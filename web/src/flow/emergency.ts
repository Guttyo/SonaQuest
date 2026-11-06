// 体調の訴えらしい入力の検出（ADR-0011）。Claudeを使わず、語の照合だけで決める。
// 医学的な緊急度は判断しない。すべての訴えを見分けられるわけではないので、
// 「訓練をやめる」ボタンを常に残す。訓練の中の想定か今の訴えかを区別できない語は、中断する側に倒す。

/** 自動で中断した理由。manual は「訓練をやめる」ボタン */
export type StopReason = "manual" | "symptom" | "self_harm";

// [TODO-OWNER: 体調の訴え・自傷のほのめかしとして照合する語の一覧（Claude Codeの下書き）]
// 語は現在形や「〜て」の形で書く。「具合が悪くなった」「痛くない」のような過去・否定の言い方には
// できるだけ当たらないようにする（safety-test-plan E9）。カタカナはひらがなに直して照合する。

/** 自傷のほのめかし。体調の訴えより先に調べ、自傷用の案内を出す */
const SELF_HARM_TERMS: readonly string[] = [
  "死にたい", "しにたい", "死のう", "死んでしまいたい", "死ねたら",
  "消えたい", "きえたい", "消えてしまいたい", "いなくなりたい",
  "生きていたくない", "生きたくない", "生きるのがつら", "生きているのがつら",
  "生きるのが苦し", "生きているのが苦し",
  "終わりにしたい", "おわりにしたい",
  "自殺", "自死", "自傷", "自分を傷つけ",
  "リストカット", "リスカ", "手首を切",
  "首を吊", "首をつる", "首をつろ", "首をつり", "首をつっ", "首つり", "首つる",
  "飛び降り", "とびおり",
  "オーバードーズ", "大量に飲",
];

/** 本人の今の体調の訴え（「薬が切れて今つらい」を含む） */
const SYMPTOM_TERMS: readonly string[] = [
  // 苦しさ・つらさ
  "苦しい", "くるしい", "つらい", "辛い", "しんどい", "もう限界",
  "息ができな", "息がしづら", "息がしにく", "息が詰ま", "息切れ", "呼吸ができな",
  // 痛み
  "痛い", "痛くて", "痛む", "頭ががんがん",
  // 具合・気分
  "具合が悪い", "具合が悪くて", "具合悪い", "具合わる",
  "体調が悪い", "体調悪い", "調子が悪い", "気分が悪い", "気分悪い",
  "気持ち悪い", "気持ちが悪い", "だるい", "だるくて",
  // 吐き気・めまい・意識
  "吐きそう", "吐き気がする", "吐き気がひど",
  "めまいがする", "目が回", "ぐるぐる回", "ふらふらする", "ふらつく",
  "意識がもうろう", "意識が遠", "意識がな", "意識が飛", "ろれつが",
  // 「棚が倒れた」のような被災の話に当たらないよう、「倒れた」は入れない
  "倒れそう", "起き上がれな", "動けな",
  // そのほかの体の異変
  "熱がある", "熱が出て", "熱っぽい", "寒気がする", "冷や汗",
  "しびれる", "しびれて", "痺れる", "痺れて",
  "動悸がする", "動悸がひど", "どきどきする", "どきどきして",
  "発作が", "けいれん", "痙攣",
  // 「〜が止まらない」は、体の症状の語に限る（「雨が止まらない」などに当たらないように）
  "咳が止まらな", "せきが止まらな", "血が止まらな", "出血が止まらな", "震えが止まらな",
  "ふるえが止まらな", "吐き気が止まらな", "下痢が止まらな", "汗が止まらな", "動悸が止まらな",
  // 助けを求める言葉
  "助けて", "たすけて", "救急車",
];

/** 照合の前に表記をそろえる：全角・半角、大文字・小文字、空白、カタカナとひらがな */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[ァ-ヶ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x60),
    );
}

const SELF_HARM = SELF_HARM_TERMS.map(normalizeForMatch);
const SYMPTOM = SYMPTOM_TERMS.map(normalizeForMatch);

/**
 * 薬の説明の言い方（Issue #206、ADR-0011 の追記）。体調の訴えの語のすぐ後に続くと、
 * 「胸が苦しい時に飲む薬」「けいれんを抑える薬」のような、何の薬かの説明とみなし、その一致を数えない。
 * 2026-11-07 オーナー決定（チャット）：「薬の説明は止めない（推奨）」（症状の語のすぐ後に「時・とき・場合・用」
 * 「を抑える・止め」が続く言い方は中断しない）。
 * 「発作が」のように「が」で終わる語は、間に「起きた・起きる・出た・出る・ある・あった」だけを許す。
 * 自傷の語には使わない。照合の前の表記（normalizeForMatch の後）で書く。
 */
const MEDICINE_DESCRIPTION_AFTER =
  /^(?:(?:起き|おき|出|で)(?:た|る)|あ(?:った|る))?(?:時|とき|場合|用|を抑え|をおさえ|止め|どめ)/;

/** 体調の訴えの語が、薬の説明ではない形で1回でも出てくるか */
function hasSymptomComplaint(t: string): boolean {
  for (const w of SYMPTOM) {
    let at = t.indexOf(w);
    while (at !== -1) {
      if (!MEDICINE_DESCRIPTION_AFTER.test(t.slice(at + w.length))) return true;
      at = t.indexOf(w, at + 1);
    }
  }
  return false;
}

/**
 * 回答が体調の訴えらしいか。自傷のほのめかしなら "self_harm"、
 * 体調の訴えなら "symptom"、どちらでもなければ null。
 * 自傷の語は薬の説明の形でも除かない（中断する側に倒す）。
 */
export function detectDistress(text: string): "symptom" | "self_harm" | null {
  const t = normalizeForMatch(text);
  if (SELF_HARM.some((w) => t.includes(w))) return "self_harm";
  if (hasSymptomComplaint(t)) return "symptom";
  return null;
}

/**
 * 体調の訴えらしい入力の後に出す、確かめの問い（2026-11-07 のオーナーの答え。親のセッション経由。ADR-0011 の追記）。
 * 体調の語は、薬の説明（「頭が痛いときに飲む薬」）にも出るので、すぐには中断しない。自傷のほのめかしは今までどおりすぐ中断する
 */
export const SYMPTOM_CHECK_TEXT = "現在の体調の訴えでしょうか？";
/** 確かめの問いの間の入力欄の案内（Claude Code の下書き） */
export const SYMPTOM_CHECK_HINT = "いまの体調のことなら「はい」、薬の説明などなら「いいえ」と答えてください";

// [TODO-OWNER: 確かめの問いへの答えを「はい」とみなす言葉の一覧（Claude Code の下書き。文の頭が肯定の言葉で、否定の言葉を含まないもの）]
const AFFIRMATIVE_HEADS: readonly string[] = [
  "はい", "うん", "ええ", "そうです", "そう", "その通り", "そのとおり", "訴えです",
];
const NEGATIVE_TERMS: readonly string[] = [
  "いいえ", "いや", "違", "ちが", "ではな", "じゃな", "ありません", "ない",
];
const AFFIRMATIVE = AFFIRMATIVE_HEADS.map(normalizeForMatch);
const NEGATIVE = NEGATIVE_TERMS.map(normalizeForMatch);

/** 確かめの問いへの答えが「はい」か。否定の言葉を含むものは「はい」とみなさない */
export function isAffirmative(text: string): boolean {
  const t = normalizeForMatch(text).replace(/[、。,.!！?？…・〜~]/g, "");
  if (t.length === 0) return false;
  if (NEGATIVE.some((w) => t.includes(w))) return false;
  return AFFIRMATIVE.some((w) => t.startsWith(w));
}
