// 提出動画の8場面の表（Issue #28、ADR-0051 と追記）。
// 中身は docs/demo-script.md「場面ごとの台本（物語の構成。可変の尺。2026-11-06 改訂）」の表から写した。
// 台本を直したら、この表と video/narration/NN.txt も一緒に直す。
// 場面の長さは行ごとに秒で持つ（20秒×9の均等な配分はやめた。ADR-0051 の追記）。合計は 180 秒。

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/**
 * 画面の種類。素材は video/public/ に置く（Git の対象外。BWJ2026_Docs から写す）。
 * - liveAction：本人の実写（1番。横長の動画）
 * - quakeMap：震源の地図のアニメーション（2番。横長の動画）
 * - phone：スマホ幅（390×844）の録画を縦の枠に入れて横長の中に置く（3〜5・8番）
 * - board：ボードの横長の録画（1920×1080。6番）
 * - techSafety：技術と安全の一枚（7番。図は後で作る。今は仮の文字）
 */
export type ScreenKind = "liveAction" | "quakeMap" | "phone" | "board" | "techSafety";

/** 声の役（docs/demo-script.md「声の割り当て」） */
export type Voice = "本人（生声）" | "ナレーター" | "ナレーター＋アプリの声";

export type Section = {
  /** 場面の番号（1〜8） */
  number: number;
  /** 開始フレーム */
  from: number;
  /** 長さ（フレーム） */
  durationInFrames: number;
  /** 台本の時間の欄（表示用） */
  timeLabel: string;
  voice: Voice;
  /**
   * 見出し語（音を消して見る審査員向けに、各場面に1つ大きく置く案）。
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
   * 素材の動画の音を鳴らすか。1番（本人の生声）と、アプリの聞き取り係の声を聞かせる3番・4番だけ鳴らす
   * （録画の音声をそのまま使う）。ほかの録画の音は消し、ナレーションだけにする（docs/demo-script.md「声の割り当て」）。
   */
  footageAudio: boolean;
  /**
   * ナレーションを鳴らし始めるまでのフレーム数（場面の頭から）。0 ならすぐ鳴らす。
   * 0 より大きいときは、録画の音（footageAudio）をナレーションが始まるところで消し、二つの声が重ならないようにする。
   */
  narrationDelayFrames: number;
  /**
   * 録画の音を鳴らし始めるフレーム数（場面の頭から）。0 なら頭から鳴らす。
   * 4番（出来事）では、ナレーションが電池切れを言い終えたあとで録画の音を開け、
   * 聞き取り係の「では、ほかにどうやって伝えられますか？」をアプリの声で聞かせる。
   */
  footageAudioFromFrames: number;
};

// [TODO-OWNER: 字幕の代わりの見出し語を各ビートに置くか、置くなら下の headline の文でよいか（docs/demo-script.md「オーナーに決めてほしいこと」の3）]
const HEADLINES = [
  "伝えられますか",
  "地震の多い国",
  "お薬の避難訓練",
  "スマートフォンが使えない",
  "まだ弱いところ",
  "本部のボード",
  "Claude の役割と守り",
  "平時の練習を、備えに",
] as const;

type Row = Omit<
  Section,
  | "number"
  | "from"
  | "durationInFrames"
  | "timeLabel"
  | "headline"
  | "narrationFile"
  | "narrationDelayFrames"
  | "footageAudioFromFrames"
> & {
  /** 場面の長さ（秒）。台本の表の時間の欄と同じ */
  seconds: number;
  narrationDelayFrames?: number;
  footageAudioFromFrames?: number;
};

/**
 * 3番の頭で、3D の聞き取り係が1問目を話す長さ（台本では3〜4秒。アプリの声は録画の音声をそのまま使う）。
 * この間はナレーションを待たせる。実際の録画の長さに合わせてオーナーが直す。
 */
const SECTION3_APP_VOICE_FRAMES = 4 * FPS;

/**
 * 4番の頭で、ナレーターが出来事（電池切れ）を言い終えるまでの長さの見込み（約40字、9秒）。
 * ここから録画の音を開け、聞き取り係の問いをアプリの声で聞かせる。合成したナレーションの長さに合わせてオーナーが直す。
 */
const SECTION4_NARRATION_FRAMES = 9 * FPS;

const ROWS: Row[] = [
  {
    seconds: 13,
    voice: "本人（生声）",
    screen: "liveAction",
    screenNote: "本人（顔出し）。災害支援で見た課題と、問い",
    footageFile: "footage/01-live-action.mp4",
    footageAudio: true,
  },
  {
    seconds: 19,
    voice: "ナレーター",
    screen: "quakeMap",
    screenNote: "震源の地図（日本語版のアニメーション）→ 避難訓練の一般的な絵",
    footageFile: "footage/02-quake-map.mp4",
    footageAudio: false,
  },
  {
    seconds: 31,
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote: "S1 はじめに → S2 3D の聞き取り係が1問目を話す → 1問目に答える → S4 情報源を選ぶ",
    footageFile: "footage/03-phone.mp4",
    footageAudio: true,
    narrationDelayFrames: SECTION3_APP_VOICE_FRAMES,
  },
  {
    seconds: 31,
    voice: "ナレーター＋アプリの声",
    screen: "phone",
    screenNote: "S5 出来事（スマートフォンの電池切れ）→ S6 聞き取り係の問い（アプリの声）→ 答え直す",
    footageFile: "footage/04-phone.mp4",
    footageAudio: true,
    footageAudioFromFrames: SECTION4_NARRATION_FRAMES,
  },
  {
    seconds: 21,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S7 振り返り（まだ弱いところ → 次の一手）→ S9 準備行動を1つ選ぶ → 終わりの画面",
    footageFile: "footage/05-phone.mp4",
    footageAudio: false,
  },
  {
    seconds: 29,
    voice: "ナレーター",
    screen: "board",
    screenNote: "S10 本部のボード（全体 → 架空の患者の到着 → 地図が動く）→ S12 連絡（掲示板）",
    footageFile: "footage/06-board.mp4",
    footageAudio: false,
  },
  {
    seconds: 25,
    voice: "ナレーター",
    screen: "techSafety",
    screenNote: "技術と安全の一枚：左に「アプリの中の Claude」、右に「開発の Claude Code」",
    footageFile: null,
    footageAudio: false,
  },
  {
    seconds: 11,
    voice: "ナレーター",
    screen: "phone",
    screenNote: "S1 はじめに（冒頭の問いに戻る）→ SonaQuest のロゴ",
    footageFile: "footage/08-phone.mp4",
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
    narrationDelayFrames: row.narrationDelayFrames ?? 0,
    footageAudioFromFrames: row.footageAudioFromFrames ?? 0,
    // 1番は本人の生声（実写の音声）なので、合成したナレーションは無い
    narrationFile: number === 1 ? null : `narration/${pad2(number)}.mp3`,
  });
  return acc;
}, []);

export const SECTION_COUNT = SECTIONS.length;
/** 全体の長さ（フレーム）。各場面の秒の合計（台本では 180 秒＝5400 フレーム） */
export const TOTAL_FRAMES = SECTIONS.reduce((sum, s) => sum + s.durationInFrames, 0);

/** 最後の場面の末尾に置く、ロゴと公開 URL の札の長さ（台本の提案：5秒。URL を置くかはオーナーの判断） */
export const ENDCARD_FRAMES = 5 * FPS;
// [TODO-OWNER: 最後に置く公開 URL（と QR）の文。今は仮の文字（docs/demo-script.md「オーナーに決めてほしいこと」の10）]
export const PUBLIC_URL_PLACEHOLDER = "[公開URL]";
