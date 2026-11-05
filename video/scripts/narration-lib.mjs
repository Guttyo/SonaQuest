// ナレーション合成の部品（Issue #28、ADR-0050）。副作用の無い関数だけを置き、試験から読む。
// 実行の入口は synthesize-narration.mjs。
//
// 守ること：API キー・声の ID・ナレーションの本文をログに出さない。
// ログに出してよいのは、ビートの番号・件数・所要時間・HTTP の状態・エラーの種類（name）だけ。
import path from "node:path";

/** ナレーションを合成するビート（1番は本人の生声なので無い） */
export const NARRATION_BEATS = [2, 3, 4, 5, 6, 7, 8, 9];

/**
 * 既定のモデル：eleven_v4。ElevenLabs の文書（elevenlabs.io/docs/models）が、ナレーション・動画の収録には
 * 品質重視の v4、低遅延が要るときだけ v4 turbo を勧めているため（2026-11-06、ADR-0050）。
 * アプリの /api/tts は会話の待ち時間を優先して eleven_v4_turbo（ADR-0045）。ELEVENLABS_MODEL_ID で上書きできる。
 * 呼ぶ口はアプリと同じ POST /v1/text-to-speech/{voice_id}（Text to Dialogue の口は使わない）。
 */
export const DEFAULT_MODEL_ID = "eleven_v4";
// [TODO-OWNER: ナレーションの voice_settings（今はアプリの TTS_VOICE_SETTINGS を写した stability 0.65・similarity_boost 0.75。文書に v4 の推奨値が見当たらなかったので下書き。合成して聞いて決める）]
/** 声の設定。アプリの web/worker/tts.ts と同じ値を写した（別パッケージなので import しない。ADR-0045） */
export const VOICE_SETTINGS = Object.freeze({ stability: 0.65, similarity_boost: 0.75 });
/** 出力の形式。どのプランでも使える形（アプリと同じ）。音質を上げるならオーナーが変える */
export const OUTPUT_FORMAT = "mp3_44100_64";
export const TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/";
/**
 * 1リクエストの文字数の上限（ElevenLabs の text-to-speech の上限 10,000 文字）。
 * 各ビートは約100字なので分けずに送る。上限を超える原稿は送らずにエラーで止める。
 */
export const MAX_TEXT_LENGTH = 10_000;
/** ElevenLabs を待つ上限 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** オーナーの判断待ちの印（文字列を分けて書き、リポジトリの印の一覧に混ざらないようにする） */
const OWNER_MARK = ["TODO", "OWNER"].join("-");
/** 声の ID の形（宛先の URL に入れるので英数字だけを通す。web/worker/tts.ts と同じ考え） */
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;
/** モデルの ID の形 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** 番号を2桁にする（2 → "02"） */
export const beatId = (beat) => {
  if (!Number.isInteger(beat) || beat < 1 || beat > 99) throw new RangeError("ビートの番号は 1〜99 の整数");
  return String(beat).padStart(2, "0");
};

/** 原稿のファイル：video/narration/NN.txt */
export const narrationTextPath = (videoDir, beat) => path.join(videoDir, "narration", `${beatId(beat)}.txt`);

/** 書き出す音声：video/public/narration/NN.mp3（Remotion の staticFile("narration/NN.mp3")） */
export const narrationAudioPath = (videoDir, beat) =>
  path.join(videoDir, "public", "narration", `${beatId(beat)}.mp3`);

/** 環境変数ファイル：video/.env（中身は読まずに場所だけ返す） */
export const envFilePath = (videoDir) => path.join(videoDir, ".env");

/**
 * コマンドの引数を読む。
 * --force：既にある mp3 を上書きする
 * --only 2,5：そのビートだけ合成する
 */
export const parseArgs = (argv) => {
  const options = { force: false, beats: [...NARRATION_BEATS] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") {
      options.force = true;
    } else if (arg === "--only") {
      const value = argv[i + 1];
      i += 1;
      if (!value) throw new Error("--only の後にビートの番号（例：2,5）を書いてください");
      const beats = value.split(",").map((s) => Number(s.trim()));
      for (const b of beats) {
        if (!NARRATION_BEATS.includes(b)) throw new Error(`--only に使える番号は ${NARRATION_BEATS.join(",")} です`);
      }
      options.beats = [...new Set(beats)].sort((a, b) => a - b);
    } else {
      throw new Error(`知らない引数です（使えるのは --force と --only）`);
    }
  }
  return options;
};

/**
 * 環境変数から設定を取り出して形を確かめる。値そのものはエラーの文に入れない。
 * 戻り値：{ ok: true, config } か { ok: false, problems: [変数の名前と何が足りないか] }
 */
export const readConfig = (env) => {
  const problems = [];
  const apiKey = (env.ELEVENLABS_API_KEY ?? "").trim();
  const voiceId = (env.ELEVENLABS_VOICE_ID ?? "").trim();
  const modelId = (env.ELEVENLABS_MODEL_ID ?? "").trim() || DEFAULT_MODEL_ID;
  if (!apiKey) problems.push("ELEVENLABS_API_KEY が空です");
  if (!voiceId) problems.push("ELEVENLABS_VOICE_ID が空です");
  else if (!VOICE_ID_PATTERN.test(voiceId)) problems.push("ELEVENLABS_VOICE_ID の形が違います（英数字 8〜64 文字）");
  if (!MODEL_ID_PATTERN.test(modelId)) problems.push("ELEVENLABS_MODEL_ID の形が違います");
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, config: { apiKey, voiceId, modelId } };
};

/** 原稿を整える（前後の空白と改行を落とす）。空や長すぎるものはエラー（本文は文に入れない） */
export const normalizeText = (raw, beat) => {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error(`${beatId(beat)}：原稿が空です`);
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`${beatId(beat)}：原稿が長すぎます（${text.length} 字）`);
  if (text.includes(OWNER_MARK)) throw new Error(`${beatId(beat)}：原稿にオーナーの判断待ちの印が残っています`);
  return text;
};

/** ElevenLabs の text-to-speech の呼び出しを組み立てる（送るのはこの関数の戻り値だけ） */
export const buildTtsRequest = ({ apiKey, voiceId, modelId, text }) => ({
  url: `${TTS_URL}${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`,
  init: {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: modelId, language_code: "ja", voice_settings: VOICE_SETTINGS }),
  },
});

const RESULT_LABELS = Object.freeze({
  saved: "保存した",
  skipped: "既にあるので飛ばした（上書きは --force）",
  httpError: "失敗（HTTP の状態）",
  networkError: "失敗（通信）",
  inputError: "失敗（原稿）",
});

/**
 * ログの1行を作る。受け取った値のうち、番号・結果・HTTP の状態・所要時間・エラーの種類だけを使い、
 * ほかの値（本文・キー・声の ID・URL・エラーの文）は渡されても出さない。
 */
export const formatLogLine = (entry) => {
  const parts = [`[narration] ${beatId(entry.beat)}`];
  parts.push(RESULT_LABELS[entry.result] ?? "不明");
  if (Number.isInteger(entry.status)) parts.push(`HTTP ${entry.status}`);
  if (typeof entry.ms === "number" && Number.isFinite(entry.ms)) parts.push(`${(entry.ms / 1000).toFixed(1)}秒`);
  if (typeof entry.errorName === "string" && /^[A-Za-z]{1,40}$/.test(entry.errorName)) parts.push(entry.errorName);
  return parts.join("　");
};

/** 最後のまとめの1行（件数と所要時間だけ） */
export const formatSummaryLine = ({ saved, skipped, failed, ms }) =>
  `[narration] 保存 ${saved} 件・飛ばした ${skipped} 件・失敗 ${failed} 件（${(ms / 1000).toFixed(1)}秒）`;

/** video/.env が無いときの案内（値は書かない） */
export const missingEnvGuide = () =>
  [
    "[narration] video フォルダに .env がありません。合成の前に、オーナーが用意してください：",
    "  1. video/.env.example を同じ video フォルダに .env という名前で写す",
    "  2. ELEVENLABS_API_KEY（ElevenLabs のキー）と ELEVENLABS_VOICE_ID（ナレーターの声の ID）を書く",
    "  3. モデルを変えるときだけ ELEVENLABS_MODEL_ID を書く（無ければ eleven_v4）",
    "  合成は ElevenLabs の課金の対象です。",
  ].join("\n");
