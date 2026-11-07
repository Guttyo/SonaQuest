// アプリの BGM（web/src/bgm/bgm.ts。Web Audio でコードから鳴らす）を、そのまま動画用の WAV に書き出す（Issue #262）。
// 2026-11-08 オーナー：「お薬の避難訓練の時は、本当の画面から出るポップなBGMがいいね」。
// 使い方（リポジトリの直下で）：node video/scripts/capture-app-bgm/capture.mjs
// - bgm.ts を esbuild（Remotion に含まれるもの）で1つの JS にまとめ、ヘッドレスの Chrome で OfflineAudioContext に描かせる
// - タイマーは偽の時計で進める（アプリと同じ予定の立て方のまま、実時間を待たない）
// - 出力：video/public/bgm/app-training.wav（Git の対象外。48kHz ステレオ、loudnorm で -20 LUFS）
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = resolve(HERE, "../..");
const ROOT = resolve(VIDEO, "..");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG
  ?? [join(process.env.LOCALAPPDATA ?? "", "Microsoft/WinGet/Links/ffmpeg.exe"), "ffmpeg"].find((p) => p === "ffmpeg" || existsSync(p));
const PORT = 9333;
const work = mkdtempSync(join(tmpdir(), "sq-bgm-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { buildSync } = createRequire(join(VIDEO, "package.json"))("esbuild");
buildSync({ entryPoints: [join(ROOT, "web/src/bgm/bgm.ts")], bundle: true, format: "iife", globalName: "SQBGM", outfile: join(work, "bgm.js"), logLevel: "error" });
copyFileSync(join(HERE, "page.html"), join(work, "cap.html"));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, "profile")}`, "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
try {
  let tabs;
  for (let i = 0; i < 50 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); } }
  const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.navigate", { url: `file:///${join(work, "cap.html").replaceAll("\\", "/")}` });
  let text = "wait";
  for (let i = 0; i < 600 && text === "wait"; i++) {
    await sleep(500);
    const r = await send("Runtime.evaluate", { expression: "document.getElementById('out')?.textContent ?? 'wait'", returnByValue: true });
    text = r.result?.result?.value ?? "wait";
  }
  ws.close();
  if (!text.startsWith("PEAK=")) throw new Error(`書き出せなかった：${text.slice(0, 80)}`);
  const raw = join(work, "raw.wav");
  writeFileSync(raw, Buffer.from(text.split("\n")[1].slice(4), "base64"));
  const out = join(VIDEO, "public", "bgm", "app-training.wav");
  const f = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-ar", "48000", "-ac", "2", out], { stdio: "inherit" });
  if (f.status !== 0) throw new Error("ffmpeg で変換できなかった");
  console.log("書き出した：video/public/bgm/app-training.wav");
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(work, { recursive: true, force: true }); } catch { /* 一時フォルダの片づけの失敗は無視する */ }
}
