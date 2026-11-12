// v2 の紹介動画（Issue #315）の本体。場面の部品は提出版（../SonaQuestVideo.tsx）と同じものを使い、
// 場面の表（sectionsV2.ts）・音・3〜5番の画面（CardSlides.tsx）だけを替える。
import type { FC } from "react";
import { CutVideo, type Cut } from "../SonaQuestVideo";
import { ENDCARD_FRAMES, FPS, section5Time } from "../sections";
import { at, type BgmCue, type SfxCue } from "../soundtrack";
import { V2Screen } from "./CardSlides";
import { SECTIONS_V2 } from "./sectionsV2";

const S = SECTIONS_V2;
const from = (n: number) => S[n - 1].from;
const end = (n: number) => S[n - 1].from + S[n - 1].durationInFrames;

/** 7番（提出版の5番）の電池切れから、立て直しの問いの後の無音まで、訓練の BGM を消す（提出版と同じ区間） */
const TRAINING_MUTE: readonly [number, number] = [
  from(7) - from(6) + Math.round(section5Time(14.8) * FPS),
  from(7) - from(6) + Math.round(section5Time(26.6) * FPS),
];

/**
 * BGM（下書き。聞いて直す）。曲は提出版の素材を流用する（video/public/bgm/）。
 * - 1〜3番：opening.wav（33秒。曲の長さで終わる）。4・5番（数字と仕組みの話）は BGM を敷かない
 * - 6〜8番：アプリの BGM（app-training.wav）
 * - 9番：board.wav、10番：ending.wav
 */
const BGM_V2: BgmCue[] = [
  { file: "bgm/opening.wav", from: from(1), duration: Math.min(end(3) - from(1), 33 * FPS) },
  { file: "bgm/app-training.wav", from: from(6), duration: end(8) - from(6), mute: [TRAINING_MUTE], gain: 0.63 },
  { file: "bgm/board.wav", from: from(9), duration: end(9) - from(9) },
  { file: "bgm/ending.wav", from: from(10), duration: end(10) - from(10) },
];

/** 効果音：タップ・章の題・テロップ（提出版と同じ決まり）、電池切れ、承認 */
const buildSfx = (): SfxCue[] => {
  const cues: SfxCue[] = [];
  for (const section of S) {
    for (const tap of section.taps) cues.push({ file: "sfx/tap.wav", at: at(section, tap.at) });
    if (section.chapter) cues.push({ file: "sfx/whoosh.wav", at: at(section, section.chapter.at) });
    for (const telop of section.telops) cues.push({ file: "sfx/pop.wav", at: at(section, telop.from), volume: 0.3 });
  }
  cues.push({ file: "sfx/battery-off.wav", at: at(S[6], section5Time(14.8)) });
  cues.push({ file: "sfx/confirm.wav", at: at(S[8], 16.2) });
  return cues;
};

export const V2_CUT: Cut = {
  sections: SECTIONS_V2,
  endcardFrames: ENDCARD_FRAMES,
  crossNarration: [],
  bgm: BGM_V2,
  sfx: buildSfx(),
  extraScreen: (section) => <V2Screen section={section} />,
};

export const SonaQuestVideoV2: FC = () => <CutVideo cut={V2_CUT} />;
