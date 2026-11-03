// 画面に出す固定文。Claudeには作らせない（ADR-0015、ADR-0019）。
// 出典が要る文は docs/references.md の確認済みのものだけを使う。

import type {
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
  "このアプリは災害時の服薬情報の伝え方を練習するものです。入力した内容は会話を進めるためにAIサービス（Anthropic）へ送信されます。氏名、住所、電話番号などは入力せず、架空の情報でも練習できます。薬の正確性や治療の適否は判定しません。";

/** この試作版の実際の動作。INTRO_LEAD は完成版の説明なので、違いを別に示す（ルール10） */
export const PROTOTYPE_NOTICE =
  "試作版：この版はAIとつないでいません。入力した内容はどこにも送信せず、この画面の中だけで扱います。";

export const INTRO_POINTS: readonly string[] = [
  "発災翌日の避難所の救護所という、架空の場面です。",
  "氏名・住所・電話番号・実際の患者情報は入力しないでください。",
  "実際の聞き取りと同じように、薬の名前や量も聞きます。分かる範囲で大丈夫です。架空の薬の情報でも練習できます。",
  "答えは入力したまま表示するだけです。薬の正確さや治療の適否は判定しません。点数や合否もありません。",
  "体調の相談の窓口ではありません。体調に異変があるときは、すぐに「訓練をやめる」を押してください。",
];

/** 自アプリの方針と外部事業者の方針は分けて書く（.claude/rules/privacy.md） */
export const PRIVACY_OWN =
  "このアプリ：会話を保存しません。ログにも残しません。タブを閉じると消えます。";
// [TODO-OWNER: 外部事業者の保持方針の書き方（ADR-0006の要約。AI連携の実装時に再確認）]
export const PRIVACY_EXTERNAL =
  "外部事業者（AI連携の実装後）：Anthropic（Claude API）は、入出力を30日以内に削除すると公表しています。利用規約違反の判定時などの例外があります。";

// --- 対話 -----------------------------------------------------------------

/** 救護所の入口で、診察の前に普段の薬を聞き取る場面（東京都 災害時薬事活動ガイドライン 第3章 p.50。README「参考にした公式資料」） */
export const SCENE_INTRO =
  "発災の翌日。避難所の救護所に来ました。入口では、診察の前に、普段飲んでいる薬を確認しています。聞き取り係が、あなたに声をかけます。";

// [TODO-OWNER: 固定の質問文（Claude Codeの下書き。前半3問、立て直しの問い、係の交代のときの問い、後半の残りの問い）]

// 質問の流れは公的な手引きの聞き取りの順番に合わせた（README「参考にした公式資料」）：
// 普段の薬があるか・中身 → 何で確かめられるか → ほかの医療機関の薬・市販薬・アレルギー・副作用
// → （出来事）→ 代わりの手段 → 最近の変化・飲めているか → 薬を知っている人・管理している人。
// 薬の名前・量・病名は聞いてよいが、答えは判定も記録もしない（ADR-0021）。

/** 前半（②問い）の固定の3問 */
export const FIRST_HALF_QUESTIONS: readonly Question[] = [
  {
    id: "first_medicines",
    viewpoint: "current",
    text: "こんにちは。ここでは、普段飲んでいる薬を確認しています。毎日、または決まって飲んでいる薬はありますか？分かる範囲で、薬の名前や何の薬か、飲む量を教えてください。",
  },
  {
    id: "first_location",
    viewpoint: "location",
    text: "その薬のことは、何を見れば確かめられますか？たとえば、お薬手帳、スマホのお薬手帳アプリ、薬の袋や説明書、薬そのものなどです。",
  },
  {
    id: "first_other",
    viewpoint: "unrecorded",
    text: "ほかの病院や診療所でもらっている薬や、市販の薬・サプリはありますか？薬で具合が悪くなったことや、アレルギーはありますか？",
  },
];

/** 後半の最初の問い（立て直し）。必ず1回出す */
export const RECOVERY_QUESTION: Question = {
  id: "second_recovery",
  viewpoint: "alternative",
  text: "では、ほかにどうやって伝えられますか？",
};

/** 係の交代のときの後半の最初の問い */
export const HANDOVER_QUESTION: Question = {
  id: "second_handover",
  viewpoint: "alternative",
  text: "係が代わりました。新しい係にも、普段の薬のことを伝えてください。さっき話したもののほかに、薬のことが分かるものはありますか？",
};

/** 後半の2問目（最近の変化と、今飲めているか） */
export const RECENT_QUESTION: Question = {
  id: "second_recent",
  viewpoint: "current",
  text: "ここ数日、いつもどおり薬を飲めていますか？最近変わった薬があれば、それはいつも見ている記録にも載っていますか？",
};

/** 後半の3問目（薬を知っている人） */
export const PROXY_QUESTION: Question = {
  id: "second_proxy",
  viewpoint: "proxy",
  text: "あなたのほかに、薬のことを知っている人や、管理を手伝っている人はいますか？その人は何を知っていて、どうやって連絡がとれますか？",
};

/** 「家族と連絡がつかない」の出来事の後は、家族のほかの人を聞く */
export const PROXY_QUESTION_AFTER_FAMILY: Question = {
  id: "second_proxy_other",
  viewpoint: "proxy",
  text: "ご家族のほかに、薬のことを知っている人はいますか？その人は何を知っていて、どうやって連絡がとれますか？",
};

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
  "この内容は保存されません。忘れないように、メモや予定表に書いておきましょう。";

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
