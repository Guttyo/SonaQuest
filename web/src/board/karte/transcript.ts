// HQ のカルテ画面の、聞き取りの文字起こし（話す見本・架空。Issue #202、ADR-0061）。
// 音声認識はブラウザ標準（voice/talk.ts の PushToTalk を使い回す）。聞き取った文は欄に足すだけで、
// 保存・送信・ログ出力をしない。Claude にも送らない。アプリは中身を判断・修正しない（safety.md）。

/** 文字起こしの欄に入れられる文字数の上限（長い見本でも画面が重くならないように） */
export const TRANSCRIPT_MAX_LENGTH = 2000;

/** 聞き取った文を下書きの後ろに足す。言っていない句読点は足さず、改行で区切る。上限で切る */
export function appendTranscript(draft: string, text: string): string {
  const piece = text.trim();
  if (piece === "") return draft.slice(0, TRANSCRIPT_MAX_LENGTH);
  const joined = draft === "" || /\n$/.test(draft) ? draft + piece : `${draft}\n${piece}`;
  return joined.slice(0, TRANSCRIPT_MAX_LENGTH);
}
