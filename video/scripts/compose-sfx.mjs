// 提出動画の効果音をコードで作り、WAV に書き出す（Issue #262。2026-11-08 オーナー：「効果音も！作ろう！」）。
// 外の音源・サンプルは使わない。Node.js の標準だけで PCM を計算する（依存パッケージなし）。
// 使い方（リポジトリの直下から）：
//   node video/scripts/compose-sfx.mjs
// 書くもの：video/public/sfx/{tap,whoosh,battery-off,confirm,pop,tick,pon,ding,cross,slam,pill-shake,rumble,ptp,book-close}.wav（Git の対象外。48 kHz・ステレオ・16 bit）
// ログに出すのはファイル名・長さ・山の大きさだけ。
// 音の山はファイルごとに決めた値にそろえる（PEAKS）。鳴らす大きさは Remotion の volume で決める。
// ナレーションの邪魔をしないよう、短く、立ち上がりを柔らかくする。乱数は種を固定してあるので毎回同じ音になる。

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SR = 48000;
const TAU = Math.PI * 2;
const outDir = path.resolve(import.meta.dirname, "..", "public", "sfx");

/** ファイルごとの山（dBFS）。タップ・ポップ・刻みは小さめ */
const PEAKS = {
  "tap.wav": -12,
  "whoosh.wav": -9,
  "battery-off.wav": -8,
  "confirm.wav": -9,
  "pop.wav": -12,
  "tick.wav": -14,
  // v2（Issue #315）で足した音。数字や ✕ が出る瞬間に合わせる
  "pon.wav": -10,
  "ding.wav": -10,
  "cross.wav": -10,
  "slam.wav": -8,
  // v2 の場面に合わせた音（2026-11-13 オーナー：「その場の雰囲気、場面に合うような音」「木のパチンという音」は例で、このアプリに合う音を、と言われて拍子木はやめた）
  "pill-shake.wav": -9,
  "rumble.wav": -6,
  "ptp.wav": -11,
  "book-close.wav": -10,
};

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

/** RBJ の2次フィルターの係数 */
function coeffs(type, f0, q = Math.SQRT1_2) {
  const w = (TAU * Math.min(f0, SR * 0.45)) / SR;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b;
  if (type === "hp") b = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else if (type === "lp") b = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else b = [al, 0, -al]; // bp（山の高さ 0 dB）
  const a0 = 1 + al;
  return { b: b.map((x) => x / a0), a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}

/** 2次フィルター。f0 を関数にすると、32 サンプルごとに係数を作り直す（周波数を動かす） */
function filter(x, type, f0, q) {
  const fixed = typeof f0 === "number" ? coeffs(type, f0, q) : null;
  let k = fixed, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (!fixed && i % 32 === 0) k = coeffs(type, f0(i / SR), q);
    const x0 = x[i];
    const y0 = k.b[0] * x0 + k.b[1] * x1 + k.b[2] * x2 - k.a1 * y1 - k.a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    x[i] = y0;
  }
  return x;
}

const buf = (seconds) => new Float64Array(Math.round(seconds * SR));
function noise(seconds, seed) {
  const r = rng(seed);
  const x = buf(seconds);
  for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  return x;
}

/** 周波数が時間で変わるサイン（freq(t) を積分して位相にする） */
function sweep(seconds, freq, amp) {
  const x = buf(seconds);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = Math.sin(ph) * amp(t);
    ph += (TAU * freq(t)) / SR;
  }
  return x;
}

const addInto = (dst, src, gain = 1, at = 0) => {
  const off = Math.round(at * SR);
  for (let i = 0; i < src.length && off + i < dst.length; i++) dst[off + i] += src[i] * gain;
  return dst;
};

// ---------------------------------------------------------------- 音

/** タップ：高めの帯域の雑音の粒と、短いサインの「トッ」。柔らかく、すぐ消える */
function tap() {
  const len = 0.1;
  const n = filter(filter(noise(len, 1), "hp", 1800), "lp", 6000);
  for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-(i / SR) / 0.006);
  const body = sweep(len, (t) => 1500 - 500 * Math.min(1, t / 0.02), (t) => Math.exp(-t / 0.012) * Math.min(1, t / 0.0015));
  const x = addInto(addInto(buf(len), n, 0.35), body, 1);
  return { L: x, R: Float64Array.from(x) };
}

/** 場面の切り替わりの「シュッ」：帯域を絞った雑音の高さを上げながら、左から右へ流す */
function whoosh() {
  const len = 0.6;
  const n = filter(noise(len, 2), "bp", (t) => 400 * (7000 / 400) ** Math.min(1, t / 0.5), 1.2);
  const env = (t) => (t < 0.42 ? (t / 0.42) ** 2 : Math.max(0, 1 - (t - 0.42) / 0.18) ** 1.5);
  const L = buf(len), R = buf(len);
  for (let i = 0; i < n.length; i++) {
    const t = i / SR;
    const p = Math.min(1, t / len) * 1.2 - 0.6; // −0.6 → 0.6
    const v = n[i] * env(t);
    L[i] = v * Math.cos(((p + 1) * Math.PI) / 4);
    R[i] = v * Math.sin(((p + 1) * Math.PI) / 4);
  }
  // 下に、ごく弱い低いうなり（上がる）
  const low = sweep(len, (t) => 90 + 120 * (t / len), env);
  addInto(L, low, 0.25);
  addInto(R, low, 0.25);
  return { L, R };
}

/** 電池切れ：高さが下がっていく鈍い音（電源が落ちる）。最後に低い「ストン」 */
function batteryOff() {
  const len = 0.8;
  const f = (t) => 520 * (45 / 520) ** Math.min(1, t / 0.62);
  const amp = (t) => Math.min(1, t / 0.01) * (t < 0.62 ? 1 - 0.55 * (t / 0.62) : 0.45 * Math.exp(-(t - 0.62) / 0.05));
  const tone = sweep(len, f, amp);
  // 2倍音を少し（鈍いが、小さなスピーカーでも聞こえる程度）
  const over = sweep(len, (t) => 2 * f(t), (t) => amp(t) * 0.3);
  const x = addInto(addInto(buf(len), tone, 1), over, 1);
  filter(x, "lp", 1400);
  // 頭の短いジッという雑音（画面が消える瞬間）
  const z = filter(noise(0.05, 3), "bp", 2500, 0.8);
  for (let i = 0; i < z.length; i++) z[i] *= Math.exp(-(i / SR) / 0.012);
  addInto(x, z, 0.5);
  // 終わりの低い打音
  const thud = sweep(0.17, (t) => 70 - 30 * Math.min(1, t / 0.1), (t) => Math.exp(-t / 0.05) * Math.min(1, t / 0.003));
  addInto(x, thud, 0.8, 0.62);
  return { L: x, R: Float64Array.from(x) };
}

/** 承認・確認の「ポーン」：ソ → ド（4度上がる）の2音の鈴。明るく、控えめに */
function confirm() {
  const len = 0.5;
  const bell = (f, decay) => {
    const x = buf(len);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      x[i] = Math.min(1, t / 0.003) * (Math.exp(-t / decay) * Math.sin(TAU * f * t)
        + 0.25 * Math.exp(-t / (decay * 0.5)) * Math.sin(TAU * 2 * f * t)
        + 0.08 * Math.exp(-t / (decay * 0.3)) * Math.sin(TAU * 3.01 * f * t));
    }
    return x;
  };
  const L = buf(len), R = buf(len);
  const g6 = bell(1567.98, 0.14), c7 = bell(2093.0, 0.16);
  addInto(L, g6, 0.75); addInto(R, g6, 0.55);
  addInto(L, c7, 0.6, 0.09); addInto(R, c7, 0.8, 0.09);
  return { L, R };
}

/** 出てくるときの「ポッ」：サインが短く上がる */
function pop() {
  const len = 0.1;
  const x = sweep(len, (t) => 500 + 1100 * Math.min(1, t / 0.03), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.022));
  return { L: x, R: Float64Array.from(x) };
}

/** 早送り・数え上げの刻み：BGM の刻みと同じ形（4.4 kHz → 3.6 kHz）に、ごく短い雑音を足す */
function tick() {
  const len = 0.05;
  const x = sweep(len, (t) => 4400 - 800 * Math.min(1, t / 0.035), (t) => Math.min(1, t / 0.001) * Math.max(0, 1 - t / 0.035));
  const n = filter(noise(len, 4), "hp", 6000);
  for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-(i / SR) / 0.004);
  addInto(x, n, 0.3);
  return { L: x, R: Float64Array.from(x) };
}

/** 数字が弾んで出るときの「ポーン」：木琴のような丸い音（ラ）。少し上から落ちて収まる */
function pon() {
  const len = 0.45;
  const f = (t) => 880 * (1 + 0.06 * Math.exp(-t / 0.02));
  const body = sweep(len, f, (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.11));
  const over = sweep(len, (t) => 4 * f(t), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.03));
  const x = addInto(addInto(buf(len), body, 1), over, 0.22);
  return { L: x, R: Float64Array.from(x) };
}

/** 大事な言葉が出るときの「チャリーン」：高い鈴を2つ、少しずらして鳴らし、長めに響かせる */
function ding() {
  const len = 0.9;
  const bell = (f, decay) => {
    const x = buf(len);
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      x[i] = Math.min(1, t / 0.002) * (Math.exp(-t / decay) * Math.sin(TAU * f * t)
        + 0.35 * Math.exp(-t / (decay * 0.6)) * Math.sin(TAU * 2.76 * f * t)
        + 0.15 * Math.exp(-t / (decay * 0.35)) * Math.sin(TAU * 5.4 * f * t));
    }
    return x;
  };
  const L = buf(len), R = buf(len);
  const e7 = bell(2637.02, 0.22), a7 = bell(3520.0, 0.26);
  addInto(L, e7, 0.7); addInto(R, e7, 0.5);
  addInto(L, a7, 0.5, 0.07); addInto(R, a7, 0.75, 0.07);
  return { L, R };
}

/** ✕ が付くときの「ブブッ」：低めの鈍い音を2回。きつくならないよう高い成分を落とす */
function cross() {
  const len = 0.32;
  const hit = () => {
    const h = buf(0.12);
    for (let i = 0; i < h.length; i++) {
      const t = i / SR;
      const sq = Math.sign(Math.sin(TAU * 196 * t)) * 0.6 + Math.sin(TAU * 98 * t) * 0.6;
      h[i] = sq * Math.min(1, t / 0.004) * Math.exp(-t / 0.05);
    }
    return filter(h, "lp", 900);
  };
  const x = buf(len);
  addInto(x, hit(), 1, 0);
  addInto(x, hit(), 0.9, 0.13);
  return { L: x, R: Float64Array.from(x) };
}

/** いちばん大きな数字が出るときの「ドン」：低い打音と、短い雑音の当たり */
function slam() {
  const len = 0.6;
  const low = sweep(len, (t) => 55 + 90 * Math.exp(-t / 0.03), (t) => Math.min(1, t / 0.003) * Math.exp(-t / 0.16));
  const n = filter(noise(0.08, 5), "lp", 2200);
  for (let i = 0; i < n.length; i++) n[i] *= Math.exp(-(i / SR) / 0.015);
  const x = addInto(addInto(buf(len), low, 1), n, 0.4);
  return { L: x, R: Float64Array.from(x) };
}

/** 薬のケースの中で錠剤が鳴る「カラッ」（薬の話でいちばん大事な数字の所）：小さく堅い粒が、樹脂の容れ物に続けて当たる */
function pillShake() {
  const len = 0.32;
  const r = rng(41);
  const L = buf(len), R = buf(len);
  [0, 0.018, 0.041, 0.058, 0.09, 0.104, 0.142, 0.19].forEach((at, k) => {
    const grain = filter(noise(0.03, 50 + k), "bp", 2600 + 2200 * r(), 2.5);
    for (let i = 0; i < grain.length; i++) grain[i] *= Math.exp(-(i / SR) / 0.004);
    const pitch = 700 + 500 * r();
    const body = sweep(0.03, () => pitch, (t) => Math.exp(-t / 0.006));
    const g = (k < 5 ? 1 : 0.55) * (0.6 + 0.4 * r());
    const pan = 0.3 + 0.4 * r();
    addInto(L, grain, g * (1 - pan), at); addInto(R, grain, g * pan, at);
    addInto(L, body, 0.25 * g, at); addInto(R, body, 0.25 * g, at);
  });
  return { L, R };
}

/** 地鳴りの低い「ドゥン」（地震の回数の所）：とても低い響きがふくらんで消える。高い成分は入れない */
function rumble() {
  const len = 1.1;
  const env = (t) => Math.min(1, t / 0.06) * Math.exp(-t / 0.32);
  const low = sweep(len, (t) => 62 - 18 * Math.min(1, t / 0.5), env);
  const sub = sweep(len, (t) => 93 - 20 * Math.min(1, t / 0.5), (t) => env(t) * 0.35);
  const n = filter(noise(len, 61), "lp", 140);
  for (let i = 0; i < n.length; i++) n[i] *= env(i / SR) * (0.7 + 0.3 * Math.sin(TAU * 11 * (i / SR)));
  const x = addInto(addInto(addInto(buf(len), low, 1), sub, 1), n, 0.8);
  return { L: x, R: Float64Array.from(x) };
}

/** 薬のシートから錠剤を押し出す「パキッ」（薬の数字が出る所）：薄い箔が破れる2つの粒と、小さな樹脂の当たり */
function ptp() {
  const len = 0.18;
  const crack = (seed, f0, decay) => {
    const c = filter(noise(0.06, seed), "bp", f0, 0.7);
    for (let i = 0; i < c.length; i++) c[i] *= Math.exp(-(i / SR) / decay);
    return c;
  };
  const x = buf(len);
  addInto(x, crack(21, 5200, 0.004), 1, 0);
  addInto(x, crack(22, 3800, 0.005), 0.6, 0.022);
  const thunk = sweep(0.08, (t) => 420 - 120 * Math.min(1, t / 0.04), (t) => Math.min(1, t / 0.001) * Math.exp(-t / 0.018));
  addInto(x, thunk, 0.5, 0.004);
  const foil = filter(noise(0.12, 23), "hp", 6000);
  for (let i = 0; i < foil.length; i++) foil[i] *= Math.exp(-(i / SR) / 0.03);
  addInto(x, foil, 0.15, 0.01);
  return { L: x, R: Float64Array.from(x) };
}

/** 手帳を閉じる「パタン」（手元に無い・入れていない、の所）：低い当たりと、紙のこすれる短い音 */
function bookClose() {
  const len = 0.3;
  const x = buf(len);
  const thump = sweep(0.2, (t) => 90 + 60 * Math.exp(-t / 0.02), (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.035));
  addInto(x, thump, 1);
  const paper = filter(noise(0.1, 31), "bp", 1200, 0.5);
  for (let i = 0; i < paper.length; i++) paper[i] *= Math.exp(-(i / SR) / 0.025);
  addInto(x, paper, 0.5);
  const air = filter(noise(0.25, 32), "lp", 500);
  for (let i = 0; i < air.length; i++) air[i] *= Math.exp(-(i / SR) / 0.06);
  addInto(x, air, 0.3);
  return { L: x, R: Float64Array.from(x) };
}

// ---------------------------------------------------------------- 書き出し

function toWav({ L, R }, peakDb) {
  const n = L.length;
  // 頭 1 ms と終わり 5 ms を消す（プツッという音を出さない）
  const fi = Math.round(0.001 * SR), fo = Math.round(0.005 * SR);
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fi, (n - 1 - i) / fo);
    L[i] *= g; R[i] *= g;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 10 ** (peakDb / 20) / peak;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * gain * 32767))), i * 4);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * gain * 32767))), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const SOUNDS = [
  ["tap.wav", tap],
  ["whoosh.wav", whoosh],
  ["battery-off.wav", batteryOff],
  ["confirm.wav", confirm],
  ["pop.wav", pop],
  ["tick.wav", tick],
  ["pon.wav", pon],
  ["ding.wav", ding],
  ["cross.wav", cross],
  ["slam.wav", slam],
  ["pill-shake.wav", pillShake],
  ["rumble.wav", rumble],
  ["ptp.wav", ptp],
  ["book-close.wav", bookClose],
];

await mkdir(outDir, { recursive: true });
for (const [name, make] of SOUNDS) {
  const s = make();
  await writeFile(path.join(outDir, name), toWav(s, PEAKS[name]));
  console.log(`${name}: ${(s.L.length / SR).toFixed(3)} 秒, 山 ${PEAKS[name]} dBFS`);
}
