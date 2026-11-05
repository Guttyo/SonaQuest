// BGM（B-03、ADR-0039）。音のファイルは使わず、Web Audio API で、ゆっくり移る穏やかな和音をコードで鳴らす。
// 利用者が「BGM」を押すまで AudioContext を作らない（自動再生しない）。
// 読み上げの間は小さくし、中断の画面では止める（ADR-0011）。BGM が無くても訓練は進む：
// Web Audio が無い・失敗したときは「使えない」に変わるだけで、例外を外に出さない。
// 設定は保存しない（メモリにだけ持つ）。ログには何も出さない（ADR-0007）。

/** AudioParam のうち、使う部分だけ */
export interface ParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect(): void;
}

export interface GainLike extends NodeLike {
  readonly gain: ParamLike;
}

export interface OscillatorLike extends NodeLike {
  type: string;
  readonly frequency: ParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

/** AudioContext のうち、使う部分だけ */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: NodeLike;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export interface BgmSnapshot {
  /** この端末で BGM を使えるか。Web Audio が無い・失敗したときは false */
  available: boolean;
  /** 鳴らしているか（利用者が押したときだけ true になる） */
  on: boolean;
  /** 音量（0〜100） */
  volume: number;
  /** 読み上げの間で、小さくしている */
  ducked: boolean;
  /** 動きを減らす設定。このときは BGM を鳴らさない（2026-11-05 オーナー決定） */
  reducedMotion: boolean;
  /** 終わりの画面。止めた後は、この画面では鳴らし直せない（2026-11-05 オーナー決定） */
  locked: boolean;
}

export interface BgmDeps {
  /** null を返す・例外を投げるときは、BGM を使えない */
  createContext: (() => AudioContextLike | null) | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** 動きを減らす設定か（作るときの値。後の変化は setReducedMotion で知らせる） */
  reducedMotion?: boolean;
}

// [TODO-OWNER: BGM の初期状態（Claude Code の下書きはオフ。オンにしても、利用者が最初に押すまでは鳴らない）]
// → オーナー決定（2026-11-05、チャット）：「オフ」（BGM の初期状態）
export const BGM_DEFAULT_ON = false;

/**
 * BGM を止める画面。中断の画面（訓練をやめた・体調の訴え・自傷の案内。どれも stopped）では必ず止める（ADR-0011）。
 * 振り返り（review）では鳴らし続け、終わりの画面（done）では止める
 */
// [TODO-OWNER: 振り返りと終わりの画面での BGM の扱い（Claude Code の下書き：振り返りでは鳴らし続け、終わりの画面で止める）]
// → オーナー決定（2026-11-05、チャット）：「振り返りで鳴らし終わりで止める」（振り返りと終わりの画面での BGM の扱い）
export function bgmStopsOn(stage: string): boolean {
  return stage === "stopped" || stage === "done";
}

// [TODO-OWNER: 動きを減らす設定のときの BGM の扱い（Claude Code の下書き：BGM は動きではないので変えない。初期状態のオフと、いつでも止められることで足りるとした）]
// → オーナー決定（2026-11-05、チャット）：「BGM も鳴らさない」（動きを減らす設定のときの BGM の扱い）

/** 終わりの画面では、小さくし終えてから止め、その画面では鳴らし直せないようにする */
export function bgmLocksOn(stage: string): boolean {
  return stage === "done";
}

/** 消音のときに小さくし終えるまでの秒数 */
export const BGM_MUTE_FADE_SECONDS = 0.3;
/** 終わりの画面で小さくし終えるまでの秒数（ゆっくり消える） */
export const BGM_END_FADE_SECONDS = 2;

/** 音量の初期値（0〜100。下書き） */
export const BGM_DEFAULT_VOLUME = 40;

/** 音量 100 のときの全体の大きさ。読み上げより十分に小さくする */
const MASTER_MAX = 0.12;
/** 読み上げの間に下げる割合（止めずに、聞き取りの邪魔にならない大きさまで下げる。下書き） */
export const BGM_DUCK_RATIO = 0.2;
/** 和音ひとつの長さ（秒）。ゆっくり移り、前後の和音を重ねてつなぐ */
const CHORD_SECONDS = 8;
const FADE_SECONDS = 3;

/**
 * 和音の進み（Hz）。ハ長調の I → vi → IV → V に近い、低めで柔らかい音。
 * 長く続く持続音だけで、拍やリズムは付けない（緊張をあおらない）
 */
export const BGM_CHORDS: readonly (readonly number[])[] = [
  [130.81, 196.0, 329.63], // C3 G3 E4
  [110.0, 164.81, 261.63], // A2 E3 C4
  [87.31, 130.81, 220.0], // F2 C3 A3
  [98.0, 146.83, 246.94], // G2 D3 B3
];

const NOTE_LEVEL = 0.22;

export class Bgm {
  private readonly deps: BgmDeps;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private ctx: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private timer: unknown = null;
  private chordIndex = 0;
  /** 鳴っている音。止めるときに、すべて消す */
  private voices: OscillatorLike[] = [];
  /** 利用者が自分で BGM を押したか。押していれば、訓練の開始で初期状態に戻さない */
  private userChose = false;
  private readonly duckReasons = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private state: BgmSnapshot;

  constructor(deps: BgmDeps) {
    this.deps = deps;
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.state = {
      available: deps.createContext !== null,
      on: false,
      volume: BGM_DEFAULT_VOLUME,
      ducked: false,
      reducedMotion: deps.reducedMotion === true,
      locked: false,
    };
  }

  get snapshot(): BgmSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 利用者が押したときだけ呼ぶ（クリックの処理の中。自動再生の制限のため） */
  toggle(): void {
    this.userChose = true;
    if (this.state.on) this.stop();
    else this.start();
  }

  /** 鳴らせない状態か（動きを減らす設定、終わりの画面） */
  get blocked(): boolean {
    return this.state.reducedMotion || this.state.locked;
  }

  /** 動きを減らす設定が変わったとき。設定になったら止め、その間は鳴らさない */
  setReducedMotion(reduced: boolean): void {
    if (reduced === this.state.reducedMotion) return;
    if (reduced) this.stop();
    this.set({ reducedMotion: reduced });
  }

  /**
   * 終わりの画面に入ったら locked=true（ゆっくり小さくして止め、鳴らし直せない）。
   * はじめにに戻るなど、終わりの画面を離れたら locked=false（また押せば鳴らせる。自動では鳴らさない）
   */
  setLocked(locked: boolean): void {
    if (locked === this.state.locked) return;
    if (locked) this.stop(BGM_END_FADE_SECONDS);
    this.set({ locked });
  }

  /**
   * 訓練を始めるボタンを押したとき（利用者の操作の中）。初期状態がオンで、利用者がまだ BGM を
   * 押していなければ鳴らし始める。初期状態がオフ（下書き）なら何もしない
   */
  startIfDefaultOn(defaultOn: boolean = BGM_DEFAULT_ON): void {
    if (defaultOn && !this.userChose) this.start();
  }

  /** 鳴らし始める。AudioContext はここで初めて作る */
  start(): void {
    if (!this.state.available || this.state.on || this.blocked) return;
    try {
      if (this.ctx === null) {
        const ctx = this.deps.createContext?.() ?? null;
        if (ctx === null) {
          this.fail();
          return;
        }
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        this.master = master;
      }
      // iOS などでは、押した処理の中で resume しないと鳴らない。失敗しても画面は止めない
      void this.ctx.resume().catch(() => this.fail());
      this.set({ on: true });
      this.applyLevel();
      this.chordIndex = 0;
      this.playChord();
    } catch {
      this.fail();
    }
  }

  /** 止める（消音、中断の画面、終わりの画面）。何度呼んでもよい。fadeSeconds で小さくし終えてから止める */
  stop(fadeSeconds: number = BGM_MUTE_FADE_SECONDS): void {
    const fade = Number.isFinite(fadeSeconds) && fadeSeconds > 0 ? fadeSeconds : BGM_MUTE_FADE_SECONDS;
    this.clearChordTimer();
    if (!this.state.on) return;
    this.set({ on: false });
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + fade);
      for (const osc of this.voices) {
        try {
          osc.stop(now + fade + 0.05);
        } catch {
          // もう止まっている音は無視する
        }
      }
      this.voices = [];
      // 小さくし終えてから止める（すぐ止めると、ぷつっと切れる）
      this.setTimer(() => {
        if (!this.state.on && this.ctx === ctx) void ctx.suspend().catch(() => {});
      }, Math.round(fade * 1000) + 100);
    } catch {
      this.fail();
    }
  }

  setVolume(volume: number): void {
    const v = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : this.state.volume;
    this.set({ volume: v });
    this.applyLevel();
  }

  /** 読み上げの間は小さくする。reason ごとに数え、すべて終わったら戻す */
  setDucked(reason: string, ducked: boolean): void {
    if (ducked) this.duckReasons.add(reason);
    else this.duckReasons.delete(reason);
    const next = this.duckReasons.size > 0;
    if (next === this.state.ducked) return;
    this.set({ ducked: next });
    this.applyLevel();
  }

  /** いまの全体の大きさ（試験と画面の確認のため） */
  get targetLevel(): number {
    if (!this.state.on) return 0;
    return (this.state.volume / 100) * MASTER_MAX * (this.state.ducked ? BGM_DUCK_RATIO : 1);
  }

  dispose(): void {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx !== null) {
      try {
        void ctx.close().catch(() => {});
      } catch {
        // 片づけの失敗は無視する
      }
    }
  }

  private applyLevel(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(this.targetLevel, now, 0.25);
    } catch {
      this.fail();
    }
  }

  private playChord(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || !this.state.on) return;
    try {
      const notes = BGM_CHORDS[this.chordIndex % BGM_CHORDS.length]!;
      this.chordIndex += 1;
      const start = ctx.currentTime;
      const end = start + CHORD_SECONDS + FADE_SECONDS;
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator();
        // いちばん低い音は三角波、上の音は正弦波にして、柔らかくする
        osc.type = i === 0 ? "triangle" : "sine";
        osc.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(NOTE_LEVEL / notes.length, start + FADE_SECONDS);
        gain.gain.setValueAtTime(NOTE_LEVEL / notes.length, start + CHORD_SECONDS);
        gain.gain.linearRampToValueAtTime(0, end);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(end + 0.1);
        this.voices.push(osc);
      });
      // 鳴り終えた和音の音は、一覧から外す（前の和音と重なる分だけ残す）
      this.voices = this.voices.slice(-notes.length * 2);
      this.timer = this.setTimer(() => this.playChord(), CHORD_SECONDS * 1000);
    } catch {
      this.fail();
    }
  }

  private clearChordTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** 使えないと分かった。鳴らさず、訓練はそのまま進める */
  private fail(): void {
    this.clearChordTimer();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx !== null) {
      try {
        void ctx.close().catch(() => {});
      } catch {
        // 片づけの失敗は無視する
      }
    }
    this.set({ available: false, on: false });
  }

  private set(patch: Partial<BgmSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // 画面の側の失敗で BGM を止めない
      }
    }
  }
}
