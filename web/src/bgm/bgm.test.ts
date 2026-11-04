import { describe, expect, it, vi } from "vitest";
import { BGM_DEFAULT_ON, BGM_DUCK_RATIO, Bgm, bgmStopsOn, type AudioContextLike, type GainLike, type OscillatorLike, type ParamLike } from "./bgm";

function fakeParam(): ParamLike & { target: number | null } {
  const p = {
    value: 0,
    target: null as number | null,
    setValueAtTime(v: number) {
      p.value = v;
    },
    linearRampToValueAtTime(v: number) {
      p.target = v;
    },
    setTargetAtTime(v: number) {
      p.target = v;
    },
    cancelScheduledValues() {},
  };
  return p;
}

function fakeContext() {
  const oscillators: (OscillatorLike & { started: boolean; stoppedAt: number[] })[] = [];
  const gains: GainLike[] = [];
  let state = "running";
  const ctx = {
    currentTime: 0,
    get state() {
      return state;
    },
    destination: { connect() {}, disconnect() {} },
    createGain(): GainLike {
      const g = { gain: fakeParam(), connect() {}, disconnect() {} };
      gains.push(g);
      return g;
    },
    createOscillator() {
      const o = {
        type: "sine",
        frequency: fakeParam(),
        started: false,
        stoppedAt: [] as number[],
        connect() {},
        disconnect() {},
        start() {
          o.started = true;
        },
        stop(when?: number) {
          o.stoppedAt.push(when ?? 0);
        },
      };
      oscillators.push(o);
      return o;
    },
    resume: vi.fn(async () => {
      state = "running";
    }),
    suspend: vi.fn(async () => {
      state = "suspended";
    }),
    close: vi.fn(async () => {
      state = "closed";
    }),
  };
  return { ctx: ctx as AudioContextLike & typeof ctx, oscillators, gains };
}

function setup() {
  const fake = fakeContext();
  const createContext = vi.fn(() => fake.ctx);
  const timers: (() => void)[] = [];
  const bgm = new Bgm({
    createContext,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: () => {},
  });
  const master = () => fake.gains[0] as GainLike & { gain: ReturnType<typeof fakeParam> };
  return { bgm, fake, createContext, timers, master };
}

describe("BGM を止める画面（B-03）", () => {
  it("中断の画面（訓練をやめた・体調の訴え・自傷の案内）と終わりの画面で止め、対話と振り返りでは止めない", () => {
    expect(bgmStopsOn("stopped")).toBe(true);
    expect(bgmStopsOn("done")).toBe(true);
    for (const stage of ["intro", "first", "confirm", "event", "second", "review"]) {
      expect(bgmStopsOn(stage)).toBe(false);
    }
  });

  it("初期状態の下書きはオフ", () => {
    expect(BGM_DEFAULT_ON).toBe(false);
  });
});

describe("BGM（B-03）", () => {
  it("利用者が押すまで AudioContext を作らず、鳴らさない", () => {
    const { bgm, createContext, fake } = setup();
    expect(createContext).not.toHaveBeenCalled();
    expect(bgm.snapshot.on).toBe(false);
    expect(bgm.targetLevel).toBe(0);
    // 音量を変えても、読み上げで小さくしても、鳴り始めない
    bgm.setVolume(80);
    bgm.setDucked("speech", true);
    expect(createContext).not.toHaveBeenCalled();
    expect(fake.oscillators).toHaveLength(0);
  });

  it("初期状態はオフ（下書き）。始めるボタンでも、初期状態がオフなら鳴らない", () => {
    const { bgm, createContext } = setup();
    bgm.startIfDefaultOn();
    expect(createContext).not.toHaveBeenCalled();
    expect(bgm.snapshot.on).toBe(false);
  });

  it("初期状態をオンにした場合も、利用者がもう BGM を止めていれば鳴らさない", () => {
    const { bgm } = setup();
    bgm.toggle();
    bgm.toggle();
    bgm.startIfDefaultOn(true);
    expect(bgm.snapshot.on).toBe(false);
  });

  it("押すと鳴り、和音の音を作り、もう一度押すと消音して止まる", () => {
    const { bgm, fake, createContext, master } = setup();
    bgm.toggle();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.ctx.resume).toHaveBeenCalled();
    expect(bgm.snapshot.on).toBe(true);
    expect(fake.oscillators.length).toBeGreaterThan(0);
    expect(fake.oscillators.every((o) => o.started)).toBe(true);
    expect(master().gain.target).toBeGreaterThan(0);

    bgm.toggle();
    expect(bgm.snapshot.on).toBe(false);
    expect(master().gain.target).toBe(0);
    expect(bgm.targetLevel).toBe(0);
    // 鳴っていた音を止める予定を入れる
    expect(fake.oscillators.every((o) => o.stoppedAt.length >= 2)).toBe(true);
  });

  it("消音した後は、次の和音を鳴らさない", () => {
    const { bgm, fake, timers } = setup();
    bgm.toggle();
    const count = fake.oscillators.length;
    bgm.toggle();
    for (const t of timers) t();
    expect(fake.oscillators).toHaveLength(count);
    expect(fake.ctx.suspend).toHaveBeenCalled();
  });

  it("音量を変えると全体の大きさが変わり、0〜100 に収める", () => {
    const { bgm } = setup();
    bgm.toggle();
    bgm.setVolume(100);
    const full = bgm.targetLevel;
    bgm.setVolume(50);
    expect(bgm.targetLevel).toBeCloseTo(full / 2);
    bgm.setVolume(250);
    expect(bgm.snapshot.volume).toBe(100);
    bgm.setVolume(-5);
    expect(bgm.snapshot.volume).toBe(0);
    expect(bgm.targetLevel).toBe(0);
  });

  it("読み上げの間は小さくし、終わったら戻す", () => {
    const { bgm, master } = setup();
    bgm.toggle();
    const normal = bgm.targetLevel;
    bgm.setDucked("speech", true);
    expect(bgm.snapshot.ducked).toBe(true);
    expect(bgm.targetLevel).toBeCloseTo(normal * BGM_DUCK_RATIO);
    expect(master().gain.target).toBeCloseTo(normal * BGM_DUCK_RATIO);
    bgm.setDucked("speech", false);
    expect(bgm.snapshot.ducked).toBe(false);
    expect(master().gain.target).toBeCloseTo(normal);
  });

  it("中断の画面で止める（stop は何度呼んでもよく、鳴らしていなくても例外にならない）", () => {
    const { bgm } = setup();
    expect(() => bgm.stop()).not.toThrow();
    bgm.toggle();
    bgm.stop();
    bgm.stop();
    expect(bgm.snapshot.on).toBe(false);
    expect(bgm.targetLevel).toBe(0);
  });

  it("Web Audio が無い端末では使えないと示し、押しても例外にならない", () => {
    const bgm = new Bgm({ createContext: null });
    expect(bgm.snapshot.available).toBe(false);
    expect(() => {
      bgm.toggle();
      bgm.setVolume(30);
      bgm.setDucked("speech", true);
      bgm.stop();
      bgm.dispose();
    }).not.toThrow();
    expect(bgm.snapshot.on).toBe(false);
  });

  it("AudioContext を作るのに失敗しても例外を外に出さず、使えないに変わる", () => {
    const bgm = new Bgm({
      createContext: () => {
        throw new Error("not allowed");
      },
    });
    expect(bgm.snapshot.available).toBe(true);
    expect(() => bgm.toggle()).not.toThrow();
    expect(bgm.snapshot.available).toBe(false);
    expect(bgm.snapshot.on).toBe(false);
  });

  it("音を作る途中で失敗しても例外を外に出さない", () => {
    const fake = fakeContext();
    let calls = 0;
    fake.ctx.createOscillator = () => {
      calls += 1;
      throw new Error("boom");
    };
    const bgm = new Bgm({ createContext: () => fake.ctx });
    expect(() => bgm.toggle()).not.toThrow();
    expect(calls).toBe(1);
    expect(bgm.snapshot.on).toBe(false);
    expect(fake.ctx.close).toHaveBeenCalled();
  });

  it("状態の変化を知らせる", () => {
    const { bgm } = setup();
    const listener = vi.fn();
    const off = bgm.subscribe(listener);
    bgm.toggle();
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    bgm.toggle();
    expect(listener).not.toHaveBeenCalled();
  });
});
