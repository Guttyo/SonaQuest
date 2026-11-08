// 動画を、前の書き出しを上書きせずに番号付きで書き出す（2026-11-08 オーナー、チャット：「上書きせずにバージョン管理して出力してほしい」）。
//
//   npm --prefix video run render
//
// 書き出し先は video/out/versions/sonaquest-vNN-<コミット>.mp4。NN は既にある番号の次。
// video/ に未コミットの変更があるときは、コミットの後に「-dirty」を付ける（その版がどのコードから出たかを分かるようにする）。
// 同じ名前のファイルが既にあれば書き出さずに止める。
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_PREFIX = "sonaquest";
const VERSION_RE = new RegExp(`^${VERSION_PREFIX}-v(\\d+)(?:-[0-9A-Za-z-]+)?\\.mp4$`);

/** 既にあるファイル名の一覧から、次の番号を返す（無ければ 1） */
export function nextVersion(fileNames) {
  let max = 0;
  for (const name of fileNames) {
    const m = VERSION_RE.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** 番号とコミットから書き出すファイル名を作る（例：sonaquest-v03-a716eeb.mp4、sonaquest-v04-a716eeb-dirty.mp4） */
export function versionFileName(version, commit, dirty) {
  const nn = String(version).padStart(2, "0");
  const tag = commit ? `-${commit}${dirty ? "-dirty" : ""}` : "";
  return `${VERSION_PREFIX}-v${nn}${tag}.mp4`;
}

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function main() {
  const videoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(videoDir, "out", "versions");
  mkdirSync(outDir, { recursive: true });

  const commit = git(["rev-parse", "--short", "HEAD"], videoDir);
  const status = git(["status", "--porcelain", "--", "."], videoDir);
  const dirty = status !== null && status.length > 0;
  const name = versionFileName(nextVersion(readdirSync(outDir)), commit, dirty);
  const outFile = path.join(outDir, name);
  if (existsSync(outFile)) {
    console.error(`[render] ${name} が既にあるので止めた（上書きしない）`);
    process.exit(1);
  }

  console.log(`[render] 書き出し先：out/versions/${name}`);
  const r = spawnSync("npx", ["remotion", "render", "src/index.ts", "SonaQuestVideo", outFile, ...process.argv.slice(2)], {
    cwd: videoDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
