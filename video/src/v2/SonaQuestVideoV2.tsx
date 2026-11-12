// v2 の紹介動画（Issue #315）の本体。場面の部品は提出版（../SonaQuestVideo.tsx）と同じものを使い、
// 場面の表（sectionsV2.ts）・音・3〜5番の画面（CardSlides.tsx）だけを替える。
import type { FC } from "react";
import { CutVideo, type Cut } from "../SonaQuestVideo";
import { ENDCARD_FRAMES, FPS, section5Time } from "../sections";
import { at, type BgmCue, type SfxCue } from "../soundtrack";
import { V2Overlay, V2Screen } from "./CardSlides";
import { DMODE, GAP, HOOK, QUAKE, REACH } from "./cardsText";
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
 * - 9番：board.wav、10・11番：ending.wav（提出版の12・13番と同じ）
 */
const BGM_V2: BgmCue[] = [
  { file: "bgm/opening.wav", from: from(1), duration: Math.min(end(3) - from(1), 33 * FPS) },
  { file: "bgm/app-training.wav", from: from(6), duration: end(8) - from(6), mute: [TRAINING_MUTE], gain: 0.63 },
  { file: "bgm/board.wav", from: from(9), duration: end(9) - from(9) },
  { file: "bgm/ending.wav", from: from(10), duration: end(11) - from(10) },
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
  // 3〜5番：数字・✕・大事な言葉が出る瞬間に合わせる（2026-11-13 オーナー：「効果音を合わせることで、その数値を立たせる」）
  const hook = S[0], quake = S[1];
  cues.push({ file: "sfx/pop.wav", at: at(hook, HOOK.ask.words[0].at), volume: 0.7 });
  cues.push({ file: "sfx/pop.wav", at: at(hook, HOOK.ask.words[2].at), volume: 0.7 });
  cues.push({ file: "sfx/pon.wav", at: at(hook, HOOK.ask.punchAt) });
  cues.push({ file: "sfx/cross.wav", at: at(hook, HOOK.lost.lostAt) });
  cues.push({ file: "sfx/slam.wav", at: at(hook, HOOK.question.punchAt) });
  cues.push({ file: "sfx/slam.wav", at: at(quake, QUAKE.punchAt) });
  const reach = S[2], gap = S[3], dmode = S[4];
  const u = GAP.unprepared;
  cues.push({ file: "sfx/pon.wav", at: at(reach, REACH.visit.bigAt) });
  cues.push({ file: "sfx/whoosh.wav", at: at(reach, REACH.notebook.from), volume: 0.5 });
  cues.push({ file: "sfx/pon.wav", at: at(reach, REACH.notebook.bigAt) });
  cues.push({ file: "sfx/cross.wav", at: at(gap, GAP.opening.missingAt), volume: 0.8 });
  cues.push({ file: "sfx/pon.wav", at: at(gap, GAP.carry.bigAt) });
  cues.push({ file: "sfx/slam.wav", at: at(gap, u.bigAt) });
  for (const item of [...u.forget.items, ...u.bag.items]) cues.push({ file: "sfx/pop.wav", at: at(gap, item.at), volume: 0.7 });
  cues.push({ file: "sfx/pop.wav", at: at(gap, u.bag.bagAt), volume: 0.7 });
  cues.push({ file: "sfx/cross.wav", at: at(gap, u.forget.punchAt) });
  cues.push({ file: "sfx/cross.wav", at: at(gap, u.bag.punchAt) });
  cues.push({ file: "sfx/cross.wav", at: at(dmode, DMODE.offline.at + 0.1), volume: 0.8 });
  cues.push({ file: "sfx/slam.wav", at: at(dmode, DMODE.offline.lines[1].at) });
  for (const word of DMODE.rely.words) cues.push({ file: "sfx/ding.wav", at: at(dmode, word.at) });
  return cues;
};

export const V2_CUT: Cut = {
  sections: SECTIONS_V2,
  endcardFrames: ENDCARD_FRAMES,
  crossNarration: [],
  bgm: BGM_V2,
  sfx: buildSfx(),
  extraScreen: (section) => <V2Screen section={section} />,
  extraOverlay: (section) => <V2Overlay section={section} />,
  hideCaption: (section) => section.cardsKey === "hook",
};

export const SonaQuestVideoV2: FC = () => <CutVideo cut={V2_CUT} />;
