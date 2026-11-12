// v2 の紹介動画（Issue #315）の11場面の表（はじめは10場面。2026-11-12 に感想の一枚を戻して11）。「なぜ必要か」の流れに絞った版。
// 台本の正本はリポジトリの外（2026-11-12 オーナー決定）。ここには場面の並びと、写したナレーションの置き場所だけを書く。
// 撮り直さない：提出版の行（../sections.ts の ROWS）を流用し、録画・寄り・タップ・テロップ・アプリの声もそのまま使う。
// 新しく合成するナレーションは narration/v2-NN.mp3（原稿は video/narration/v2-NN.txt）。ほかは提出版の mp3。
// 2〜6・9番の長さは、合成した声の長さ（2026-11-12 に測った。v2-02 7.7秒、v2-03 10.5秒、v2-04 27.3秒、v2-05 14.3秒、v2-06 8.3秒、v2-09 20.8秒。2・4・9番は v03 を見て原稿を直し合成し直した長さ）に
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

/** 提出版の何番の行か（1始まり） */
const v1 = (n: number): Row => ROWS[n - 1];

const ROWS_V2: Row[] = [
  // 1：問い。提出版の1番のまま（暗転の録画は置かない：2026-11-08 オーナー「最初に一瞬だけお薬の避難訓練が映る」）
  { ...v1(1), narrationFile: "narration/01.mp3" },
  // 2：地震の回数。提出版の2番の地図を使う（数え直さない：2026-11-12 オーナー決定「数えた当時の日時で」）。
  // 2026-11-12 オーナー（v03 を見て、チャット）：「11月5日時点で21回」としたい → ナレーションを v2-02 に替えた
  { ...v1(2), seconds: 8.5, narrationFile: "narration/v2-02.mp3", footageFreezeSeconds: 5.7 },
  // 3：薬は身近（数字のカード）
  {
    seconds: 12.5,
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
    seconds: 29,
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
    seconds: 16,
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
  { ...v1(4), seconds: 9.5,narrationFile: "narration/v2-06.mp3", footageFreezeSeconds: 7.9 },
  // 7：訓練の実演。提出版の5番のまま（アプリの声・オーナーの声の台詞・電池切れ・立て直しの問い）
  { ...v1(5), narrationFile: "narration/05.mp3", headlineIntro: headlineIntroOf(4) },
  // 8：振り返り。提出版の6番のまま
  { ...v1(6), narrationFile: "narration/06.mp3" },
  // 9：受け取る側の備え（ボード）。提出版の8番の録画・患者の表・早送り・承認のタップを使い、ナレーションを1本で合成し直す。
  // 新旧の声をつながないので 08a は鳴らさない。章の題は場面の頭に出す
  {
    ...v1(8),
    seconds: 23,
    narrationFile: "narration/v2-09.mp3",
    narrationDelayFrames: sec(0.5),
    extraNarration: [],
    footageFreezeSeconds: 21.8,
    chapter: { text: CHAPTERS.board, at: 0, seconds: 2.0 },
  },
  // 10：使った人の声。提出版の12番のまま（写真・感想の一枚・声。中身はリポジトリの外）。
  // 2026-11-12 オーナー（v02 を見て、チャット）：感想の一枚が無くなっていると言われて戻した
  { ...v1(12), narrationFile: "narration/12.mp3" },
  // 11：締め。提出版の13番のまま（公開 URL は出さない：2026-11-08 オーナー決定。スマホの画面も出さない：同日オーナー）
  { ...v1(13), narrationFile: "narration/13.mp3" },
];

export const SECTIONS_V2 = buildSections(ROWS_V2, (i) => HEADLINES_V2[i], () => null);
export const TOTAL_FRAMES_V2 = SECTIONS_V2.reduce((sum, s) => sum + s.durationInFrames, 0);
