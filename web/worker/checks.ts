// Claude が作った文（質問文、受け止めの一言、質問し直す文）の検査（ADR-0025、docs/safety-test-plan.md S16〜S18）。
// 1つでも通らなければ、その文を捨てて固定文に戻す。検査は完全ではないので、語の一覧と試験を一緒に直す。
// 誤って捨てても固定文に戻るだけなので、迷うものは捨てる側に寄せる。

import { MAX_PROMPT_LENGTH } from "../src/flow/turnContract";

const NUM = "[0-9０-９一二三四五六七八九十百半]";
const KANJI = "[\\u4e00-\\u9fff々]";
const KATAKANA = "[\\u30a1-\\u30faー]";

/**
 * 禁止表現（語の照合）。薬の名前の修正、候補や推測の確認、薬効・用法・用量、服薬の助言、
 * 診断、緊急度、備蓄の量、公的な制度、個人の連絡先を尋ねること
 */
// 決定済み：Claude が作った文で禁止する表現の一覧（Claude Codeの下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の Claude の守り）
export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  // 候補・推測の確認、薬の名前の修正
  /ではないですか|ではないでしょうか|ではないかと|ではありませんか|じゃないですか|では？|のことですか|という意味ですか/,
  /かもしれません|と思われます|おそらく|可能性が(?:あ|高)|のようです|みたいですね/,
  // 名詞の直後（「の」「お薬」をはさんでも）の「でしょうか」「ですね」「ですか」は、薬の名前や病名を推測して確かめる形になりやすい
  new RegExp(`(?:${KANJI}{2,}|${KATAKANA}{2,})の?お?薬?(?:でしょうか|ですね|ですか|かな)`),
  // 「〜する薬ですか」「〜の薬ですね」は、薬効から薬を推測する形
  /(?:する|の|な)お?薬(?:でしょうか|ですね|ですか|かな|では)/,
  /止め(?:は|を|や|など|でしょうか|ですか)/,
  /正しくは|の間違い|間違って(?:いま|い)/,
  // 病名らしい語（〜病・〜症・〜炎）と、よくある病気の言葉
  new RegExp(`${KANJI}+(?:病(?!院)|症|炎)`),
  /血圧|血糖|糖尿|コレステロール|喘息|痛風|心臓|肝臓|腎臓|甲状腺|認知症|癌/,
  // 薬効・用法・用量
  /効(?:く|き目|果|能)|副作用/,
  /用法|用量|飲み方/,
  new RegExp(`${NUM}+\\s*(?:mg|ｍｇ|ml|ｍｌ|g|ミリ|錠|カプセル|包|回|日分|錠剤|粒|滴|単位|本|枚|吸入|度|つ)`, "i"),
  /ずつ|朝晩|朝昼晩/,
  /食前|食後|食間|就寝前|寝る前/,
  // 服薬の助言
  /飲んで(?:ください|下さい|おきましょう|おいて)|お飲み(?:ください|下さい|になって)|飲むように|飲み続け|飲まずに|飲まない(?:で|ほうが|方が)|飲み忘れ|切らさない|気をつけ(?:て|ましょう)/,
  /服用(?:して|を|しない)|中止|中断して|続けて(?:ください|下さい)|控え(?:て|ましょう)|やめないで/,
  /増や|減ら|やめ(?:て|ましょう|たほうが|た方が)/,
  /受診|相談して(?:ください|下さい)|病院(?:に|へ)行|医師に/,
  // 診断・緊急度・体調の判断・安心させる判断
  /診断|病気です|症状(?:です|が出|は)|疑い/,
  /緊急|救急|危険|命に|急いで|すぐに(?:受診|病院|医)/,
  /心配(?:ない|いら|いりません|ありません|は)|問題(?:ない|ありません)|(?<!(?:書かなくて|答えなくて|言わなくて|ゆっくりで|急がなくて|あわてなくて|慌てなくて))(?:大丈夫|だいじょうぶ)|様子を見|安心して|ご安心|平気/,
  // 備蓄・公的な制度
  /備蓄|ストック|多めに|日分/,
  /制度|助成|補助金|特例|処方箋/,
  // 個人の情報を尋ねること
  /電話番号を|住所|氏名|お名前|フルネーム|住んで|お住まい|勤め|職業|お仕事|年齢|生年月日|何歳/,
  // 外部への誘導
  /https?:|www\./i,
];

/** 比べる前にそろえる。全角・半角、大文字・小文字、空白、カタカナとひらがなの違いをなくす */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 長い並びから、決まった長さの切れ端をすべて取り出す */
function grams(run: string, size: number): string[] {
  const chars = [...run];
  if (chars.length <= size) return [run];
  return Array.from({ length: chars.length - size + 1 }, (_, i) =>
    chars.slice(i, i + size).join(""),
  );
}

/**
 * 利用者の入力から、繰り返しを見張る言葉を取り出す。
 * 漢字の並びは2文字ずつ（「頭痛薬」の「頭痛」も見る）、カタカナ・英数字は2文字以上の並び、
 * ひらがな（長音「ー」を含む）は、ひらがなで書いた薬の名前を捕まえるために4文字ずつ
 */
export function watchedWords(userText: string): string[] {
  const nfkc = userText.normalize("NFKC").toLowerCase();
  const words = new Set<string>();
  for (const m of nfkc.matchAll(new RegExp(`${KANJI}{2,}`, "gu"))) {
    for (const g of grams(m[0], 2)) words.add(g);
  }
  for (const m of nfkc.matchAll(new RegExp(`${KATAKANA}{2,}|[a-z0-9]{2,}`, "gu"))) {
    words.add(normalize(m[0]));
  }
  for (const m of nfkc.matchAll(/[ぁ-ゟー]{4,}/gu)) {
    for (const g of grams(m[0], 4)) words.add(normalize(g));
  }
  return [...words];
}

/**
 * 受け止めに使う決まった言葉。利用者が同じ言葉を使っていても、繰り返しとみなさない（ADR-0029 の5）。
 * 「わからない」「覚えていない」を受け止める言葉は入れない（RECALL_NOW と重なり、答えの言い直しにもなるため）。
 * 禁止表現の「大丈夫」の例外（ゆっくりで・急がなくて・あわてなくて）は FORBIDDEN_PATTERNS の中にある（ADR-0029 の6）
 */
// 決定済み：繰り返しの検査で許す、受け止めの決まった言葉の一覧（Claude Code の下書き：「わかりました」「承知しました」）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の Claude の守り）
export const ACK_WORDS: readonly string[] = ["わかりました", "分かりました", "承知しました"];

/** 利用者の言葉を繰り返していないか。固定の文と、受け止めの決まった言葉にもある言葉は除く */
export function repeatsUserWords(
  text: string,
  userTexts: readonly string[],
  allowed: readonly string[],
): boolean {
  const target = normalize(text);
  const allowedText = [...allowed, ...ACK_WORDS].map(normalize).join("\n");
  return userTexts.some((userText) =>
    watchedWords(userText).some((w) => target.includes(w) && !allowedText.includes(w)),
  );
}

/**
 * アプリの固定の文に無いカタカナの言葉、英字の言葉、「〜薬」「〜剤」の言葉を探す。
 * 利用者が言っていない薬の名前や薬の種類を、Claude が推測して出すのを止めるため。
 * ひらがなで書いた薬の名前など、ここで見つけられない形は、意味で判断する監査役（Issue #40）で補う
 */
export function unknownTerms(text: string, allowed: readonly string[]): string[] {
  const nfkc = text.normalize("NFKC");
  const allowedText = allowed.map((a) => a.normalize("NFKC")).join("\n").toLowerCase();
  const found = [
    ...nfkc.matchAll(new RegExp(`${KATAKANA}{2,}`, "gu")),
    ...nfkc.matchAll(/[A-Za-z]{2,}/gu),
    ...nfkc.matchAll(new RegExp(`${KANJI}+(?:薬|剤)`, "gu")),
  ].map((m) => m[0]);
  return found.filter((w) => !allowedText.includes(w.toLowerCase()));
}

export interface TextCheckContext {
  /** 利用者のこれまでの入力 */
  userTexts: readonly string[];
  /** 文に含まれてよいアプリの固定の文（質問、情報源の分類、出来事など） */
  allowed: readonly string[];
  /**
   * 直前の回答（復唱してよい言葉の出どころ。2026-11-07 のオーナーの答え、親のセッション経由）。
   * この答えに文字どおりある言葉だけは、繰り返し・固定の文に無い言葉・名前の直後の「ですね」・病名らしい語の照合で捨てない
   */
  lastAnswer?: string;
}

/** 文を捨てた理由の種類。本文を含まないので、公開する版でもログに出してよい（ADR-0029 の1） */
/** pairing：振り返りの一言で、観点と決まった言い回しのつなぎ方が合わない（remarkPairing.ts。ADR-0064） */
export type RejectReason = "length" | "forbidden" | "unknown_term" | "repeat" | "pairing";

/**
 * 復唱なら許す禁止表現：名前の直後の「ですね」など（推測の確かめの形）、「〜の薬ですね」、病名らしい語、よくある病気の言葉。
 * 直前の回答から写した言葉を伏せた文で照合する。量・薬効・用法・助言・診断・緊急度などは、伏せずに照合する（復唱でも捨てる）
 */
// [TODO-OWNER: 復唱で許す範囲（Claude Code の下書き：直前の回答に文字どおりある、漢字・カタカナ・英数字で始まり終わる2文字以上の言葉。許す禁止表現は、名前の直後の「ですね」等・「〜の薬ですね」等・病名らしい語・よくある病気の言葉の4つ）]
const ECHOABLE_PATTERNS: ReadonlySet<RegExp> = new Set([
  FORBIDDEN_PATTERNS[2],
  FORBIDDEN_PATTERNS[3],
  FORBIDDEN_PATTERNS[6],
  FORBIDDEN_PATTERNS[7],
]);

const WORD_CHAR = new RegExp(`${KANJI}|${KATAKANA}|[A-Za-z0-9]`, "u");

/**
 * 文の中で、直前の回答から文字どおり写した言葉を「〇」に替える。言葉は、漢字・カタカナ・英数字で始まって終わり、
 * その文字が2つ以上あり、前後が語の切れ目（漢字・カタカナ・英数字が続かない）のもの。長いものを先に取る。
 * 引数はどちらも NFKC にそろえ、空白を除いたもの
 */
export function maskEchoed(text: string, answer: string): string {
  const chars = [...text];
  const isWord = (c: string | undefined) => c !== undefined && WORD_CHAR.test(c);
  let out = "";
  let i = 0;
  while (i < chars.length) {
    let taken = 0;
    if (isWord(chars[i]) && !isWord(chars[i - 1])) {
      for (let end = chars.length; end >= i + 2; end--) {
        if (!isWord(chars[end - 1]) || isWord(chars[end])) continue;
        const span = chars.slice(i, end);
        if (span.filter((c) => isWord(c)).length < 2) continue;
        if (answer.includes(span.join(""))) {
          taken = end - i;
          break;
        }
      }
    }
    if (taken > 0) {
      out += "〇";
      i += taken;
    } else {
      out += chars[i];
      i += 1;
    }
  }
  return out;
}

/** 文の問題を1つ返す。画面に出してよければ null。長さ・禁止表現・固定の文に無い薬らしい言葉・繰り返しの順に見る */
export function promptTextProblem(text: string, context: TextCheckContext): RejectReason | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || text.length > MAX_PROMPT_LENGTH) return "length";
  // 語の間に空白や改行をはさんで禁止表現をすり抜けないよう、空白を除いた文で照合する（表示は元の文のまま）
  const nfkc = text.normalize("NFKC").replace(/\s+/g, "");
  const answer = (context.lastAnswer ?? "").normalize("NFKC").replace(/\s+/g, "");
  const masked = answer.length === 0 ? nfkc : maskEchoed(nfkc, answer);
  if (FORBIDDEN_PATTERNS.some((p) => p.test(ECHOABLE_PATTERNS.has(p) ? masked : nfkc))) return "forbidden";
  // 直前の回答の言葉は、固定の文と同じく許す（復唱）
  const allowed = answer.length === 0 ? context.allowed : [...context.allowed, answer];
  if (unknownTerms(text, allowed).length > 0) return "unknown_term";
  if (repeatsUserWords(text, context.userTexts, allowed)) return "repeat";
  return null;
}

/** 文を画面に出してよいか */
export function isAcceptablePromptText(text: string, context: TextCheckContext): boolean {
  return promptTextProblem(text, context) === null;
}

/**
 * 振り返りの一言だけの検査（Issue #200 の案B。2026-11-07 オーナーが「B を作る」を選んだ。親のセッション経由）。
 * 質問文の検査（promptTextProblem）から、利用者の言葉の繰り返しの照合だけを外したもの。一言では、利用者が挙げた
 * 情報源・手段・人（続柄）の言葉に触れてよいため。長さ・禁止表現（薬の名前の推測、量、病名、薬効、助言、診断、緊急度）・
 * 固定の文に無いカタカナと英字の言葉・「〜薬」「〜剤」の言葉は、質問文と同じに捨てる。
 * 繰り返しの照合が捕まえていた、ひらがな・漢字で書いた薬の名前や人の名前は、ここでは止まらない。監査役（ADR-0030）を必ず通す
 */
// [TODO-OWNER: 振り返りの一言だけの検査（Claude Code の下書き。繰り返しの照合を外し、ほかは質問文と同じ。監査役は必ず通す）]
export function remarkTextProblem(text: string, allowed: readonly string[]): RejectReason | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || text.length > MAX_PROMPT_LENGTH) return "length";
  const nfkc = text.normalize("NFKC").replace(/\s+/g, "");
  if (FORBIDDEN_PATTERNS.some((p) => p.test(nfkc))) return "forbidden";
  if (unknownTerms(text, allowed).length > 0) return "unknown_term";
  return null;
}
