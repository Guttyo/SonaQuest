// HQ のカルテ画面の、聞き取りの文字起こし（話す見本・架空。Issue #202、ADR-0061）。
// 音声認識はブラウザ標準（voice/talk.ts の PushToTalk を使い回す）。聞き取った文は欄に足すだけで、
// 保存・ログ出力をしない。Claude に送るのは、要約を作るときだけ（ADR-0061 の追記）。アプリは中身を判断・修正しない（safety.md）。

import type { CodeFinding, KarteSummary } from "./contract";

/** 文字起こしの欄に入れられる文字数の上限（長い見本でも画面が重くならないように） */
export const TRANSCRIPT_MAX_LENGTH = 2000;

/** 聞き取った文を下書きの後ろに足す。言っていない句読点は足さず、改行で区切る。上限で切る */
export function appendTranscript(draft: string, text: string): string {
  const piece = text.trim();
  if (piece === "") return draft.slice(0, TRANSCRIPT_MAX_LENGTH);
  const joined = draft === "" || /\n$/.test(draft) ? draft + piece : `${draft}\n${piece}`;
  return joined.slice(0, TRANSCRIPT_MAX_LENGTH);
}

// --- 要約（抽出型。Issue #202 の2つめ、ADR-0061 の追記） --------------------------
// 文字起こしは全部が本人（架空の患者を演じる人）の発言として扱う。1行を1つの発言にし、
// 引用（quote）は1行の中から文字どおりに写したものだけを根拠にする（codeCheck.ts の quoteFound）。

/** 要約に回せる文字起こしの下限（短すぎると抜き出す言葉が無い） */
export const MIN_TRANSCRIPT_FOR_SUMMARY = 10;

/** 文字起こしを発言（1行ずつ）に分ける。空の行は捨てる */
export function transcriptUtterances(transcript: string): string[] {
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** 改行のほかの制御文字（タブ・復帰・NUL など）。入っていたら受け付けない */
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/;

/** 要約の入口（/api/karte/transcript-summary）に送る形を確かめる。キーは transcript だけ */
export function parseTranscriptSummaryRequest(value: unknown): { transcript: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "transcript") return null;
  const { transcript } = value as { transcript: unknown };
  if (typeof transcript !== "string" || CONTROL_CHARS.test(transcript)) return null;
  if (transcript.length > TRANSCRIPT_MAX_LENGTH) return null;
  if (transcriptUtterances(transcript).join("").length < MIN_TRANSCRIPT_FOR_SUMMARY) return null;
  return { transcript };
}

/** 要約の入口の応答。findings は1段目（コードでの確認）。禁止表現に当たった項目の text・quote は伏せてある */
export interface TranscriptSummaryResponse {
  source: "model";
  summary: KarteSummary;
  findings: CodeFinding[];
  /** この環境で監査役が使えるか（Issue #244。文字起こしの要約は監査役に回さないが、形を要約の入口とそろえる）。ID は返さない */
  auditConfigured: boolean;
}
