// カルテの抽出型の要約（B-10、Issue #142）の、架空の会話の見本 10本と正解の要約。
// 人物・薬・数字はすべて架空。薬の名前は board/data.ts と同じく「降圧薬A」のような仮名で、実在の製品名を使わない。
// 会話は救護所の聞き手（staff）と本人（patient）のやりとり。聞き手は質問だけをし、助言・診断・薬の評価をしない。
// 訓練（患者向け）の会話はここに入れない。要約を作るモデルにも監査役にも、この見本だけを送る。
//
// 正解の要約は「本人の言葉の抜き出し」：quote は本人の発言の一部を文字どおりに写し、text は quote を短くしたもの。
// text に出る数字・カタカナ・英字は quote にもある（codeCheck.ts の text_adds_terms）。
// planted は、デモと試験で使う「会話にない内容」の項目（quote が会話に無い）。どの見本にも1つ持たせる。

import type { KarteSummary, KarteSummaryItem } from "./contract";

export interface KarteTurn {
  speaker: "staff" | "patient";
  text: string;
}

export interface KarteSample {
  id: string;
  /** 見本の短い名前（画面の選択肢） */
  title: string;
  turns: readonly KarteTurn[];
  /** 正解の要約。コードでの確認の指摘が0件になる */
  expected: KarteSummary;
  /** 会話にない内容の項目。正解の要約に足すと、コードでの確認が quote_not_found を出す */
  planted: KarteSummaryItem;
}

const S = (text: string): KarteTurn => ({ speaker: "staff", text });
const P = (text: string): KarteTurn => ({ speaker: "patient", text });

// 決定済み：架空の会話の見本 10本と正解の要約（Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「案は提出後、今の下書きは採る（推奨）」（ボードの AI の守り）
export const KARTE_SAMPLES: readonly KarteSample[] = [
  {
    id: "karte-01",
    title: "お薬手帳が家にある人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("お薬手帳は家の台所の引き出しに入れています。今日は持ってきていません。"),
      S("手帳が見られないときは、ほかにどうやって伝えますか。"),
      P("スマホのカメラで薬の袋を撮った写真があります。"),
      S("今飲んでいるお薬と、記録が新しいかを教えてください。"),
      P("架空の降圧薬Aを朝に1錠です。先月から量が変わって、手帳にはまだ書いていません。"),
      S("記録に載っていないことはありますか。"),
      P("歯医者さんでもらった痛み止めは、手帳に貼っていないです。"),
      S("ご自分で説明できないとき、代わりに伝えられる人はいますか。"),
      P("隣の市に住む娘が、薬のことを知っています。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "お薬手帳は家の台所の引き出し", quote: "お薬手帳は家の台所の引き出しに入れています" },
        { aspect: "alternative", text: "スマホで撮った薬の袋の写真", quote: "スマホのカメラで薬の袋を撮った写真があります" },
        { aspect: "current", text: "架空の降圧薬Aを朝に1錠", quote: "架空の降圧薬Aを朝に1錠です" },
        { aspect: "current", text: "先月から量が変わり、手帳にはまだ書いていない", quote: "先月から量が変わって、手帳にはまだ書いていません" },
        { aspect: "unrecorded", text: "歯医者でもらった痛み止めは手帳に貼っていない", quote: "歯医者さんでもらった痛み止めは、手帳に貼っていない" },
        { aspect: "proxy", text: "隣の市に住む娘が薬のことを知っている", quote: "隣の市に住む娘が、薬のことを知っています" },
      ],
      not_covered: [],
    },
    planted: { aspect: "unrecorded", text: "卵のアレルギーがある", quote: "卵のアレルギーがあります" },
  },
  {
    id: "karte-02",
    title: "スマホのアプリに記録している人",
    turns: [
      S("お薬の記録は、どこで見られますか。"),
      P("スマホのお薬手帳のアプリに入れています。"),
      S("スマホの電池が切れたら、どうしますか。"),
      P("それは考えたことがなかったです。紙の手帳は持っていません。"),
      S("今のお薬と、記録が新しいかを教えてください。"),
      P("架空の血糖降下薬Bを朝と夜に1錠ずつです。アプリは薬局で毎回読み込んでもらっています。"),
      S("代わりに伝えられる人はいますか。"),
      P("一人暮らしなので、すぐには思いつきません。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "スマホのお薬手帳のアプリ", quote: "スマホのお薬手帳のアプリに入れています" },
        { aspect: "alternative", text: "考えたことがなかった", quote: "それは考えたことがなかったです" },
        { aspect: "alternative", text: "紙の手帳は持っていない", quote: "紙の手帳は持っていません" },
        { aspect: "current", text: "架空の血糖降下薬Bを朝と夜に1錠ずつ", quote: "架空の血糖降下薬Bを朝と夜に1錠ずつです" },
        { aspect: "current", text: "アプリは薬局で毎回読み込んでもらっている", quote: "アプリは薬局で毎回読み込んでもらっています" },
        { aspect: "proxy", text: "一人暮らしで、すぐには思いつかない", quote: "一人暮らしなので、すぐには思いつきません" },
      ],
      not_covered: ["unrecorded"],
    },
    planted: { aspect: "proxy", text: "近所の友人が代わりに伝えられる", quote: "近所の友人が代わりに伝えてくれます" },
  },
  {
    id: "karte-03",
    title: "薬の袋を財布に入れている人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("薬の説明書を小さく折って、財布に入れています。"),
      S("その紙が無いときは、どうやって伝えますか。"),
      P("かかりつけの薬局に電話すれば分かると思います。"),
      S("最近、お薬が変わったことはありますか。"),
      P("先週から架空の吸入薬Dが増えました。説明書は前のままです。"),
      S("記録に載っていないことはありますか。"),
      P("ドラッグストアで買った胃薬を、ときどき飲んでいます。"),
      S("代わりに伝えられる人はいますか。"),
      P("夫が一緒に避難しているので、夫に聞いてください。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "薬の説明書を折って財布に入れている", quote: "薬の説明書を小さく折って、財布に入れています" },
        { aspect: "alternative", text: "かかりつけの薬局に電話すれば分かると思う", quote: "かかりつけの薬局に電話すれば分かると思います" },
        { aspect: "current", text: "先週から架空の吸入薬Dが増えた", quote: "先週から架空の吸入薬Dが増えました" },
        { aspect: "current", text: "説明書は前のまま", quote: "説明書は前のままです" },
        { aspect: "unrecorded", text: "ドラッグストアで買った胃薬をときどき飲んでいる", quote: "ドラッグストアで買った胃薬を、ときどき飲んでいます" },
        { aspect: "proxy", text: "一緒に避難している夫", quote: "夫が一緒に避難しているので、夫に聞いてください" },
      ],
      not_covered: [],
    },
    planted: { aspect: "current", text: "架空の吸入薬Dを1日2回", quote: "吸入薬Dは1日2回です" },
  },
  {
    id: "karte-04",
    title: "記録の場所が分からない人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("どこに置いたか、ちょっと覚えていないです。"),
      S("分かる範囲で、今飲んでいるお薬を教えてください。"),
      P("白くて小さい錠剤を、夜に飲んでいます。名前は出てこないです。"),
      S("代わりに伝えられる人はいますか。"),
      P("息子が通院に付き添ってくれているので、息子なら分かります。電話はつながりません。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "どこに置いたか覚えていない", quote: "どこに置いたか、ちょっと覚えていないです" },
        { aspect: "current", text: "白くて小さい錠剤を夜に飲んでいる", quote: "白くて小さい錠剤を、夜に飲んでいます" },
        { aspect: "current", text: "名前は出てこない", quote: "名前は出てこないです" },
        { aspect: "proxy", text: "通院に付き添っている息子なら分かる", quote: "息子が通院に付き添ってくれているので、息子なら分かります" },
        { aspect: "proxy", text: "電話はつながらない", quote: "電話はつながりません" },
      ],
      not_covered: ["alternative", "unrecorded"],
    },
    planted: { aspect: "location", text: "お薬手帳は車の中にある", quote: "お薬手帳は車の中にあります" },
  },
  {
    id: "karte-05",
    title: "家族の分もまとめて持つ人",
    turns: [
      S("お薬の記録は、どこにありますか。"),
      P("家族全員のお薬手帳を、防災リュックにまとめて入れてあります。"),
      S("リュックを持ち出せなかったら、どうしますか。"),
      P("手帳の中を写した写真を、家族のグループのチャットに送ってあります。"),
      S("今のお薬と、記録が新しいかを教えてください。"),
      P("架空の抗てんかん薬Cを朝夕に2錠です。写真は半年前のものです。"),
      S("記録に載っていないことはありますか。"),
      P("昔、ある薬で発疹が出たと言われたことがありますが、手帳には書いていません。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "家族全員のお薬手帳を防災リュックにまとめている", quote: "家族全員のお薬手帳を、防災リュックにまとめて入れてあります" },
        { aspect: "alternative", text: "手帳の写真を家族のグループのチャットに送ってある", quote: "手帳の中を写した写真を、家族のグループのチャットに送ってあります" },
        { aspect: "current", text: "架空の抗てんかん薬Cを朝夕に2錠", quote: "架空の抗てんかん薬Cを朝夕に2錠です" },
        { aspect: "current", text: "写真は半年前のもの", quote: "写真は半年前のものです" },
        { aspect: "unrecorded", text: "昔ある薬で発疹が出たと言われたが、手帳には書いていない", quote: "昔、ある薬で発疹が出たと言われたことがありますが、手帳には書いていません" },
      ],
      not_covered: ["proxy"],
    },
    planted: { aspect: "proxy", text: "妻が薬のことを知っている", quote: "妻が薬のことを全部知っています" },
  },
  {
    id: "karte-06",
    title: "かかりつけの病院で管理している人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("病院の中の薬局で全部管理してもらっていて、自分では持っていません。"),
      S("その病院に連絡がつかないときは、どうしますか。"),
      P("診察券に病院の名前が書いてあるので、それを見せます。"),
      S("最近、お薬が変わったことはありますか。"),
      P("変わっていないと思いますが、自信はないです。"),
      S("代わりに伝えられる人はいますか。"),
      P("ケアマネジャーさんが、薬の一覧を持っているはずです。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "病院の中の薬局で管理してもらい、自分では持っていない", quote: "病院の中の薬局で全部管理してもらっていて、自分では持っていません" },
        { aspect: "alternative", text: "診察券に書いてある病院の名前を見せる", quote: "診察券に病院の名前が書いてあるので、それを見せます" },
        { aspect: "current", text: "変わっていないと思うが自信はない", quote: "変わっていないと思いますが、自信はないです" },
        { aspect: "proxy", text: "ケアマネジャーが薬の一覧を持っているはず", quote: "ケアマネジャーさんが、薬の一覧を持っているはずです" },
      ],
      not_covered: ["unrecorded"],
    },
    planted: { aspect: "current", text: "先月から薬が1つ減った", quote: "先月から薬が1つ減りました" },
  },
  {
    id: "karte-07",
    title: "メモを書いて持ち歩く人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("手帳は家ですが、名前と量を書いたメモを、いつもかばんに入れています。"),
      S("メモの内容は新しいですか。"),
      P("メモは去年の春に書いたので、今と合っているか分かりません。"),
      S("記録に載っていないことはありますか。"),
      P("整形外科でもらった湿布は、メモに書いていません。"),
      S("代わりに伝えられる人はいますか。"),
      P("同じ避難所にいる妹が、だいたい知っています。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "手帳は家", quote: "手帳は家ですが" },
        { aspect: "alternative", text: "名前と量を書いたメモをかばんに入れている", quote: "名前と量を書いたメモを、いつもかばんに入れています" },
        { aspect: "current", text: "メモは去年の春に書いたもので、今と合っているか分からない", quote: "メモは去年の春に書いたので、今と合っているか分かりません" },
        { aspect: "unrecorded", text: "整形外科でもらった湿布はメモに書いていない", quote: "整形外科でもらった湿布は、メモに書いていません" },
        { aspect: "proxy", text: "同じ避難所にいる妹がだいたい知っている", quote: "同じ避難所にいる妹が、だいたい知っています" },
      ],
      not_covered: [],
    },
    planted: { aspect: "alternative", text: "薬局のサイトで履歴を見られる", quote: "薬局のサイトで履歴が見られます" },
  },
  {
    id: "karte-08",
    title: "代わりの手段が無い人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("紙のお薬手帳だけで、家に置いてきました。"),
      S("ほかに伝える手段はありますか。"),
      P("ほかには何もないです。写真も撮っていません。"),
      S("今のお薬を教えてください。"),
      P("架空の降圧薬Aと、架空の血糖降下薬Bです。量はよく分かりません。"),
      S("記録に載っていないことはありますか。"),
      P("サプリメントを毎朝飲んでいます。手帳には書いていません。"),
      S("代わりに伝えられる人はいますか。"),
      P("妻なら分かりますが、別の避難所にいます。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "紙のお薬手帳だけで、家に置いてきた", quote: "紙のお薬手帳だけで、家に置いてきました" },
        { aspect: "alternative", text: "ほかの手段は無く、写真も撮っていない", quote: "ほかには何もないです。写真も撮っていません" },
        { aspect: "current", text: "架空の降圧薬Aと架空の血糖降下薬B", quote: "架空の降圧薬Aと、架空の血糖降下薬Bです" },
        { aspect: "current", text: "量はよく分からない", quote: "量はよく分かりません" },
        { aspect: "unrecorded", text: "サプリメントを毎朝飲んでいて、手帳には書いていない", quote: "サプリメントを毎朝飲んでいます。手帳には書いていません" },
        { aspect: "proxy", text: "妻なら分かるが別の避難所にいる", quote: "妻なら分かりますが、別の避難所にいます" },
      ],
      not_covered: [],
    },
    planted: { aspect: "current", text: "架空の降圧薬Aを1日3錠", quote: "降圧薬Aは1日3錠です" },
  },
  {
    id: "karte-09",
    title: "話が途中でそれた人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("それより、毛布が足りないんですけど。"),
      S("毛布のことは係に伝えます。お薬の記録は、どこにありますか。"),
      P("ああ、お薬手帳はこのポーチに入っています。"),
      S("ありがとうございます。ほかに記録に載っていないことはありますか。"),
      P("夜に眠れないときに飲む薬があって、それは手帳に書いていないかもしれません。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "お薬手帳はポーチに入っている", quote: "お薬手帳はこのポーチに入っています" },
        { aspect: "unrecorded", text: "夜に眠れないときに飲む薬は手帳に書いていないかもしれない", quote: "夜に眠れないときに飲む薬があって、それは手帳に書いていないかもしれません" },
      ],
      not_covered: ["alternative", "current", "proxy"],
    },
    planted: { aspect: "proxy", text: "隣の人が代わりに伝えられる", quote: "隣の人が代わりに伝えてくれます" },
  },
  {
    id: "karte-10",
    title: "付き添いの人がいる人",
    turns: [
      S("普段のお薬の記録は、どこにありますか。"),
      P("娘のスマホに、お薬手帳の写真が入っています。"),
      S("娘さんと離れたときは、どうしますか。"),
      P("自宅の冷蔵庫に、薬の一覧を貼ってあります。"),
      S("今のお薬と、記録が新しいかを教えてください。"),
      P("架空の吸入薬Dを朝に1回です。一覧は先月、娘が書き直してくれました。"),
      S("代わりに伝えられる人はいますか。"),
      P("娘が一番よく知っています。"),
    ],
    expected: {
      items: [
        { aspect: "location", text: "娘のスマホにお薬手帳の写真", quote: "娘のスマホに、お薬手帳の写真が入っています" },
        { aspect: "alternative", text: "自宅の冷蔵庫に薬の一覧を貼ってある", quote: "自宅の冷蔵庫に、薬の一覧を貼ってあります" },
        { aspect: "current", text: "架空の吸入薬Dを朝に1回", quote: "架空の吸入薬Dを朝に1回です" },
        { aspect: "current", text: "一覧は先月、娘が書き直した", quote: "一覧は先月、娘が書き直してくれました" },
        { aspect: "proxy", text: "娘が一番よく知っている", quote: "娘が一番よく知っています" },
      ],
      not_covered: ["unrecorded"],
    },
    planted: { aspect: "unrecorded", text: "市販の目薬を使っている", quote: "市販の目薬を毎日使っています" },
  },
];

/** デモで「誤りを混ぜた例」として使う見本 */
export const PLANTED_DEMO_SAMPLE_ID = "karte-01";

export function findSample(id: string): KarteSample | undefined {
  return KARTE_SAMPLES.find((s) => s.id === id);
}

/** 正解の要約に、会話にない項目を1つ足したもの（デモと試験で使う） */
export function plantedSummary(sample: KarteSample): KarteSummary {
  return { items: [...sample.expected.items, sample.planted], not_covered: [...sample.expected.not_covered] };
}

/** 本人の発言だけを並べたもの（quote の照合に使う。聞き手の質問は根拠にしない） */
export function patientUtterances(sample: KarteSample): string[] {
  return sample.turns.filter((t) => t.speaker === "patient").map((t) => t.text);
}
