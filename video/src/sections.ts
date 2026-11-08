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

/**
 * 画面に出ている選択肢を、スマホの右の余白に書き出す札（2026-11-08 オーナー：「画面の流れが速いので、
 * 選択肢の詳細をスライドの左右の余白に書いておくとよい」）。文はアプリの固定文（web/src/flow/content.ts）。
 * 場面の頭からの秒。picks は録画で選んだ時刻と、選んだ選択肢の id（その時刻から札でも印を付ける）。
 */
export type OptionPanel = {
  kind: "sources" | "prep";
  from: number;
  to: number;
  picks: Array<{ at: number; id: string }>;
};

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
  /** 録画がこのフレーム（場面の頭から）より先へ行かないよう、ここで止める。録画が場面より短いとき（10番）。null なら止めない */
  footageFreezeFrame: number | null;
  /** 録画を途中で止めて間を作る（5番）。atFrame（場面の頭から）の絵を frames だけ止め、その後は続きから流す。null なら止めない */
  footageHold: { atFrame: number; frames: number } | null;
  /** 場面の前半だけ別の見出しを出す（untilFrame は場面の頭から。その後は headline）。null なら頭から headline */
  headlineIntro: { text: string; untilFrame: number } | null;
  /** 寄り（01 クローズアップ）。無ければ寄らない */
  zooms: Zoom[];
  /** 画面に出す札（05 早回しの「早送り」など） */
  badges: Badge[];
  /** タップの寄りと波紋。無ければ出さない */
  taps: Tap[];
  /** 下のテロップ。無ければ出さない */
  telops: Telop[];
  /** 右の余白の選択肢の札。無ければ出さない */
  optionPanel: OptionPanel | null;
  /**
   * 大きな場面の切り替わり（訓練・本部のボード）の頭に、約1秒、章の題を録画の上に重ねる。
   * 1枚のスライドを足すと 180 秒が延びるので、録画に重ねる形にした。
   */
  chapter: { text: string; at: number; seconds: number } | null;
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
  /**
   * 写真の場面の1カット目に重ねる、人の名前の札の中身：video/public/ からの相対パスの JSON
   * （Git の対象外。{ role, name, nameEn }）。置かれていなければ出さない。名前や肩書きはリポジトリに書かない。
   */
  nameplateFile: string | null;
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
  appVoice: AudioClip[];
  /**
   * 場面の中の間に足す、オーナーの声の台詞（5番。2026-11-08 オーナー：「0:50のところ、実際の入力に合わせて僕の声で発言して」
   * 「スマホの充電が切れてしまっていました・・・というのを0:57くらいに入れてほしい。僕の声で」「僕の声でセリフね。続きのナレーションみたいな感じ」
   * 「映像やBGMは変えないで」）。原稿は video/narration/<id>.txt、合成は scripts/synthesize-narration.mjs の EXTRA_CLIPS。
   * file は video/public/ の中（Git の対象外）、fromFrames は場面の頭からのフレーム
   */
  extraNarration: AudioClip[];
  /**
   * ナレーションの mp3 を切り分けて、別々の時刻に鳴らすとき（5番。2026-11-08 オーナー：ソナの返事を「残して」）。
   * 空でなければ narrationDelayFrames の代わりにこれを使う。trimBeforeFrames・durationFrames は mp3 の中のフレーム
   */
  narrationParts: Array<{ fromFrames: number; trimBeforeFrames: number; durationFrames: number }>;
};

/** 場面に重ねる音の1つ。fromFrames は場面の頭から。trimBeforeFrames・durationFrames は mp3 の中のどこを使うか（null なら終わりまで） */
export type AudioClip = { file: string; fromFrames: number; trimBeforeFrames: number; durationFrames: number | null };

/** 秒で書く音の1つ。fileFromSeconds・fileToSeconds は mp3 の中のどこを使うか */
type ClipRow = { file: string; fromSeconds: number; fileFromSeconds?: number; fileToSeconds?: number };

const toClip = (v: ClipRow): AudioClip => {
  const trim = v.fileFromSeconds ?? 0;
  return {
    file: v.file,
    fromFrames: Math.round(v.fromSeconds * FPS),
    trimBeforeFrames: Math.round(trim * FPS),
    durationFrames: v.fileToSeconds === undefined ? null : Math.round((v.fileToSeconds - trim) * FPS),
  };
};

// [TODO-OWNER: 字幕の代わりの見出し語を各ビートに置くか、置くなら下の headline の文でよいか（docs/demo-script.md「オーナーに決めてほしいこと」の3）]
const HEADLINES = [
  "どう伝えますか",
  "地震の多い国",
  "現場で見たこと",
  "お薬の避難訓練",
  "スマートフォンが使えない",
  "まだ準備が弱いところ",
  "本部の備え",
  // 8番も7番と同じ題にして、左上の題を続けて出す（2026-11-08 オーナー：「本部の備え」を「架空の患者100人のスライドまで継続して表示」）
  "本部の備え",
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
  agents: "本部と救護所A〜Dの5つの役を、Claude Managed Agents が演じる",
  summary: "Claude Sonnet 5.5：本人の言葉を写した抽出型の要約",
  audit: "別の Claude（Managed Agents 上の Opus 5.5）が、記録との一致を監査",
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
  | "nameplateFile"
  | "overlay"
  | "narrationDelayFrames"
  | "footageMutedRanges"
  | "appVoice"
  | "extraNarration"
  | "narrationParts"
  | "footageStartFrame"
  | "footageFreezeFrame"
  | "footageHold"
  | "headlineIntro"
  | "zooms"
  | "badges"
  | "taps"
  | "telops"
  | "optionPanel"
  | "chapter"
  | "quoteFile"
  | "bezel"
> & {
  /** 場面の長さ（秒）。台本の表の時間の欄と同じ */
  seconds: number;
  privateNarration?: boolean;
  photoShots?: string[][];
  captionFile?: string;
  nameplateFile?: string;
  overlay?: Overlay;
  narrationDelayFrames?: number;
  footageMutedRanges?: Array<readonly [number, number]>;
  /** アプリの声（秒で書く。fromSeconds は場面の頭から） */
  appVoice?: ClipRow[];
  /** 足す台詞（秒で書く。fromSeconds は場面の頭から） */
  extraNarration?: ClipRow[];
  /** ナレーションを切り分けて鳴らす（秒で書く。fromSeconds は場面の頭から、fileFromSeconds・fileToSeconds は mp3 の中） */
  narrationParts?: Array<{ fromSeconds: number; fileFromSeconds: number; fileToSeconds: number }>;
  /** 録画のどこから使うか（秒） */
  footageStartSeconds?: number;
  /** 録画を止める時刻（秒。場面の頭から） */
  footageFreezeSeconds?: number;
  /** 録画を途中で止めて間を作る（秒） */
  footageHold?: { atSeconds: number; seconds: number };
  zooms?: Zoom[];
  badges?: Badge[];
  taps?: Tap[];
  telops?: Telop[];
  optionPanel?: OptionPanel;
  /** 章の題。seconds は出す長さ（無ければ 1.1 秒） */
  chapter?: { text: string; at: number; seconds?: number };
  quoteFile?: string;
  bezel?: boolean;
};

/**
 * 1番の頭の黒の長さ。この後に問いの文字を出す（opening.wav の鈴も同じ 1.0 秒。scripts/compose-bgm.mjs）。
 * 電池切れの暗転の録画は置かない：アプリの上の帯「お薬の避難訓練」が暗くならずに映るため
 * （2026-11-08 オーナー：「最初に一瞬だけお薬の避難訓練が映る」）。暗転は5番の録画で見せる。
 */
// 問いの後の間は1秒（2026-11-08 オーナー決定）。合成したナレーション（01.mp3、声は 6.09 秒で終わる）を
// 問いの文字と同時に鳴らし、黒 0.9 秒＋声 6.09 秒＋間 1.0 秒で 8 秒に収める（opening.wav の鈴も 0.9 秒）
export const QUESTION_BLACKOUT_FRAMES = Math.round(0.9 * FPS);

/** 秒 → フレーム */
const sec = (seconds: number) => Math.round(seconds * FPS);

/**
 * 合成したナレーションの長さ（秒。2026-11-08 に ffprobe で測った値。mp3 の頭と終わりの無音を含む）。
 * 各場面の narrationDelayFrames と、言葉に合わせた札・寄りの時刻は、この長さと文の切れ目（ffmpeg の silencedetect）から決めた。
 * 合成し直したら測り直して直す。2番は 2026-11-08 に一度速さ 0.85 にし、同じ日に元の速さに戻した（6.32 秒）。
 * 3〜6・8〜12番は 2026-11-08 にオーナーの原稿の直しで合成し直した。
 */
export const NARRATION_SECONDS: Record<number, number> = {
  1: 6.32, 2: 6.32, 3: 15.84, 4: 5.36, 5: 6.64, 6: 10.08, 7: 10.0, 8: 10.4, 9: 8.08, 10: 13.44, 11: 6.72, 12: 10.88, 13: 4.8,
};

/**
 * 2番で「21回」の札を出し始めるフレーム。02.mp3 で「すでに」の後の間（5.19〜5.35 秒）が明けて回数を言う所。
 * 札は地図の動画が無いときだけ出す（SonaQuestVideo.tsx の OverlayView）。動画の中の数は約 13 秒（場面の頭から約 5 秒）で 21 に届く
 */
export const QUAKE_COUNT_FROM_FRAMES = sec(5.3);

/**
 * 5番の時間（2026-11-08 の R1 の録画に合わせた）。
 * 録画は 13.9 秒（情報源「スマートフォン」を選んだ後、「これで進む」を押す前）で 6 秒止め、その間にナレーションを言う
 * （2026-11-08 オーナー：「血圧の薬Aを飲んでいます」の直後に「お薬手帳アプリが…」が来るのはおかしい。間にソナの質問が入らないと」
 * 「ところが・・・と画面の切り替わりがかぶっていて展開が早すぎる」。止める 5 秒は 4・6・8番から回した。
 * 2026-11-08 に2文目を「これなら正確に答えられそうです。」に替えて長くなったので、6番から1秒もらって 6 秒止める）。
 * section5Time(録画の秒) で、止めた後の録画の時刻を場面の時刻に直す。
 * - 0.2〜4.0：ソナの1問目（アプリの声）
 * - 4.15〜6.5：オーナーの声の台詞「血圧の薬のAを飲んでいます。」（05a。入力の間）
 * - 10.2〜13.5：ソナの返事の問い「以下の中で、いちばん頼りにしているのはどれですか？」（アプリの声。合成した返事の2文目だけ）
 * - 13.9〜18.7：ナレーション「お薬手帳アプリが、スマホに入っている。」（13.9〜16.3）「これなら正確に答えられそうです。」（16.8〜18.7）（05.mp3 の 0〜2.45 秒と 2.95〜5.0 秒）
 * - 19.2〜20.0：ナレーション「ところが……」（05.mp3 の 5.45 秒から）。約 0.8 秒おいて、20.2 秒に「これで進む」、20.8 秒に電池切れの暗転
 * - その後（録画の時刻 + 6 秒）：05b（21.5〜）→ ソナの立て直しの問い（24.8〜）→ 05c（30.7〜）→ 答え直す（32.6〜）
 */
export const SECTION5_HOLD = { atSeconds: 13.9, seconds: 6 } as const;
/** 5番の録画の秒を、止めた分を足した場面の秒に直す */
export const section5Time = (footageSeconds: number) =>
  footageSeconds >= SECTION5_HOLD.atSeconds ? footageSeconds + SECTION5_HOLD.seconds : footageSeconds;
const t5 = section5Time;
const SECTION5_PIPELINE_TO = 9 * FPS;

/**
 * 5番の横の経路の図を出す区間。ソナの1問目（Claude が言い回しを作る文）の間だけ出す。
 * 電池切れの後の立て直しの問いは固定文（safety.md）で Claude が作らないので、暗転の前に消す。
 */
export const PIPELINE_FROM_FRAMES = Math.round(0.5 * FPS);
export const PIPELINE_TO_FRAMES = SECTION5_PIPELINE_TO;

/** 8番で、架空の患者の表（Issue #261 の PatientTableVideo、5秒＝150 フレーム）を差し込む区間（ボードの全体を4秒見せた後） */
export const PATIENT_TABLE_FROM_FRAMES = 4 * FPS;
export const PATIENT_TABLE_FRAMES = 150;

/**
 * 写真の後に録画を続ける場面（7番）で、写真1カットに使う長さ。3カットで 10.2 秒にし、
 * ナレーション（07.mp3、10.0 秒）を写真の間に言い終えてから、ボードの録画と章の題に替える
 */
export const PHOTO_SHOT_FRAMES = Math.round(3.4 * FPS);

/**
 * 場面の途中で見出しを切り替える。5番は暗転（電池切れ）まで結末を言わず「いつもの薬を伝える」とし、暗転で「スマートフォンが使えない」にする
 * （v06 の第三者のレビューで「見出しが山場を先に言ってしまう」と指摘。2026-11-08 オーナーが直すと選んだ）
 */
function headlineIntroOf(index: number): { text: string; untilFrame: number } | null {
  if (index === 4) return { text: "いつもの薬を伝える", untilFrame: Math.round(section5Time(14.8) * FPS) };
  return null;
}

const ROWS: Row[] = [
  {
    seconds: 8,
    voice: "ナレーター",
    screen: "question",
    screenNote: "黒の地 → 問いを大きく文字で",
    footageFile: null,
    footageAudio: false,
    // 問いの文字と同時に読み始める
    narrationDelayFrames: QUESTION_BLACKOUT_FRAMES,
  },
  {
    // 2026-11-08 に 10 → 7 秒（地図の最後の3秒を 3番の自己紹介に回した。オーナー：「0:15-0:18に表示されている日本地図を、次の自己紹介の枠に充てて」）
    seconds: 7,
    voice: "ナレーター",
    screen: "quakeMap",
    screenNote: "震源の地図（日本語版のアニメーション）→「21回」と出典",
    footageFile: "footage/02-quake-map.mp4",
    footageAudio: false,
    overlay: "quakeCount",
  },
  {
    // 2026-11-08 に 15 → 18 秒（2番から3秒もらった）
    seconds: 18,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "本人の経験（原稿・写真はリポジトリの外。video/public/ の素材を読む）",
    footageFile: null,
    footageAudio: false,
    privateNarration: true,
    photoShots: [["photos/03-a", "photos/03-b"], ["photos/03-c"]],
    // 1カット目（顔の写った写真）に名前の札（2026-11-08 オーナーの依頼。中身は Git の外）
    nameplateFile: "private/03-nameplate.json",
    narrationDelayFrames: sec(0.8),
  },
  {
    // 2026-11-08 に 8 → 7 秒（5番の間に回した）
    seconds: 7,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "ロゴ → S1 はじめに（2D／3D を選ぶ）",
    footageFile: "footage/04-phone.mp4",
    footageAudio: false,
    chapter: { text: CHAPTERS.training, at: 0 },
    bezel: true,
    // 章の題の音（0秒）と重ねない
    narrationDelayFrames: sec(0.5),
    taps: [
      { at: 4.48, x: 287, y: 422 },
      { at: 6.39, x: 195, y: 615 },
    ],
    telops: [{ from: 3.5, to: 7.8, text: TELOPS.mode }],
  },
  {
    // 2026-11-08 に 30 → 35 秒（録画を 5 秒止めて間を作る。上の SECTION5_HOLD）
    seconds: 36,
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote:
      "3D：ソナが1問目を話す → 文字で答える → ソナの問い → 情報源「スマートフォン」（ここで止めてナレーション）→ 電池切れの暗転 → ソナ「では、ほかにどうやって伝えられますか？」→ 2秒の無音 → 答え直す",
    footageFile: "footage/05-phone.mp4",
    // 録画に音は無い。ソナの声は appVoice で、オーナーの声の台詞は extraNarration で重ね、ナレーションは narrationParts で切り分ける（上の注）
    footageAudio: false,
    footageHold: SECTION5_HOLD,
    overlay: "pipeline",
    narrationParts: [
      { fromSeconds: 13.9, fileFromSeconds: 0, fileToSeconds: 2.45 },
      { fromSeconds: 16.75, fileFromSeconds: 2.95, fileToSeconds: 5.0 },
      { fromSeconds: 19.15, fileFromSeconds: 5.45, fileToSeconds: 6.4 },
    ],
    // 録画（2026-11-08、R1 の4回目）の区間（録画の秒）：0〜4 ソナの1問目、4〜10 文字で答える、10〜14.8 ソナの問いと情報源「スマートフォン」、
    // 14.8〜18.2 電池切れ、18.2〜24.6 立て直しの問い、24.6〜26.6 無音、26.6〜 答え直す
    appVoice: [
      { file: "voice/05-sona-1.mp3", fromSeconds: 0.2 },
      // 返事の問いの部分だけ（mp3 の 2.75 秒から。前はお礼の1文と息の音。問いの声は 2.92〜6.29 秒）
      { file: "voice/05-sona-reply.mp3", fromSeconds: 10.0, fileFromSeconds: 2.75 },
      { file: "voice/05-sona-2.mp3", fromSeconds: t5(18.8) },
    ],
    // オーナーの声の台詞：入力している答えを短くしたもの（4〜10秒の入力の間）、電池切れの暗転の間、立て直しの問いの後
    extraNarration: [
      { file: "narration/05a.mp3", fromSeconds: 4.15 },
      { file: "narration/05b.mp3", fromSeconds: t5(15.5) },
      { file: "narration/05c.mp3", fromSeconds: t5(24.7) },
    ],
    // 寄り：電池切れ〜立て直しの問いでスマホに寄る（情報源を押す所はタップの寄り）
    zooms: [{ from: t5(18.2), to: t5(26.6), scale: 1.18, x: 0.49, y: 0.5 }],
    // 答える（9.46）は波紋だけ。情報源「スマートフォン」→「これで進む」も、
    // 右の余白に選択肢の札を出すので寄らずに波紋だけ（寄るとスマホの画面が札にかかる）
    taps: [
      { at: 9.46, x: 195, y: 808, zoom: false },
      { at: 12.17, x: 195, y: 422, zoom: false },
      { at: t5(14.22), x: 195, y: 746, zoom: false },
      { at: t5(29.84), x: 195, y: 808, zoom: false },
    ],
    // 10 秒〜電池切れの前：情報源の選択肢（録画では「スマートフォン」を 12.17 秒に選ぶ）。止めている間も出す
    optionPanel: { kind: "sources", from: 10.0, to: t5(14.6), picks: [{ at: 12.17, id: "smartphone" }] },
    telops: [
      { from: t5(15.0), to: t5(18.2), text: TELOPS.event },
      { from: t5(19.0), to: t5(26.6), text: TELOPS.recovery },
    ],
  },
  {
    // 2026-11-08 に 19 → 17 秒（終わりの画面を2秒短くし、5番の間に回した）。さらに 17 → 16 秒（5番の文「これなら正確に答えられそうです」が長くなった分）
    seconds: 16,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S7 振り返りの「まだ弱いところ」→ S9 準備行動「飲んでいる薬のメモを財布に入れる」→「今週中」→ 終わりの画面",
    footageFile: "footage/06-phone.mp4",
    footageAudio: false,
    // 寄りの下書き：振り返りの「まだ弱いところ」の札。録画に合わせて直す
    zooms: [{ from: 0.5, to: 6, scale: 1.25, x: 0.49, y: 0.4 }],
    // 「この人は、薬のメモを財布に入れると決めました」（06.mp3 の 6.63 秒〜）が、財布に入れるを押す所（8.97 秒）に重なる
    // （2026-11-08 に1文目を「振り返りを採点することはありません。」に替えて 0.4 秒長くなったので、1.0 → 0.6 秒）
    narrationDelayFrames: sec(0.6),
    // 準備行動「財布に入れる」→「今週中」→「これに決める」。右の余白に選択肢の札を出すので寄らずに波紋だけ
    taps: [
      { at: 8.97, x: 195, y: 422, zoom: false },
      { at: 11.0, x: 195, y: 422, zoom: false },
      { at: 13.34, x: 195, y: 422, zoom: false },
    ],
    // 7.5〜14 秒：準備行動と「いつやるか」の選択肢（録画では「財布に入れる」→「今週中」）
    optionPanel: {
      kind: "prep",
      from: 7.5,
      to: 14.0,
      picks: [
        { at: 8.97, id: "wallet_memo" },
        { at: 11.0, id: "this_week" },
      ],
    },
    telops: [
      { from: 0.8, to: 6, text: TELOPS.review },
      { from: 8.5, to: 15, text: TELOPS.prep },
    ],
    // 終わりの画面の間に、本人の声の一言（06a、5.3 秒。2026-11-08 オーナー：「1:25あたりに、私の声で…5秒程度無音があるので、そこに」）
    extraNarration: [{ file: "narration/06a.mp3", fromSeconds: 10.6 }],
  },
  {
    seconds: 13,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "当時の本部と救護所の写真（素材はリポジトリの外）→ ボードの全体へ",
    footageFile: "footage/07-board.mp4",
    footageAudio: false,
    photoShots: [["photos/07-a"], ["photos/07-b"], ["photos/07-c"]],
    // 写真の3カット（10.2 秒。PHOTO_SHOT_FRAMES）の後、ボードの録画に替わる所で章の題を出す。ナレーションは 10.0 秒で終わる。
    // 章の題は 2.5 秒出し、録画の頭のログインの画面（0〜1.7 秒）は飛ばす（2026-11-08 オーナー：「ログインの画面は消してよいので、その分少しだけ長く表示して」）。
    // 10.4 秒から 8番の頭にかけて 07a（CROSS_NARRATION）を鳴らす
    footageStartSeconds: 1.7,
    chapter: { text: CHAPTERS.board, at: 10.2, seconds: 2.5 },
  },
  {
    // 2026-11-08 に 23 → 21 秒（最後の2秒を 5番の間に回した）
    seconds: 21,
    voice: "ナレーター",
    screen: "board",
    screenNote:
      "ボードの全体（「架空データ」の印）→ 架空の患者 100 人の表 → 受け入れ → 自動で進める → 1つの救護所・1つの品目を追う（在庫 → 不足 → 発注の提案 → HQ が承認 → 搬送 → 受領）",
    footageFile: "footage/08-board.mp4",
    footageAudio: false,
    overlay: "patientTable",
    // 頭は 7番から続く 07a（〜4.3 秒）。08.mp3 の文の切れ目に合わせて 5.5 秒遅らせる：「100人の架空の患者」が患者の表（4〜9秒）、
    // 「在庫が減ります」が早送り（9〜13秒）、「手配を承認し」が承認のタップ（16.01秒）の少し前に来る
    narrationDelayFrames: sec(5.5),
    // 08.mp3 の後に 08a「デモの時計を進めると、発注の提案が次々に入るのがわかります。」（2026-11-08 オーナーの依頼。
    // 4.8 秒。v06 のレビューで「リアルタイム」を言い換えて長くなったので 18.0 → 16.2 秒に早め、場面の終わり（21秒）の前に終える）
    extraNarration: [{ file: "narration/08a.mp3", fromSeconds: 16.2 }],
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
    // 2026-11-08 に 12 → 10 秒（10番に2秒回した。オーナー：「前のスライドを2秒なら削っていいよ」）
    seconds: 10,
    voice: "ナレーター",
    screen: "board",
    screenNote: "掲示板：救護所の報告と本部の返事を1組だけ寄せて見せる",
    // 救護所のエージェントの返事が映る録画（R3 の 9〜11 秒と 47.5〜55.5 秒をつないだ 10 秒。09-board-v2.json）。
    // 前の 09-board.mp4 は書き込みの後「返事を待っています…」のまま切れていた（v06 の第三者のレビューの指摘、2026-11-08 オーナー「別セッションでB-9取れるか試して」）。
    // 0.23 エージェントの連絡を始める、2.79 本部として書き込む、5.95 救護所Aの返事が出る → 返事の吹き出しに寄る
    footageFile: "footage/09-board-v2.mp4",
    footageAudio: false,
    taps: [
      { at: 0.23, x: 489, y: 579, zoom: false },
      { at: 2.79, x: 643, y: 992 },
    ],
    zooms: [{ from: 5.9, to: 10.6, scale: 1.5, x: 880 / 1920, y: 962 / 1080 }],
    telops: [{ from: 1.0, to: 6, text: TELOPS.agents }],
    narrationDelayFrames: sec(1.0),
  },
  {
    // 2026-11-08 に 13 → 15 秒（文を長くしたので 9番から2秒もらった）
    seconds: 15,
    voice: "ナレーター",
    screen: "board",
    screenNote: "カルテ：見本の会話 → 要約（引用に寄る）→ 監査の指摘 →「人が確認済み」",
    footageFile: "footage/10-board.mp4",
    footageAudio: false,
    // 10.mp3（14.2 秒、声は 14.0 秒まで）を 0.8 秒から：「AI要約され」が要約の出た所、「別のモデルが…確かめます」（9.1〜11.9秒）が監査、
    // 「最後に確かめるのは、人です」（12.8秒〜）が確認済みにするタップ（11.2秒）の後に来る。録画（13.0 秒）が場面より短いので 12.9 秒で止める
    narrationDelayFrames: sec(0.8),
    footageFreezeSeconds: 12.9,
    // 録画の区間：0〜2.8 要約を作る、2.8〜 要約が出た所 → 記録との一致をチェック（監査）→ 確認済みにする → 最後の絵を止める
    taps: [
      { at: 0.63, x: 507, y: 775 },
      { at: 3.15, x: 509, y: 827 },
      { at: 11.2, x: 514, y: 828 },
    ],
    telops: [
      { from: 3.6, to: 8.7, text: TELOPS.summary },
      { from: 8.9, to: 11.9, text: TELOPS.audit },
      { from: 12.2, to: 15, text: TELOPS.human },
    ],
  },
  {
    seconds: 9,
    voice: "ナレーター",
    screen: "models",
    screenNote: "モデルの使い分け：訓練・掲示板・カルテの実際の画面を並べ、それぞれにモデルの流れの札を重ねる。下に Claude Code",
    footageFile: null,
    footageAudio: false,
    narrationDelayFrames: sec(0.5),
  },
  {
    // 2026-11-08 に 10 → 13 秒（ナレーションで感想の一節を読む。13番のロゴの後の無音から3秒もらった。オーナーの選択）
    seconds: 13,
    voice: "ナレーター",
    screen: "photos",
    screenNote: "協力者の写真と、試用した人の感想の一節（原稿・写真・文はリポジトリの外）",
    footageFile: null,
    footageAudio: false,
    privateNarration: true,
    photoShots: [["photos/12-a"], ["photos/12-b"]],
    captionFile: "private/12-caption.txt",
    quoteFile: "private/12-quote.json",
    narrationDelayFrames: sec(1.0),
  },
  {
    // 2026-11-08 に 10 → 7 秒（ロゴの後の無音を3秒削って12番に回した）
    seconds: 7,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "締めの画面（締めの文 → ロゴ）",
    // 頭から締めの画面（2026-11-08 オーナー：「スマホ画面が一瞬映るんだけど、それいらないわ。そのスマホ画面スライドは削除して、最後のスライドを写そう」。
    // その前は頭の3秒に訓練のトップページを出していた）。「ソナクエスト。」（13.mp3 の 3.84 秒〜 → 5.34 秒）でロゴが出る（SonaQuestVideo.tsx の EndCard）
    footageFile: null,
    footageAudio: false,
    narrationDelayFrames: sec(1.5),
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
    headlineIntro: headlineIntroOf(i),
    privateNarration: row.privateNarration ?? false,
    photoShots: row.photoShots ?? [],
    captionFile: row.captionFile ?? null,
    nameplateFile: row.nameplateFile ?? null,
    overlay: row.overlay ?? null,
    narrationDelayFrames: row.narrationDelayFrames ?? 0,
    footageMutedRanges: row.footageMutedRanges ?? [],
    appVoice: (row.appVoice ?? []).map(toClip),
    extraNarration: (row.extraNarration ?? []).map(toClip),
    narrationParts: (row.narrationParts ?? []).map((v) => ({
      fromFrames: Math.round(v.fromSeconds * FPS),
      trimBeforeFrames: Math.round(v.fileFromSeconds * FPS),
      durationFrames: Math.round((v.fileToSeconds - v.fileFromSeconds) * FPS),
    })),
    footageStartFrame: Math.round((row.footageStartSeconds ?? 0) * FPS),
    footageFreezeFrame: row.footageFreezeSeconds === undefined ? null : Math.round(row.footageFreezeSeconds * FPS),
    footageHold: row.footageHold ? { atFrame: Math.round(row.footageHold.atSeconds * FPS), frames: Math.round(row.footageHold.seconds * FPS) } : null,
    zooms: row.zooms ?? [],
    badges: row.badges ?? [],
    taps: row.taps ?? [],
    telops: row.telops ?? [],
    optionPanel: row.optionPanel ?? null,
    chapter: row.chapter ? { ...row.chapter, seconds: row.chapter.seconds ?? 1.1 } : null,
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
 * 最後の場面（13番）の締めの画面の長さ。2026-11-08 から13番の頭から終わりまで（7 秒）。
 * ロゴは場面の 5.3〜5.9 秒に出て、約1秒残る
 */
export const ENDCARD_FRAMES = 7 * FPS;

/**
 * 場面をまたいで鳴らすナレーション（2026-11-08 オーナー：「1：41から1：47にかけてセリフ追加」）。
 * 07a「そこで、災害時の情報集約の場として、…作りました。」（7.1 秒、声は 6.9 秒まで）を、7番の写真の後（10.4 秒）から 8番の頭にかけて鳴らす。
 * 場面ごとの Sequence の中に置くと場面の終わりで切れるので、全体の時間で置く
 */
export const CROSS_NARRATION: Array<{ file: string; fromFrames: number }> = [
  { file: "narration/07a.mp3", fromFrames: SECTIONS[6].from + sec(10.4) },
];
// [TODO-OWNER: 最後に置く公開 URL（と QR）の文。今は仮の文字（docs/demo-script.md「オーナーに決めてほしいこと」の10）]
// → オーナー決定（2026-11-08、チャット）：「最後の公開URLは不要」
export const PUBLIC_URL_PLACEHOLDER = "[公開URL]";
