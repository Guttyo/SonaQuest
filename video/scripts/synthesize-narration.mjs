// 提出動画のナレーションを ElevenLabs で合成する（Issue #28、ADR-0051）。
// 使い方（リポジトリの直下から）：
//   npm --prefix video run narration                 … 2〜9番のうち、まだ mp3 が無いものを合成
//   npm --prefix video run narration -- --force      … 既にある mp3 も上書き
//   npm --prefix video run narration -- --only 2,5   … そのビートだけ
//
// 読むもの：video/.env（Node.js 標準の process.loadEnvFile。dotenv は使わない）、video/narration/NN.txt
// 書くもの：video/public/narration/NN.mp3（Git の対象外）
// ログに出すのは番号・件数・所要時間・HTTP の状態・エラーの種類だけ。キー・声の ID・本文は出さない。
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  REQUEST_TIMEOUT_MS,
  buildTtsRequest,
  envFilePath,
  formatLogLine,
  formatSummaryLine,
  missingEnvGuide,
  narrationAudioPath,
  narrationTextPath,
  normalizeText,
  parseArgs,
  readConfig,
} from "./narration-lib.mjs";

const videoDir = path.resolve(import.meta.dirname, "..");

const main = async () => {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[narration] ${error.message}`);
    return 1;
  }

  const envPath = envFilePath(videoDir);
  if (!existsSync(envPath)) {
    console.error(missingEnvGuide());
    return 1;
  }
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    // エラーの文には中身が入りうるので、種類だけを出す
    console.error(`[narration] .env を読めませんでした（${error?.name ?? "Error"}）`);
    return 1;
  }

  const read = readConfig(process.env);
  if (!read.ok) {
    console.error("[narration] video/.env の設定が足りません：");
    for (const problem of read.problems) console.error(`  - ${problem}`);
    return 1;
  }
  const { config } = read;

  const started = performance.now();
  const counts = { saved: 0, skipped: 0, failed: 0 };
  await mkdir(path.join(videoDir, "public", "narration"), { recursive: true });

  for (const beat of options.beats) {
    const outPath = narrationAudioPath(videoDir, beat);
    if (!options.force && existsSync(outPath)) {
      console.log(formatLogLine({ beat, result: "skipped" }));
      counts.skipped += 1;
      continue;
    }

    let text;
    try {
      text = normalizeText(await readFile(narrationTextPath(videoDir, beat), "utf8"), beat);
    } catch (error) {
      // ファイルが無いときは code（ENOENT など）。normalizeText のエラーは自分で作った文で、本文を含まない
      console.error(formatLogLine({ beat, result: "inputError", errorName: error?.code ?? error?.name }));
      if (error instanceof Error && !error.code) console.error(`  ${error.message}`);
      counts.failed += 1;
      continue;
    }

    const { url, init } = buildTtsRequest({ ...config, text });
    const t0 = performance.now();
    let response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      // 通信のエラーの文には宛先（声の ID を含む URL）が入りうるので、種類だけを出す
      console.error(formatLogLine({ beat, result: "networkError", ms: performance.now() - t0, errorName: error?.name }));
      counts.failed += 1;
      continue;
    }
    if (!response.ok) {
      // 応答の本文は出さない（入力の一部を返すことがある）
      await response.body?.cancel();
      console.error(formatLogLine({ beat, result: "httpError", status: response.status, ms: performance.now() - t0 }));
      counts.failed += 1;
      continue;
    }
    const audio = Buffer.from(await response.arrayBuffer());
    await writeFile(outPath, audio);
    console.log(formatLogLine({ beat, result: "saved", status: response.status, ms: performance.now() - t0 }));
    counts.saved += 1;
  }

  console.log(formatSummaryLine({ ...counts, ms: performance.now() - started }));
  return counts.failed > 0 ? 1 : 0;
};

process.exitCode = await main();
