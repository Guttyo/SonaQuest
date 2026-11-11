// 押して話す（ADR-0033、Issue #52）。ブラウザの音声認識（Web Speech API、ADR-0004）を、
// 「話す」を押したときだけ開く（3D の対話は1回押しで、話し終わると自動で止まる。ボードの文字起こしは押している間）。認識した文は入力欄に入れるだけで、送らない（利用者が直してから送る。ADR-0010）。
// 緊急の照合は、送るときに文字入力と同じ照合（flow/emergency.ts）を通る（training.ts の "answer"）。
// 会話の本文・音声を保存しない。ログにも出さない（ADR-0007）。
// ブラウザの API は差し込める形にして、Node の単体試験で状態の移り変わりを確かめる。

import { MAX_ANSWER_LENGTH } from "../flow/rules";

/**
 * 押し方。tap は1回押すと聞き始め、話し終わると自動で止まる（既定。2026-11-06 オーナー決定「1回押しで自動で止まる」、
 * ADR-0033、Issue #52）。聞いている間にもう一度押すと止まる。hold は押している間だけ聞く（ボードの文字起こしで使う）。
 */
export type TalkStyle = "hold" | "tap";
export const TALK_STYLE: TalkStyle = "tap";

/** 音声認識の言語（ADR-0004） */
export const TALK_LANG = "ja-JP";

/** マイクを使えるか。ready 以外は文字入力だけで進む */
export type MicStatus = "ready" | "unsupported" | "denied" | "unavailable";

/** 利用者に文字で示す、うまくいかなかったことの種類 */
export type TalkNotice = "no_speech" | "denied" | "no_mic" | "network" | "unsupported" | "failed";

export interface TalkSnapshot {
  mic: MicStatus;
  /** マイクが開いているか（start してから end が来るまで） */
  listening: boolean;
  /** 聞き取り中の、まだ確定していない文（画面の中だけで見せる） */
  interim: string;
  notice: TalkNotice | null;
}

/** 認識の結果の1件（SpeechRecognitionResult のうち、使う部分だけ） */
export interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

export interface RecognitionResultEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike };
}

/** SpeechRecognition のうち、使う部分だけ */
export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionFactory = () => RecognitionLike;

/** ブラウザの SpeechRecognition（Chrome などは webkit の接頭辞つき）。無いブラウザでは null */
export function browserRecognitionFactory(
  scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
): RecognitionFactory | null {
  const Ctor = (scope.SpeechRecognition ?? scope.webkitSpeechRecognition) as
    | (new () => RecognitionLike)
    | undefined;
  return typeof Ctor === "function" ? () => new Ctor() : null;
}

/** マイクが使えない理由を、示す文の種類にする */
export function micNotice(mic: MicStatus): TalkNotice | null {
  if (mic === "unsupported") return "unsupported";
  if (mic === "denied") return "denied";
  if (mic === "unavailable") return "no_mic";
  return null;
}

/** エラーの種類から、示すことと、その後もマイクを使えるかを決める */
export function classifyRecognitionError(error: string): { notice: TalkNotice | null; mic: MicStatus | null } {
  switch (error) {
    case "aborted":
      // こちらから止めたとき（読み上げを始めた、画面を離れた）。何も示さない
      return { notice: null, mic: null };
    case "no-speech":
      return { notice: "no_speech", mic: null };
    case "not-allowed":
    case "service-not-allowed":
      return { notice: "denied", mic: "denied" };
    case "audio-capture":
      return { notice: "no_mic", mic: "unavailable" };
    case "network":
      return { notice: "network", mic: null };
    case "language-not-supported":
      return { notice: "unsupported", mic: "unsupported" };
    default:
      return { notice: "failed", mic: null };
  }
}

export interface PushToTalkOptions {
  /** null のときは、このブラウザで音声認識を使えない（文字入力で進む） */
  create: RecognitionFactory | null;
  /** その回のうちに、マイクが使えないと分かっていたら、その状態から始める（質問ごとに作り直すため） */
  mic?: MicStatus;
  style?: TalkStyle;
  /** 認識が終わったときの、確定した文。入力欄に足すだけで、送らない */
  onText: (text: string) => void;
  /** マイクを開く直前に呼ぶ。読み上げを止める（読み上げの間はマイクを閉じる。ADR-0033） */
  beforeListen: () => void;
  onChange?: (snapshot: TalkSnapshot) => void;
}

export class PushToTalk {
  private readonly create: RecognitionFactory | null;
  private readonly style: TalkStyle;
  private readonly onText: (text: string) => void;
  private readonly beforeListen: () => void;
  private readonly onChange: (snapshot: TalkSnapshot) => void;
  private recognition: RecognitionLike | null = null;
  /** 確定した文。end のときに渡す */
  private finalText = "";
  /** abort したら、届いた文を捨てる */
  private discard = false;
  private disposed = false;
  private state: TalkSnapshot;

  constructor(options: PushToTalkOptions) {
    this.create = options.create;
    this.style = options.style ?? TALK_STYLE;
    this.onText = options.onText;
    this.beforeListen = options.beforeListen;
    this.onChange = options.onChange ?? (() => {});
    this.state = {
      mic: options.create === null ? "unsupported" : (options.mic ?? "ready"),
      listening: false,
      interim: "",
      notice: null,
    };
  }

  get snapshot(): TalkSnapshot {
    return this.state;
  }

  /** 「話す」を押した。hold は押している間だけ、tap は話し終わるまで聞く */
  press(): void {
    if (this.disposed || this.state.mic !== "ready" || this.create === null) return;
    if (this.recognition !== null) {
      // tap では、聞いている間にもう一度押すと止める
      if (this.style === "tap") {
        try {
          this.recognition.stop();
        } catch {
          // すでに止まりかけている
        }
      }
      return;
    }
    // 読み上げを止めてからマイクを開く（自分の声を拾わない）
    this.beforeListen();
    let recognition: RecognitionLike;
    try {
      recognition = this.create();
    } catch {
      this.set({ mic: "unsupported", notice: "unsupported" });
      return;
    }
    recognition.lang = TALK_LANG;
    // hold は押している間ずっと聞き、離したら止める。tap は話し終わると自動で止まる
    recognition.continuous = this.style === "hold";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(recognition, event);
    recognition.onerror = (event) => this.handleError(recognition, event.error);
    recognition.onend = () => this.handleEnd(recognition);
    this.recognition = recognition;
    this.finalText = "";
    this.discard = false;
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      this.set({ listening: false, notice: "failed" });
      return;
    }
    this.set({ listening: true, interim: "", notice: null });
  }

  /** 「話す」から指を離した。hold のときだけ止める */
  release(): void {
    if (this.style !== "hold" || this.recognition === null) return;
    try {
      this.recognition.stop();
    } catch {
      // すでに止まりかけている（指を離した後に、焦点が外れたときなど）
    }
  }

  /** 届いた文を捨てて、すぐにマイクを閉じる（読み上げを始める、画面を離れる、中断） */
  abort(): void {
    const recognition = this.recognition;
    if (recognition === null) return;
    this.discard = true;
    this.recognition = null;
    detach(recognition);
    try {
      recognition.abort();
    } catch {
      // すでに止まっている
    }
    this.finalText = "";
    this.set({ listening: false, interim: "" });
  }

  dispose(): void {
    this.abort();
    this.disposed = true;
  }

  private handleResult(recognition: RecognitionLike, event: RecognitionResultEventLike): void {
    if (recognition !== this.recognition || this.discard) return;
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result.length > 0 ? result[0].transcript : "";
      if (result.isFinal) this.finalText += transcript;
      else interim += transcript;
    }
    this.set({ interim });
  }

  private handleError(recognition: RecognitionLike, error: string): void {
    if (recognition !== this.recognition) return;
    const { notice, mic } = classifyRecognitionError(error);
    this.set({
      ...(notice !== null ? { notice } : {}),
      ...(mic !== null ? { mic } : {}),
    });
  }

  private handleEnd(recognition: RecognitionLike): void {
    if (recognition !== this.recognition) return;
    this.recognition = null;
    detach(recognition);
    const text = this.finalText.trim();
    this.finalText = "";
    this.set({ listening: false, interim: "" });
    if (!this.discard && !this.disposed && text !== "") this.onText(text);
  }

  private set(patch: Partial<TalkSnapshot>): void {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.onChange(this.state);
  }
}

function detach(recognition: RecognitionLike): void {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  recognition.onstart = null;
}

/** 聞き取った文を下書きの後ろに足す。利用者が言っていない句読点は足さない。入力の上限で切る */
export function appendRecognized(draft: string, text: string): string {
  const joined = draft === "" || /\s$/.test(draft) ? draft + text : `${draft} ${text}`;
  return joined.slice(0, MAX_ANSWER_LENGTH);
}
