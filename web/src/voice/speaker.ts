// 聞き取り係の文の読み上げ（ADR-0005、ADR-0033、Issue #53）。
// まず Workers の中継（/api/tts）経由で ElevenLabs を使い、失敗したとき・始まるまでが長いときは、
// ブラウザの読み上げ（speechSynthesis）に切り替えて、その回の残りでは ElevenLabs を呼ばない。
// 読み上げるのは聞き取り係の文と固定文だけ。利用者の回答は渡さない（speech.ts）。
// 音声はメモリにだけ持ち、保存しない。本文はログに出さない（ADR-0007）。

/** ElevenLabs の読み上げが始まるまで待つ上限。過ぎたらブラウザの読み上げに切り替える（ADR-0033。オーナーに確かめる） */
export const TTS_START_TIMEOUT_MS = 5_000;

/** 読み上げに使っているもの。none は読み上げなし（画面の文だけで進む） */
export type SpeakerEngine = "elevenlabs" | "browser" | "none";

export interface SpeakerSnapshot {
  engine: SpeakerEngine;
  /** 音声を取りに行っている間 */
  loading: boolean;
  /** 声が出ている間（パペットの口を動かす） */
  speaking: boolean;
  /** ブラウザの自動再生の制限で止まった。利用者が押せば読み上げる */
  blocked: boolean;
}

/** HTMLAudioElement のうち、使う部分だけ */
export interface AudioLike {
  src: string;
  onplaying: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
}

/** SpeechSynthesisUtterance のうち、使う部分だけ */
export interface UtteranceLike {
  lang: string;
  voice: VoiceLike | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { readonly error?: string }) => void) | null;
}

export interface VoiceLike {
  readonly lang: string;
}

/** speechSynthesis のうち、使う部分だけ */
export interface SynthLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices(): readonly VoiceLike[];
}

export interface SpeakerDeps {
  /** /api/tts から音声を取る。失敗は例外にする */
  fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob>;
  createAudio: () => AudioLike;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  /** null のときは、ブラウザの読み上げも無い */
  synth: SynthLike | null;
  createUtterance: (text: string) => UtteranceLike;
  /** 利用者がこのページで一度でも操作したか（最初のタップまで再生しない） */
  hasUserActivation: () => boolean;
  startTimeoutMs?: number;
  onChange?: (snapshot: SpeakerSnapshot) => void;
  /** 本文を含まない種類だけを出す（ADR-0007） */
  warn?: (kind: string) => void;
}

/** ElevenLabs から切り替えた理由。ログには種類だけを出す */
export type FallbackReason = "failed" | "timeout" | "media_error";

export class Speaker {
  private readonly deps: SpeakerDeps;
  private readonly startTimeoutMs: number;
  private readonly onChange: (snapshot: SpeakerSnapshot) => void;
  private readonly warn: (kind: string) => void;
  /** 同じ文を2回取りに行かない（固定の質問は回ごとに繰り返す）。メモリの中だけ */
  private readonly cache = new Map<string, Blob>();
  private audio: AudioLike | null = null;
  private objectUrl: string | null = null;
  private abortFetch: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** 古い読み上げの知らせを捨てるための番号 */
  private token = 0;
  private lastText: string | null = null;
  private disposed = false;
  private state: SpeakerSnapshot;

  constructor(deps: SpeakerDeps) {
    this.deps = deps;
    this.startTimeoutMs = deps.startTimeoutMs ?? TTS_START_TIMEOUT_MS;
    this.onChange = deps.onChange ?? (() => {});
    this.warn = deps.warn ?? (() => {});
    this.state = { engine: "elevenlabs", loading: false, speaking: false, blocked: false };
  }

  get snapshot(): SpeakerSnapshot {
    return this.state;
  }

  /** 文を読み上げる。前の読み上げは止める。最初のタップの前なら、押されるまで待つ */
  speak(text: string): void {
    if (this.disposed) return;
    this.stop();
    this.lastText = text;
    if (!this.deps.hasUserActivation()) {
      this.set({ blocked: true });
      return;
    }
    const token = ++this.token;
    if (this.state.engine === "elevenlabs") void this.speakElevenLabs(text, token);
    else this.speakBrowser(text, token);
  }

  /** 利用者が押した（自動再生の制限のときの続き、もう一度聞く） */
  replay(): void {
    if (this.lastText !== null) this.speak(this.lastText);
  }

  /** 読み上げを止める（マイクを開く前、画面を離れる、中断） */
  stop(): void {
    this.token++;
    this.clearTimer();
    this.abortFetch?.abort();
    this.abortFetch = null;
    if (this.audio !== null) {
      this.audio.onplaying = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    this.releaseUrl();
    this.deps.synth?.cancel();
    if (this.state.loading || this.state.speaking || this.state.blocked) {
      this.set({ loading: false, speaking: false, blocked: false });
    }
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.cache.clear();
  }

  private async speakElevenLabs(text: string, token: number): Promise<void> {
    this.set({ loading: true });
    const controller = new AbortController();
    this.abortFetch = controller;
    // 始まるまでが長いときは、待たずにブラウザの読み上げへ
    this.timer = setTimeout(() => {
      if (token === this.token) this.fallback(text, token, "timeout");
    }, this.startTimeoutMs);
    try {
      let blob = this.cache.get(text);
      if (blob === undefined) {
        blob = await this.deps.fetchAudio(text, controller.signal);
        this.cache.set(text, blob);
      }
      if (token !== this.token) return;
      const audio = this.audio ?? (this.audio = this.deps.createAudio());
      this.releaseUrl();
      this.objectUrl = this.deps.createObjectUrl(blob);
      audio.onplaying = () => {
        if (token !== this.token) return;
        this.clearTimer();
        this.set({ loading: false, speaking: true });
      };
      audio.onended = () => {
        if (token !== this.token) return;
        this.releaseUrl();
        this.set({ speaking: false });
      };
      audio.onerror = () => {
        if (token === this.token) this.fallback(text, token, "media_error");
      };
      audio.src = this.objectUrl;
      await audio.play();
    } catch (error) {
      if (token !== this.token) return;
      if (isNotAllowed(error)) {
        // 自動再生の制限。事業者の失敗ではないので切り替えず、押されるのを待つ
        this.clearTimer();
        this.set({ loading: false, blocked: true });
        return;
      }
      this.fallback(text, token, "failed");
    }
  }

  /**
   * ElevenLabs をやめて、その回の残りはブラウザの読み上げにする。
   * 番号を進め、止めた取りに行く処理の失敗（AbortError）で、もう一度切り替えないようにする
   */
  private fallback(text: string, token: number, reason: FallbackReason): void {
    if (token !== this.token) return;
    const next = ++this.token;
    this.clearTimer();
    this.abortFetch?.abort();
    this.abortFetch = null;
    if (this.audio !== null) {
      this.audio.onplaying = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
    }
    this.releaseUrl();
    this.warn(`tts: fallback_${reason}`);
    this.set({ engine: this.deps.synth === null ? "none" : "browser", loading: false, speaking: false });
    this.speakBrowser(text, next);
  }

  private speakBrowser(text: string, token: number): void {
    const synth = this.deps.synth;
    if (synth === null) {
      this.set({ engine: "none", loading: false, speaking: false });
      return;
    }
    const utterance = this.deps.createUtterance(text);
    utterance.lang = "ja-JP";
    utterance.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ja")) ?? null;
    utterance.onstart = () => {
      if (token === this.token) this.set({ speaking: true });
    };
    utterance.onend = () => {
      if (token === this.token) this.set({ speaking: false });
    };
    utterance.onerror = (event) => {
      if (token !== this.token) return;
      // 自動再生の制限（not-allowed）は、押されるのを待つ。それ以外は文だけで進む
      this.set({ speaking: false, blocked: event.error === "not-allowed" });
    };
    synth.cancel();
    synth.speak(utterance);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 再生に使った URL を手放す。src を空にすると error が起きるブラウザがあるので、src は変えない */
  private releaseUrl(): void {
    if (this.objectUrl !== null) {
      this.deps.revokeObjectUrl(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private set(patch: Partial<SpeakerSnapshot>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onChange(this.state);
  }
}

function isNotAllowed(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "NotAllowedError";
}

/** 読み上げの中継（Workers の /api/tts）。送るのは読み上げる文だけ。失敗は例外にする */
export async function fetchTtsAudio(
  text: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Blob> {
  const response = await fetchImpl("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(`tts_status_${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("tts_empty");
  return blob;
}
