// BGM と効果音（2026-11-08 オーナー：「お薬の避難訓練の時は、本当の画面から出るポップなBGMがいいね」
// 「新しいチャットでテーマとテンポにあうBGMを作ろう」「効果音とかもね！作ろうね！」）。
// 音のファイルは video/public/bgm/・sfx/（Git の対象外）に置く。置かれていない音は鳴らさない。
// - 訓練（4〜6番）：アプリの BGM（web/src/bgm/bgm.ts の Web Audio）をそのまま書き出した app-training.wav
// - ほかの場面：コードで合成した曲（video/scripts/compose-bgm.mjs）
// - 効果音：タップ・章の切り替わり・電池切れ・承認と確認（同じくコードで合成）
import type { FC } from "react";
import { Audio, Sequence, interpolate, staticFile } from "remotion";
import { FPS, SECTIONS, type Section } from "./sections";
import { hasStaticFile } from "./theme";

/** BGM の大きさ（ナレーションの下に敷く）。ナレーションを合成した後に聞いて直す */
export const BGM_VOLUME = 0.22;
/** 効果音の大きさ */
export const SFX_VOLUME = 0.5;

const sectionFrom = (n: number) => SECTIONS[n - 1].from;
const sectionEnd = (n: number) => SECTIONS[n - 1].from + SECTIONS[n - 1].durationInFrames;

type BgmCue = {
  file: string;
  from: number;
  duration: number;
  /** 場面の中で BGM を消す区間（cue の頭からのフレーム。[始め, 終わり)） */
  mute?: Array<readonly [number, number]>;
};

/**
 * 5番の電池切れ（場面の 14.8 秒）から、立て直しの問いの後の2秒の無音（26.6 秒）まで BGM を消す。
 * 出来事の重さと、無音の間（ま）を聞かせるため。
 */
const SECTION5_MUTE: readonly [number, number] = [
  sectionFrom(5) - sectionFrom(4) + Math.round(14.8 * FPS),
  sectionFrom(5) - sectionFrom(4) + Math.round(26.6 * FPS),
];

export const BGM_CUES: BgmCue[] = [
  { file: "bgm/opening.wav", from: sectionFrom(1), duration: sectionEnd(3) - sectionFrom(1) },
  { file: "bgm/app-training.wav", from: sectionFrom(4), duration: sectionEnd(6) - sectionFrom(4), mute: [SECTION5_MUTE] },
  { file: "bgm/board.wav", from: sectionFrom(7), duration: sectionEnd(10) - sectionFrom(7) },
  { file: "bgm/models.wav", from: sectionFrom(11), duration: sectionEnd(11) - sectionFrom(11) },
  { file: "bgm/ending.wav", from: sectionFrom(12), duration: sectionEnd(13) - sectionFrom(12) },
];

/** 頭と終わりの 0.5 秒で出し入れし、mute の区間は 0.3 秒で消して戻す */
const bgmVolume = (cue: BgmCue) => (f: number) => {
  const fade = Math.round(0.5 * FPS);
  let v = Math.min(
    interpolate(f, [0, fade], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(f, [cue.duration - fade, cue.duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const ramp = Math.round(0.3 * FPS);
  for (const [a, b] of cue.mute ?? []) {
    v = Math.min(v, interpolate(f, [a - ramp, a, b, b + ramp], [1, 0, 0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }
  return v * BGM_VOLUME;
};

type SfxCue = { file: string; at: number; volume?: number };

/** 場面の中の秒 → 全体のフレーム */
const at = (section: Section, seconds: number) => section.from + Math.round(seconds * FPS);

const buildSfx = (): SfxCue[] => {
  const cues: SfxCue[] = [];
  for (const section of SECTIONS) {
    for (const tap of section.taps) cues.push({ file: "sfx/tap.wav", at: at(section, tap.at) });
    if (section.chapter) cues.push({ file: "sfx/whoosh.wav", at: at(section, section.chapter.at) });
    for (const telop of section.telops) cues.push({ file: "sfx/pop.wav", at: at(section, telop.from), volume: 0.3 });
  }
  // 5番：電池切れ（録画の 14.8 秒で画面が暗くなる）
  cues.push({ file: "sfx/battery-off.wav", at: at(SECTIONS[4], 14.8) });
  // 8番：HQ が承認（タップの少し後に状態が変わる）。10番：人が確認済み
  cues.push({ file: "sfx/confirm.wav", at: at(SECTIONS[7], 16.2) });
  cues.push({ file: "sfx/confirm.wav", at: at(SECTIONS[9], 11.5) });
  return cues;
};

export const SFX_CUES: SfxCue[] = buildSfx();

export const Soundtrack: FC = () => (
  <>
    {BGM_CUES.filter((c) => hasStaticFile(c.file)).map((cue) => (
      <Sequence key={cue.file} from={cue.from} durationInFrames={cue.duration} layout="none" name={`BGM ${cue.file}`}>
        <Audio src={staticFile(cue.file)} volume={bgmVolume(cue)} />
      </Sequence>
    ))}
    {SFX_CUES.filter((c) => hasStaticFile(c.file)).map((cue, i) => (
      <Sequence key={`${cue.file}-${cue.at}-${i}`} from={cue.at} durationInFrames={Math.round(2 * FPS)} layout="none" name={`効果音 ${cue.file}`}>
        <Audio src={staticFile(cue.file)} volume={(cue.volume ?? 1) * SFX_VOLUME} />
      </Sequence>
    ))}
  </>
);
