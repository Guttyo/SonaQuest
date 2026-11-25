// v2 の紹介動画（Issue #315）の11場面の表（はじめは10場面。2026-11-12 に感想の一枚を戻して11）。「なぜ必要か」の流れに絞った版。
// 台本の正本はリポジトリの外（2026-11-12 オーナー決定）。ここには場面の並びと、写したナレーションの置き場所だけを書く。
// 撮り直さない：提出版の行（../sections.ts の ROWS）を流用し、録画・寄り・タップ・テロップ・アプリの声もそのまま使う。
// 新しく合成するナレーションは narration/v2-NN.mp3（原稿は video/narration/v2-NN.txt）。ほかは提出版の mp3。
// 2〜6・9番の長さは、合成した声の長さ（2026-11-12 に測った。v2-01 11.3秒、v2-02 7.7秒、v2-03 11.4秒、v2-04 30.2秒、v2-05 14.3秒、v2-06 8.3秒、v2-09 20.8秒。2・4・9番は v03 を見て、4番は v04 を見てさらに原稿を直し合成し直した長さ）に
// 頭の 0.5 秒と終わりの間を足したもの。
// 自己紹介・派遣の体験談・掲示板・カルテ・モデルの使い分けは入れない（試用した医師の感想の一枚は10番に入れる）。
// 見出し語のマーカーの「1・10番は画面に出ない」は、11場面にした今は「1・11番」のこと（マーカーは書き換えない）。
import { CHAPTERS, FPS, ROWS, buildSections, headlineIntroOf, type Row } from "../sections";

const sec = (seconds: number) => Math.round(seconds * FPS);

// [TODO-OWNER: v2 の左上の見出し語（Claude Code の下書き。1・10番は画面に出ない）]
const HEADLINES_V2 = [
  "どう伝えますか",
  "地震の多い国",
  "薬は身近",
  "手元にあるとは限らない",
  "仕組みがあっても",
  "お薬の避難訓練",
  "スマートフォンが使えない",
  "まだ準備が弱いところ",
  "受け取る側の備え",
  "使った人の声",
  "普段からの練習を、備えに",
] as const;

/**
 * 声の中の長い間を詰めて鳴らす（mp3 は変えず、間の真ん中を飛ばす）。2026-11-13 オーナー「3分にしたいね」。
 * pauses は [間の始まり, 間の終わり, 残す長さ]（mp3 の中の秒。silencedetect で測った値）
 */
const trimPauses = (delay: number, fileSeconds: number, pauses: Array<[number, number, number]>): NonNullable<Row["narrationParts"]> => {
  const parts: NonNullable<Row["narrationParts"]> = [];
  let segFrom = 0;
  let removed = 0;
  for (const [from, to, keep] of pauses) {
    const cut = to - from - keep;
    const cutFrom = from + keep / 2;
    parts.push({ fromSeconds: delay + segFrom - removed, fileFromSeconds: segFrom, fileToSeconds: cutFrom });
    segFrom = cutFrom + cut;
    removed += cut;
  }
  parts.push({ fromSeconds: delay + segFrom - removed, fileFromSeconds: segFrom, fileToSeconds: fileSeconds });
  return parts;
};

/** 提出版の何番の行か（1始まり） */
const v1 = (n: number): Row => ROWS[n - 1];

const ROWS_V2: Row[] = [
  // 1：問い。提出版の1番のまま（暗転の録画は置かない：2026-11-08 オーナー「最初に一瞬だけお薬の避難訓練が映る」）
  // 2026-11-13 オーナー（v08 を見て、チャット）：冒頭に問いかけを足す（文は案B）→ 声を v2-01（11.3秒）にし、黒い地に声の句ごとの文字を出す画面に替えた
  {
    seconds: 12,
    voice: "ナレーター",
    screen: "cards",
    screenNote: "黒い地に、問いかけを声の句ごとに大きく出す",
    footageFile: null,
    footageAudio: false,
    cardsKey: "hook",
    narrationFile: "narration/v2-01.mp3",
    narrationDelayFrames: sec(0.3),
  },
  // 2：地震の回数。提出版の2番の地図を使う（数え直さない：2026-11-12 オーナー決定「数えた当時の日時で」）。
  // 2026-11-12 オーナー（v03 を見て、チャット）：「11月5日時点で21回」としたい → ナレーションを v2-02 に替えた
  // 2026-11-13 オーナー（v10 を見て、チャット）：地図は素材を作り直す → 録画をやめて、動画の中で描く（CardSlides.tsx の QuakeScene）
  {
    seconds: 7.9,
    voice: "ナレーター",
    screen: "cards",
    screenNote: "震源の地図を描く。点が1つ出るたびに、大きな回数が1つ上がる",
    footageFile: null,
    footageAudio: false,
    cardsKey: "quake",
    narrationFile: "narration/v2-02.mp3",
  },
  // 3：薬は身近（数字のカード）
  {
    // 声の中の間を2か所で 0.3 秒ずつ詰めて 12.1 → 11.5 秒
    seconds: 11.5,
    narrationParts: trimPauses(0.5, 11.36, [[2.37, 3.14, 0.47], [7.33, 8.1, 0.47]]),
    voice: "ナレーター",
    screen: "cards",
    screenNote: "数字のカード：通院している人、お薬手帳の利用",
    footageFile: null,
    footageAudio: false,
    cardsKey: "reach",
    narrationFile: "narration/v2-03.mp3",
    narrationDelayFrames: sec(0.5),
  },
  // 4：手元にあるとは限らない（数字のカード。「ある調査では」）
  {
    seconds: 30.9,
    voice: "ナレーター",
    screen: "cards",
    screenNote: "数字のカード：持ち歩き、覚えておらず備えも無い（ある調査では）",
    footageFile: null,
    footageAudio: false,
    cardsKey: "gap",
    narrationFile: "narration/v2-04.mp3",
    narrationDelayFrames: sec(0.5),
  },
  // 5：仕組みがあっても（資料の一節の札。2026-11-12 オーナー決定「案4にする」）
  {
    // 声の中の間を 0.3 秒と 0.4 秒詰めて 15 → 14.3 秒
    seconds: 14.3,
    narrationParts: trimPauses(0.5, 14.32, [[5.81, 6.59, 0.48], [9.7, 10.61, 0.51]]),
    voice: "ナレーター",
    screen: "sourceQuote",
    screenNote: "資料の一節：災害時モード（厚生労働省の資料 p.11）→ 通信が止まれば使えない",
    footageFile: null,
    footageAudio: false,
    cardsKey: "dmode",
    narrationFile: "narration/v2-05.mp3",
    narrationDelayFrames: sec(0.5),
  },
  // 6：ソナクエスト（はじめに）。提出版の4番の録画（8秒）を使い、ナレーションだけ替える。録画の終わりで止める
  // 2026-11-13 オーナー（v08 を見て）：切り替わりで iPhone の画面が一瞬濃く出るのは要らない → 題の幕を頭から出す（instant）
  // 2026-11-13 オーナー（v13 を見て、チャット）：終わりに「Claudeで作りました。実際に訓練をしてみましょう。」を足す（「足す形でよい」と確認）。
  // 声は 12.2 秒。間を3か所詰めて 11.3 秒で終える。句の時刻（場面の秒）：足りないのは… 0.3〜2.45、ソナクエストは… 2.85〜6.1、
  // お薬の避難訓練です 6.43〜7.93、Claudeで作りました 8.33〜9.38、実際に訓練をしてみましょう 9.72〜11.3。
  // 録画は「はじめに」の画面（3.2 秒）で 4.2 秒止め、答え方を選ぶタップを 8.68 秒、「次へ」のタップを 10.59 秒（「実際に訓練を…」の中）にする
  {
    ...v1(4),
    seconds: 11.4,
    narrationFile: "narration/v2-06.mp3",
    narrationParts: trimPauses(0.3, 12.24, [[2.15, 2.91, 0.4], [7.99, 8.68, 0.4], [9.73, 10.3, 0.35]]),
    footageHold: { atSeconds: 3.2, seconds: 4.2 },
    taps: v1(4).taps!.map((tap) => ({ ...tap, at: tap.at + 4.2 })),
    telops: [{ ...v1(4).telops![0], from: 7.7, to: 11.2 }],
    chapter: { ...v1(4).chapter!, instant: true },
  },
  // 7：訓練の実演。提出版の5番のまま（アプリの声・オーナーの声の台詞・電池切れ・立て直しの問い）
  { ...v1(5), narrationFile: "narration/05.mp3", headlineIntro: headlineIntroOf(4) },
  // 8：振り返り。提出版の6番のまま
  { ...v1(6), narrationFile: "narration/06.mp3" },
  // 9：受け取る側の備え（ボード）。提出版の8番の録画・患者の表・早送り・承認のタップを使い、ナレーションを1本で合成し直す。
  // 新旧の声をつながないので 08a は鳴らさない。章の題は場面の頭に出す
  {
    ...v1(8),
    // 3分に収めるため、声の中の長い間を3か所詰めて 21.6 → 19.6 秒。句の時刻（場面の秒）：100人の… 9.66、本部は… 15.59、手配を承認し 16.94、終わり 19.52
    seconds: 19.6,
    narrationParts: trimPauses(0.5, 20.8, [[2.1, 2.91, 0.35], [9.27, 10.16, 0.35], [15.74, 16.64, 0.35]]),
    narrationFile: "narration/v2-09.mp3",
    narrationDelayFrames: sec(0.5),
    extraNarration: [],
    // 2026-11-13 オーナー（v13 を見て、チャット）：「100名の一覧…タイミングが早い。ナレーションに合わせて」「動いているダッシュボードは最初から見せるべき」
    // 録画は 6.5〜13.0 秒で時計が進む（動く所）。頭の止まった所（0〜6.2 秒）を飛ばし、動く所を 0.7 倍でゆっくり流して、
    // 声の「100人の架空の患者」（場面の 9.66 秒）で患者の表（BOARD_TABLE_FROM_SECONDS から5秒）に替える。
    // 表の下で録画を止め（録画の 12.9 秒）、表が終わる所から等速で続ける：場面の時刻 ＝ 録画の時刻 ＋ 1.5 秒
    footageStartSeconds: 6.2,
    footageHold: { atSeconds: 9.6, seconds: 4.8, rateBefore: 0.698 },
    badges: [{ from: 2.0, to: 9.4, text: "▶▶ デモの時間を早送り" }],
    taps: v1(8).taps!.map((tap) => ({ ...tap, at: tap.at + 1.5 })),
    telops: [
      { ...v1(8).telops![0], from: 2.2, to: 6 },
      { ...v1(8).telops![1], from: 15.0, to: 19.2 },
    ],
    chapter: { text: CHAPTERS.board, at: 0, seconds: 2.0 },
  },
  // 10：使った人の声。提出版の12番のまま（写真・感想の一枚・声。中身はリポジトリの外）。
  // 2026-11-12 オーナー（v02 を見て、チャット）：感想の一枚が無くなっていると言われて戻した
  // 冒頭を 4 秒延ばした分、2・3・5・6・9・10番の終わりの余白を詰めた（2026-11-13）
  { ...v1(12), seconds: 12, narrationFile: "narration/12.mp3" },
  // 11：締め。提出版の13番のまま（公開 URL は出さない：2026-11-08 オーナー決定。スマホの画面も出さない：同日オーナー）
  { ...v1(13), narrationFile: "narration/13.mp3" },
];

/** 9番で、架空の患者の表を出し始める時刻（場面の頭から。声の「100人の架空の患者」の少し前） */
export const BOARD_TABLE_FROM_SECONDS = 9.5;

export const SECTIONS_V2 = buildSections(ROWS_V2, (i) => HEADLINES_V2[i], () => null);
export const TOTAL_FRAMES_V2 = SECTIONS_V2.reduce((sum, s) => sum + s.durationInFrames, 0);
