// 画面に出す固定文。Claudeには作らせない（ADR-0015、ADR-0019）。
// 出典が要る文は docs/references.md の確認済みのものだけを使う。

import type { TrainingMode } from "./mode";
import type {
  AnswerAs,
  EventId,
  PrepActionId,
  Question,
  SourceId,
  TimingId,
  ViewpointId,
} from "./types";

// --- はじめに -------------------------------------------------------------

/** 利用開始の文面（ADR-0009 第2回監査の案） */
// [TODO-OWNER: 利用開始の文面の最終確認（ADR-0009の案をそのまま使っている）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（E1。今の `INTRO_LEAD` はオーナーの文）
export const INTRO_LEAD =
  "災害時に、お薬の情報を伝える練習をします。回答は、会話を進めるためにAIサービス（Anthropic）へ送信されます。氏名・住所・電話番号は入力しないでください。薬の名前・量・病名などは、実際の情報ではなく架空の内容で答えてください。このアプリは、薬の情報が正しいか、治療が適切かを判断するものではありません。";

/**
 * AIと接続しているか。接続しているときは回答のたびに /api/turn を呼ぶ（Issue #15）。
 * false にすると、Claude を呼ばずに固定の進行だけで動き、初回画面も送信しない版の文になる
 */
export const AI_CONNECTED = true;

/**
 * 試作版で INTRO_LEAD の代わりに出す文。送信しない版に「送信されます」と出すと、
 * 送信先を誤認させるため（ルール10、privacy.md）。それ以外は INTRO_LEAD と同じ
 */
export const PROTOTYPE_LEAD =
  "このアプリは災害時の服薬情報の伝え方を練習するものです。この版はAIとつないでおらず、入力した内容はどこにも送信しません。この画面の中だけで扱います。氏名、住所、電話番号や、実際の服薬情報（薬の名前・量・病名など）は入力せず、薬の中身は架空の内容で答えてください。薬の正確性や治療の適否は判定しません。";

export const INTRO_POINTS: readonly string[] = [
  "発災翌日の避難所の救護所という、架空の場面です。",
  "氏名・住所・電話番号や、あなたやほかの人の実際の服薬情報は入力しないでください。",
  "実際の聞き取りと同じように、薬の名前や量も聞きます。薬があるか、薬の中身、飲めているかは、架空の内容で答えてください（例：「Aという薬を朝に1錠」）。",
  "どこに記録があるか、ほかにどう伝えるか、薬のことを知っている人は、あなた自身のことを振り返って答えてください。名前や電話番号は書かないでください。",
  "答えは入力したまま表示するだけです。薬の正確さや治療の適否は判定しません。点数や合否もありません。",
  "体調の相談の窓口ではありません。体調に異変があるときは、すぐに「訓練をやめる」を押してください。体調の訴えらしい入力では、まず「現在の体調の訴えでしょうか？」と確かめ、「はい」と答えたときに訓練を中断します。自分を傷つけることをほのめかす入力では、すぐに中断します。すべての訴えを見分けられるわけではありません。",
];

/** 自アプリの方針と外部事業者の方針は分けて書く（.claude/rules/privacy.md） */
// 2026-11-07（Issue #212）：オーナー「文章長い」の後、短くした下書きに「下書きで短くする」（チャット）
export const PRIVACY_OWN =
  "このアプリ：会話・声・読み上げの音声を保存せず、ログにも残しません。タブを閉じると消えます。";
// [TODO-OWNER: 外部事業者の保持方針の書き方（ADR-0006の要約。AI連携の実装時に再確認）]
// 2026-11-07（Issue #212）：オーナー「下書きで短くする」（チャット）で、短くした下書きの文にした。上のマーカーはそのまま
export const PRIVACY_EXTERNAL =
  "Anthropic（Claude）：会話を進めるため、あなたの回答と画面の文を送ります。AIが作った文は、画面に出す前にもう一度送って確かめます（この確認では、あなたの回答そのものは送信しません。ただし、AIが作った文に回答の内容が含まれる場合があります）。Anthropic は入出力を30日以内に削除すると公表しています（規約違反の判定などの例外あり）。このアプリは、入出力を保持しない契約（ゼロ保持）を結んでいません。";

/**
 * 3D の対話モードの声の送信先（ADR-0033、A-08）。2D（文字で答える）では送らない。
 * 保持方針は 2026-11-04 に一次資料で確かめた（README「外部事業者に送るもの」）。確かめられないものは確かめられないと書く
 */
// [TODO-OWNER: 音声の送信先と保持方針の書き方（Claude Code の下書き。ADR-0033 の要約）]
// → オーナー決定（2026-11-06、チャット）：「声の送信先の説明にも同様に直していいよ」（答え方の呼び方「文字で答える」「自分の声で答える」に合わせる。Issue #183）
// → オーナー決定（2026-11-07、チャット、Issue #217）：「どちらも下書きのまま採る」（声の送信先と保持方針の書き方。今の `PRIVACY_VOICE` の文）
// 2026-11-07（Issue #212）：オーナー「下書きで短くする」（チャット）で、短くした下書きの文にした
export const PRIVACY_VOICE =
  "声で答えるとき：声は、文字にするためにブラウザの音声認識へ送られます。送り先は、Edge は Microsoft、Safari は Apple です。Chrome は Google と見られますが、確かめられていません。Microsoft は録音を保存しないと、Apple は改善に同意していなければ保存しないと公表しています。ソナの文は、読み上げのため ElevenLabs へ送ります（あなたの回答や声は送りません）。ElevenLabs は、既定で履歴に残し、AIの学習に使うことがあると公表しています。「文字で答える」ではどちらにも送りません。";

/*
 * 「はじめる前に」を目で追いやすくする図と見出し（Issue #212。2026-11-07 オーナー「図とかフローとか使って認知負荷下げてよ」、
 * 同日「畳まず図で整理」）。上の必ず見せる説明の文は変えず、畳まずに全文を出したまま、その上と各項目に添える。
 * 文言は Claude Code の下書き（Issue #212 の PR の説明に一覧で書く）。説明の全文の書き出しを写さず、短い言い方にする
 */
export interface IntroFlowStep {
  id: "arrive" | "tell" | "event" | "recover" | "review";
  label: string;
  note: string;
}

export const INTRO_FLOW_TITLE = "訓練の流れ";

export const INTRO_FLOW_STEPS: readonly IntroFlowStep[] = [
  { id: "arrive", label: "救護所に着く", note: "発災翌日の避難所（架空）" },
  { id: "tell", label: "薬のことを伝える", note: "ソナの質問に答えます" },
  { id: "event", label: "想定外の出来事", note: "思いがけないことが起きます" },
  { id: "recover", label: "それでも伝えられる？", note: "ほかの伝え方を考えます" },
  { id: "review", label: "振り返り", note: "準備を1つ選んで終わります" },
];

export interface IntroAnswerGroup {
  id: "never" | "fictional" | "own";
  label: string;
  items: readonly string[];
  /** 札の下に小さく添える一言 */
  note?: string;
}

export const INTRO_ANSWER_TITLE = "答え方のきまり";

export const INTRO_ANSWER_GROUPS: readonly IntroAnswerGroup[] = [
  { id: "never", label: "入れないもの", items: ["氏名・住所・電話番号", "あなたやほかの人の実際の服薬情報"] },
  {
    id: "fictional",
    label: "架空で答えるもの",
    items: ["薬があるか", "薬の名前・量", "飲めているか"],
    note: "例：「Aという薬を朝に1錠」",
  },
  {
    id: "own",
    label: "自分のこととして答えるもの",
    items: ["記録がどこにあるか", "ほかの伝え方", "薬のことを知っている人"],
    note: "名前や電話番号は書きません",
  },
];

/**
 * 「気をつけること」に出す項目（Issue #212。2026-11-07 オーナー「文章長い」の後、短くした下書きに「下書きで短くする」（チャット））。
 * 上の図と3つの札と重なる INTRO_POINTS の2〜4つめと INTRO_LEAD は、この画面には出さない（文は残す。INTRO_LEAD のマーカーもそのまま）。
 * 体調の項目は INTRO_POINTS の最後をそのまま使う（PR #203 で文が変わるので、ここで書き換えず、マージ後に自動でそろう）
 */
export interface IntroNotePoint {
  tag: string;
  text: string;
}

export const INTRO_POINTS_TITLE = "気をつけること";
export const INTRO_NOTE_POINTS: readonly IntroNotePoint[] = [
  { tag: "場面", text: "発災翌日の避難所の救護所（架空）です。" },
  {
    tag: "判定しない",
    text: "答えはそのまま表示するだけです。薬の正確さや治療の適否は判定せず、点数や合否もありません。",
  },
  { tag: "体調のこと", text: INTRO_POINTS[INTRO_POINTS.length - 1] },
];

/**
 * 送り先の図（Issue #212 の2つめ。2026-11-07 オーナー「３D版も同じように図とフローチャートで表現しておいてほしい」）。
 * 何を・どこへ・何のために送るかを矢印でつなぐ。3D は声と読み上げの2本を足し、図を先頭に置く（ADR-0033 の「先頭の目立つ位置」）。
 * 2D は声を使わないことを1行で添える。全文（PRIVACY_*）は下の「会話の扱い」にそのまま出す
 */
export interface SendRoute {
  id: "answer" | "voice" | "speech";
  from: string;
  to: string;
  why: string;
  /** true のものは「自分の声で答える」を選んだときだけ出す */
  voiceOnly?: boolean;
}

export const SEND_MAP_TITLE = "どこへ送るか";

export const SEND_ROUTES: readonly SendRoute[] = [
  { id: "answer", from: "あなたの回答", to: "Anthropic（Claude）", why: "会話を進めるため" },
  {
    id: "voice",
    from: "あなたの声",
    to: "ブラウザの音声認識",
    why: "文字にするため（送り先はブラウザによって違います）",
    voiceOnly: true,
  },
  {
    id: "speech",
    from: "ソナの文",
    to: "ElevenLabs",
    why: "読み上げるため（あなたの回答や声は送りません）",
    voiceOnly: true,
  },
];

/** 送り先の図の下に添える1行 */
export const SEND_MAP_KEEP = "このアプリには残りません。タブを閉じると消えます。";
export const SEND_MAP_TEXT_ONLY = "「文字で答える」では声を使わず、音声認識と ElevenLabs には送りません。";

/** 会話の扱いの見出し。各項目は「名前：本文」の名前を太字にして出す */
export const PRIVACY_TITLE = "会話の扱い";

/** はじめにの 2D／3D のモード選択（A-14、ADR-0031、ADR-0036）。文言は Claude Code の下書き（Issue #51 の PR の説明で確認） */
export const MODE_LEGEND = "答え方を選ぶ";

export interface ModeOption {
  id: TrainingMode;
  label: string;
  description: string;
  /** 選んだ結果を文字で添えるときの言い方 */
  result: string;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: "2d",
    label: "文字で答える",
    description: "ソナの2Dの姿を見ながら、文字で答えます。声は使いません。",
    result: "文字で答える",
  },
  {
    id: "3d",
    label: "自分の声で答える",
    description:
      "3Dのパペットのソナと会話します。「話す」を1回押すと声を聞き取り、話し終わると自動で止まります。ソナの文を読み上げます。文字でも答えられます。",
    result: "自分の声で答える",
  },
];

/** 選んだ結果の前に付ける見出し */
export const MODE_CHOSEN_LABEL = "選んでいる答え方：";

/**
 * はじめにの2画面（2026-11-05 オーナー決定「2画面目に全文」、ADR-0036）。
 * 1画面目はカードで選ぶだけ、2画面目「はじめる前に」に必ず見せる説明の全文と「訓練をはじめる」。文言は Claude Code の下書き
 */
export const NEXT_LABEL = "次へ";
export const NOTES_TITLE = "はじめる前に";
export const BACK_LABEL = "答え方を選び直す";

/**
 * 医療者の立場で確認する訓練（C-01）の Coming soon。将来構想で、押せない文字として出す（ADR-0031）。
 * 文言は PRD「Coming soon の表示の決まり」のオーナー決定（2026-11-04、下書きのまま）
 */
export const COMING_SOON_C01 =
  "医療者の立場で確認する訓練（Coming soon）— 将来構想で、提供の時期は決まっていません";

// --- 対話 -----------------------------------------------------------------

/**
 * 話し相手の名前（Issue #164。旧称「ソナ」）。2026-11-06 オーナー決定（チャット）：名前は「ソナ」。
 * 係の交代（出来事 handover）の後の話し相手は「クエ」（2026-11-06 オーナー決定、チャット：「交代後はクエ」）。
 * 吹き出しと係の姿の横に出す。名前の表示はアプリの状態だけで決める（Claude の出力は使わない）
 */
export const LISTENER_NAME = "ソナ";
export const RELIEF_LISTENER_NAME = "クエ";

/** 係の交代の後なら「クエ」、それ以外は「ソナ」 */
export function listenerName(relief: boolean): string {
  return relief ? RELIEF_LISTENER_NAME : LISTENER_NAME;
}


/** 救護所の入口で、診察の前に普段の薬を聞き取る場面（東京都 災害時薬事活動ガイドライン 第3章 p.50。README「参考にした公式資料」） */
// 決定済み：役割の添え方（Claude Code の下書き：場面の説明で「受付のソナ」と役割を添え、吹き出しと係の姿の横は名前だけにする）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const SCENE_INTRO =
  "発災の翌日。避難所の救護所に来ました。入口では、診察の前に、普段飲んでいる薬を確認しています。受付のソナが、あなたに声をかけます。";

// [TODO-OWNER: 固定の質問文（Claude Codeの下書き。前半3問、立て直しの問い、係の交代のときの問い、後半の残りの問い）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」。ADR-0046 に合わない文は「意味を保って縮める」（Q1・Q6・Q7・Q8〜Q12。Q6・Q7・Q12 はオーナーの文のまま、Q1・Q8〜Q10 は Claude Code が縮めた）
// → オーナー決定（2026-11-07、チャット、Issue #163）：「短縮した Q1・Q8・Q9・Q10はそのまま採用してください」。Q11 は「ご家族のほかに、お薬の情報を伝えられる人や相談先はありますか？個人名や施設名は出さずに教えてください。」

// 質問の流れは公的な手引きの聞き取りの順番に合わせた（README「参考にした公式資料」）：
// 普段の薬があるか・中身 → 何で確かめられるか → ほかの医療機関の薬・市販薬・アレルギー・副作用
// → （出来事）→ 代わりの手段 → 最近の変化・飲めているか → 薬を知っている人・管理している人。
// 薬の名前・量・病名は聞いてよいが、答えは判定も記録もしない（ADR-0021）。

// [TODO-OWNER: Issue #41 で足した固定の質問（Claude Code の下書き）：前半の4問目（記録に載っていないこと）と後半の4問目（思い出せなかったこと）の文面、観点、誰のこととして答えるか。あわせて、増えた4回の枠の分け方（半分ごとに、固定の質問を1問足し、残りの1回を聞き返しの余裕にする）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」。ADR-0046 に合わない文は「意味を保って縮める」（Q4・Q12 はオーナーの文。観点・枠の分け方は下書きのまま）
// → オーナー決定（2026-11-07、チャット、Issue #163）：Q4 は「薬のアレルギーや、薬を使って具合が悪くなった経験はありますか？」。「記録の有無は、必要に応じて聞き返してください」

/**
 * 前半（②問い）の固定の4問。回答は最大5回（ADR-0019）で、残りの1回は聞き返しの余裕。
 * 聞き返しが2回入ると、最後の問いは聞かずに③確認へ進む
 */
export const FIRST_HALF_QUESTIONS: readonly Question[] = [
  {
    // Issue #94：飲み薬だけでなく注射・貼り薬・塗り薬と、毎日でなく決まった日だけ使う薬も聞く
    // （2026-11-05 オーナー決定、ADR-0040 の決定7）。数字を入れない（Claude の言い直しが用量の形の検査に当たらないように）
    // [TODO-OWNER: 1問目の文面（Claude Code の下書き。剤形と、決まった日だけ使う薬の例の言い方）]
    // → オーナー決定（2026-11-07、チャット、Issue #163）：「意味を保って縮める」（Q1。オーナーの文を Claude Code が90字に縮めた）
    id: "first_medicines",
    viewpoint: "current",
    answerAs: "fictional",
    // Issue #110：1問1問いにし、薬の名前・何の薬か・量は回答欄の案内（ANSWER_HINTS.fictional）に移した
    // 2026-11-07 オーナーの文（Issue #217・#163）を、1問目の上限90字（ADR-0046）に合わせて縮めた（オーナー「意味を保って縮める」）
    text: "こんにちは。救護所での聞き取りを練習します。薬の名前や量は架空の内容で答えてください。毎日、または決まった日に使うお薬はありますか？飲み薬のほか、注射・貼り薬・塗り薬も含みます。",
  },
  {
    id: "first_location",
    viewpoint: "location",
    answerAs: "self",
    // Issue #110：例は最初は出さず、聞き返すときだけ出す（2026-11-05 オーナー決定「聞き返すときだけ」）
    text: "その薬のことは、何を見れば確かめられますか？",
    examples: "お薬手帳、スマホのお薬手帳アプリ、薬の袋や説明書、薬そのもの",
  },
  {
    id: "first_other",
    viewpoint: "unrecorded",
    answerAs: "fictional",
    // Issue #110：体調の語（「具合が悪くなった」）を外し、アレルギー・合わなかった薬は次の問いへ移した
    text: "ほかの病院でもらっている薬や、市販の薬・サプリはありますか？",
    examples: "歯科でもらう薬、薬局やドラッグストアで買う薬",
  },
  {
    // Issue #41 で足した問い。記録に載っていない可能性のある情報を、もう一歩聞く。
    // 例に体調の言葉（「具合の悪いとき」など）を使わない。利用者が言い返すと、体調の訴えの照合で中断するため
    id: "first_unrecorded",
    viewpoint: "unrecorded",
    answerAs: "fictional",
    // Issue #110：前の問いから移したアレルギー・合わなかった薬を聞く。「最近やめた薬」などは聞き返しの例にした
    // 2026-11-07 オーナーの文（Q4）。もとの例「最近やめた薬・ときどき飲む薬」は、アレルギーの問いと食い違うので外した（オーナーの指摘）。
    // 記録にあるかは1問1問いに合わせて問いから外し、聞き返しの固定文（CLARIFY_TEXTS.first_unrecorded）で聞く（オーナー「記録の有無は、必要に応じて聞き返してください」）
    text: "薬のアレルギーや、薬を使って具合が悪くなった経験はありますか？",
  },
];

/**
 * 「ほかには？」の掘り下げ（Issue #200、ADR-0025 の B）。今の薬をすべて言えるよう、1問目の後に Claude が選んだときだけ出す。
 * 固定の進行（Claude を使わない・失敗した）では出さない。Claude の言い回しが使えないときは、この固定文に戻す
 */
// 決定済み：「ほかには？」の掘り下げの固定文と、同じ半分で掘り下げてよい回数（Claude Code の下書き：「ほかにも、使っている薬はありますか？」、2回まで。rules.ts の FOLLOWUP_LIMIT）
// → オーナー決定（2026-11-07、チャット）：文は「内服薬、貼り薬、注射薬、目薬などがあげられる。他に普段使っているお薬はありますか？症状が出た時だけ使っているお薬なども教えてください。という感じで。」の後、整えた文に「整えた文で」、60字の上限と「症状」の語の問題を聞いた後に「縮めて言い換える」（「貼り薬や目薬、注射薬なども含めて、ほかに使っているお薬はありますか？必要なときだけ使うお薬も教えてください。」）。回数は「2回まで」。
export const MEDICINES_FOLLOWUP_QUESTION: Question = {
  id: "first_medicines_more",
  viewpoint: "current",
  answerAs: "fictional",
  // 2026-11-07：オーナーが「縮めて言い換える」を選んだ文（親のセッション経由）。54字で、質問の上限60字（ADR-0046）に収まる。
  // 「症状」の語は使わない（禁止表現の「症状が出」に当たり、Claude の言い直しが捨てられるため）
  text: "貼り薬や目薬、注射薬なども含めて、ほかに使っているお薬はありますか？必要なときだけ使うお薬も教えてください。",
};

/** 後半の最初の問い（立て直し）。必ず1回出す */
export const RECOVERY_QUESTION: Question = {
  id: "second_recovery",
  viewpoint: "alternative",
  answerAs: "self",
  text: "この状況で、お薬の情報を伝えるには、ほかにどんな方法がありそうですか？",
};

/** 係の交代のときの後半の最初の問い。話し相手はクエ（Issue #164） */
// [TODO-OWNER: 係の交代の文面（Claude Code の下書き。Issue #164：交代の後はクエが名乗る形。出来事の文「受付の係が、ソナからクエに交代しました。…」、この問い、聞き返し・質問し直しの「交代したわたしに」）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」。判定は「伝え直せたかで判定」（Q7・V6・出来事の文はオーナーの文。判定の指示は worker/prompt.ts）
export const HANDOVER_QUESTION: Question = {
  id: "second_handover",
  viewpoint: "alternative",
  answerAs: "both",
  text: "ソナと交代した、クエです。お薬の情報を確認したいので、見せられる記録や、確認できる方法を教えてください。",
};

/**
 * 後半の2問目（最近の変化と、記録が最新か）。Issue #110 で1問1問いにし、
 * 「ここ数日、いつもどおり飲めているか」は聞かない（2026-11-05 オーナー決定「A：記録が最新か」）。
 * 今使っている薬は1問目で集まるので、current の判定の基準は変えない
 */
export const RECENT_QUESTION: Question = {
  id: "second_recent",
  viewpoint: "current",
  answerAs: "both",
  // 2026-11-07 オーナーの文（Q8）を1問1問い（ADR-0046）に縮めた
  text: "最近変わった薬があれば、お薬手帳などの記録にも反映されていますか？",
};

/**
 * 出来事が「お薬手帳は自宅」のときの後半の2問目。使えなくなったお薬手帳を前提にしない
 * （2026-11-07 のオーナーの指摘「お薬手帳がないシナリオなのに、こんなこと聞いてくる」）
 */
// [TODO-OWNER: お薬手帳が自宅のときの、最近の変化と記録の問い（Claude Code の下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「意味を保って縮める」（Q9。オーナーの文を Claude Code が1問1問いに縮めた）
export const RECENT_QUESTION_WITHOUT_NOTEBOOK: Question = {
  id: "second_recent_other",
  viewpoint: "current",
  answerAs: "both",
  // 2026-11-07 オーナーの文（Q9）を1問1問い（ADR-0046）に縮めた
  text: "最近変わった薬があれば、お薬手帳以外の記録でも確認できますか？",
};

/**
 * 後半の3問目（薬を知っている人）。連絡先そのもの（電話番号など）は尋ねない（ADR-0022）。
 * Issue #110 で1問1問いにし、連絡の手段は回答欄の上の選択肢（CONTACT_CHOICES）で補う
 * （2026-11-05 オーナー決定「画面の選択肢で補う」。判定の基準は変えない）。
 * 「電話番号や薬の名前は書かない」は回答欄の案内（ANSWER_HINTS.self）にある
 */
export const PROXY_QUESTION: Question = {
  id: "second_proxy",
  viewpoint: "proxy",
  answerAs: "self",
  // 2026-11-07 オーナーの文（Q10）を60字（ADR-0046）に縮め、例「家族」「ヘルパーさん」は聞き返しに移した
  text: "あなたが説明できないとき、代わりにお薬の情報を伝えられる人はいますか？名前ではなく、関係で教えてください。",
  examples: "家族、ヘルパーさん",
};

/** 「家族と連絡がつかない」の出来事の後は、家族のほかの人を聞く */
export const PROXY_QUESTION_AFTER_FAMILY: Question = {
  id: "second_proxy_other",
  viewpoint: "proxy",
  answerAs: "self",
  // 2026-11-07 オーナーの文（Q11）。例「ヘルパーさん」「かかりつけ薬局」は聞き返しに移した。相談先も聞くので「関係で」ではなく、個人名や施設名を出さない聞き方にした（オーナー）
  text: "ご家族のほかに、お薬の情報を伝えられる人や相談先はありますか？個人名や施設名は出さずに教えてください。",
  examples: "ヘルパーさん、かかりつけ薬局",
};

/**
 * 後半の4問目（Issue #41 で足した問い）。思い出せなかったことと、あとで何で確かめられるかを聞く。
 * 候補は出さず、確かめた内容の入力も求めない（ADR-0022）。回答は最大5回で、残りの1回は聞き返しの余裕
 */
/**
 * 後半の終わりに、受け止めの後に言う固定文（2026-11-07 のオーナーの言葉「今回思い出せなかった薬がないか、お薬手帳で
 * しっかりと確認しておきましょう。という感じの応答で会話終了でいい」）。RECHECK_QUESTION は聞かなくなった
 */
export const RECHECK_CLOSING = "今回思い出せなかった薬がないか、お薬手帳でしっかりと確認しておきましょう。";

/** 2026-11-07 から聞かない（後半の問いの一覧から外した）。以前の記録の項目と試験のために残す */
export const RECHECK_QUESTION: Question = {
  id: "second_recheck",
  viewpoint: "location",
  answerAs: "self",
  text: "思い出せなかったことがあれば、あとで何を見たり、誰に聞いたりすれば確認できそうですか？",
};

/** すべての固定の質問。/api/turn で受け付ける質問IDはこの中のものだけ */
export const ALL_QUESTIONS: readonly Question[] = [
  ...FIRST_HALF_QUESTIONS,
  MEDICINES_FOLLOWUP_QUESTION,
  RECOVERY_QUESTION,
  HANDOVER_QUESTION,
  RECENT_QUESTION,
  PROXY_QUESTION,
  PROXY_QUESTION_AFTER_FAMILY,
  RECENT_QUESTION_WITHOUT_NOTEBOOK,
  RECHECK_QUESTION,
];

/**
 * Claude の文が使えないとき（検査に通らない、失敗した）に出す、聞き返しと質問し直しの固定文（ADR-0025）。
 * 聞き返しは曖昧な回答に、質問し直しは関係のない話に使う。受け止めは内容を繰り返さない一言にする
 */
// [TODO-OWNER: 聞き返しと質問し直しの固定文（Claude Codeの下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（C3〜C6・C10〜C12・C15・C16・C20・C21・C23・C24 はオーナーの文）
export const CLARIFY_TEXTS: Record<string, string> = {
  first_medicines:
    "もう少し教えてください。飲み薬のほか、注射・貼り薬・塗り薬も含めて、毎日、または決まった日に使う薬はありますか？薬の中身は架空の内容で答えてください。",
  first_location:
    "もう少し教えてください。その薬の名前や量は、何に書いてありますか？たとえば、お薬手帳、スマホのお薬手帳アプリ、薬の袋や説明書などです。",
  first_other: "ほかの病院や歯科でもらっている薬、薬局やドラッグストアで買う薬、サプリはありますか？",
  first_medicines_more:
    "貼り薬、注射薬、目薬なども含めて、ほかに使っているお薬はありますか？必要なときだけ使うものも含みます。",
  first_unrecorded:
    "薬を使って、アレルギーが出たり具合が悪くなったりしたことはありますか？ある場合は、そのことが記録に残っているかも教えてください。",
  second_recovery: "今使えなくなった方法のほかに、お薬の情報を確認したり、伝えたりする方法はありますか？",
  second_handover:
    "もう少し教えてください。交代したわたしに、どうやって薬のことを伝えますか？",
  second_recent:
    "もう少し教えてください。最近変わった薬があれば、それはいつも見ている記録に載っていますか？",
  second_recent_other:
    "もう少し教えてください。最近変わった薬があれば、お薬手帳のほかに、記録に残っているものはありますか？",
  second_proxy:
    "あなたの代わりに、お薬の情報や記録の場所を伝えられる人はいますか？名前ではなく、あなたとの関係を教えてください。",
  second_proxy_other:
    "ご家族以外で、お薬の情報や記録の場所を知っている人、または確認できる相談先はありますか？",
  second_recheck: "あとで確認するとしたら、何を見ますか？または、誰に聞けそうですか？",
};

export const REDIRECT_TEXTS: Record<string, string> = {
  first_medicines:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。飲み薬のほか、注射・貼り薬・塗り薬も含めて、毎日、または決まった日に使う薬はありますか？",
  first_location:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。その薬のことは、何を見れば確かめられますか？",
  first_other:
    "いまは、ほかに使っているお薬を確認しています。ほかの病院や歯科でもらう薬、市販の薬、サプリはありますか？",
  first_medicines_more: "いまは、ほかに使っているお薬を確認しています。必要なときだけ使うものも含めて、ほかにありますか？",
  first_unrecorded:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。薬のアレルギーや、薬が合わなかったことはありますか？",
  second_recovery:
    "お話しくださってありがとうございます。いまは薬のことの伝え方を伺っています。ほかに、どうやって伝えられますか？",
  second_handover:
    "お話しくださってありがとうございます。いまは薬のことの伝え方を伺っています。交代したわたしに、どうやって薬のことを伝えますか？",
  second_recent:
    "いまは、薬の変更が記録に反映されているかを確認しています。最近変わった薬があれば、お薬手帳などにも載っていますか？",
  second_recent_other:
    "いまは、お薬手帳以外の記録を確認しています。最近変わった薬があれば、その内容を確認できる記録はありますか？",
  second_proxy:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。薬のことを伝えられる人はいますか？",
  second_proxy_other:
    "いまは、あなたの代わりに情報を伝えられる人や相談先を確認しています。ご家族のほかに、思い当たりますか？",
  second_recheck:
    "いまは、思い出せなかったことをあとで確認する方法を考えています。何を見たり、誰に聞いたりすれば確認できそうですか？",
};

/**
 * 思い出せないという回答の直後に出す固定文（docs/phase2-decisions.md 項目7）。
 * 候補は出さず、確かめた内容の入力も求めない（ADR-0022）
 */
// 決定済み：思い出せない回答の直後に出す固定文（Claude Codeの下書き）
// → オーナー決定（2026-11-04、チャット）：B。その場の固定文は「今ここで、実際のお薬手帳や薬の袋を確認しましょう。確認した内容を答える必要はありません。」（音声で答えることがあるので「書く」を「答える」にした）
export const RECALL_NOW =
  "今ここで、実際のお薬手帳や薬の袋を確認しましょう。確認した内容を答える必要はありません。";

/**
 * Claude の返事を待っている間の表示（ADR-0030）。文の後ろに、流れる点を画面で足す（読み上げでは読まない）。
 * 動きを減らす設定では点は止まり、この文だけで「考え中」を示す（ADR-0020）
 */
// 決定済み：考え中の表示の文言と動き（Claude Code の下書き：光がゆっくり明滅し、文の後ろに点が流れる。ADR-0030）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const WAITING_TEXT = "次の質問を考えています";

/**
 * 受け止めの一言の固定文（ADR-0029 の2・3）。Claude の文が使えなかったときに、
 * 次の固定の質問の前と、前半・後半の最後（③確認・振り返りの冒頭）に出す。内容には触れない
 */
// 決定済み：前半・後半の最後と、固定の進行で次へ進むときに出す受け止めの一言（Claude Code の下書き：「教えてくださってありがとうございます。」）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const ACK_TEXT = "教えてくださってありがとうございます。";

/**
 * 固定の進行で次の質問へ進むときの、短い受け止めの一言（2026-11-05 オーナー「教えてくださってありがとうございます。ばかり出て不愉快」）。
 * 回答の数で順に替え、同じ言い方が続かないようにする。前半・後半の最後は ACK_TEXT のまま。内容には触れない
 */
export const ACK_TEXTS: readonly string[] = [
  "はい、ありがとうございます。",
  "わかりました。",
  "ありがとうございます。",
  "承知しました。",
];

/** n 番目の回答の後の受け止め（0 から） */
export function ackFor(n: number): string {
  return ACK_TEXTS[((n % ACK_TEXTS.length) + ACK_TEXTS.length) % ACK_TEXTS.length];
}

/** 途中で Claude とのやり取りに失敗し、固定の進行に切り替えたときに、1回だけ出す知らせ（ADR-0029 の4） */
// 決定済み：固定の進行に落ちたときの知らせ（Claude Code の下書き：「AIとのやり取りがうまくいかなかったため、ここからは決まった質問で進めます。」）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const FALLBACK_NOTICE =
  "AIとのやり取りがうまくいかなかったため、ここからは決まった質問で進めます。";

// --- ③確認 ----------------------------------------------------------------

export const CONFIRM_PROMPT =
  "いま話してくれた中で、いちばん頼りにしているのはどれですか？";

export const SOURCE_OPTIONS: readonly {
  id: SourceId;
  label: string;
  description: string;
}[] = [
  {
    id: "smartphone",
    label: "スマートフォン",
    description: "スマホに保存した写真・メモ・アプリの記録",
  },
  {
    id: "online",
    label: "アプリ・マイナポータル",
    description: "インターネットにつないで見るもの",
  },
  { id: "notebook", label: "お薬手帳", description: "紙のお薬手帳" },
  { id: "family", label: "家族", description: "薬のことを知っている家族" },
  {
    id: "clinic",
    label: "薬局・病院",
    description: "かかりつけの薬局や病院に聞く",
  },
  { id: "none", label: "どれにも当てはまらない", description: "" },
];

export const SKIP_CONFIRM_LABEL = "わからない・選ばずに進む";

/**
 * 回答欄の案内。質問ごとに、誰のこととして答えるかを示す（ADR-0022 案B）。
 * 実際の服薬情報を入れないよう、答えるたびに目に入る位置にも示す（ADR-0009）
 */
export const ANSWER_HINTS: Record<AnswerAs, string> = {
  // Issue #110：短くした。1問目から外した「薬の名前・何の薬か・量」は fictional に入れた
  self: "あなた自身のことを答えてください。人の名前や電話番号、薬の中身は書かないでください",
  fictional: "分かる範囲で、薬の名前・何の薬か・量も。薬があるか・飲めているかを含め、薬の中身は架空の内容で答えてください",
  both: "記録や伝え方はあなた自身のこと、薬があるか・飲めているかなどの薬の中身は架空の内容で。人の名前や電話番号は書かないでください",
};

/**
 * 薬を知っている人の問いで、回答欄の上に出す連絡の手段の選択肢（Issue #110、2026-11-05 オーナー決定「画面の選択肢で補う」）。
 * 押すと、その文を入力欄の後ろに足すだけ。送るのは利用者が「答える」を押したとき。連絡先そのものは聞かない（ADR-0022）
 */
// 決定済み：連絡の手段の選択肢の文言（Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const CONTACT_CHOICES_LABEL = "連絡の手段（押すと回答に足します）";
export const CONTACT_CHOICES: readonly string[] = [
  "電話で連絡できる",
  "メッセージで連絡できる",
  "同じ避難所にいる",
  "連絡の手段がない",
];
/** 連絡の手段の選択肢を出す質問 */
export const CONTACT_CHOICE_QUESTIONS: ReadonlySet<string> = new Set(["second_proxy", "second_proxy_other"]);

// --- ④出来事 --------------------------------------------------------------

/** 出来事の文と「使えなくなるもの」（docs/PRD.md「出来事で使えなくなるもの」） */
export const EVENTS: Record<
  EventId,
  { text: string; unavailable: string | null }
> = {
  battery: {
    text: "スマートフォンの電池が切れてしまいました。充電もできません。",
    unavailable:
      "スマホ本体。端末内の写真・メモ・アプリ、スマホでの電話や通信のすべて",
  },
  network: {
    text: "通信がつながりません。インターネットも電話も使えない状態です。",
    unavailable:
      "インターネットと電話。マイナポータルなどネット上のサービス、電話・メールでの問い合わせ",
  },
  notebook_home: {
    text: "お薬手帳は自宅にあり、今は取りに戻れません。",
    unavailable: "紙のお薬手帳そのもの",
  },
  family_unreachable: {
    text: "ご家族と連絡がつきません。",
    unavailable: "その家族に聞くこと",
  },
  clinic_unreachable: {
    text: "かかりつけの薬局や病院も被災していて、連絡がつきません。",
    unavailable: "かかりつけ先への問い合わせ",
  },
  handover: {
    text: "受付の係が、ソナからクエに交代しました。クエは、まだあなたのお薬の情報を確認できていません。",
    unavailable: null,
  },
};

/**
 * 3D で、最初の質問の前に言う文（固定文）。2026-11-07 のオーナーの言葉（チャット）のまま。
 * 画面には、はじめにの説明があるので出さない
 */
export const OPENING_SPEECH =
  "これはデモ用の模擬応答です。実際のあなたのお薬情報を入力することはご遠慮ください。それではお薬の避難訓練を開始します。";

/** 3D の振り返りで、出来事に合わせた準備行動を3つ読み上げるときの前置き（固定文。Claude Code の下書き） */
export const EVENT_PREP_INTRO = "今回の出来事を踏まえて、おすすめの準備を3つ挙げます。";
export const ORDINALS: readonly string[] = ["1つ目", "2つ目", "3つ目"];

/**
 * 3D の振り返りの読み上げの最後に言う文（固定文）。「次の準備を1つ決める」へ促す。
 * 2026-11-07 のオーナーの言葉（チャット）：「準備行動を読んで、簡単にできるところから今から取り掛かってみてくださいね」
 */
export const PREP_SPEECH =
  "次の準備を1つ決めましょう。準備行動を読んで、簡単にできるところから、今から取り掛かってみてくださいね。";

/** 3D の振り返りの読み上げの、いちばん最後に言う文（2026-11-07 のオーナーの言葉のまま） */
export const CLOSING_SPEECH = "以上でお薬の避難訓練を終わります。お疲れさまでした。";

/**
 * 3D で出来事を読み上げる文（固定文。画面の表示は EVENTS のまま）。2026-11-07 のオーナーの言葉（チャット）で、
 * 「使えなくなったもの」の一覧を読み上げず、場面を語る文にした。お薬手帳の文はオーナーの言葉
 * （「急いで非難した」は「避難した」の打ち間違いとして直した）。ほかの5つは、それに合わせた Claude Code の下書き
 */
// [TODO-OWNER: 出来事の読み上げの文（お薬手帳はオーナーの言葉、ほかの5つは Claude Code の下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（V3・V6 はオーナーの文）
export const EVENT_SPEECH: Record<EventId, string> = {
  battery:
    "ここで想定外の出来事が起こりました。スマートフォンの電池が切れてしまいました。充電する手段もありません。どうしますか。",
  network:
    "ここで想定外の出来事が起こりました。通信がつながらず、インターネットも電話も使えません。どうしますか。",
  notebook_home:
    "ここで状況が変わります。お薬手帳は自宅にあり、今は手元にありません。安全のため、自宅には戻れない状況です。どうしますか。",
  family_unreachable: "ここで想定外の出来事が起こりました。ご家族と連絡がつきません。どうしますか。",
  clinic_unreachable:
    "ここで想定外の出来事が起こりました。かかりつけの薬局や病院も被災していて、連絡がつきません。どうしますか。",
  handover:
    "ここで受付の係が、ソナからクエに交代します。クエは、まだあなたのお薬の情報を確認できていません。どうしますか。",
};

// --- ⑥結果 ----------------------------------------------------------------

export const VIEWPOINT_LABELS: Record<ViewpointId, string> = {
  location: "情報がどこにあるか",
  alternative: "その情報源が使えないときの代わりの手段",
  current: "今の服用状況と、記録が最新か",
  unrecorded: "記録に載っていない可能性のある情報",
  proxy: "本人が説明できないときに代わりに伝えられる人",
};

export const VIEWPOINT_ORDER: readonly ViewpointId[] = [
  "location",
  "alternative",
  "current",
  "unrecorded",
  "proxy",
];

export const JUDGMENT_LABELS = {
  confirmed: "確認できた",
  aware_unconfirmed: "未確認と気づいた",
  not_mentioned: "確認していない",
  undetermined: "判定できませんでした",
} as const;

export const JUDGMENT_NOTE =
  "「確認できた」は、その点を説明できたという意味です。内容が正しいことや、実際にその薬を飲んでいることを確かめたものではありません。";

export const UNDETERMINED_NOTE =
  "この版はAIによる判定をしていないため、観点ごとの判定は表示できません。あなたの回答をそのまま読み返して、手薄なところを探してみてください。";

/** 途中で Claude とのやり取りに失敗し、固定の進行に切り替えたとき（ADR-0012） */
export const AI_FAILED_NOTE =
  "途中でAIとのやり取りがうまくいかなかったため、観点ごとの判定は表示できません。あなたの回答をそのまま読み返して、手薄なところを探してみてください。";

/**
 * 思い出せなかったことへの案内（ADR-0022）。候補や「〜ではないですか」は出さず、
 * 実物の確認と、訓練を繰り返すことに向ける。確認した内容の入力は求めない
 */
// [TODO-OWNER: 思い出せないときの案内の文面（オーナーの言葉をもとにした下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（R2・R3 はオーナーの文）
export const RECALL_FEEDBACK: readonly string[] = [
  "思い出せなかったことや、はっきりしなかったことはありましたか？",
  "訓練が終わったら、実際のお薬手帳や薬の袋を見て、今使っている薬の情報を確認しましょう。手元にあれば、今確認してもかまいません。確認した内容を、このアプリに入力する必要はありません。",
  "記録や確認方法を準備したら、もう一度試してみましょう。前に答えられなかったことを伝えられるか、確かめてみてください。",
];

/**
 * 中断すると体調を崩しやすい薬についての、振り返りの固定文（Issue #94、ADR-0040 の決定7）。
 * 薬の種類は挙げない（2026-11-05 オーナー決定）。飲む・やめるの助言にしない。名前を言えるようにしておくことだけを勧める
 */
// [TODO-OWNER: 中断で体調を崩しやすい薬についての振り返りの固定文（Claude Code の下書き。出典があれば添える）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（R4 はオーナーの文）
/**
 * 振り返りの一言の近くに出す固定文（Issue #200）。2026-11-07 に別のセッション経由で伝わったオーナーの求め
 * （「最後の結果のところに、ご不明点はかかりつけ薬局等へご確認ください。と書いておこうか」）の文をそのまま使う
 */
export const REVIEW_CONTACT_NOTE = "ご不明点はかかりつけ薬局等へご確認ください。";

// 2026-11-07 オーナーの文（R4）。中断による影響の説明を外し、訓練で準備してほしい行動に絞った（薬の名前の暗記を目標にしない）
export const INTERRUPTION_NOTE =
  "薬の名前や量を思い出せないときに備えて、お薬手帳などで確認し、医療者に伝えられるようにしておきましょう。";

/** 準備行動（docs/PRD.md「体験の流れ」6。オーナー決定 2026-11-02） */
// [TODO-OWNER: 準備行動と観点の対応（並び順に使う。Claude Codeの下書き）]
export const PREP_ACTIONS: readonly {
  id: PrepActionId;
  label: string;
  viewpoints: readonly ViewpointId[];
}[] = [
  {
    id: "notebook_bag",
    label: "最新のお薬手帳の写しを非常持ち出し袋に入れ、薬が変わったら入れ替える",
    viewpoints: ["location", "alternative"],
  },
  {
    id: "photo_and_paper",
    label: "最新のお薬手帳や薬の説明書をスマホで撮り、紙の写しも用意する。薬が変わったら更新する",
    viewpoints: ["alternative", "current"],
  },
  {
    id: "wallet_memo",
    label: "今使っている薬の名前・量と、メモを更新した日を書いて財布に入れる",
    viewpoints: ["alternative", "current", "unrecorded"],
  },
  {
    id: "tell_family",
    label: "家族など頼れる人に、お薬の記録の場所と確認方法を伝えておく",
    viewpoints: ["proxy"],
  },
  {
    id: "pharmacy_contact",
    label: "かかりつけ薬局の連絡先を控える",
    viewpoints: ["alternative"],
  },
  {
    id: "check_portal",
    label: "マイナポータルにログインし、自分の薬の情報がどこまで確認できるか試しておく",
    viewpoints: ["location", "alternative"],
  },
];

export const TIMINGS: readonly { id: TimingId; label: string }[] = [
  { id: "today", label: "今日中" },
  { id: "this_week", label: "今週中" },
  { id: "next_day_off", label: "次の休み" },
];

/**
 * 振り返りの先頭に出す「まだ弱いところ → 次の一手」（ADR-0054。下のマーカーの行の ADR-0051 は番号を振り直す前の呼び名で、同じ ADR を指す）。
 * すべて固定文で、規則（rules.ts の nextSteps）で選ぶ。Claude は使わない。
 * 利用者の回答を引かず、薬の名前・量・病名にも触れない。準備行動の名前は PREP_ACTIONS のまま使う
 */
// [TODO-OWNER: 「まだ弱いところ」の観点ごとの短い名前と、判定ごとの一言、準備行動が何を強くするかの一言（Claude Code の下書き。ADR-0051。1文40字以内）]
// → オーナー決定（2026-11-07、チャット、Issue #163）：「以下を修正し、書いていない番号は「下書きのまま」で進めてください」（W1〜W3・W10〜W18・W20・W22・W24 はオーナーの文。40字を超える文もオーナーの文のまま）
export const NEXT_STEPS_HEADING = "これから確認したいことと、できる準備";
export const NEXT_STEPS_LEAD = "今回の回答では確認できなかったことがあります。次にできる準備を選んでみましょう。";
export const STRONG_POINTS_LABEL = "伝えられたこと";
export const NO_WEAK_POINTS_NOTE =
  "今回の回答では、5つの観点すべてで確認方法を説明できました。実際にその方法が使えるか、訓練のあとで確かめましょう。";
export const NEXT_STEP_LABEL = "次の一手";
/** 弱い観点が2つ以上のとき、最初の1枚に付ける印。2枚目からは短い行にする */
export const NEXT_STEP_FIRST_TAG = "まず、ここから";
export const NEXT_STEP_PICK = "これを準備する";
export const NEXT_STEP_PICKED = "選びました";
export const DETAILS_SUMMARY = "くわしく見る（出来事、5つの観点、あなたの回答、記録の形）";

/** 観点の短い名前（先頭のまとめと、終わりの画面で使う。一覧の正式な名前は VIEWPOINT_LABELS） */
export const VIEWPOINT_SHORT_LABELS: Record<ViewpointId, string> = {
  location: "お薬の情報を確認できるもの",
  alternative: "代わりの手段",
  current: "今使っている薬と記録の一致",
  unrecorded: "記録に載っていないこと",
  proxy: "代わりに伝える人",
};

/** 観点ごとの、弱いときに何を確かめるかの一言。判定が「確認していない」と「未確認と気づいた」で言い方を変える */
export const WEAK_POINT_LINES: Record<
  ViewpointId,
  { not_mentioned: string; aware_unconfirmed: string }
> = {
  // 2026-11-07 オーナーの文（W10〜W18）。回答されていない内容を「できていない」と断定しない言い方にした
  location: {
    not_mentioned: "自分の薬の情報が今どこにあるか、まず確かめましょう。",
    aware_unconfirmed: "お薬の情報を何で確認できるか、訓練のあとで確かめましょう。",
  },
  alternative: {
    not_mentioned: "いつもの確認方法が使えないときに備えて、別の方法を1つ考えましょう。",
    aware_unconfirmed: "別の確認方法が実際に使えるか、試しておきましょう。",
  },
  current: {
    not_mentioned: "今使っている薬と、お薬手帳などの記録が合っているか確かめましょう。",
    aware_unconfirmed: "薬の変更が記録に反映されているか確かめ、違いがあれば薬剤師に相談しましょう。",
  },
  unrecorded: {
    not_mentioned: "アレルギーや薬で具合が悪くなった経験など、記録に載っていないことがないか確認しましょう。",
    aware_unconfirmed: "記録に載っているか確かめ、伝えておきたいことがあればメモに残しましょう。",
  },
  proxy: {
    not_mentioned: "自分が説明できないときに備えて、頼れる人に記録の場所を共有できるか考えましょう。",
    aware_unconfirmed: "頼れる人に、お薬の情報や記録の場所を伝えられるか確認してみましょう。",
  },
};

/**
 * 係の交代（出来事 handover）のときの「代わりの手段」の観点の見せ方。交代は情報源が使えなくなる出来事ではないので、
 * 判定は「交代した係にも伝え直せたか」で付ける（ADR-0064）。そのまま「代わりの手段：確認できた」と出すと、
 * いつもの方法が使えないときの代わりの手段まで確かめたように読めるので、名前と一言を替える
 * （2026-11-07 オーナー、チャット：「係の交代では、振り返りも「交代した相手への伝え直し」に合わせてください」）。
 */
// [TODO-OWNER: 係の交代のときの観点の名前（一覧の名前）と、弱いときの一言2つ（Claude Code の下書き。短い名前「交代した相手への伝え直し」はオーナーの言葉）]
export const HANDOVER_ALTERNATIVE = {
  label: "交代した相手に、お薬の情報を伝え直せるか",
  shortLabel: "交代した相手への伝え直し",
  weak: {
    not_mentioned: "係が交代したときに、もう一度伝える方法を考えましょう。",
    aware_unconfirmed: "交代した相手にも、同じ記録を見せられるか確かめましょう。",
  },
} as const;

const isHandoverAlternative = (v: ViewpointId, event: EventId | null) =>
  v === "alternative" && event === "handover";

/** 一覧に出す観点の名前（係の交代のときだけ「代わりの手段」を替える） */
export function viewpointLabel(v: ViewpointId, event: EventId | null): string {
  return isHandoverAlternative(v, event) ? HANDOVER_ALTERNATIVE.label : VIEWPOINT_LABELS[v];
}

/** 観点の短い名前（係の交代のときだけ「代わりの手段」を替える） */
export function viewpointShortLabel(v: ViewpointId, event: EventId | null): string {
  return isHandoverAlternative(v, event) ? HANDOVER_ALTERNATIVE.shortLabel : VIEWPOINT_SHORT_LABELS[v];
}

/** 弱いときの一言（係の交代のときだけ「代わりの手段」を替える） */
export function weakPointLine(
  v: ViewpointId,
  judgment: "not_mentioned" | "aware_unconfirmed",
  event: EventId | null,
): string {
  return isHandoverAlternative(v, event) ? HANDOVER_ALTERNATIVE.weak[judgment] : WEAK_POINT_LINES[v][judgment];
}

/** 準備行動が何を強くするかの一言（カードと終わりの画面に出す） */
export const PREP_ACTION_EFFECTS: Record<PrepActionId, string> = {
  notebook_bag: "持ち出せば、避難先でそのまま見せられます。",
  photo_and_paper: "スマホと紙の両方に用意しておくと、どちらかが使えないときの確認方法になります。",
  wallet_memo: "財布なら持ち出しやすく、記録に無いものも書き足せます。",
  tell_family: "記録の場所を共有しておくと、本人が説明できないときに、頼んだ人から伝えてもらう準備になります。",
  pharmacy_contact: "連絡がつけば、薬局の記録で確かめてもらえます。",
  // 2026-11-07 オーナーの文（W24）。「過去の薬」と「最近の薬」は取得元と表示期間が違う（マイナポータルの FAQ）
  check_portal: "マイナポータルも確認方法の1つです。表示される情報の範囲や時期は、情報の種類によって異なります。",
};

export const DONE_NOTE =
  "この内容は保存されません。忘れないように、メモや予定表に書いておきましょう。ときどきこの訓練を繰り返して、復習しておきましょう。";

/**
 * 終わりの画面の「メモに写す」（ADR-0054 の追記10。下のマーカーの行の ADR-0051 は同じ ADR）。決めた準備・いつ・まだ弱いところの固定文だけを、
 * 利用者の端末のクリップボード（または共有）に渡す。回答の原文は入れない。アプリは保存しない
 */
// 決定済み：「メモに写す」の文言と、写す内容の形（Claude Code の下書き。ADR-0051 追記10）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const DONE_MEMO_TITLE = "お薬の避難訓練の、次の準備";
// 2026-11-07 のオーナーの言葉（チャット）「メモに移すって、コピーってこと？…コピーするというボタンがよいのでは？」で、ボタンの文を「コピーする」にした
export const DONE_MEMO_COPY = "コピーする";
export const DONE_MEMO_COPIED = "コピーしました。メモや予定表に貼り付けてください。";
export const DONE_MEMO_FAILED = "コピーできませんでした。下の文を選んでコピーしてください。";
export const DONE_MEMO_SHARE = "共有する";

// --- 中断 -----------------------------------------------------------------

export const STOP_LABEL = "訓練をやめる";

/** 中断の案内（ADR-0011 オーナー決定 2026-11-02） */
export const STOP_MESSAGE: readonly string[] = [
  "訓練を中断しました。",
  "このアプリは訓練用であり、症状の緊急性や治療について判断できません。",
  "現在、急な体調の異変があり、命に関わるおそれがある場合は119番に連絡してください。",
  "救急車を呼ぶか迷う場合は、#7119で相談できる地域があります。利用できない地域では、地域の救急相談窓口をご確認ください。",
];

export const STOP_SOURCE = {
  label: "総務省消防庁「救急安心センター事業（♯7119）」",
  url: "https://www.fdma.go.jp/mission/enrichment/appropriate/appropriate007.html",
  checkedOn: "2026-11-02",
} as const;

/** 自傷のほのめかしで中断したときの案内（ADR-0011 の下書き） */
// 決定済み：自傷に関する入力の案内文面（ADR-0011 の下書きをそのまま使っている）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「このまま採る（推奨）」（自傷の案内の文面）
export const SELF_HARM_MESSAGE: readonly string[] = [
  "訓練を中断しました。",
  "このアプリは訓練用で、相談をお受けすることはできません。",
  "いま自分を傷つけてしまいそうなときは、119番に連絡するか、身近な人に助けを求めてください。",
  "話を聞いてもらえる相談窓口が、厚生労働省「まもろうよ こころ」に載っています。",
];

export const SELF_HARM_SOURCE = {
  label: "厚生労働省「まもろうよ こころ」",
  url: "https://www.mhlw.go.jp/mamorouyokokoro/",
  checkedOn: "2026-11-02",
} as const;

// --- ⑥振り返りの並びと絵（Issue #49 の④⑥、A-05） ----------------------------

/** 振り返りで、出来事と、出来事の直後の立て直しの問いへの回答（原文）をまとめて示す区切り */
// 決定済み：振り返りの「出来事と立て直し」の見出しと、立て直しの回答の見出し（Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const REVIEW_EVENT_HEADING = "出来事と立て直しの回答";
export const REVIEW_RECOVERY_LABEL = "出来事の後の、あなたの回答（入力したまま）";

// --- ⑥振り返りの公的資料（A-06、ADR-0044） -----------------------------------

export type PublicSourceId =
  | "gov_online_prep"
  | "mhlw_after_service_10_disaster"
  | "mhlw_after_service_10_photo"
  | "fdma_ecollege_pack"
  | "myna_faq_medicine"
  | "myna_faq_medicine_kinds"
  | "myna_news_medicine";

/**
 * 準備行動に関係する公的資料（docs/references.md「振り返りの公的資料」）。
 * 画面に出すのは verified が true のものだけ（rules.ts の verifiedSourcesFor）。
 * verified を true にしてよいのは、オーナーが本文と該当箇所を確かめ、docs/references.md を「確認済み」にしたときだけ。
 * section は資料の見出しをそのまま写したもので、説明文ではない。資料の説明を Claude に作らせない。
 */
// 決定済み：振り返りの公的資料を確認済みにするか（Claude Code が本文を確かめた候補。docs/references.md）。確かめたものは verified を true に、checkedOn をオーナーの確認日にする
// → オーナー決定（2026-11-05、チャット）：1（政府広報オンライン）・3（消防庁 eカレッジ）・4（マイナポータル FAQ No.4901）を確認済みにする。2・5 は選ばなかった。
export const PUBLIC_SOURCES: Readonly<
  Record<
    PublicSourceId,
    {
      publisher: string;
      title: string;
      section: string;
      url: string;
      checkedOn: string;
      verified: boolean;
    }
  >
> = {
  gov_online_prep: {
    publisher: "政府広報オンライン",
    title: "【防災特集】ACTION01 災害に事前に備える",
    section: "常用薬・お薬手帳の備え",
    url: "https://www.gov-online.go.jp/tokusyu/bousai/preparation.html",
    checkedOn: "2026-11-05",
    verified: true,
  },
  // 同じ報告書の、準備行動ごとに根拠になる子見出しを分けて持つ
  mhlw_after_service_10_disaster: {
    publisher: "厚生労働省",
    title: "アフターサービス推進室活動報告書（Vol.10:2012年12月）",
    section: "６-１-１．東日本大震災時における活用例",
    url: "https://www.mhlw.go.jp/iken/after-service-vol10.html",
    checkedOn: "2026-11-05",
    verified: false,
  },
  mhlw_after_service_10_photo: {
    publisher: "厚生労働省",
    title: "アフターサービス推進室活動報告書（Vol.10:2012年12月）",
    section: "６-２．紙のお薬手帳を携帯電話で撮影して保存する活用事例",
    url: "https://www.mhlw.go.jp/iken/after-service-vol10.html",
    checkedOn: "2026-11-05",
    verified: false,
  },
  fdma_ecollege_pack: {
    publisher: "総務省消防庁 防災・危機管理eカレッジ",
    title: "4.非常持出品の準備",
    section: "4.非常持出品の準備",
    url: "https://www.fdma.go.jp/relocation/e-college/cat65/cat63/cat31/4-7.html",
    checkedOn: "2026-11-05",
    verified: true,
  },
  myna_faq_medicine: {
    publisher: "デジタル庁（マイナポータル よくあるご質問）",
    title: "過去の薬（薬剤情報）ではどのような情報が閲覧できますか。",
    section: "No : 4901",
    url: "https://faq.myna.go.jp/faq/show/4901?category_id=18&site_domain=default",
    checkedOn: "2026-11-05",
    verified: true,
  },
  // S6：オーナーが追加を指定した FAQ（2026-11-07、チャット、Issue #163）。Claude Code が 2026-11-07 にページの題と番号を確かめた
  myna_faq_medicine_kinds: {
    publisher: "デジタル庁（マイナポータル よくあるご質問）",
    title:
      "過去の薬（薬剤情報）、処方せん（処方情報）、最近の薬（調剤情報）で閲覧できる情報の違いについて教えてください。",
    section: "No : 6598",
    url: "https://faq.myna.go.jp/faq/show/6598?site_domain=default",
    checkedOn: "2026-11-07",
    verified: true,
  },
  myna_news_medicine: {
    publisher: "デジタル庁（マイナポータル お知らせ）",
    title: "薬の画面で最近の薬や処方せんの情報を確認できるようになりました",
    section: "2026年5月26日のお知らせ",
    url: "https://services.digital.go.jp/mynaportal/news/4894d0efa80e90b66c58e/",
    checkedOn: "2026-11-05",
    verified: false,
  },
};

/** 準備行動と公的資料の対応（Claude Code の下書き。資料が見つからなかった準備行動は空で、リンクなしで出す） */
// [TODO-OWNER: 準備行動と公的資料の対応（Claude Code の下書き。docs/references.md）]
export const PREP_SOURCES: Readonly<Record<PrepActionId, readonly PublicSourceId[]>> = {
  // S1・S2：URL と該当箇所を確かめるまで出さない（2026-11-07 オーナーの答え「確認するまで出さない」）。
  // もとの候補は notebook_bag が gov_online_prep・mhlw_after_service_10_disaster、
  // photo_and_paper が mhlw_after_service_10_photo・fdma_ecollege_pack
  notebook_bag: [],
  photo_and_paper: [],
  wallet_memo: [],
  tell_family: [],
  pharmacy_contact: [],
  check_portal: ["myna_faq_medicine", "myna_faq_medicine_kinds", "myna_news_medicine"],
};

// 決定済み：振り返りの公的資料の見出しと注記（Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const REVIEW_SOURCES_HEADING = "準備に役立つ公的資料";
export const REVIEW_SOURCES_NOTE =
  "リンクは別のタブで開きます。内容は、それぞれの発行元のページでご確認ください。";

// --- BGM（B-03、ADR-0039） ---------------------------------------------------

// 決定済み：BGM の操作の文字と説明（Claude Code の下書き）
// → オーナー決定（2026-11-05、チャット）：「このまま採用」（BGM の操作の文字と説明、音の雰囲気）
export const BGM_LABELS = {
  /** ヘッダーの開閉ボタン。後ろに今の状態（オン・オフ）を続ける */
  name: "BGM",
  on: "オン",
  off: "オフ",
  /** 開いた欄の、鳴らす・止めるボタン */
  toggle: "BGM を鳴らす",
  volume: "BGM の音量",
  close: "閉じる",
  unavailable: "この端末では BGM を使えません。訓練はそのまま続けられます。",
  note: "読み上げの間は小さくなります。訓練をやめると止まります。",
} as const;

// 2026-11-05 オーナー決定（ヘッダーで1回で消音できる形・動きを減らす設定では鳴らさない・終わりの画面で止める）で足した文字
// 決定済み：BGM の音量の欄を開くボタンの文字と、鳴らせないときの説明（Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
export const BGM_EXTRA_LABELS = {
  /** ヘッダーの、音量の欄を開くボタン（BGM のオン・オフのボタンの隣） */
  volumeOpener: "音量",
  /** 動きを減らす設定のとき。オン・オフのボタンは押せない */
  reducedMotion: "動きを減らす設定のため、BGM は鳴らしません。",
  /** 終わりの画面。オン・オフのボタンは押せない */
  ended: "訓練が終わったので、BGM を止めました。",
} as const;

// --- 出来事のあとの情報源（B-02、Issue #55） ------------------------------------

/**
 * 後半（それでも伝えられる？）で、係の横に出す情報源の並びの文（SourceShift.tsx）。
 * 何が使えなくなったかは PRD「出来事で使えなくなるもの」の表だけで決め、利用者の回答も Claude の判断も使わない
 */
// 決定済み：出来事のあとの情報源の並びの文面（B-02 の下書き。点数や正解に見えないか、後半の答えの手がかりになりすぎないか）
// → オーナー決定（2026-11-05、チャット）：「このまま採用」（出来事のあとの情報源の並びの文面）
export const SHIFT_CAPTION = "出来事のあとの情報源";
export const SHIFT_LOST_PREFIX = "使えない：";
export const SHIFT_NONE_LOST = "使えなくなった情報源はありません";
export const SHIFT_LOST_STATE = "使えない";
export const SHIFT_KEPT_STATE = "この出来事では使えなくなっていない";
export const SHIFT_CHOSEN_STATE = "頼りにしていた";
