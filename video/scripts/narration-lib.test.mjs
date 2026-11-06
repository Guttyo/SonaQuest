// ナレーション合成の部品の試験（Issue #28、ADR-0051）。node:test だけを使う（依存を足さない）。
// 本物の ElevenLabs は呼ばない。video/.env も読まない。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_MODEL_ID,
  NARRATION_BEATS,
  OUTPUT_FORMAT,
  beatId,
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
// 試験用の作り物の値（本物のキー・声の ID ではない）
const FAKE_KEY = "sk_test_fakekey_000000000000";
const FAKE_VOICE = "FakeVoiceId0000000000";
const FAKE_TEXT = "これは試験のための架空の原稿です。";
// 判断待ちの印（文字列を分けて書き、リポジトリの印の一覧に試験の文字が混ざらないようにする）
const OWNER_MARK = ["TODO", "OWNER"].join("-");

test("ナレーションは 2〜9番の8件（1番は本人の生声で合成しない）", () => {
  assert.deepEqual(NARRATION_BEATS, [2, 3, 4, 5, 6, 7, 8, 9]);
});

test("ファイル名は2桁の番号で組み立てる", () => {
  assert.equal(beatId(2), "02");
  assert.equal(beatId(9), "09");
  assert.throws(() => beatId(0));
  assert.throws(() => beatId(1.5));
  assert.equal(narrationTextPath("/v", 2), path.join("/v", "narration", "02.txt"));
  assert.equal(narrationAudioPath("/v", 9), path.join("/v", "public", "narration", "09.mp3"));
  assert.equal(envFilePath("/v"), path.join("/v", ".env"));
});

test("音声の置き場所は Remotion の sections.ts と同じ名前（narration/NN.mp3）", () => {
  const sections = readFileSync(path.join(videoDir, "src", "sections.ts"), "utf8");
  assert.match(sections, /narration\/\$\{pad2\(number\)\}\.mp3/);
});

test("2〜9番の原稿がそろい、どれも空でなく、判断待ちの印が無い", () => {
  const files = readdirSync(path.join(videoDir, "narration")).filter((f) => f.endsWith(".txt")).sort();
  assert.deepEqual(files, NARRATION_BEATS.map((b) => `${beatId(b)}.txt`));
  for (const beat of NARRATION_BEATS) {
    const text = normalizeText(readFileSync(narrationTextPath(videoDir, beat), "utf8"), beat);
    assert.ok(text.length > 0);
    // 読み上げの原稿では「ソナクエスト」とカタカナにする（Issue #28）
    assert.doesNotMatch(text, /SonaQuest/i);
  }
});

test("引数：--force と --only", () => {
  assert.deepEqual(parseArgs([]), { force: false, beats: NARRATION_BEATS });
  assert.deepEqual(parseArgs(["--force"]), { force: true, beats: NARRATION_BEATS });
  assert.deepEqual(parseArgs(["--only", "5,2,5"]), { force: false, beats: [2, 5] });
  assert.throws(() => parseArgs(["--only", "1"]));
  assert.throws(() => parseArgs(["--only"]));
  assert.throws(() => parseArgs(["--nope"]));
});

test("設定：足りないときは変数の名前だけを返し、値を入れない", () => {
  const empty = readConfig({});
  assert.equal(empty.ok, false);
  assert.ok(empty.problems.some((p) => p.includes("ELEVENLABS_API_KEY")));
  assert.ok(empty.problems.some((p) => p.includes("ELEVENLABS_VOICE_ID")));

  const badVoice = readConfig({ ELEVENLABS_API_KEY: FAKE_KEY, ELEVENLABS_VOICE_ID: "bad/voice?id" });
  assert.equal(badVoice.ok, false);
  for (const p of badVoice.problems) {
    assert.ok(!p.includes(FAKE_KEY));
    assert.ok(!p.includes("bad/voice?id"));
  }

  const good = readConfig({ ELEVENLABS_API_KEY: FAKE_KEY, ELEVENLABS_VOICE_ID: FAKE_VOICE });
  assert.equal(good.ok, true);
  assert.equal(good.config.modelId, DEFAULT_MODEL_ID);
  assert.equal(DEFAULT_MODEL_ID, "eleven_v4");

  const custom = readConfig({ ELEVENLABS_API_KEY: FAKE_KEY, ELEVENLABS_VOICE_ID: FAKE_VOICE, ELEVENLABS_MODEL_ID: "eleven_v4_turbo" });
  assert.equal(custom.config.modelId, "eleven_v4_turbo");
});

test("原稿：空・長すぎ・判断待ちの印はエラーで、エラーの文に本文を入れない", () => {
  assert.equal(normalizeText(`  ${FAKE_TEXT}\r\n`, 2), FAKE_TEXT);
  assert.throws(() => normalizeText("  \n", 2));
  assert.throws(() => normalizeText("あ".repeat(10_001), 2), (e) => !e.message.includes("あああ"));
  assert.throws(() => normalizeText(`${FAKE_TEXT}[${OWNER_MARK}: 試験]`, 2), (e) => !e.message.includes(FAKE_TEXT));
});

test("呼び出しの組み立て：宛先・ヘッダー・本文の形", () => {
  const { url, init } = buildTtsRequest({ apiKey: FAKE_KEY, voiceId: FAKE_VOICE, modelId: DEFAULT_MODEL_ID, text: FAKE_TEXT });
  assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${FAKE_VOICE}?output_format=${OUTPUT_FORMAT}`);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["xi-api-key"], FAKE_KEY);
  const body = JSON.parse(init.body);
  assert.deepEqual(body, {
    text: FAKE_TEXT,
    model_id: DEFAULT_MODEL_ID,
    language_code: "ja",
    voice_settings: { stability: 0.65, similarity_boost: 0.75 },
  });
});

test("ログの行に、キー・声の ID・本文・URL・エラーの文が入らない", () => {
  const { url } = buildTtsRequest({ apiKey: FAKE_KEY, voiceId: FAKE_VOICE, modelId: DEFAULT_MODEL_ID, text: FAKE_TEXT });
  const secrets = [FAKE_KEY, FAKE_VOICE, FAKE_TEXT, url, "fetch failed for"];
  const entries = [
    { beat: 2, result: "saved", status: 200, ms: 3210 },
    { beat: 3, result: "httpError", status: 401, ms: 120 },
    { beat: 4, result: "networkError", ms: 60000, errorName: "TimeoutError" },
    { beat: 5, result: "skipped" },
    { beat: 6, result: "inputError", errorName: "ENOENT" },
    // 余計な値を渡しても出さない
    { beat: 7, result: "saved", status: 200, ms: 1, text: FAKE_TEXT, apiKey: FAKE_KEY, voiceId: FAKE_VOICE, url },
    // エラーの種類の欄に文を入れても出さない
    { beat: 8, result: "networkError", errorName: `fetch failed for ${url}` },
  ];
  for (const entry of entries) {
    const line = formatLogLine(entry);
    assert.match(line, new RegExp(`^\\[narration\\] ${beatId(entry.beat)}`));
    for (const s of secrets) assert.ok(!line.includes(s), `ログに出してはいけない値が入った：${entry.beat}`);
  }
  assert.equal(formatLogLine(entries[0]), "[narration] 02　保存した　HTTP 200　3.2秒");

  const summary = formatSummaryLine({ saved: 7, skipped: 1, failed: 0, ms: 25000 });
  assert.equal(summary, "[narration] 保存 7 件・飛ばした 1 件・失敗 0 件（25.0秒）");
});

test("video/.env が無いときの案内に、置くものの名前が入る", () => {
  const guide = missingEnvGuide();
  assert.match(guide, /\.env\.example/);
  assert.match(guide, /ELEVENLABS_API_KEY/);
  assert.match(guide, /ELEVENLABS_VOICE_ID/);
});

test("v4 のオーディオタグ（[pause] など）は原稿のまま API に渡す", () => {
  const tagged = `${FAKE_TEXT}[pause]つづきの文です。[long pause]`;
  const text = normalizeText(tagged, 3);
  assert.equal(text, tagged);
  const { init } = buildTtsRequest({ apiKey: FAKE_KEY, voiceId: FAKE_VOICE, modelId: DEFAULT_MODEL_ID, text });
  assert.equal(JSON.parse(init.body).text, tagged);
});

test("上限（10,000 文字）ちょうどは通り、超えると送らずに止める", () => {
  assert.equal(normalizeText("あ".repeat(10_000), 2).length, 10_000);
  assert.throws(() => normalizeText("あ".repeat(10_001), 2));
});

test("原稿（narration/NN.txt）は docs/demo-script.md の台本の表のナレーションと同じ", () => {
  const script = readFileSync(path.join(videoDir, "..", "docs", "demo-script.md"), "utf8");
  for (const beat of NARRATION_BEATS) {
    const row = script.split("\n").find((line) => line.startsWith(`| ${beat} | `));
    assert.ok(row, `台本の表に ${beat} 番の行がある`);
    const cells = row.split("|").map((c) => c.trim());
    const quoted = cells[5];
    assert.ok(quoted.startsWith("「") && quoted.endsWith("」"), `${beat} 番のナレーションの欄が「」で囲まれている`);
    const text = normalizeText(readFileSync(narrationTextPath(videoDir, beat), "utf8"), beat);
    assert.equal(text, quoted.slice(1, -1), `${beat} 番の原稿が台本と食い違う`);
  }
});
