// 提出動画の13場面の表（Issue #28・#262、ADR-0051 と追記）。
// 中身は docs/demo-script.md「場面ごとの台本（13場面。2026-11-08 改訂）」の表から写した。
// 台本を直したら、この表と video/narration/NN.txt も一緒に直す。
// 場面の長さは行ごとに秒で持つ。合計は 180 秒。
// 3番（本人の経験）と 12番（協力者の写真と、試用した人の感想）は、原稿・写真をリポジトリに置かない
// （CLAUDE.md 絶対ルール8）。素材は video/public/（Git の対象外）に置き、この表には中立の名前の枠だけを書く。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * 画面の種類。素材は video/public/ に置く（Git の対象外。BWJ2026_Docs から写す）。
 * - question：冒頭の問いを大きく文字で（1番。頭に電池切れの暗転の切り出しを置ける）
 * - quakeMap：震源の地図のアニメーション（2番。横長の動画）に「21回」と出典を重ねる
 * - photos：写真を順に見せる（3・7・12番）。1枚の場面と、2枚を横に並べる場面がある。最後に横長の録画を続けられる
 * - phone：スマホ幅（390×844）の録画を縦の枠に入れて横長の中に置く（4〜6・13番）
 * - board：ボードの横長の録画（1920×1080。8〜10番）
 * - models：モデルの使い分けの一枚（11番。Remotion で描く）
 */
export type ScreenKind = "question" | "quakeMap" | "photos" | "phone" | "board" | "models";

/** 声の役（docs/demo-script.md「声の割り当て」）。13場面の版では本人の生声の場面は無い */
export type Voice = "ナレーター" | "ナレーター＋アプリの声";

/**
 * 画面に重ねる Remotion の部品。
 * - quakeCount：「21回」と出典（2番）
 * - pipeline：スマホの横の空きに出す、訓練の文の経路の図（5番。訓練の文に限る）
 * - patientTable：架空の患者 100 人の表を差し込む枠（8番。部品は Issue #261 で作る。今は仮の画面）
 */
export type Overlay = "quakeCount" | "pipeline" | "patientTable";

export type Section = {
  /** 場面の番号（1〜13） */
  number: number;
  /** 開始フレーム */
  from: number;
  /** 長さ（フレーム） */
  durationInFrames: number;
  /** 台本の時間の欄（表示用） */
  timeLabel: string;
  voice: Voice;
  /**
   * 見出し語（音を消して見る審査員向けに、各場面に1つ大きく置く。提案 C、Issue #258 で採用）。
   * 文は Claude Code の下書き。文はオーナーが決める（下のマーカー）。
   */
  headline: string;
  /** 画面の種類 */
  screen: ScreenKind;
  /** 台本の「画面」の欄の要約（仮の画面に出す）。3・12番は中身を書かない */
  screenNote: string;
  /**
   * ナレーションの音声：video/public/ からの相対パス。
   * 合成は scripts/synthesize-narration.mjs（原稿 → video/public/narration/NN.mp3）。
   */
  narrationFile: string | null;
  /**
   * 原稿がリポジトリの外にあるか（3・12番）。原稿は video/public/private/narration/NN.txt に置く（Git の対象外）。
   */
  privateNarration: boolean;
  /** 横長・縦長の録画：video/public/ からの相対パス。置かれていなければ仮の画面のまま */
  footageFile: string | null;
  /**
   * 写真の場面（photos）の写真：video/public/ からの相対パス。1つの要素が1カット（1枚か、横に並べる2枚）。
   * 拡張子を除いた中立の名前（photos/03-a など）で書く。jpg・png・webp のどれを置いてもよい（theme.ts の resolveImage）。
   * 元の写真の名前はリポジトリに書かない。
   */
  photoShots: string[][];
  /**
   * 写真の場面の最後のカットに重ねる文：video/public/ からの相対パスのテキストファイル（12番の感想の一節）。
   * 文はリポジトリに置かない。置かれていなければ何も重ねない。
   */
  captionFile: string | null;
  /** 画面に重ねる Remotion の部品 */
  overlay: Overlay | null;
  /**
   * 素材の録画の音を鳴らすか。アプリのソナの声を聞かせる5番だけ鳴らす（録画の音声をそのまま使う）。
   * ほかの録画の音は消し、ナレーションだけにする（docs/demo-script.md「声の割り当て」）。
   */
  footageAudio: boolean;
  /** ナレーションを鳴らし始めるまでのフレーム数（場面の頭から）。0 ならすぐ鳴らす */
  narrationDelayFrames: number;
  /**
   * 録画の音を消す区間（場面の頭からのフレーム。[始め, 終わり)）。
   * 5番では、ナレーションの間だけ録画の音を消し、二つの声が重ならないようにする。
   * ナレーションが終わったら録画の音を戻し、電池切れの後のソナの問いをアプリの声で聞かせる。
   */
  footageMutedRanges: Array<readonly [number, number]>;
};

// [TODO-OWNER: 字幕の代わりの見出し語を各ビートに置くか、置くなら下の headline の文でよいか（docs/demo-script.md「オーナーに決めてほしいこと」の3）]
const HEADLINES = [
  "どう伝えますか",
  "地震の多い国",
  "現場で見たこと",
  "お薬の避難訓練",
  "スマートフォンが使えない",
  "まだ弱いところ",
  "本部の備え",
  "架空の患者100人",
  "5つの役の連絡",
  "最後は人が確かめる",
  "モデルの使い分け",
  "使った人の声",
  "普段からの練習を、備えに",
] as const;

type Row = Omit<
  Section,
  | "number"
  | "from"
  | "durationInFrames"
  | "timeLabel"
  | "headline"
  | "narrationFile"
  | "privateNarration"
  | "photoShots"
  | "captionFile"
  | "overlay"
  | "narrationDelayFrames"
  | "footageMutedRanges"
> & {
  /** 場面の長さ（秒）。台本の表の時間の欄と同じ */
  seconds: number;
  privateNarration?: boolean;
  photoShots?: string[][];
  captionFile?: string;
  overlay?: Overlay;
  narrationDelayFrames?: number;
  footageMutedRanges?: Array<readonly [number, number]>;
};

/**
 * 1番の頭に置く、電池切れの暗転（5番の録画から切り出す）の長さ。この後に問いの文字を出す。
 * 切り出した録画の長さに合わせてオーナーが直す。
 */
export const QUESTION_BLACKOUT_FRAMES = Math.round(1.5 * FPS);

/** 2番で「21回」を出し始めるフレーム（ナレーションが回数を言うところの見込み）。合成した長さに合わせて直す */
export const QUAKE_COUNT_FROM_FRAMES = 4 * FPS;

/**
 * 5番の時間の見込み（録画とナレーションの長さに合わせてオーナーが直す）。
 * - 0〜：ソナが1問目を話す（アプリの声）→ 文字で答える
 * - SECTION5_NARRATION_FROM：ナレーション「薬の写真は、スマホに入っている。…ところが……」（約35字、約7秒）。
 *   この間だけ録画の音を消す
 * - その後：電池切れの暗転 → ソナ「では、ほかにどうやって伝えられますか？」（アプリの声）→ 2秒の無音 → 答え直す
 */
const SECTION5_NARRATION_FROM = 9 * FPS;
const SECTION5_NARRATION_FRAMES = 8 * FPS;

/**
 * 5番の横の経路の図を出す区間。ソナの1問目（Claude が言い回しを作る文）の間だけ出す。
 * 電池切れの後の立て直しの問いは固定文（safety.md）で Claude が作らないので、暗転の前に消す。
 */
export const PIPELINE_FROM_FRAMES = Math.round(0.5 * FPS);
export const PIPELINE_TO_FRAMES = SECTION5_NARRATION_FROM;

/** 8番で、架空の患者の表を差し込む区間（ボードの全体を4秒見せた後）。Issue #261 の部品の長さに合わせて直す */
export const PATIENT_TABLE_FROM_FRAMES = 4 * FPS;
export const PATIENT_TABLE_FRAMES = 6 * FPS;

/** 写真の後に録画を続ける場面（7番）で、写真1カットに使う長さ */
export const PHOTO_SHOT_FRAMES = 3 * FPS;

const ROWS: Row[] = [
  {
    seconds: 8,
    voice: "ナレーター",
    screen: "question",
    screenNote: "電池切れの暗転（5番の録画から切り出す）→ 問いを大きく文字で",
    footageFile: "footage/01-blackout.mp4",
    footageAudio: false,
  },
  {
    seconds: 10,
    voice: "ナレーター",
    screen: "quakeMap",
    screenNote: "震源の地図（日本語版のアニメーション）→「21回」と出典",
    footageFile: "footage/02-quake-map.mp4",
    footageAudio: false,
    overlay: "quakeCount",
  },
  {
    seconds: 15,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "本人の経験（原稿・写真はリポジトリの外。video/public/ の素材を読む）",
    footageFile: null,
    footageAudio: false,
    privateNarration: true,
    photoShots: [["photos/03-a", "photos/03-b"], ["photos/03-c"]],
  },
  {
    seconds: 8,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "ロゴ → S1 はじめに（2D／3D を選ぶ）",
    footageFile: "footage/04-phone.mp4",
    footageAudio: false,
  },
  {
    seconds: 30,
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote:
      "3D：ソナが1問目を話す → 文字で答える → 情報源「スマートフォン」→ 電池切れの暗転 → ソナ「では、ほかにどうやって伝えられますか？」→ 2秒の無音 → 答え直す",
    footageFile: "footage/05-phone.mp4",
    footageAudio: true,
    overlay: "pipeline",
    narrationDelayFrames: SECTION5_NARRATION_FROM,
    footageMutedRanges: [[SECTION5_NARRATION_FROM, SECTION5_NARRATION_FROM + SECTION5_NARRATION_FRAMES]],
  },
  {
    seconds: 19,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S7 振り返りの「まだ弱いところ」→ S9 準備行動「飲んでいる薬のメモを財布に入れる」→「今週中」→ 終わりの画面",
    footageFile: "footage/06-phone.mp4",
    footageAudio: false,
  },
  {
    seconds: 13,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "当時の本部と救護所の写真（素材はリポジトリの外）→ ボードの全体へ",
    footageFile: "footage/07-board.mp4",
    footageAudio: false,
    photoShots: [["photos/07-a"], ["photos/07-b"], ["photos/07-c"]],
  },
  {
    seconds: 23,
    voice: "ナレーター",
    screen: "board",
    screenNote:
      "ボードの全体（「架空データ」の印）→ 架空の患者 100 人の表 → 受け入れ → 自動で進める → 1つの救護所・1つの品目を追う（在庫 → 不足 → 発注の提案 → HQ が承認 → 搬送 → 受領）",
    footageFile: "footage/08-board.mp4",
    footageAudio: false,
    overlay: "patientTable",
  },
  {
    seconds: 12,
    voice: "ナレーター",
    screen: "board",
    screenNote: "掲示板：救護所の報告と本部の返事を1組だけ寄せて見せる",
    footageFile: "footage/09-board.mp4",
    footageAudio: false,
  },
  {
    seconds: 13,
    voice: "ナレーター",
    screen: "board",
    screenNote: "カルテ：見本の会話 → 要約（引用に寄る）→ 監査の指摘 →「人が確認済み」",
    footageFile: "footage/10-board.mp4",
    footageAudio: false,
  },
  {
    seconds: 9,
    voice: "ナレーター",
    screen: "models",
    screenNote: "モデルの使い分けの一枚：左に訓練、右にボード、下に Claude Code",
    footageFile: null,
    footageAudio: false,
  },
  {
    seconds: 10,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "協力者の写真と、試用した人の感想の一節（原稿・写真・文はリポジトリの外）",
    footageFile: null,
    footageAudio: false,
    privateNarration: true,
    photoShots: [["photos/12-a"], ["photos/12-b"]],
    captionFile: "private/12-caption.txt",
  },
  {
    seconds: 10,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "選んだ準備のカードを一瞬 → 締めの画面（ロゴは仮の文字。Issue #263 で作る）",
    footageFile: "footage/13-phone.mp4",
    footageAudio: false,
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;

export const SECTIONS: Section[] = ROWS.reduce<Section[]>((acc, row, i) => {
  const number = i + 1;
  const last = acc[acc.length - 1];
  const from = last ? last.from + last.durationInFrames : 0;
  const durationInFrames = row.seconds * FPS;
  const startSec = from / FPS;
  const endSec = (from + durationInFrames) / FPS;
  const { seconds: _seconds, ...rest } = row;
  acc.push({
    ...rest,
    number,
    from,
    durationInFrames,
    timeLabel: `${clock(startSec)}–${clock(endSec)}`,
    headline: HEADLINES[i],
    privateNarration: row.privateNarration ?? false,
    photoShots: row.photoShots ?? [],
    captionFile: row.captionFile ?? null,
    overlay: row.overlay ?? null,
    narrationDelayFrames: row.narrationDelayFrames ?? 0,
    footageMutedRanges: row.footageMutedRanges ?? [],
    // どの場面もナレーターの声。3・12番の原稿はリポジトリの外だが、合成した音声は同じ場所に置く
    narrationFile: `narration/${pad2(number)}.mp3`,
  });
  return acc;
}, []);

export const SECTION_COUNT = SECTIONS.length;
/** 全体の長さ（フレーム）。各場面の秒の合計（台本では 180 秒＝5400 フレーム） */
export const TOTAL_FRAMES = SECTIONS.reduce((sum, s) => sum + s.durationInFrames, 0);

/**
 * 最後の場面（13番）の締めの画面の長さ。準備のカードを一瞬見せた後、締めの文とロゴを出し、ロゴを2秒残す。
 */
export const ENDCARD_FRAMES = 7 * FPS;
// [TODO-OWNER: 最後に置く公開 URL（と QR）の文。今は仮の文字（docs/demo-script.md「オーナーに決めてほしいこと」の10）]
export const PUBLIC_URL_PLACEHOLDER = "[公開URL]";
