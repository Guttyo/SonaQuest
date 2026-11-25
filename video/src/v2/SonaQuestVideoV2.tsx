// v2 の紹介動画（Issue #315）の本体。場面の部品は提出版（../SonaQuestVideo.tsx）と同じものを使い、
// 場面の表（sectionsV2.ts）・音・3〜5番の画面（CardSlides.tsx）だけを替える。
import type { FC } from "react";
import { CutVideo, type Cut } from "../SonaQuestVideo";
import { ENDCARD_FRAMES, FPS, section5Time } from "../sections";
import { at, type BgmCue, type SfxCue } from "../soundtrack";
import { V2Screen } from "./CardSlides";
import { DMODE, GAP, HOOK, QUAKE, REACH } from "./cardsText";
import { BOARD_TABLE_FROM_SECONDS, SECTIONS_V2 } from "./sectionsV2";
import { SonaOverlay } from "./Sona3D";

const S = SECTIONS_V2;
const from = (n: number) => S[n - 1].from;
const end = (n: number) => S[n - 1].from + S[n - 1].durationInFrames;

/** 7番（提出版の5番）の電池切れから、立て直しの問いの後の無音まで、訓練の BGM を消す（提出版と同じ区間） */
const TRAINING_MUTE: readonly [number, number] = [
  from(7) - from(6) + Math.round(section5Time(14.8) * FPS),
  from(7) - from(6) + Math.round(section5Time(26.6) * FPS),
];

/**
 * BGM（聞いて直す）。v16 までは提出版の曲（opening・board・ending）を流用していた。
 * 今の置き方は、下の BGM_V2 の上の覚え書き。
 */
// 2026-11-25 オーナー決定（チャット）：「案1で作って」。前半は課題を静かに聞かせ、訓練から明るくする。
// v2 の曲を作った（video/scripts/compose-bgm.mjs の problemV2・boardV2・endingV2。場面の長さと声の時刻に合わせてある）：
// - 1番（問いかけ）：BGM を敷かない（声と間だけ）
// - 2〜5番：v2-problem.wav（低い持続音とゆっくりした短調の和音。拍は刻まない。「27.4%」と「通信が止まれば…」で和音を引き、低い持続音だけを残す。v19 は 3 秒の無音だった。
//   2026-11-25 オーナー、チャット：「BGMが途切れているところあるから、そこを直して」→ 音は切らさない）
// - 6〜8番：アプリの BGM（app-training.wav）のまま
// - 9番：v2-board.wav（9番の長さの曲）、10・11番：v2-ending.wav（ロゴが出る所で着地）
const BGM_V2: BgmCue[] = [
  { file: "bgm/v2-problem.wav", from: from(2), duration: end(5) - from(2) },
  { file: "bgm/app-training.wav", from: from(6), duration: end(8) - from(6), mute: [TRAINING_MUTE], gain: 0.63 },
  { file: "bgm/v2-board.wav", from: from(9), duration: end(9) - from(9) },
  { file: "bgm/v2-ending.wav", from: from(10), duration: end(11) - from(10) },
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
  cues.push({ file: "sfx/confirm.wav", at: at(S[8], 17.7) });
  // 冒頭と2〜5番：大事な数字と言葉の所だけに鳴らす（2026-11-13 オーナー：「効果音を合わせることで、その数値を立たせる」。
  // v10 を見て「使いすぎ…本当に大事なところに」と言われて、札が1つずつ出る所・小さな ✕ の音は外した）
  // 2026-11-13 オーナー（v14 の後、チャット）：「地震の回数のカウントアップに効果音は不要」→ 点ごとの刻みを外した。
  // 「既存効果音やBGMではなく、その場の雰囲気、場面に合うような音だとなおよい…木のパチンという音…『火の用心、カンカン』のカン」
  // → 場面の中身に合う音に替えた（下書き。聞いて直す）：
  //   同日、続けて：「拍子木の音は、湯番だから適切であっただけで、このアプリには適切ではない…そのような効果音を提案してほしい」→ 拍子木はやめた。
  //   地震の回数 ＝ 地鳴りの低い音（rumble）、薬の数字 ＝ 薬のシートを押し出す音（ptp）、いちばん大事な数字 ＝ 薬のケースで錠剤が鳴る音（pill-shake）、
  //   冒頭の「どう伝えますか」は音を置かない（声と間だけ）、
  //   スマホ・通信が使えない ＝ 7番の電池切れと同じ音（battery-off）、手元に無い・入れていない ＝ 手帳を閉じる音（book-close）
  const hook = S[0], reach = S[2], gap = S[3], dmode = S[4];
  const u = GAP.unprepared;
  cues.push({ file: "sfx/rumble.wav", at: at(S[1], QUAKE.punchAt) });
  cues.push({ file: "sfx/battery-off.wav", at: at(hook, HOOK.lost.lostAt), volume: 0.6 });
  cues.push({ file: "sfx/ptp.wav", at: at(reach, REACH.visit.bigAt) });
  cues.push({ file: "sfx/ptp.wav", at: at(reach, REACH.notebook.bigAt) });
  cues.push({ file: "sfx/ptp.wav", at: at(gap, GAP.carry.bigAt) });
  cues.push({ file: "sfx/pill-shake.wav", at: at(gap, u.bigAt) });
  cues.push({ file: "sfx/book-close.wav", at: at(gap, u.forget.punchAt) });
  cues.push({ file: "sfx/book-close.wav", at: at(gap, u.bag.punchAt) });
  cues.push({ file: "sfx/battery-off.wav", at: at(dmode, DMODE.offline.lines[1].at), volume: 0.6 });
  cues.push({ file: "sfx/ding.wav", at: at(dmode, DMODE.rely.words[1].at) });
  return cues;
};

export const V2_CUT: Cut = {
  sections: SECTIONS_V2,
  endcardFrames: ENDCARD_FRAMES,
  crossNarration: [],
  bgm: BGM_V2,
  sfx: buildSfx(),
  extraScreen: (section) => <V2Screen section={section} />,
  hideCaption: (section) => section.cardsKey === "hook" || section.cardsKey === "quake",
  patientTableFromFrames: Math.round(BOARD_TABLE_FROM_SECONDS * FPS),
  sectionOverlay: (section) => <SonaOverlay section={section} />,
};

export const SonaQuestVideoV2: FC = () => <CutVideo cut={V2_CUT} />;
