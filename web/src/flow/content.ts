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
export const INTRO_LEAD =
  "このアプリは災害時の服薬情報の伝え方を練習するものです。入力した内容は会話を進めるためにAIサービス（Anthropic）へ送信されます。氏名、住所、電話番号や、実際の服薬情報（薬の名前・量・病名など）は入力せず、薬の中身は架空の内容で答えてください。薬の正確性や治療の適否は判定しません。";

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
  "このアプリは災害時の服薬情報の伝え方を練習するものです。この試作版はAIとつないでおらず、入力した内容はどこにも送信しません。この画面の中だけで扱います。氏名、住所、電話番号や、実際の服薬情報（薬の名前・量・病名など）は入力せず、薬の中身は架空の内容で答えてください。薬の正確性や治療の適否は判定しません。";

export const INTRO_POINTS: readonly string[] = [
  "発災翌日の避難所の救護所という、架空の場面です。",
  "氏名・住所・電話番号や、あなたやほかの人の実際の服薬情報は入力しないでください。",
  "実際の聞き取りと同じように、薬の名前や量も聞きます。薬があるか、薬の中身、飲めているかは、架空の内容で答えてください（例：「Aという薬を朝に1錠」）。",
  "どこに記録があるか、ほかにどう伝えるか、薬のことを知っている人は、あなた自身のことを振り返って答えてください。名前や電話番号は書かないでください。",
  "答えは入力したまま表示するだけです。薬の正確さや治療の適否は判定しません。点数や合否もありません。",
  "体調の相談の窓口ではありません。体調に異変があるときは、すぐに「訓練をやめる」を押してください。体調の訴えらしい入力では訓練を自動で中断しますが、すべての訴えを見分けられるわけではありません。",
];

/** 自アプリの方針と外部事業者の方針は分けて書く（.claude/rules/privacy.md） */
export const PRIVACY_OWN =
  "このアプリ：会話を保存しません。声や読み上げの音声も保存しません。ログにも残しません。タブを閉じると消えます。";
// [TODO-OWNER: 外部事業者の保持方針の書き方（ADR-0006の要約。AI連携の実装時に再確認）]
export const PRIVACY_EXTERNAL =
  "外部事業者：会話を進めるため、あなたの回答と、画面に出した質問の文（AIが作った言い回しを含む）、出来事などのアプリの文を Anthropic（Claude API）へ送ります。AIが作った文は、画面に出す前に、もう一度 Anthropic へ送って確かめます（このときは、AIが作った文と固定の質問の文だけを送り、あなたの回答は送りません）。Anthropic は、入出力を30日以内に削除すると公表しています。利用規約違反の判定時などの例外があります。このアプリは、入出力を保持しない契約（ゼロ保持）を結んでいません。";

/**
 * 3D の対話モードの声の送信先（ADR-0033、A-08）。2D（文字で答える）では送らない。
 * 保持方針は 2026-11-04 に一次資料で確かめた（README「外部事業者に送るもの」）。確かめられないものは確かめられないと書く
 */
// [TODO-OWNER: 音声の送信先と保持方針の書き方（Claude Code の下書き。ADR-0033 の要約）]
export const PRIVACY_VOICE =
  "3Dで話すモードを選んだとき：声で答えると、あなたの声は、文字にするためにブラウザが使う音声認識のサービスへ送られます（ブラウザによって送り先が違います。Microsoft Edge は Microsoft、Safari は Apple です。Google Chrome は Google と見られますが、送り先と保持方針は確かめられていません）。Microsoft は録音を保存しないと、Apple は音声入力の改善に同意していなければ音声を保存しないと公表しています。また、聞き取り係の文を読み上げるため、画面に出した聞き取り係の文と固定の文を ElevenLabs へ送ります（あなたの回答や声は送りません）。ElevenLabs は、読み上げた文と音声を既定で履歴に残し、AIの学習に使うことがあると公表しています。文字で答える2Dのモードでは、どちらにも送りません。";

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
    label: "2D：文字で答える",
    description: "聞き取り係の2Dの姿を見ながら、文字で答えます。声は使いません。",
    result: "文字で答える",
  },
  {
    id: "3d",
    label: "3D：声で答えて読み上げを聞く",
    description:
      "3Dのパペットと会話します。「話す」を押している間だけ声を聞き取り、聞き取り係の文を読み上げます。文字でも答えられます。",
    result: "声で答えて読み上げを聞く",
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

/** 救護所の入口で、診察の前に普段の薬を聞き取る場面（東京都 災害時薬事活動ガイドライン 第3章 p.50。README「参考にした公式資料」） */
export const SCENE_INTRO =
  "発災の翌日。避難所の救護所に来ました。入口では、診察の前に、普段飲んでいる薬を確認しています。聞き取り係が、あなたに声をかけます。";

// [TODO-OWNER: 固定の質問文（Claude Codeの下書き。前半3問、立て直しの問い、係の交代のときの問い、後半の残りの問い）]

// 質問の流れは公的な手引きの聞き取りの順番に合わせた（README「参考にした公式資料」）：
// 普段の薬があるか・中身 → 何で確かめられるか → ほかの医療機関の薬・市販薬・アレルギー・副作用
// → （出来事）→ 代わりの手段 → 最近の変化・飲めているか → 薬を知っている人・管理している人。
// 薬の名前・量・病名は聞いてよいが、答えは判定も記録もしない（ADR-0021）。

// [TODO-OWNER: Issue #41 で足した固定の質問（Claude Code の下書き）：前半の4問目（記録に載っていないこと）と後半の4問目（思い出せなかったこと）の文面、観点、誰のこととして答えるか。あわせて、増えた4回の枠の分け方（半分ごとに、固定の質問を1問足し、残りの1回を聞き返しの余裕にする）]

/**
 * 前半（②問い）の固定の4問。回答は最大5回（ADR-0019）で、残りの1回は聞き返しの余裕。
 * 聞き返しが2回入ると、最後の問いは聞かずに③確認へ進む
 */
export const FIRST_HALF_QUESTIONS: readonly Question[] = [
  {
    id: "first_medicines",
    viewpoint: "current",
    answerAs: "fictional",
    text: "こんにちは。ここでは、普段飲んでいる薬を確認しています。毎日、または決まって飲んでいる薬はありますか？分かる範囲で、薬の名前や何の薬か、飲む量を教えてください。",
  },
  {
    id: "first_location",
    viewpoint: "location",
    answerAs: "self",
    text: "その薬のことは、何を見れば確かめられますか？たとえば、お薬手帳、スマホのお薬手帳アプリ、薬の袋や説明書、薬そのものなどです。",
  },
  {
    id: "first_other",
    viewpoint: "unrecorded",
    answerAs: "fictional",
    text: "ほかの病院や診療所でもらっている薬や、市販の薬・サプリはありますか？薬で具合が悪くなったことや、アレルギーはありますか？",
  },
  {
    // Issue #41 で足した問い。記録に載っていない可能性のある情報を、もう一歩聞く。
    // 例に体調の言葉（「具合の悪いとき」など）を使わない。利用者が言い返すと、体調の訴えの照合で中断するため
    id: "first_unrecorded",
    viewpoint: "unrecorded",
    answerAs: "fictional",
    text: "お薬手帳や薬の袋に書かれていないことで、薬について伝えておきたいことはありますか？たとえば、最近やめた薬や、ときどきだけ飲む薬などです。",
  },
];

/** 後半の最初の問い（立て直し）。必ず1回出す */
export const RECOVERY_QUESTION: Question = {
  id: "second_recovery",
  viewpoint: "alternative",
  answerAs: "self",
  text: "では、ほかにどうやって伝えられますか？",
};

/** 係の交代のときの後半の最初の問い */
export const HANDOVER_QUESTION: Question = {
  id: "second_handover",
  viewpoint: "alternative",
  answerAs: "both",
  text: "係が代わりました。新しい係にも、普段の薬のことを伝えてください。さっき話したもののほかに、薬のことが分かるものはありますか？",
};

/** 後半の2問目（最近の変化と、今飲めているか） */
export const RECENT_QUESTION: Question = {
  id: "second_recent",
  viewpoint: "current",
  answerAs: "both",
  text: "ここ数日、いつもどおり薬を飲めていますか？最近変わった薬があれば、それはいつも見ている記録にも載っていますか？",
};

/**
 * 後半の3問目（薬を知っている人）。連絡先そのもの（電話番号など）は尋ねず、
 * 連絡をとる手段の種類だけを聞く（ADR-0022。入力は Claude連携の後に送られるため）
 */
export const PROXY_QUESTION: Question = {
  id: "second_proxy",
  viewpoint: "proxy",
  answerAs: "self",
  text: "あなたのほかに、薬のことを知っている人や、管理を手伝っている人はいますか？続柄で教えてください。その人は、あなたの薬のことをどのくらい知っていますか（例：「お薬手帳の置き場所を知っている」）。どんな手段（電話、メッセージなど）で連絡をとれますか？電話番号や薬の名前は書かなくて大丈夫です。",
};

/** 「家族と連絡がつかない」の出来事の後は、家族のほかの人を聞く */
export const PROXY_QUESTION_AFTER_FAMILY: Question = {
  id: "second_proxy_other",
  viewpoint: "proxy",
  answerAs: "self",
  text: "ご家族のほかに、薬のことを知っている人はいますか？続柄などで教えてください。その人は、あなたの薬のことをどのくらい知っていますか（例：「かかりつけの薬局を知っている」）。どんな手段（電話、メッセージなど）で連絡をとれますか？電話番号や薬の名前は書かなくて大丈夫です。",
};

/**
 * 後半の4問目（Issue #41 で足した問い）。思い出せなかったことと、あとで何で確かめられるかを聞く。
 * 候補は出さず、確かめた内容の入力も求めない（ADR-0022）。回答は最大5回で、残りの1回は聞き返しの余裕
 */
export const RECHECK_QUESTION: Question = {
  id: "second_recheck",
  viewpoint: "location",
  answerAs: "self",
  text: "ここまでで、思い出せなかったことや、はっきりしなかったことはありますか？あれば、あとで何を見れば確かめられそうかも教えてください。",
};

/** すべての固定の質問。/api/turn で受け付ける質問IDはこの中のものだけ */
export const ALL_QUESTIONS: readonly Question[] = [
  ...FIRST_HALF_QUESTIONS,
  RECOVERY_QUESTION,
  HANDOVER_QUESTION,
  RECENT_QUESTION,
  PROXY_QUESTION,
  PROXY_QUESTION_AFTER_FAMILY,
  RECHECK_QUESTION,
];

/**
 * Claude の文が使えないとき（検査に通らない、失敗した）に出す、聞き返しと質問し直しの固定文（ADR-0025）。
 * 聞き返しは曖昧な回答に、質問し直しは関係のない話に使う。受け止めは内容を繰り返さない一言にする
 */
// [TODO-OWNER: 聞き返しと質問し直しの固定文（Claude Codeの下書き）]
export const CLARIFY_TEXTS: Record<string, string> = {
  first_medicines:
    "もう少し教えてください。毎日、または決まって飲んでいる薬はありますか？薬の中身は架空の内容で答えてください。",
  first_location:
    "もう少し教えてください。その薬のことは、何を見れば確かめられますか？",
  first_other:
    "もう少し教えてください。ほかでもらっている薬や市販の薬、アレルギーはありますか？",
  first_unrecorded:
    "もう少し教えてください。お薬手帳や薬の袋に書かれていないことで、伝えておきたいことはありますか？",
  second_recovery: "もう少し教えてください。ほかに、どうやって伝えられますか？",
  second_handover:
    "もう少し教えてください。新しい係に、どうやって薬のことを伝えますか？",
  second_recent:
    "もう少し教えてください。いつもどおり飲めていますか？最近変わった薬は、記録に載っていますか？",
  second_proxy:
    "もう少し教えてください。あなたの薬のことを知っている人はいますか？続柄で教えてください。",
  second_proxy_other:
    "もう少し教えてください。ご家族のほかに、薬のことを知っている人はいますか？",
  second_recheck:
    "もう少し教えてください。思い出せなかったことがあれば、あとで何を見れば確かめられそうですか？",
};

export const REDIRECT_TEXTS: Record<string, string> = {
  first_medicines:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。毎日、または決まって飲んでいる薬はありますか？",
  first_location:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。その薬のことは、何を見れば確かめられますか？",
  first_other:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。ほかでもらっている薬や市販の薬、アレルギーはありますか？",
  first_unrecorded:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。お薬手帳や薬の袋に書かれていないことで、伝えておきたいことはありますか？",
  second_recovery:
    "お話しくださってありがとうございます。いまは薬のことの伝え方を伺っています。ほかに、どうやって伝えられますか？",
  second_handover:
    "お話しくださってありがとうございます。いまは薬のことの伝え方を伺っています。新しい係に、どうやって薬のことを伝えますか？",
  second_recent:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。いつもどおり飲めていますか？",
  second_proxy:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。あなたの薬のことを知っている人はいますか？",
  second_proxy_other:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。ご家族のほかに、薬のことを知っている人はいますか？",
  second_recheck:
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。ここまでで、思い出せなかったことはありますか？あれば、あとで何を見れば確かめられそうですか？",
};

/**
 * 思い出せないという回答の直後に出す固定文（docs/phase2-decisions.md 項目7）。
 * 候補は出さず、確かめた内容の入力も求めない（ADR-0022）
 */
// [TODO-OWNER: 思い出せない回答の直後に出す固定文（Claude Codeの下書き）]
// → オーナー決定（2026-11-04、チャット）：B。その場の固定文は「今ここで、実際のお薬手帳や薬の袋を確認しましょう。確認した内容を答える必要はありません。」（音声で答えることがあるので「書く」を「答える」にした）
export const RECALL_NOW =
  "今ここで、実際のお薬手帳や薬の袋を確認しましょう。確認した内容を答える必要はありません。";

/**
 * Claude の返事を待っている間の表示（ADR-0030）。文の後ろに、流れる点を画面で足す（読み上げでは読まない）。
 * 動きを減らす設定では点は止まり、この文だけで「考え中」を示す（ADR-0020）
 */
// [TODO-OWNER: 考え中の表示の文言と動き（Claude Code の下書き：光がゆっくり明滅し、文の後ろに点が流れる。ADR-0030）]
export const WAITING_TEXT = "次の質問を考えています";

/**
 * 受け止めの一言の固定文（ADR-0029 の2・3）。Claude の文が使えなかったときに、
 * 次の固定の質問の前と、前半・後半の最後（③確認・振り返りの冒頭）に出す。内容には触れない
 */
// [TODO-OWNER: 前半・後半の最後と、固定の進行で次へ進むときに出す受け止めの一言（Claude Code の下書き：「教えてくださってありがとうございます。」）]
export const ACK_TEXT = "教えてくださってありがとうございます。";

/** 途中で Claude とのやり取りに失敗し、固定の進行に切り替えたときに、1回だけ出す知らせ（ADR-0029 の4） */
// [TODO-OWNER: 固定の進行に落ちたときの知らせ（Claude Code の下書き：「AIとのやり取りがうまくいかなかったため、ここからは決まった質問で進めます。」）]
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
  self: "あなた自身のことを振り返って答えてください（人の名前や電話番号、薬の名前などの薬の中身は書かないでください）",
  fictional: "薬があるか、薬の名前・量、飲めているかなどの薬の中身は、架空の内容で答えてください",
  both: "伝え方や記録のことはあなた自身のこと、薬があるか・薬の中身・飲めているかは架空の内容で答えてください（人の名前や電話番号は書かないでください）",
};

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
    text: "係の人が交代しました。新しい係の人は、まだあなたの話を聞いていません。",
    unavailable: null,
  },
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
  "この試作版はAIによる判定をしていないため、観点ごとの判定は表示できません。あなたの回答をそのまま読み返して、手薄なところを探してみてください。";

/** 途中で Claude とのやり取りに失敗し、固定の進行に切り替えたとき（ADR-0012） */
export const AI_FAILED_NOTE =
  "途中でAIとのやり取りがうまくいかなかったため、観点ごとの判定は表示できません。あなたの回答をそのまま読み返して、手薄なところを探してみてください。";

/**
 * 思い出せなかったことへの案内（ADR-0022）。候補や「〜ではないですか」は出さず、
 * 実物の確認と、訓練を繰り返すことに向ける。確認した内容の入力は求めない
 */
// [TODO-OWNER: 思い出せないときの案内の文面（オーナーの言葉をもとにした下書き）]
export const RECALL_FEEDBACK: readonly string[] = [
  "思い出せなかったことや、はっきりしなかったことはありましたか？",
  "今ここで、実際のお薬手帳や薬の袋を確認しましょう。確認した内容を、ここに書く必要はありません。",
  "今回のように、定期的にお薬の避難訓練をやって復習しておくとよいですね。",
];

/** 準備行動（docs/PRD.md「体験の流れ」6。オーナー決定 2026-11-02） */
// [TODO-OWNER: 準備行動と観点の対応（並び順に使う。Claude Codeの下書き）]
export const PREP_ACTIONS: readonly {
  id: PrepActionId;
  label: string;
  viewpoints: readonly ViewpointId[];
}[] = [
  {
    id: "notebook_bag",
    label: "お薬手帳（または写し）を非常持ち出し袋に入れる",
    viewpoints: ["location", "alternative"],
  },
  {
    id: "photo_and_paper",
    label: "お薬手帳のページや薬の説明書をスマホで撮り、紙にも控える",
    viewpoints: ["alternative", "current"],
  },
  {
    id: "wallet_memo",
    label: "飲んでいる薬のメモを財布に入れる",
    viewpoints: ["alternative", "current", "unrecorded"],
  },
  {
    id: "tell_family",
    label: "家族に、自分の薬の情報がどこにあるかを伝えておく",
    viewpoints: ["proxy"],
  },
  {
    id: "pharmacy_contact",
    label: "かかりつけ薬局の連絡先を控える",
    viewpoints: ["alternative"],
  },
  {
    id: "check_portal",
    label: "マイナポータル等で自分の薬の情報が見られるか確かめておく",
    viewpoints: ["location", "alternative"],
  },
];

export const TIMINGS: readonly { id: TimingId; label: string }[] = [
  { id: "today", label: "今日中" },
  { id: "this_week", label: "今週中" },
  { id: "next_day_off", label: "次の休み" },
];

export const DONE_NOTE =
  "この内容は保存されません。忘れないように、メモや予定表に書いておきましょう。ときどきこの訓練を繰り返して、復習しておきましょう。";

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
// [TODO-OWNER: 自傷に関する入力の案内文面（ADR-0011 の下書きをそのまま使っている）]
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
// [TODO-OWNER: 振り返りの「出来事と立て直し」の見出しと、立て直しの回答の見出し（Claude Code の下書き）]
export const REVIEW_EVENT_HEADING = "出来事と立て直しの回答";
export const REVIEW_RECOVERY_LABEL = "出来事の後の、あなたの回答（入力したまま）";

// --- ⑥振り返りの公的資料（A-06、ADR-0043） -----------------------------------

export type PublicSourceId =
  | "gov_online_prep"
  | "mhlw_after_service_10_disaster"
  | "mhlw_after_service_10_photo"
  | "fdma_ecollege_pack"
  | "myna_faq_medicine"
  | "myna_news_medicine";

/**
 * 準備行動に関係する公的資料（docs/references.md「振り返りの公的資料」）。
 * 画面に出すのは verified が true のものだけ（rules.ts の verifiedSourcesFor）。
 * verified を true にしてよいのは、オーナーが本文と該当箇所を確かめ、docs/references.md を「確認済み」にしたときだけ。
 * section は資料の見出しをそのまま写したもので、説明文ではない。資料の説明を Claude に作らせない。
 */
// [TODO-OWNER: 振り返りの公的資料を確認済みにするか（Claude Code が本文を確かめた候補。docs/references.md）。確かめたものは verified を true に、checkedOn をオーナーの確認日にする]
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
    verified: false,
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
    verified: false,
  },
  myna_faq_medicine: {
    publisher: "デジタル庁（マイナポータル よくあるご質問）",
    title: "過去の薬（薬剤情報）ではどのような情報が閲覧できますか。",
    section: "No : 4901",
    url: "https://faq.myna.go.jp/faq/show/4901?category_id=18&site_domain=default",
    checkedOn: "2026-11-05",
    verified: false,
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
  notebook_bag: ["gov_online_prep", "mhlw_after_service_10_disaster"],
  photo_and_paper: ["mhlw_after_service_10_photo", "fdma_ecollege_pack"],
  wallet_memo: [],
  tell_family: [],
  pharmacy_contact: [],
  check_portal: ["myna_faq_medicine", "myna_news_medicine"],
};

// [TODO-OWNER: 振り返りの公的資料の見出しと注記（Claude Code の下書き）]
export const REVIEW_SOURCES_HEADING = "準備に役立つ公的資料";
export const REVIEW_SOURCES_NOTE =
  "リンクは別のタブで開きます。内容は、それぞれの発行元のページでご確認ください。";

// --- BGM（B-03、ADR-0039） ---------------------------------------------------

// [TODO-OWNER: BGM の操作の文字と説明（Claude Code の下書き）]
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
// [TODO-OWNER: BGM の音量の欄を開くボタンの文字と、鳴らせないときの説明（Claude Code の下書き）]
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
// [TODO-OWNER: 出来事のあとの情報源の並びの文面（B-02 の下書き。点数や正解に見えないか、後半の答えの手がかりになりすぎないか）]
// → オーナー決定（2026-11-05、チャット）：「このまま採用」（出来事のあとの情報源の並びの文面）
export const SHIFT_CAPTION = "出来事のあとの情報源";
export const SHIFT_LOST_PREFIX = "使えない：";
export const SHIFT_NONE_LOST = "使えなくなった情報源はありません";
export const SHIFT_LOST_STATE = "使えない";
export const SHIFT_KEPT_STATE = "この出来事では使えなくなっていない";
export const SHIFT_CHOSEN_STATE = "頼りにしていた";
