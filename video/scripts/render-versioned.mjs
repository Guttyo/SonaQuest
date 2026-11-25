// 動画を、前の書き出しを上書きせずに番号付きで書き出す（2026-11-08 オーナー、チャット：「上書きせずにバージョン管理して出力してほしい」）。
//
//   npm --prefix video run render
//
// 書き出し先は video/out/versions/sonaquest-vNN-<コミット>.mp4。NN は既にある番号の次。
// video/ に未コミットの変更があるときは、コミットの後に「-dirty」を付ける（その版がどのコードから出たかを分かるようにする）。
// 同じ名前のファイルが既にあれば書き出さずに止める。
//
//   npm --prefix video run render -- --cut v2
//
// v2 の紹介動画（Issue #315、Composition は SonaQuestVideoV2）は、提出版と別の番号の列
// video/out/versions/sonaquest-v2-vNN-<コミット>.mp4 に書き出す。--cut の後ろ以外の引数は remotion render に渡す。
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_PREFIX = "sonaquest";

/**
 * YouTube に合わせる音の大きさ（2026-11-25 オーナー、チャット：「YouTubeの音量指標を調査してそれに合わせて」）。
 * YouTube は再生のとき、全体の大きさ（積分ラウドネス）が約 -14 LUFS より大きい動画を下げる。小さい動画は上げない
 * （公式の文書には無く、「詳細統計情報」の content loudness から知られている値）。
 * 山（トゥルーピーク）の -1 dBTP は YouTube の決まりではなく、圧縮で山が割れないようにする一般の目安。
 * 提出版（v1）は提出したときの音のままにする（合わせない）。
 */
export const YOUTUBE_LOUDNESS = { i: -14, tp: -1, lra: 11 };

/** ffmpeg の loudnorm が1回目に出す測定値（JSON）を、出力の文字の中から取り出す。無ければ null */
export function parseLoudnormJson(text) {
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    const keys = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];
    return keys.every((k) => Number.isFinite(Number(json[k]))) ? json : null;
  } catch {
    return null;
  }
}

/** loudnorm のフィルター。measured（1回目の測定値）があれば2回目の形にする */
export function loudnormFilter(target, measured = null) {
  const base = `loudnorm=I=${target.i}:TP=${target.tp}:LRA=${target.lra}`;
  if (measured === null) return `${base}:print_format=json`;
  return `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:print_format=summary`;
}

/**
 * 書き出した動画の音を、target の大きさに合わせる（絵は写すだけ）。ffmpeg の loudnorm を2回かける（1回目で測り、2回目で合わせる）。
 * ffmpeg が無い・測れないときは、動画をそのままにして false を返す
 */
function normalizeLoudness(file, target) {
  const run = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
  const first = run(["-i", file, "-vn", "-af", loudnormFilter(target), "-f", "null", "-"]);
  const measured = first.status === 0 ? parseLoudnormJson(first.stderr ?? "") : null;
  if (measured === null) {
    console.warn("[render] 音の大きさを合わせられなかった（ffmpeg が無いか、測れなかった）。動画はそのまま");
    return false;
  }
  const tmp = file.replace(/\.mp4$/, ".loudnorm.mp4");
  const second = run(["-y", "-i", file, "-c:v", "copy", "-af", loudnormFilter(target, measured), "-ar", "48000", "-c:a", "aac", "-b:a", "320k", tmp]);
  if (second.status !== 0) {
    rmSync(tmp, { force: true });
    console.warn("[render] 音の大きさを合わせる書き出しに失敗した。動画はそのまま");
    return false;
  }
  renameSync(tmp, file);
  console.log(`[render] 音の大きさを合わせた：${measured.input_i} LUFS → ${target.i} LUFS（山の上限 ${target.tp} dBTP）`);
  return true;
}

/** 書き出せる動画（--cut の値 → Composition とファイル名の頭） */
export const CUTS = {
  v1: { composition: "SonaQuestVideo", prefix: VERSION_PREFIX },
  v2: { composition: "SonaQuestVideoV2", prefix: `${VERSION_PREFIX}-v2`, loudness: YOUTUBE_LOUDNESS },
};

/**
 * 番号を読む形。番号の後ろの「-コミット」などの札は、v と数字で始まらないものだけ
 * （提出版の列が sonaquest-v2-v01-… を2番と読まないように）
 */
const versionRe = (prefix) => new RegExp(`^${prefix}-v(\\d+)(?:-(?!v\\d)[0-9A-Za-z-]+)?\\.mp4$`);

/** 既にあるファイル名の一覧から、次の番号を返す（無ければ 1） */
export function nextVersion(fileNames, prefix = VERSION_PREFIX) {
  const re = versionRe(prefix);
  let max = 0;
  for (const name of fileNames) {
    const m = re.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** 番号とコミットから書き出すファイル名を作る（例：sonaquest-v03-a716eeb.mp4、sonaquest-v04-a716eeb-dirty.mp4） */
export function versionFileName(version, commit, dirty, prefix = VERSION_PREFIX) {
  const nn = String(version).padStart(2, "0");
  const tag = commit ? `-${commit}${dirty ? "-dirty" : ""}` : "";
  return `${prefix}-v${nn}${tag}.mp4`;
}

/** 引数から --cut を取り出す。残りは remotion render に渡す */
export function parseCut(argv) {
  const rest = [];
  let cut = "v1";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--cut") {
      cut = argv[i + 1];
      i += 1;
      if (!(cut in CUTS)) throw new Error(`--cut に使えるのは ${Object.keys(CUTS).join(",")} です`);
    } else {
      rest.push(argv[i]);
    }
  }
  return { cut, rest };
}

/** shell 経由で渡す引数を二重引用符で囲む（中の二重引用符は外す） */
export function quoteForShell(arg) {
  return `"${String(arg).replaceAll('"', "")}"`;
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function main() {
  const videoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(videoDir, "out", "versions");
  mkdirSync(outDir, { recursive: true });

  let parsed;
  try {
    parsed = parseCut(process.argv.slice(2));
  } catch (error) {
    console.error(`[render] ${error.message}`);
    process.exit(1);
  }
  const { composition, prefix, loudness } = CUTS[parsed.cut];

  const commit = git(["rev-parse", "--short", "HEAD"], videoDir);
  const status = git(["status", "--porcelain", "--", "."], videoDir);
  const dirty = status !== null && status.length > 0;
  const name = versionFileName(nextVersion(readdirSync(outDir), prefix), commit, dirty, prefix);
  const outFile = path.join(outDir, name);
  if (existsSync(outFile)) {
    console.error(`[render] ${name} が既にあるので止めた（上書きしない）`);
    process.exit(1);
  }

  console.log(`[render] 書き出し先：out/versions/${name}`);
  // Windows では npx を shell 経由で呼ぶので、引数は引用符で囲む。書き出し先は video/ からの相対パスにする
  // （作業フォルダの絶対パスに空白があり、囲まないと空白の前で切れて別の場所に書き出される）
  const args = ["remotion", "render", "src/index.ts", composition, `out/versions/${name}`, ...parsed.rest];
  const useShell = process.platform === "win32";
  const r = spawnSync("npx", useShell ? args.map(quoteForShell) : args, { cwd: videoDir, stdio: "inherit", shell: useShell });
  // 一部だけの書き出し（--frames）では合わせない（全体の大きさで合わせるものなので）
  const partial = parsed.rest.some((a) => String(a).startsWith("--frames"));
  if (r.status === 0 && loudness && !partial) normalizeLoudness(outFile, loudness);
  process.exit(r.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
