// 音声の部品を、実際のブラウザの API につなぐ。試験では使わない（talk.ts と speaker.ts に偽物を差し込む）。

import { Speaker, fetchTtsAudio, type AudioLike, type SpeakerSnapshot, type SynthLike, type UtteranceLike } from "./speaker";

/** このページで利用者が一度でも操作したか。navigator.userActivation が無いブラウザのために、自分でも数える */
let activated = false;
if (typeof document !== "undefined") {
  const mark = () => {
    activated = true;
  };
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    document.addEventListener(type, mark, { capture: true, once: true });
  }
}

export function hasUserActivation(): boolean {
  if (activated) return true;
  const ua = (globalThis.navigator as { userActivation?: { hasBeenActive?: boolean } } | undefined)
    ?.userActivation;
  return ua?.hasBeenActive === true;
}

function browserSynth(): SynthLike | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? (window.speechSynthesis as unknown as SynthLike)
    : null;
}

export function createBrowserSpeaker(onChange: (snapshot: SpeakerSnapshot) => void): Speaker {
  return new Speaker({
    // 設計図が無い文は /api/tts に送らない（失敗として、ブラウザの読み上げに切り替わる。Issue #284）
    fetchAudio: (_text, signal, spec) => (spec === undefined ? Promise.reject(new Error("tts_no_spec")) : fetchTtsAudio(spec, signal)),
    createAudio: () => new Audio() as unknown as AudioLike,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    synth: browserSynth(),
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    hasUserActivation,
    onChange,
    // 本文を含まない種類だけ（ADR-0007）
    warn: (kind) => console.warn(kind),
  });
}

/** 開いている読み上げとマイクを止める手続きの一覧。中断の画面で、残っていたものも止める */
const stoppers = new Set<() => void>();

export function registerVoiceStopper(stop: () => void): () => void {
  stoppers.add(stop);
  return () => {
    stoppers.delete(stop);
  };
}

/** 読み上げとマイクをすべて止める。何度呼んでもよい（中断の画面、ADR-0011） */
export function stopAllVoice(): void {
  for (const stop of [...stoppers]) stop();
  browserSynth()?.cancel();
}
