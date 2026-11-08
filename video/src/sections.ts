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
 * - models：モデルの使い分け（11番）。訓練・掲示板・カルテの録画（footage/11-*.mp4）を並べ、モデルの流れの札を重ねる
 *   （2026-11-08 オーナー：「デモ＞プレゼン」。流れの図は要所に残してよい）
 */
export type ScreenKind = "question" | "quakeMap" | "photos" | "phone" | "board" | "models";

/** 声の役（docs/demo-script.md「声の割り当て」）。13場面の版では本人の生声の場面は無い */
export type Voice = "ナレーター" | "ナレーター＋アプリの声";

/**
 * 画面に重ねる Remotion の部品。
 * - quakeCount：「21回」と出典（2番）
 * - pipeline：スマホの横の空きに出す、訓練の文の経路の図（5番。訓練の文に限る）
 * - patientTable：架空の患者 100 人の表（8番。Issue #261 の PatientTableVideo を差し込む）
 */
export type Overlay = "quakeCount" | "pipeline" | "patientTable";

/**
 * 寄り（10のコツの 01 クローズアップ。提案 A）。場面の頭からの秒で、寄り始めから戻り終わりまでを持つ。
 * x・y は寄る中心（画面の幅・高さに対する割合。0.5 が中央）。録画を撮った後に、決め所に合わせて直す。
 */
export type Zoom = { from: number; to: number; scale: number; x: number; y: number };

/**
 * タップ（2026-11-08 オーナー：「ズームインとかしてタップしてズームアウトして…変化を見る」）。
 * at は場面の頭からの秒、x・y は録画の CSS の座標（スマホは 390×844、ボードは 1920×1080）。
 * 撮影の記録（media/RN.json の clicks）を場面の時間に写した値。3秒より近いタップは1回の寄りにまとめる。
 * zoom: false は波紋だけ（場面の頭すぎる・終わりすぎるタップ）。
 */
export type Tap = { at: number; x: number; y: number; zoom?: boolean };

/**
 * 下のテロップ（2026-11-08 オーナー：「強調したいところは、デモ動画の最中にでも…下の方に、小さく…テロップ」）。
 * 場面の頭からの秒。文は Claude Code の下書き（下のマーカー）。
 */
export type Telop = { from: number; to: number; text: string };

/** 札（10のコツの 05 ログの早回し）。場面の頭からの秒 */
export type Badge = { from: number; to: number; text: string };

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
   * 録画のどこから使うか（フレーム）。長い1本の録画（撮影の R1〜R4）から場面ごとに切り出すときに使う。
   * 同じ録画を複数の場面で使い、開始位置だけ変えてよい。
   */
  footageStartFrame: number;
  /** 寄り（01 クローズアップ）。無ければ寄らない */
  zooms: Zoom[];
  /** 画面に出す札（05 早回しの「早送り」など） */
  badges: Badge[];
  /** タップの寄りと波紋。無ければ出さない */
  taps: Tap[];
  /** 下のテロップ。無ければ出さない */
  telops: Telop[];
  /**
   * 大きな場面の切り替わり（訓練・本部のボード）の頭に、約1秒、章の題を録画の上に重ねる。
   * 1枚のスライドを足すと 180 秒が延びるので、録画に重ねる形にした。
   */
  chapter: { text: string; at: number } | null;
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
   * 12番のコメントの一枚の中身：video/public/ からの相対パスの JSON（Git の対象外。名前・コメント・出典・写真）。
   * 置かれていなければ写真の場面のまま。
   */
  quoteFile: string | null;
  /**
   * スマホの場面で iPhone のベゼルを出すか。ベゼルは最初の4番だけにし、5・6・13番は画面だけを少し大きく出す
   * （2026-11-08 オーナー：「iPhoneのベゼルは1回だせばいいんじゃないかな」）。
   */
  bezel: boolean;
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
  /**
   * 場面に重ねるアプリの声（ソナの声）。5番だけ。画面の録画（ヘッドレスの Chrome の screencast）には音が入らないので、
   * 録画に映るソナの文を、公開 URL の /api/tts（アプリと同じ ElevenLabs の声）で合成して重ねる
   * （2026-11-08 オーナー：「elevenslabだからそれで合成してもらってもいいよ」）。
   * file は video/public/ の中（Git の対象外）、fromFrames は場面の頭からのフレーム
   */
  appVoice: Array<{ file: string; fromFrames: number }>;
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

// [TODO-OWNER: デモの最中の下のテロップと、章の題の文（Claude Code の下書き。2026-11-08 オーナーの「大事なところはテロップ」に合わせた）]
/** 章の題（大きな場面の切り替わりの頭に約1秒） */
const CHAPTERS = {
  training: "お薬の避難訓練",
  board: "本部の医薬品ボード（架空データ）",
} as const;

/** 下のテロップの文。モデルの名前は modelMap.ts と同じ */
const TELOPS = {
  mode: "文字で答えるか、自分の声で答えるかを選べる",
  event: "想定外の出来事：スマートフォンの電池が切れた",
  recovery: "立て直しの問いは固定文。Claude には作らせない",
  review: "5つの観点ごとに、話せたこと・まだ弱いところ",
  prep: "準備を1つ選び、いつやるかを決めて終わる",
  fictional: "人も数もすべて架空のデータ",
  approve: "発注の提案はコードの計算。承認するのは人（本部）",
  agents: "本部と救護所A〜Dの5つの役を、Managed Agents が演じる",
  summary: "Claude Sonnet 5.5：本人の言葉を写した抽出型の要約",
  audit: "別のモデル（Managed Agents）が、記録との一致を監査",
  human: "最後は人が確かめて「確認済み」にする",
} as const;

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
  | "appVoice"
  | "footageStartFrame"
  | "zooms"
  | "badges"
  | "taps"
  | "telops"
  | "chapter"
  | "quoteFile"
  | "bezel"
> & {
  /** 場面の長さ（秒）。台本の表の時間の欄と同じ */
  seconds: number;
  privateNarration?: boolean;
  photoShots?: string[][];
  captionFile?: string;
  overlay?: Overlay;
  narrationDelayFrames?: number;
  footageMutedRanges?: Array<readonly [number, number]>;
  /** アプリの声（秒で書く。fromSeconds は場面の頭から） */
  appVoice?: Array<{ file: string; fromSeconds: number }>;
  /** 録画のどこから使うか（秒） */
  footageStartSeconds?: number;
  zooms?: Zoom[];
  badges?: Badge[];
  taps?: Tap[];
  telops?: Telop[];
  chapter?: { text: string; at: number };
  quoteFile?: string;
  bezel?: boolean;
};

/**
 * 1番の頭の黒の長さ。この後に問いの文字を出す（opening.wav の鈴も同じ 1.0 秒。scripts/compose-bgm.mjs）。
 * 電池切れの暗転の録画は置かない：アプリの上の帯「お薬の避難訓練」が暗くならずに映るため
 * （2026-11-08 オーナー：「最初に一瞬だけお薬の避難訓練が映る」）。暗転は5番の録画で見せる。
 */
// 問いの後の間は1秒（2026-11-08 オーナー決定）。ナレーション約7秒＋1秒で8秒に収まる
export const QUESTION_BLACKOUT_FRAMES = Math.round(1.0 * FPS);

/** 2番で「21回」を出し始めるフレーム（ナレーションが回数を言うところの見込み）。合成した長さに合わせて直す */
export const QUAKE_COUNT_FROM_FRAMES = 4 * FPS;

/**
 * 5番の時間（2026-11-08 の R1 の録画に合わせた）。
 * - 0〜：ソナが1問目を話す（アプリの声を appVoice で重ねる）→ 文字で答える
 * - SECTION5_NARRATION_FROM：ナレーション「薬の写真は、スマホに入っている。…ところが……」（約8秒）
 * - その後：電池切れの暗転 → ソナの立て直しの問い（アプリの声）→ 2秒の無音 → 答え直す
 */
const SECTION5_NARRATION_FROM = 9 * FPS;

/**
 * 5番の横の経路の図を出す区間。ソナの1問目（Claude が言い回しを作る文）の間だけ出す。
 * 電池切れの後の立て直しの問いは固定文（safety.md）で Claude が作らないので、暗転の前に消す。
 */
export const PIPELINE_FROM_FRAMES = Math.round(0.5 * FPS);
export const PIPELINE_TO_FRAMES = SECTION5_NARRATION_FROM;

/** 8番で、架空の患者の表（Issue #261 の PatientTableVideo、5秒＝150 フレーム）を差し込む区間（ボードの全体を4秒見せた後） */
export const PATIENT_TABLE_FROM_FRAMES = 4 * FPS;
export const PATIENT_TABLE_FRAMES = 150;

/** 写真の後に録画を続ける場面（7番）で、写真1カットに使う長さ */
export const PHOTO_SHOT_FRAMES = 3 * FPS;

const ROWS: Row[] = [
  {
    seconds: 8,
    voice: "ナレーター",
    screen: "question",
    screenNote: "黒の地 → 問いを大きく文字で",
    footageFile: null,
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
    chapter: { text: CHAPTERS.training, at: 0 },
    bezel: true,
    taps: [
      { at: 4.48, x: 287, y: 422 },
      { at: 6.39, x: 195, y: 615 },
    ],
    telops: [{ from: 3.5, to: 7.8, text: TELOPS.mode }],
  },
  {
    seconds: 30,
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote:
      "3D：ソナが1問目を話す → 文字で答える → 情報源「スマートフォン」→ 電池切れの暗転 → ソナ「では、ほかにどうやって伝えられますか？」→ 2秒の無音 → 答え直す",
    footageFile: "footage/05-phone.mp4",
    // 録画に音は無い。ソナの声は appVoice で重ねる（ナレーションの 9〜17秒とは重ならない）
    footageAudio: false,
    overlay: "pipeline",
    narrationDelayFrames: SECTION5_NARRATION_FROM,
    // 録画（2026-11-08、R1 の4回目）の区間：0〜4 ソナの1問目、4〜10 文字で答える、10〜14.8 情報源「スマートフォン」、
    // 14.8〜18.2 電池切れ、18.2〜24.6 立て直しの問い、24.6〜26.6 無音、26.6〜 答え直す
    appVoice: [
      { file: "voice/05-sona-1.mp3", fromSeconds: 0.2 },
      { file: "voice/05-sona-2.mp3", fromSeconds: 18.8 },
    ],
    // 寄り：電池切れ〜立て直しの問いでスマホに寄る（情報源を押す所はタップの寄り）
    zooms: [{ from: 18.2, to: 26.6, scale: 1.18, x: 0.49, y: 0.5 }],
    // 答える（9.46）はナレーションの頭なので波紋だけ。情報源「スマートフォン」→「これで進む」で寄る
    taps: [
      { at: 9.46, x: 195, y: 808, zoom: false },
      { at: 12.17, x: 195, y: 422 },
      { at: 14.22, x: 195, y: 746 },
      { at: 29.84, x: 195, y: 808, zoom: false },
    ],
    telops: [
      { from: 15.0, to: 18.2, text: TELOPS.event },
      { from: 19.0, to: 26.6, text: TELOPS.recovery },
    ],
  },
  {
    seconds: 19,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S7 振り返りの「まだ弱いところ」→ S9 準備行動「飲んでいる薬のメモを財布に入れる」→「今週中」→ 終わりの画面",
    footageFile: "footage/06-phone.mp4",
    footageAudio: false,
    // 寄りの下書き：振り返りの「まだ弱いところ」の札。録画に合わせて直す
    zooms: [{ from: 0.5, to: 6, scale: 1.25, x: 0.49, y: 0.4 }],
    // 準備行動「財布に入れる」→「今週中」→「これに決める」
    taps: [
      { at: 8.97, x: 195, y: 422 },
      { at: 11.0, x: 195, y: 422 },
      { at: 13.34, x: 195, y: 422 },
    ],
    telops: [
      { from: 0.8, to: 6, text: TELOPS.review },
      { from: 8.5, to: 15, text: TELOPS.prep },
    ],
  },
  {
    seconds: 13,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "当時の本部と救護所の写真（素材はリポジトリの外）→ ボードの全体へ",
    footageFile: "footage/07-board.mp4",
    footageAudio: false,
    photoShots: [["photos/07-a"], ["photos/07-b"], ["photos/07-c"]],
    // 写真の3カット（9秒）の後、ボードの録画に替わる所で章の題を出す
    chapter: { text: CHAPTERS.board, at: 9 },
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
    // 05 ログの早回し：自動で進める所（デモ時計の早送り）。録画に合わせて直す
    // 録画の区間：0〜5.5 全体、5.5〜13 受け入れと早送り（4〜9 は患者の表が重なる）、13〜 発注・搬送 → 承認 → 搬送 → 受領
    badges: [{ from: 9, to: 13, text: "▶▶ デモの時間を早送り" }],
    taps: [
      { at: 13.04, x: 555, y: 156 },
      { at: 16.01, x: 413, y: 660 },
    ],
    telops: [
      { from: 1.2, to: 4, text: TELOPS.fictional },
      { from: 13.5, to: 19, text: TELOPS.approve },
    ],
  },
  {
    seconds: 12,
    voice: "ナレーター",
    screen: "board",
    screenNote: "掲示板：救護所の報告と本部の返事を1組だけ寄せて見せる",
    footageFile: "footage/09-board.mp4",
    footageAudio: false,
    taps: [
      { at: 0.23, x: 489, y: 579, zoom: false },
      { at: 6.79, x: 643, y: 992 },
    ],
    telops: [{ from: 1.0, to: 6, text: TELOPS.agents }],
  },
  {
    seconds: 13,
    voice: "ナレーター",
    screen: "board",
    screenNote: "カルテ：見本の会話 → 要約（引用に寄る）→ 監査の指摘 →「人が確認済み」",
    footageFile: "footage/10-board.mp4",
    footageAudio: false,
    // 録画の区間：0〜2.8 要約を作る、2.8〜 要約が出た所 → 記録との一致をチェック（監査）→ 確認済みにする → 最後の絵を止める
    taps: [
      { at: 0.63, x: 507, y: 775 },
      { at: 3.15, x: 509, y: 827 },
      { at: 11.2, x: 514, y: 828 },
    ],
    telops: [
      { from: 2.9, to: 6.2, text: TELOPS.summary },
      { from: 6.8, to: 10.6, text: TELOPS.audit },
      { from: 11.4, to: 13, text: TELOPS.human },
    ],
  },
  {
    seconds: 9,
    voice: "ナレーター",
    screen: "models",
    screenNote: "モデルの使い分け：訓練・掲示板・カルテの実際の画面を並べ、それぞれにモデルの流れの札を重ねる。下に Claude Code",
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
    quoteFile: "private/12-quote.json",
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
    appVoice: (row.appVoice ?? []).map((v) => ({ file: v.file, fromFrames: Math.round(v.fromSeconds * FPS) })),
    footageStartFrame: Math.round((row.footageStartSeconds ?? 0) * FPS),
    zooms: row.zooms ?? [],
    badges: row.badges ?? [],
    taps: row.taps ?? [],
    telops: row.telops ?? [],
    chapter: row.chapter ?? null,
    quoteFile: row.quoteFile ?? null,
    bezel: row.bezel ?? false,
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
// → オーナー決定（2026-11-08、チャット）：「最後の公開URLは不要」
export const PUBLIC_URL_PLACEHOLDER = "[公開URL]";
