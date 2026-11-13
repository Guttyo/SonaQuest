// ナレーション合成の部品の試験（Issue #28・#262、ADR-0051）。node:test だけを使う（依存を足さない）。
// 本物の ElevenLabs は呼ばない。video/.env も読まない。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  ALL_CLIPS,
  ALL_NARRATION_BEATS,
  CLIP_VOICE_SETTINGS,
  DEFAULT_MODEL_ID,
  EXTRA_CLIPS,
  V2_CLIPS,
  VOICE_SETTINGS,
  NARRATION_BEATS,
  PRIVATE_NARRATION_BEATS,
  OUTPUT_FORMAT,
  beatId,
  buildTtsRequest,
  envFilePath,
  formatLogLine,
  formatSummaryLine,
  isPrivateBeat,
  missingEnvGuide,
  narrationAudioPath,
  narrationTextPath,
  normalizeText,
  parseArgs,
  readConfig,
  voiceSettingsFor,
} from "./narration-lib.mjs";

const videoDir = path.resolve(import.meta.dirname, "..");
// 試験用の作り物の値（本物のキー・声の ID ではない）
const FAKE_KEY = "sk_test_fakekey_000000000000";
const FAKE_VOICE = "FakeVoiceId0000000000";
const FAKE_TEXT = "これは試験のための架空の原稿です。";
// 判断待ちの印（文字列を分けて書き、リポジトリの印の一覧に試験の文字が混ざらないようにする）
const OWNER_MARK = ["TODO", "OWNER"].join("-");

test("ナレーションは13場面すべて。原稿をリポジトリに置くのは11件で、3・12番はリポジトリの外", () => {
  assert.deepEqual(NARRATION_BEATS, [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 13]);
  assert.deepEqual(PRIVATE_NARRATION_BEATS, [3, 12]);
  assert.deepEqual(ALL_NARRATION_BEATS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.equal(isPrivateBeat(3), true);
  assert.equal(isPrivateBeat(4), false);
});

test("ファイル名は2桁の番号で組み立てる", () => {
  assert.equal(beatId(2), "02");
  assert.equal(beatId(9), "09");
  assert.throws(() => beatId(0));
  assert.throws(() => beatId(1.5));
  assert.equal(narrationTextPath("/v", 2), path.join("/v", "narration", "02.txt"));
  // リポジトリの外の原稿は video/public/（Git の対象外）の下
  assert.equal(narrationTextPath("/v", 3), path.join("/v", "public", "private", "narration", "03.txt"));
  assert.equal(narrationTextPath("/v", 12), path.join("/v", "public", "private", "narration", "12.txt"));
  assert.equal(narrationAudioPath("/v", 9), path.join("/v", "public", "narration", "09.mp3"));
  assert.equal(envFilePath("/v"), path.join("/v", ".env"));
});

test("音声の置き場所は Remotion の sections.ts と同じ名前（narration/NN.mp3）", () => {
  const sections = readFileSync(path.join(videoDir, "src", "sections.ts"), "utf8");
  assert.match(sections, /narration\/\$\{pad2\(number\)\}\.mp3/);
});

test("リポジトリに置く原稿がそろい、どれも空でなく、判断待ちの印が無い。3・12番の原稿はリポジトリに無い", () => {
  const files = readdirSync(path.join(videoDir, "narration")).filter((f) => f.endsWith(".txt")).sort();
  assert.deepEqual(files, [...NARRATION_BEATS, ...EXTRA_CLIPS, ...V2_CLIPS].map((b) => `${beatId(b)}.txt`).sort());
  for (const beat of PRIVATE_NARRATION_BEATS) assert.ok(!files.includes(`${beatId(beat)}.txt`));
  for (const beat of [...NARRATION_BEATS, ...EXTRA_CLIPS, ...V2_CLIPS]) {
    const text = normalizeText(readFileSync(narrationTextPath(videoDir, beat), "utf8"), beat);
    assert.ok(text.length > 0);
    // 読み上げの原稿では「ソナクエスト」とカタカナにする（Issue #28）
    assert.doesNotMatch(text, /SonaQuest/i);
  }
});

test("引数：--force と --only", () => {
  assert.deepEqual(parseArgs([]), { force: false, beats: ALL_CLIPS });
  assert.deepEqual(parseArgs(["--force"]), { force: true, beats: ALL_CLIPS });
  assert.deepEqual(parseArgs(["--only", "05b,2,05a"]), { force: false, beats: [2, "05a", "05b"] });
  assert.throws(() => parseArgs(["--only", "05z"]));
  assert.deepEqual(parseArgs(["--only", "5,2,5"]), { force: false, beats: [2, 5] });
  assert.deepEqual(parseArgs(["--only", "12,3"]), { force: false, beats: [3, 12] });
  assert.throws(() => parseArgs(["--only", "14"]));
  assert.throws(() => parseArgs(["--only", "0"]));
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
  for (const beat of PRIVATE_NARRATION_BEATS) {
    // 3・12番の原稿は台本にも書かない（CLAUDE.md 絶対ルール8）
    const row = script.split("\n").find((line) => line.startsWith(`| ${beat} | `));
    assert.ok(row, `台本の表に ${beat} 番の行がある`);
    const cells = row.split("|").map((c) => c.trim());
    assert.ok(!cells[5].startsWith("「"), `${beat} 番のナレーションの欄に原稿を書かない`);
  }
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

test("場面の秒（sections.ts）は13場面・合計180秒で、台本の表の時間の欄と同じ", () => {
  const sections = readFileSync(path.join(videoDir, "src", "sections.ts"), "utf8");
  const seconds = [...sections.matchAll(/^\s*seconds: (\d+),$/gm)].map((m) => Number(m[1]));
  assert.equal(seconds.length, 13);
  assert.equal(seconds.reduce((a, b) => a + b, 0), 180);
  const script = readFileSync(path.join(videoDir, "..", "docs", "demo-script.md"), "utf8");
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  let start = 0;
  seconds.forEach((sec, i) => {
    const beat = i + 1;
    const row = script.split("\n").find((line) => line.startsWith(`| ${beat} | `));
    assert.ok(row, `台本の表に ${beat} 番の行がある`);
    const time = row.split("|").map((c) => c.trim())[2];
    assert.equal(time, `${clock(start)}–${clock(start + sec)}`, `${beat} 番の時間が sections.ts と食い違う`);
    start += sec;
  });
});

test("モデルの使い分けの一枚（src/modelMap.ts）のモデルは web/worker の定数の値と同じ", () => {
  const modelMap = readFileSync(path.join(videoDir, "src", "modelMap.ts"), "utf8");
  const refs = [...modelMap.matchAll(/modelId: "([^"]+)", source: "([^"]+)", constant: "([^"]+)"/g)];
  // 訓練の言い回し・監査役、掲示板、カルテの要約・監査、文字起こしの要約
  assert.equal(refs.length, 6);
  const seen = new Set();
  for (const [, modelId, source, constant] of refs) {
    const code = readFileSync(path.join(videoDir, "..", source), "utf8");
    const m = new RegExp(`export const ${constant} = (?:\{ id: )?"([^"]+)"`).exec(code);
    assert.ok(m, `${source} に ${constant} がある`);
    assert.equal(modelId, m[1], `${source} の ${constant} と一枚のモデルが食い違う`);
    seen.add(constant);
  }
  assert.deepEqual([...seen].sort(), ["AUDIT_MODEL", "BOARD_CHAT_MODEL", "KARTE_AUDIT_MODEL", "KARTE_SUMMARY_MODEL", "MODEL"]);
});

test("モデルの一枚で取り違えない：在庫・発注はコード、掲示板と文字起こしの要約は監査役を通らない", () => {
  const modelMap = readFileSync(path.join(videoDir, "src", "modelMap.ts"), "utf8");
  const rowOf = (role) => {
    const start = modelMap.indexOf(`role: "${role}`);
    assert.ok(start >= 0, `${role} の行がある`);
    const end = modelMap.indexOf("role: ", start + 6);
    return modelMap.slice(start, end < 0 ? undefined : end);
  };
  const stock = rowOf("在庫・残り日数・発注の提案");
  assert.doesNotMatch(stock, /modelId/);
  assert.match(stock, /Claude ではない/);
  const chat = rowOf("掲示板");
  assert.doesNotMatch(chat, /AUDIT_MODEL|claude-haiku/);
  assert.match(chat, /監査役は通らない/);
  const transcript = rowOf("HQ：聞き取りの文字起こし");
  assert.doesNotMatch(transcript, /KARTE_AUDIT_MODEL|AUDIT_MODEL/);
  assert.match(transcript, /監査には回さない/);
});

test("足す台詞（05a など）は場面の番号の後に並び、ファイルは narration/<id>.txt と public/narration/<id>.mp3", () => {
  assert.deepEqual(EXTRA_CLIPS, ["05a", "05b", "05c", "06a", "07a", "08a"]);
  assert.deepEqual(ALL_CLIPS.slice(4, 8), [5, "05a", "05b", "05c"]);
  assert.equal(beatId("05a"), "05a");
  assert.throws(() => beatId("5a"));
  assert.equal(isPrivateBeat("05a"), false);
  assert.equal(narrationTextPath("/v", "05b"), path.join("/v", "narration", "05b.txt"));
  assert.equal(narrationAudioPath("/v", "05c"), path.join("/v", "public", "narration", "05c.mp3"));
  assert.equal(formatLogLine({ beat: "05a", result: "saved", status: 200, ms: 1000 }), "[narration] 05a　保存した　HTTP 200　1.0秒");
});

test("v2 のナレーション（Issue #315）は v2-NN の id で、提出版の後に並び、--only で選べる", () => {
  assert.deepEqual(V2_CLIPS, ["v2-01", "v2-02", "v2-03", "v2-04", "v2-05", "v2-06", "v2-09"]);
  assert.deepEqual(ALL_CLIPS.slice(-7), V2_CLIPS);
  assert.equal(beatId("v2-03"), "v2-03");
  assert.throws(() => beatId("v2-3"));
  assert.throws(() => beatId("v3-03"));
  assert.equal(narrationTextPath("/v", "v2-05"), path.join("/v", "narration", "v2-05.txt"));
  assert.equal(narrationAudioPath("/v", "v2-05"), path.join("/v", "public", "narration", "v2-05.mp3"));
  assert.deepEqual(parseArgs(["--only", "v2-09,v2-03"]), { force: false, beats: ["v2-03", "v2-09"] });
  assert.throws(() => parseArgs(["--only", "v2-07"]));
});

test("声の設定：今はどの台詞も既定の値（2番の速さは元に戻した）。台詞ごとの上書きは voice_settings に入る", () => {
  assert.deepEqual(CLIP_VOICE_SETTINGS, {});
  assert.deepEqual(voiceSettingsFor(2), { ...VOICE_SETTINGS });
  assert.deepEqual(voiceSettingsFor(5), { ...VOICE_SETTINGS });
  assert.deepEqual(voiceSettingsFor("05a"), { ...VOICE_SETTINGS });
  const { init } = buildTtsRequest({ apiKey: FAKE_KEY, voiceId: FAKE_VOICE, modelId: DEFAULT_MODEL_ID, text: FAKE_TEXT, voiceSettings: { ...VOICE_SETTINGS, speed: 0.85 } });
  assert.equal(JSON.parse(init.body).voice_settings.speed, 0.85);
  const plain = buildTtsRequest({ apiKey: FAKE_KEY, voiceId: FAKE_VOICE, modelId: DEFAULT_MODEL_ID, text: FAKE_TEXT });
  assert.deepEqual(JSON.parse(plain.init.body).voice_settings, { ...VOICE_SETTINGS });
});
