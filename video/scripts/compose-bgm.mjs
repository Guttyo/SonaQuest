// 提出動画の BGM（訓練の 4〜6番以外）をコードで作り、WAV に書き出す（Issue #262）。
// 外の音源・サンプル・ループは使わない。Node.js の標準だけで PCM を計算する（依存パッケージなし）。
// 使い方（リポジトリの直下から）：
//   node video/scripts/compose-bgm.mjs
// 書くもの：video/public/bgm/{opening,board,models,ending}.wav（Git の対象外。48 kHz・ステレオ・16 bit）
// ログに出すのはファイル名・長さ・音の大きさだけ。
//
// 調とテンポは訓練の BGM（web/src/bgm/bgm.ts：ハ長調・120 BPM・C–G/B–Am–F・4拍子）に合わせる。
// - opening：イ短調（ハ長調と同じ調号）・60 BPM（120 の半分）
// - board・models・ending：ハ長調・120 BPM
// 合わせるのは調とテンポだけで、音域は合わせない。ナレーション（日本語、やや速い）の声の帯域
// （おおよそ 300 Hz〜3 kHz）を避けるため、和音と伸ばす音は 300 Hz より下、きらめきは 3 kHz より上に置き、
// 真ん中には短い音を少しだけ置く。サイン波と三角波（倍音を切ったもの）だけを使う。
// 場面の秒は video/src/sections.ts の表と同じ（合計 180 秒）。表を直したら、下の SCENES も直す。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SR = 48000;
/** 目標の音の大きさ（LUFS、BS.1770 の積分値）。ナレーションの下に敷く伴奏の大きさ */
const TARGET_LUFS = -24;
/** サンプルの山の上限（dBFS）。これを超えるときは、音の大きさより山を優先して下げる */
const PEAK_CEILING_DB = -3;
/** 頭と終わりのフェード（秒） */
const FADE_SECONDS = 0.5;
/** 高い音（鈴・刻み・ハイハット・データの音）の持ち上げ。声の帯域より上で、小さなスピーカーでも聞こえるように */
const HIGH_GAIN = 2;

/** 場面の秒（sections.ts の表と同じ） */
const SCENES = {
  opening: [8, 10, 15], // 1〜3番
  board: [13, 23, 12, 13], // 7〜10番
  models: [9], // 11番
  ending: [10, 10], // 12〜13番
};

const outDir = path.resolve(import.meta.dirname, "..", "public", "bgm");

// ---------------------------------------------------------------- 基本

const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** 決まった種の乱数（毎回同じ音になる） */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2次のフィルター（RBJ の式） */
function biquad(type, f0, q = Math.SQRT1_2) {
  const w = (TAU * f0) / SR;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "hp") [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  const a0 = 1 + al;
  return { b: [b0 / a0, b1 / a0, b2 / a0], a: [1, (-2 * c) / a0, (1 - al) / a0] };
}

function filterInPlace(x, { b, a }) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i];
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

/** 高い帯域だけを残した雑音（刻みの音に使う）。1 秒分を作っておき、場所を変えて読む */
function makeNoise(seed, cutoff) {
  const r = rng(seed);
  const n = new Float64Array(SR);
  for (let i = 0; i < n.length; i++) n[i] = r() * 2 - 1;
  filterInPlace(n, biquad("hp", cutoff));
  filterInPlace(n, biquad("hp", cutoff));
  return n;
}
const HAT_NOISE = makeNoise(7, 8000);
const AIR_NOISE = makeNoise(11, 4500);

// ---------------------------------------------------------------- ミキサー

class Mix {
  constructor(seconds) {
    this.seconds = seconds;
    this.n = Math.round(seconds * SR);
    this.L = new Float64Array(this.n);
    this.R = new Float64Array(this.n);
    /** 残響へ送る分（モノ） */
    this.send = new Float64Array(this.n);
  }

  /** 1つの音を足す。fn(i, t) は i 番目のサンプル（音の頭からの秒 t）の値を返す */
  add(t0, dur, fn, { level = 1, pan = 0, send = 0 } = {}) {
    const start = Math.max(0, Math.round(t0 * SR));
    const end = Math.min(this.n, Math.round((t0 + dur) * SR));
    const gl = level * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = level * Math.sin(((pan + 1) * Math.PI) / 4);
    const off = Math.round(t0 * SR);
    for (let i = start; i < end; i++) {
      const v = fn((i - off) / SR);
      this.L[i] += v * gl;
      this.R[i] += v * gr;
      if (send) this.send[i] += v * level * send;
    }
  }
}

// ---------------------------------------------------------------- 楽器

/** 包絡（立ち上がり a、持続 dur のあと r で消える） */
const env = (t, a, dur, r) => {
  if (t < 0) return 0;
  if (t < a) return 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
  if (t < dur) return 1;
  if (t < dur + r) return 0.5 + 0.5 * Math.cos((Math.PI * (t - dur)) / r);
  return 0;
};

/**
 * パッド：のこぎり波を倍音で組み、cutoff Hz より上の倍音を切る（声の帯域に倍音を出さない）。
 * 3つの声を少しずらして左右に広げる。
 */
function pad(mix, t0, dur, notes, { level = 0.05, a = 1.2, r = 1.2, cutoff = 520, send = 0.35, width = 0.6, seed = 1 } = {}) {
  const r0 = rng(seed + Math.round(t0 * 100));
  for (const midi of notes) {
    for (const [cents, pan] of [[-7, -width], [0, 0], [7, width]]) {
      const f = hz(midi) * 2 ** (cents / 1200);
      const parts = [];
      for (let k = 1; k * f < cutoff * 1.5; k++) {
        const taper = k * f < cutoff ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (k * f - cutoff)) / (cutoff * 0.5));
        parts.push([k, (1 / k) * taper, r0() * TAU]);
      }
      const lfo = 0.15 + r0() * 0.2;
      const lp = r0() * TAU;
      mix.add(t0, dur + r, (t) => {
        let v = 0;
        for (const [k, amp, ph] of parts) v += amp * Math.sin(TAU * f * k * t + ph);
        return v * env(t, a, dur, r) * (0.9 + 0.1 * Math.sin(TAU * lfo * t + lp));
      }, { level: level / 3, pan, send });
    }
  }
}

/** 低音：サインに弱い2倍音。center に置く */
function bass(mix, t0, dur, midi, { level = 0.25, r = 0.08, decay = 1.5 } = {}) {
  const f = hz(midi);
  mix.add(t0, dur + r, (t) => {
    const e = env(t, 0.006, dur, r) * (0.55 + 0.45 * Math.exp(-t / decay));
    return e * (Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 2 * f * t) + 0.05 * Math.sin(TAU * 3 * f * t));
  }, { level });
}

/** はじく音：三角波（cutoff より上の倍音を切る）が指数で消える */
function pluck(mix, t0, midi, { level = 0.1, decay = 0.35, pan = 0, send = 0.2, cutoff = 900, len } = {}) {
  const f = hz(midi);
  const parts = [];
  for (let k = 1; k * f < cutoff; k += 2) parts.push([k, ((k - 1) / 2) % 2 ? -1 / (k * k) : 1 / (k * k)]);
  const L = len ?? decay * 5;
  mix.add(t0, L, (t) => {
    let v = 0;
    for (const [k, amp] of parts) v += amp * Math.sin(TAU * f * k * t);
    return v * Math.exp(-t / decay) * Math.min(1, t / 0.004) * (t > L - 0.02 ? (L - t) / 0.02 : 1);
  }, { level, pan, send });
}

/** 鈴の音：高い音域（3 kHz 前後より上）に、少しずれた倍音を足す */
function bell(mix, t0, midi, { level = 0.04, decay = 1.2, pan = 0, send = 0.5 } = {}) {
  const f = hz(midi);
  const parts = [[1, 1, decay], [2.0, 0.22, decay * 0.5], [3.01, 0.08, decay * 0.3]].filter(([k]) => f * k < 12000);
  mix.add(t0, decay * 5, (t) => {
    let v = 0;
    for (const [k, amp, d] of parts) v += amp * Math.exp(-t / d) * Math.sin(TAU * f * k * t);
    return v * Math.min(1, t / 0.002);
  }, { level: level * HIGH_GAIN, pan, send });
}

/** ピッという短い音（データの音）。データの粒を表す */
function blip(mix, t0, f, { level = 0.03, len = 0.05, pan = 0, send = 0.15 } = {}) {
  mix.add(t0, len, (t) => Math.sin(TAU * f * t) * Math.min(1, t / 0.002) * (1 - t / len) ** 2, { level: level * HIGH_GAIN, pan, send });
}

/** 刻み：bgm.ts の tick より高い所（4.4 kHz → 3.6 kHz）で、ごく短く */
function tick(mix, t0, { level = 0.02, pan = 0 } = {}) {
  const len = 0.035;
  mix.add(t0, len, (t) => {
    const f = 4400 - 800 * (t / len);
    return Math.sin(TAU * f * t) * (1 - t / len) * Math.min(1, t / 0.001);
  }, { level: level * HIGH_GAIN, pan });
}

/** ハイハット：8 kHz より上の雑音を短く */
function hat(mix, t0, { level = 0.03, decay = 0.025, pan = 0 } = {}) {
  const off = Math.floor((t0 * 9973) % (SR - 0.3 * SR));
  mix.add(t0, decay * 6, (t) => HAT_NOISE[off + Math.floor(t * SR)] * Math.exp(-t / decay), { level: level * HIGH_GAIN, pan });
}

/** 柔らかいキック：サインの高さを下げる。アタックの「カチッ」は入れない（声の帯域を避ける） */
function kick(mix, t0, { level = 0.3, from = 105, to = 46, decay = 0.28 } = {}) {
  mix.add(t0, decay * 4, (t) => {
    const ph = TAU * (to * t + ((from - to) * 0.035) * (1 - Math.exp(-t / 0.035)));
    return Math.sin(ph) * Math.exp(-t / decay) * Math.min(1, t / 0.003);
  }, { level });
}

/** 心音のような2つの低い打音（どくん） */
function heartbeat(mix, t0, { level = 0.3 } = {}) {
  kick(mix, t0, { level, from: 80, to: 42, decay: 0.16 });
  kick(mix, t0 + 0.24, { level: level * 0.6, from: 72, to: 40, decay: 0.14 });
}

/** 高い帯域の雑音を、だんだん大きくする（早送りの盛り上がり） */
function riser(mix, t0, dur, { level = 0.05, pan = 0 } = {}) {
  mix.add(t0, dur + 0.05, (t) => {
    const k = Math.min(1, t / dur);
    return AIR_NOISE[Math.floor(t * SR) % SR] * k ** 2.5 * (t > dur ? 1 - (t - dur) / 0.05 : 1);
  }, { level, pan, send: 0.3 });
}

/** シンバルの代わりの、長く消える高い雑音（着地の合図） */
function wash(mix, t0, { level = 0.03, decay = 1.0 } = {}) {
  for (const pan of [-0.5, 0.5]) {
    const off = pan < 0 ? 0 : SR / 2;
    mix.add(t0, decay * 4, (t) => HAT_NOISE[(off + Math.floor(t * SR)) % SR] * Math.exp(-t / decay) * Math.min(1, t / 0.01), { level, pan, send: 0.4 });
  }
}

// ---------------------------------------------------------------- 残響（Freeverb の形）

function reverb(mix, { room = 0.82, damp = 0.25, wet = 1 } = {}) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const input = filterInPlace(Float64Array.from(mix.send), biquad("hp", 220));
  for (const [ch, spread] of [[mix.L, 0], [mix.R, 23]]) {
    const out = new Float64Array(mix.n);
    for (const d0 of combs) {
      const d = Math.round((d0 + spread) * scale);
      const buf = new Float64Array(d);
      let idx = 0, store = 0;
      for (let i = 0; i < mix.n; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = input[i] * 0.015 + store * room;
        out[i] += y;
        idx = (idx + 1) % d;
      }
    }
    for (const d0 of alls) {
      const d = Math.round((d0 + spread) * scale);
      const buf = new Float64Array(d);
      let idx = 0;
      for (let i = 0; i < mix.n; i++) {
        const b = buf[idx];
        const y = -out[i] + b;
        buf[idx] = out[i] + b * 0.5;
        out[i] = y;
        idx = (idx + 1) % d;
      }
    }
    for (let i = 0; i < mix.n; i++) ch[i] += out[i] * wet;
  }
}

// ---------------------------------------------------------------- 音の大きさ（BS.1770、48 kHz の係数）

function lufs(L, R) {
  const k = (x) => {
    const y = Float64Array.from(x);
    filterInPlace(y, { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] });
    filterInPlace(y, { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] });
    return y;
  };
  const kl = k(L), kr = k(R);
  const block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const zs = [];
  for (let s = 0; s + block <= kl.length; s += hop) {
    let z = 0;
    for (let i = s; i < s + block; i++) z += kl[i] * kl[i] + kr[i] * kr[i];
    zs.push(z / block);
  }
  const loud = (z) => -0.691 + 10 * Math.log10(z);
  const abs = zs.filter((z) => loud(z) > -70);
  const rel = loud(sum(abs) / abs.length) - 10;
  const gated = abs.filter((z) => loud(z) > rel);
  return loud(sum(gated) / gated.length);
}

// ---------------------------------------------------------------- 書き出し

function finish(mix) {
  // 30 Hz より下を切る（聞こえない低さの揺れを残さない）
  for (const ch of [mix.L, mix.R]) filterInPlace(ch, biquad("hp", 30));
  // 頭と終わりのフェード（余弦）
  const f = Math.round(FADE_SECONDS * SR);
  for (let i = 0; i < f; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / f);
    mix.L[i] *= g; mix.R[i] *= g;
    mix.L[mix.n - 1 - i] *= g; mix.R[mix.n - 1 - i] *= g;
  }
  const before = lufs(mix.L, mix.R);
  let gain = 10 ** ((TARGET_LUFS - before) / 20);
  let peak = 0;
  for (let i = 0; i < mix.n; i++) peak = Math.max(peak, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  const ceiling = 10 ** (PEAK_CEILING_DB / 20);
  if (peak * gain > ceiling) gain = ceiling / peak;
  const r = rng(99);
  const data = Buffer.alloc(mix.n * 4);
  for (let i = 0; i < mix.n; i++) {
    for (const [c, ch] of [[0, mix.L], [1, mix.R]]) {
      const dither = r() - r(); // 三角分布のディザ（±1 LSB）
      const v = Math.max(-32768, Math.min(32767, Math.round(ch[i] * gain * 32767 + dither)));
      data.writeInt16LE(v, i * 4 + c * 2);
    }
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return { wav: Buffer.concat([head, data]), lufs: 20 * Math.log10(gain) + before, peakDb: 20 * Math.log10(peak * gain) };
}

// ---------------------------------------------------------------- 和音

/** パッドの和音（伸ばす音は 330 Hz 以下に置く）と低音の根音 */
const CHORDS = {
  C: { pad: [48, 55, 60, 64], root: 36 },
  Cmaj7: { pad: [48, 52, 55, 59], root: 36 },
  Dm7: { pad: [50, 53, 57, 60], root: 38 },
  Em: { pad: [47, 52, 55, 59], root: 40 },
  Em7: { pad: [50, 52, 55, 59], root: 40 },
  F: { pad: [48, 53, 57, 60], root: 41 },
  Fmaj7: { pad: [52, 53, 57, 60], root: 41 },
  G: { pad: [47, 55, 59, 62], root: 43 },
  GB: { pad: [47, 55, 59, 62], root: 35 }, // G/B
  Gsus4: { pad: [50, 55, 60, 62], root: 43 },
  Am: { pad: [45, 52, 57, 60], root: 45 },
  Am7: { pad: [45, 52, 55, 60], root: 45 },
};
/** 和音の音（高い所で鳴らす鈴・データの音に使う。オクターブは呼ぶ側で足す） */
const TONES = {
  C: [0, 4, 7], Cmaj7: [0, 4, 7, 11], Dm7: [2, 5, 9, 12], Em: [4, 7, 11], Em7: [4, 7, 11, 14],
  F: [5, 9, 12], Fmaj7: [5, 9, 12, 16], G: [7, 11, 14], GB: [7, 11, 14], Gsus4: [7, 12, 14],
  Am: [9, 12, 16], Am7: [9, 12, 16, 19],
};

// ---------------------------------------------------------------- 1〜3番：opening（イ短調・60 BPM・33 秒）
// 静かで少し張りつめた、まじめな音。1番は頭の黒（0.9 秒）の間は低い持続音だけにし、
// 問いの文字が出る所で、高い鈴を1つだけ鳴らして問いを置く。2番（震源の地図）から心音のような低い打音を足す。
// 3番（本人の経験）は心音を止め、Am–F–C–G でゆっくり進め、G で終えて訓練のハ長調へ渡す。

function opening() {
  const [s1, s2, s3] = SCENES.opening;
  const total = s1 + s2 + s3;
  const m = new Mix(total);
  const t2 = s1, t3 = s1 + s2;

  // 1番：低い A と E の空虚五度（長調・短調を決めない、張りつめた持続音）
  pad(m, 0, t2 + 1, [45, 52], { level: 0.04, a: 2.5, r: 2, cutoff: 360, seed: 2 });
  bass(m, 0, t2 + 0.5, 33, { level: 0.1, r: 2, decay: 99 });
  // 問いが出る所（頭の黒は 0.9 秒。sections.ts の QUESTION_BLACKOUT_FRAMES）：高い鈴をひとつ。2つ目は少し後に、さらに小さく
  bell(m, 0.9, 93, { level: 0.05, decay: 2.2, pan: 0.1 }); // A6
  bell(m, 0.9, 100, { level: 0.012, decay: 1.6, pan: -0.2 }); // E7
  bell(m, 4.0, 88, { level: 0.022, decay: 2.0, pan: -0.3 }); // E6

  // 2番：心音（1 秒ごと）、Am → F。地図に震源が点る様子に、ごく小さな高い鈴を裏で
  for (let b = 0; b < s2; b++) heartbeat(m, t2 + b, { level: b === 0 ? 0.28 : 0.24 });
  pad(m, t2, 5, CHORDS.Am.pad, { level: 0.06, a: 1.5, r: 1.5, cutoff: 420, seed: 3 });
  pad(m, t2 + 5, s2 - 5, CHORDS.F.pad, { level: 0.06, a: 1.5, r: 1.5, cutoff: 420, seed: 4 });
  bass(m, t2, 5, 45 - 12, { level: 0.14, r: 1, decay: 99 });
  bass(m, t2 + 5, s2 - 5, 41 - 12, { level: 0.14, r: 1, decay: 99 });
  const quake = [93, 96, 100, 98, 93, 100, 96, 105, 100, 98];
  for (let b = 0; b < s2; b++) bell(m, t2 + b + 0.5, quake[b], { level: 0.012, decay: 0.8, pan: ((b * 37) % 9) / 4.5 - 1 });

  // 3番：Am–F–C–G、4 秒ずつ（最後の G は 3 秒）。低い三角波の分散和音を4分音符で
  const prog = [["Am", 4], ["F", 4], ["C", 4], ["G", 3]];
  let t = t3;
  for (const [name, len] of prog) {
    const ch = CHORDS[name];
    pad(m, t, len, ch.pad, { level: 0.085, a: 1.2, r: name === "G" ? 1 : 1.4, cutoff: 520, seed: 5 + t });
    bass(m, t, len - 0.05, ch.root - 12, { level: 0.2, r: 0.6, decay: 3 });
    const arp = [ch.root + 12, ch.root + 19, ch.root + 24, ch.root + 19];
    for (let b = 0; b < len; b++) {
      pluck(m, t + b, arp[b % arp.length], { level: 0.07, decay: 0.6, pan: b % 2 ? 0.25 : -0.25, send: 0.35, cutoff: 600 });
    }
    // 和音が変わる所に、高い鈴をひとつ
    bell(m, t + 0.02, 84 + TONES[name][1] + 12, { level: 0.014, decay: 1.6, pan: t % 8 ? 0.4 : -0.4 });
    t += len;
  }
  reverb(m, { room: 0.86, damp: 0.3, wet: 1 });
  return m;
}

// ---------------------------------------------------------------- 7〜10番：board（ハ長調・120 BPM・61 秒）
// 仕事が着実に進むリズム、落ち着いて信頼できる音。F–G–Em–Am（王道の進行）を1小節（2 秒）ずつ。
// 7番：写真（0〜10.2 秒）はパッドと刻みだけ、録画（10.2 秒〜）でハイハット。
// 8番（13 秒〜）：キック・8分の低音・高い分散和音。22〜26 秒の早送りは同じテンポのまま 16分に倍にし、
//   高い雑音で盛り上げ、26 秒で着地の合図。
// 9番（36 秒〜）：掲示板の5つの役。キックを減らし、5か所（左〜右）から短い鈴の呼びかけと返事。
// 10番（48 秒〜）：要約 → 監査 → 人の確認。F–G–Em–Am のあと F–G（半小節ずつ）で、58 秒に C へ着地する。

function board() {
  const [s7, s8, s9, s10] = SCENES.board;
  const total = s7 + s8 + s9 + s10;
  const m = new Mix(total);
  const beat = 60 / 120;
  const bar = beat * 4;
  const t8 = s7, t9 = s7 + s8, t10 = s7 + s8 + s9;
  const ffFrom = t8 + 9, ffTo = t8 + 13; // 早送りの札（sections.ts の 8番の badges）
  const landAt = total - 3; // C に着地する所

  /** その時刻の和音 */
  const loop = ["F", "G", "Em", "Am"];
  const chordAt = (t) => {
    if (t >= landAt) return "C";
    if (t >= landAt - 1) return "G";
    if (t >= landAt - 2) return "F";
    return loop[Math.floor(t / bar + 1e-9) % 4];
  };
  // 和音の区切り
  const changes = [];
  for (let t = 0; t < landAt - 2 - 1e-9; t += bar) changes.push([t, Math.min(bar, landAt - 2 - t)]);
  changes.push([landAt - 2, 1], [landAt - 1, 1], [landAt, 3]);

  for (const [t, len] of changes) {
    const name = chordAt(t + 0.01);
    const ch = CHORDS[name];
    const lvl = t < t8 ? 0.06 : 0.07;
    pad(m, t, t === landAt ? len - 1.5 : len, ch.pad, { level: name === "C" && t === landAt ? 0.09 : lvl, a: 0.4, r: t === landAt ? 1.5 : 0.5, cutoff: 480, seed: 20 + t });
  }

  for (let i = 0; i * beat < total - 1e-9; i++) {
    const t = i * beat;
    const inBar = i % 4; // 拍（0〜3）
    const name = chordAt(t + 0.01);
    const root = CHORDS[name].root;
    const ff = t >= ffFrom && t < ffTo;
    const sec9 = t >= t9 && t < t10;
    const end = t >= landAt;

    if (end) {
      if (t === landAt) {
        bass(m, t, 2.5, root - 12, { level: 0.24, r: 0.8, decay: 2 });
        kick(m, t, { level: 0.26 });
        for (const [k, st] of [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36]]) bell(m, t + st, 84 + k, { level: 0.02, decay: 1.6, pan: (k / 6) - 1 });
        wash(m, t, { level: 0.012, decay: 1.2 });
      }
      continue;
    }

    // 刻み（拍ごと）。7番からずっと鳴らす「時計」
    tick(m, t, { level: inBar === 0 ? 0.022 : 0.014, pan: 0.15 });

    // 低音
    if (t < t8) {
      if (inBar === 0) bass(m, t, bar - 0.1, root - 12, { level: 0.18, r: 0.3, decay: 2 });
      if (t >= 4) pluck(m, t + beat / 2, root + 12, { level: 0.04, decay: 0.18, pan: -0.2, send: 0.15, cutoff: 500 });
    } else if (sec9) {
      bass(m, t, beat * 0.9, root - 12 + (inBar === 3 ? 7 : 0), { level: 0.2, r: 0.06, decay: 0.4 });
    } else {
      bass(m, t, beat * 0.45, root - 12, { level: 0.2, r: 0.05, decay: 0.3 });
      bass(m, t + beat / 2, beat * 0.4, root - 12 + (inBar === 3 ? 12 : 0), { level: 0.15, r: 0.05, decay: 0.3 });
    }

    // キック：8番から。9番は1拍目だけ。7番の最後（12.5〜13 秒）は前ぶれ
    if (t >= t8 - 1e-9) {
      if (sec9 ? inBar === 0 : inBar % 2 === 0 || (t >= t8 && t < t8 + beat)) kick(m, t, { level: t >= t10 ? 0.24 : 0.27 });
    }

    // ハイハット：7番の録画（9 秒〜）から裏拍。早送りは 16分
    if (t >= 10) {
      // 7番の録画（写真の3カットの後、10.2 秒。sections.ts の PHOTO_SHOT_FRAMES）の頭から
      hat(m, t + beat / 2, { level: sec9 ? 0.022 : 0.03, pan: 0.3 });
      if (ff || (t >= t8 - beat * 1 && t < t8)) {
        hat(m, t + beat / 4, { level: 0.016, pan: -0.3 });
        hat(m, t + (beat * 3) / 4, { level: 0.016, pan: -0.3 });
      }
    }

    // 高い分散和音（3 kHz 前後〜）：8番と10番。8分、早送りは16分
    if (!sec9 && t >= t8) {
      const tones = TONES[name];
      const steps = ff ? 4 : 2;
      for (let s = 0; s < steps; s++) {
        const idx = (inBar * steps + s) % (tones.length + 1);
        const midi = 96 + (idx < tones.length ? tones[idx] : tones[0] + 12) - 12 * (tones[0] > 6 ? 1 : 0);
        const lvl = ff ? 0.011 : t >= t10 ? 0.012 : 0.014;
        bell(m, t + (s * beat) / steps, midi, { level: lvl, decay: ff ? 0.12 : 0.22, pan: s % 2 ? 0.45 : -0.45, send: 0.25 });
      }
    }

    // 9番：5つの役の呼びかけと返事（2拍目と4拍目に、場所を変えて2音）
    if (sec9 && (inBar === 1 || inBar === 3)) {
      const who = (i / 2) % 5;
      const pan = [-0.8, -0.4, 0, 0.4, 0.8][Math.floor(who)];
      const tones = TONES[name];
      bell(m, t, 96 + tones[0] - 12 * (tones[0] > 6 ? 1 : 0) + 12, { level: 0.016, decay: 0.3, pan });
      bell(m, t + beat / 2, 96 + tones[1] - 12 * (tones[0] > 6 ? 1 : 0) + 12, { level: 0.012, decay: 0.3, pan });
    }
  }

  // 7番の最後：8番の入り（13 秒）へ小さく盛り上げる
  riser(m, t8 - 2, 2, { level: 0.03 });
  // 早送り：盛り上げて、26 秒で着地
  riser(m, ffFrom, ffTo - ffFrom, { level: 0.06 });
  wash(m, ffTo, { level: 0.014, decay: 0.9 });
  // 9番の入りと10番の入りに、小さな合図
  wash(m, t9, { level: 0.008, decay: 0.6 });
  wash(m, t10, { level: 0.008, decay: 0.6 });

  reverb(m, { room: 0.8, damp: 0.3, wet: 0.9 });
  return m;
}

// ---------------------------------------------------------------- 11番：models（ハ長調・120 BPM・9 秒）
// 軽く、技術の感じ。Cmaj7–Dm7–Em7–Fmaj7 と1小節（2 秒）ずつ上がり、最後の1 秒は Gsus4 で次（12番の F）へ渡す。
// 高い所の 16分のデータの音、弱いサブの低音、8分の刻み。パッドはごく薄く。

function models() {
  const [s11] = SCENES.models;
  const m = new Mix(s11);
  const beat = 0.5;
  const prog = [["Cmaj7", 0, 2], ["Dm7", 2, 2], ["Em7", 4, 2], ["Fmaj7", 6, 2], ["Gsus4", 8, 1]];
  for (const [name, t, len] of prog) {
    const ch = CHORDS[name];
    pad(m, t, len, ch.pad.slice(0, 3), { level: 0.035, a: 0.3, r: 0.4, cutoff: 400, seed: 40 + t });
    bass(m, t, beat * 0.8, ch.root - 12, { level: 0.2, r: 0.05, decay: 0.3 });
    bass(m, t + beat * 2, beat * 0.8, ch.root - 12, { level: 0.15, r: 0.05, decay: 0.3 });
    kick(m, t, { level: 0.09, decay: 0.18 });
    const tones = TONES[name];
    for (let s = 0; s < len * 8; s++) {
      const st = t + s * (beat / 4);
      const k = tones[(s * 3) % tones.length] + (s % 8 >= 4 ? 12 : 0);
      blip(m, st, hz(96 + k - 12 * (tones[0] > 6 ? 1 : 0)), { level: s % 4 === 0 ? 0.03 : 0.018, len: 0.045, pan: ((s % 4) - 1.5) / 2.5 });
      if (s % 2 === 1) hat(m, st, { level: 0.014, decay: 0.015, pan: 0.35 });
    }
  }
  reverb(m, { room: 0.7, damp: 0.4, wet: 0.7 });
  return m;
}

// ---------------------------------------------------------------- 12〜13番：ending（ハ長調・120 BPM・20 秒）
// 温かく、希望のある音。12番（試した人のコメント）は低い三角波の分散和音とパッドだけ。
// 13番（締めの一言とロゴ）から高い鈴の分散和音とハイハットを足し、Am7–G/B（ラ・シ）と上がって 16 秒に C へ着地。
// 着地では、訓練の BGM の頭の音（ミ・ソ・ド）を1オクターブ上の鈴で鳴らし、残りの 4 秒は自然に消える。

function ending() {
  const [s12, s13] = SCENES.ending;
  const total = s12 + s13;
  const m = new Mix(total);
  const beat = 0.5;
  const t13 = s12;
  const landAt = total - 4;
  const prog = [
    ["F", 0, 2], ["G", 2, 2], ["Em7", 4, 2], ["Am7", 6, 2], ["Dm7", 8, 1], ["G", 9, 1],
    ["Fmaj7", 10, 2], ["G", 12, 2], ["Am7", 14, 1], ["GB", 15, 1], ["C", 16, 4],
  ];
  for (const [name, t, len] of prog) {
    const ch = CHORDS[name];
    const last = t === landAt;
    pad(m, t, last ? len - 2.2 : len, ch.pad, { level: last ? 0.1 : t >= t13 ? 0.085 : 0.075, a: t === 0 ? 1 : 0.5, r: last ? 2.0 : 0.6, cutoff: t >= t13 ? 560 : 480, seed: 60 + t });
    if (last) {
      bass(m, t, 1.6, ch.root - 12, { level: 0.24, r: 1.6, decay: 1.5 });
      kick(m, t, { level: 0.2, decay: 0.4 });
      for (const [k, st] of [[88, 0], [91, 0.25], [96, 0.5], [100, 0.75]]) bell(m, t + st, k, { level: k === 96 ? 0.026 : 0.02, decay: 1.8, pan: (k - 94) / 10 });
      wash(m, t, { level: 0.01, decay: 1.4 });
      continue;
    }
    // 低音：2分音符（13番は4分）
    for (let b = 0; b < len / beat; b += t >= t13 ? 1 : 2) bass(m, t + b * beat, beat * (t >= t13 ? 0.9 : 1.8), ch.root - 12, { level: 0.2, r: 0.1, decay: 1 });
    // 低い三角波の分散和音（4分）：根・5度・8度・10度
    const arp = [ch.root + 12, ch.root + 19, ch.root + 24, ch.root + 28 - (TONES[name][1] - TONES[name][0] === 3 ? 1 : 0)];
    for (let b = 0; b < len / beat; b++) {
      pluck(m, t + b * beat, arp[b % 4], { level: 0.06, decay: 0.45, pan: b % 2 ? 0.3 : -0.3, send: 0.35, cutoff: 620 });
    }
    if (t >= t13) {
      const tones = TONES[name];
      for (let s = 0; s < len / beat; s++) {
        bell(m, t + s * beat + beat / 2, 96 + tones[s % tones.length] - 12 * (tones[0] > 6 ? 1 : 0), { level: 0.013, decay: 0.5, pan: s % 2 ? 0.5 : -0.5, send: 0.45 });
        hat(m, t + s * beat + beat / 2, { level: 0.016, pan: 0.25 });
      }
    }
  }
  // 13番の入り：小さな合図
  wash(m, t13, { level: 0.007, decay: 0.8 });
  riser(m, landAt - 2, 2, { level: 0.025 });
  reverb(m, { room: 0.86, damp: 0.25, wet: 1 });
  return m;
}

// ---------------------------------------------------------------- 実行

const PIECES = [
  ["opening.wav", opening],
  ["board.wav", board],
  ["models.wav", models],
  ["ending.wav", ending],
];

await mkdir(outDir, { recursive: true });
for (const [name, make] of PIECES) {
  const started = Date.now();
  const mix = make();
  const { wav, lufs: l, peakDb } = finish(mix);
  await writeFile(path.join(outDir, name), wav);
  console.log(`${name}: ${mix.seconds} 秒, ${l.toFixed(1)} LUFS, 山 ${peakDb.toFixed(1)} dBFS（${((Date.now() - started) / 1000).toFixed(1)} 秒で作成）`);
}
