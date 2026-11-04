// 音声まわりで画面に出す固定文（3D の対話モードだけで出す）。医療に関わる文は含まない。

import type { SpeakerEngine } from "./speaker";
import type { TalkNotice, TalkStyle } from "./talk";

export const TALK_LABELS: Record<TalkStyle, { idle: string; listening: string }> = {
  hold: { idle: "押している間、話す", listening: "聞いています（離すと止まります）" },
  tap: { idle: "押して話す", listening: "聞いています（もう一度押すと止まります）" },
};

/** 認識した文は入力欄に入るだけで、送らない（ADR-0010） */
export const TALK_HINT = "話した内容は入力欄に入ります。直してから「答える」を押してください。";

export const TALK_INSERTED = "聞き取った文を入力欄に入れました。直してから「答える」を押してください。";

export const TALK_NOTICES: Record<TalkNotice, string> = {
  unsupported: "このブラウザでは音声で答えられません。文字で答えてください。",
  denied: "マイクが使えません（許可されていません）。文字で答えてください。",
  no_mic: "マイクが見つかりません。文字で答えてください。",
  network: "音声の聞き取りがうまくいきませんでした（通信）。もう一度押して話すか、文字で答えてください。",
  no_speech: "声が聞き取れませんでした。もう一度押して話すか、文字で答えてください。",
  failed: "音声の聞き取りがうまくいきませんでした。もう一度押して話すか、文字で答えてください。",
};

export const SPEAKER_LABELS = {
  stop: "読み上げを止める",
  replay: "もう一度聞く",
  blocked: "読み上げを聞く",
};

/** 読み上げを切り替えたときの知らせ。ElevenLabs のときは何も出さない */
export const SPEAKER_ENGINE_NOTES: Record<SpeakerEngine, string | null> = {
  elevenlabs: null,
  browser: "ブラウザの読み上げに切り替えました。",
  none: "このブラウザでは読み上げを使えないため、文字で示します。",
};
