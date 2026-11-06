// 提出動画の9ビートの表（Issue #28、ADR-0050）。
// 中身は docs/demo-script.md「場面ごとの台本（下書き。20秒×9セクション。2026-11-06 改訂）」の表から写した。
// 台本を直したら、この表と video/narration/NN.txt も一緒に直す。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** 1ビートの長さ：20秒 */
export const BEAT_FRAMES = 20 * FPS;
export const BEAT_COUNT = 9;
/** 全体：180秒（5400フレーム） */
export const TOTAL_FRAMES = BEAT_FRAMES * BEAT_COUNT;

/**
 * 画面の種類。素材は video/public/ に置く（Git の対象外。BWJ2026_Docs から写す）。
 * - liveAction：本人の実写（1番。横長の動画）
 * - quakeMap：震源の地図のアニメーション（2番。横長の動画）
 * - phone：スマホ幅（390×844）の録画を縦の枠に入れて横長の中に置く（3〜6・9番）
 * - board：ボードの横長の録画（1920×1080。7番）
 * - techSafety：技術と安全の一枚（8番。図は後で作る。今は仮の文字）
 */
export type ScreenKind = "liveAction" | "quakeMap" | "phone" | "board" | "techSafety";

/** 声の役（docs/demo-script.md「声の割り当て」） */
export type Voice = "本人（生声）" | "ナレーター" | "ナレーター＋アプリの声";

export type Section = {
  /** ビートの番号（1〜9） */
  number: number;
  /** 開始フレーム */
  from: number;
  /** 長さ（フレーム） */
  durationInFrames: number;
  /** 台本の時間の欄（表示用） */
  timeLabel: string;
  voice: Voice;
  /**
   * 見出し語（音を消して見る審査員向けに、各ビートに1つ大きく置く案）。
   * 文は Claude Code の下書き。見出し語を置くかどうかと文はオーナーが決める（下のマーカー）。
   */
  headline: string;
  /** 画面の種類 */
  screen: ScreenKind;
  /** 台本の「画面」の欄の要約（仮の画面に出す） */
  screenNote: string;
  /**
   * ナレーションの音声：video/public/ からの相対パス。1番は本人の生声で、実写の音声を使うので無し。
   * 合成は scripts/synthesize-narration.mjs（video/narration/NN.txt → video/public/narration/NN.mp3）。
   */
  narrationFile: string | null;
  /** 画面の素材：video/public/ からの相対パス。置かれていなければ仮の画面のまま */
  footageFile: string | null;
  /**
   * 素材の動画の音を鳴らすか。1番（本人の生声）と4番（アプリの聞き取り係の声。録画の音声をそのまま使う）だけ鳴らす。
   * ほかの録画の音は消し、ナレーションだけにする（docs/demo-script.md「声の割り当て」）。
   */
  footageAudio: boolean;
  /**
   * ナレーションを鳴らし始めるまでのフレーム数（ビートの頭から）。0 ならすぐ鳴らす。
   * 0 より大きいときは、録画の音（footageAudio）をナレーションが始まるところで消し、二つの声が重ならないようにする。
   */
  narrationDelayFrames: number;
};

// [TODO-OWNER: 字幕の代わりの見出し語を各ビートに置くか、置くなら下の headline の文でよいか（docs/demo-script.md「オーナーに決めてほしいこと」の3）]
const HEADLINES = [
  "伝えられますか",
  "地震の多い国",
  "お薬の避難訓練",
  "救護所の聞き取り",
  "想定外の出来事",
  "点数のない振り返り",
  "本部のボード",
  "Claude の役割と守り",
  "平時の練習を、備えに",
] as const;

type Row = Omit<
  Section,
  "number" | "from" | "durationInFrames" | "timeLabel" | "headline" | "narrationFile" | "narrationDelayFrames"
> & { narrationDelayFrames?: number };

/**
 * 4番の頭で、3D の聞き取り係が1問目を話す長さ（台本では3〜4秒。アプリの声は録画の音声をそのまま使う）。
 * この間はナレーションを待たせる。実際の録画の長さに合わせてオーナーが直す。
 */
const BEAT4_APP_VOICE_FRAMES = 4 * FPS;

const ROWS: Row[] = [
  {
    voice: "本人（生声）",
    screen: "liveAction",
    screenNote: "本人（顔出し）。自己紹介と、なぜ作ったか",
    footageFile: "footage/01-live-action.mp4",
    footageAudio: true,
  },
  {
    voice: "ナレーター",
    screen: "quakeMap",
    screenNote: "震源の地図（日本語版のアニメーション）→ 避難訓練の一般的な絵",
    footageFile: "footage/02-quake-map.mp4",
    footageAudio: false,
  },
  {
    voice: "ナレーター",
    screen: "phone",
    screenNote: "薬の袋・手帳の一般的な絵 → S1 はじめに（2D／3D の選択）",
    footageFile: "footage/03-phone.mp4",
    footageAudio: false,
  },
  {
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote: "S2 3D の聞き取り係が1問目を話す → S3 2D の対話 → S4 情報源を選ぶ",
    footageFile: "footage/04-phone.mp4",
    footageAudio: true,
    narrationDelayFrames: BEAT4_APP_VOICE_FRAMES,
  },
  {
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S5 出来事（スマートフォンの電池切れ）→ S6 立て直しの問いと回答",
    footageFile: "footage/05-phone.mp4",
    footageAudio: false,
  },
  {
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S7 振り返り（手薄なところ → 5つの観点）→ S8 救護所に渡す記録の形",
    footageFile: "footage/06-phone.mp4",
    footageAudio: false,
  },
  {
    voice: "ナレーター",
    screen: "board",
    screenNote: "S10 本部のボード（全体 → 架空の患者の到着 → 地図が動く）→ S12 連絡（掲示板）",
    footageFile: "footage/07-board.mp4",
    footageAudio: false,
  },
  {
    voice: "ナレーター",
    screen: "techSafety",
    screenNote: "技術と安全の一枚：左に「アプリの中の Claude」、右に「開発の Claude Code」",
    footageFile: null,
    footageAudio: false,
  },
  {
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S9 準備行動を1つ選ぶ → 終わりの画面 → SonaQuest のロゴと公開 URL",
    footageFile: "footage/09-phone.mp4",
    footageAudio: false,
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;

export const SECTIONS: Section[] = ROWS.map((row, i) => {
  const number = i + 1;
  const from = i * BEAT_FRAMES;
  const startSec = from / FPS;
  const endSec = (from + BEAT_FRAMES) / FPS;
  return {
    ...row,
    number,
    from,
    durationInFrames: BEAT_FRAMES,
    timeLabel: `${clock(startSec)}–${clock(endSec)}`,
    headline: HEADLINES[i],
    narrationDelayFrames: row.narrationDelayFrames ?? 0,
    // 1番は本人の生声（実写の音声）なので、合成したナレーションは無い
    narrationFile: number === 1 ? null : `narration/${pad2(number)}.mp3`,
  };
});

/** 9番の最後に置く、ロゴと公開 URL の札の長さ（台本の提案：5秒） */
export const ENDCARD_FRAMES = 5 * FPS;
// [TODO-OWNER: 最後に置く公開 URL（と QR）の文。今は仮の文字（docs/demo-script.md「オーナーに決めてほしいこと」の10）]
export const PUBLIC_URL_PLACEHOLDER = "[公開URL]";
