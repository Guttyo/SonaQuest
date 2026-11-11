// 振り返りから印刷する「記入用のカード」（Issue #278、ADR-0067）。
// 何も書かれていない A4 の用紙で、本人が実際の薬を紙に手で書く。アプリは実際の薬を受け取らず、保存もしない。
// 利用者の回答はカードに一切入れない（カードの部品は回答を受け取らない）。準備行動「財布に入れる」の用紙として使う。

export interface BlankCardField {
  id: string;
  /** 欄の名前 */
  label: string;
  /** 書き方の小さな添え書き。無ければ空 */
  hint: string;
  /** 記入の行の数（紙の上の罫線の数） */
  lines: number;
}

// [TODO-OWNER: 記入用のカードの題・案内・欄・注意の文（Claude Code の下書き。Issue #278）]
export const BLANK_CARD_TITLE = "わたしのお薬メモ（災害のとき用）";
export const BLANK_CARD_LEAD =
  "お薬手帳や薬の説明書を見ながら、今使っている薬を書き写してください。薬が変わったら書き直してください。";
export const BLANK_CARD_FIELDS: readonly BlankCardField[] = [
  { id: "updated", label: "書いた日・書き直した日", hint: "", lines: 1 },
  { id: "medicines", label: "今使っている薬", hint: "名前・量・使い方（飲み薬のほか、注射・貼り薬・塗り薬・目薬も）", lines: 6 },
  { id: "other", label: "ほかの病院の薬・市販薬・サプリ", hint: "", lines: 2 },
  { id: "allergy", label: "アレルギー・合わなかった薬", hint: "", lines: 2 },
  { id: "location", label: "薬の記録の在りか", hint: "お薬手帳、お薬手帳アプリ、マイナポータルなど", lines: 1 },
  { id: "pharmacy", label: "かかりつけの薬局・病院", hint: "", lines: 1 },
  { id: "proxy", label: "代わりに伝えられる人", hint: "続柄と連絡先", lines: 2 },
];
export const BLANK_CARD_NOTES: readonly string[] = [
  "このメモは、あなたが手で書いたものです。SonaQuest は内容を受け取らず、保存もしません。",
  "書き写した内容が合っているかは、お薬手帳や薬の説明書で確かめてください。分からないことは、かかりつけの薬局へ。",
];

// 振り返りの画面に出す、印刷のための箱の文
export const BLANK_CARD_BOX_HEADING = "記入用のカードを印刷する";
export const BLANK_CARD_BOX_TEXT =
  "準備行動の「今使っている薬の名前・量と、メモを更新した日を書いて財布に入れる」に使える、空欄のカードです（A4）。印刷して、実際の薬を手で書いてください。このアプリには何も入力しません。";
export const BLANK_CARD_PRINT_BUTTON = "記入用のカードを印刷する";

/** 印刷のあいだだけ <html> に付けるクラス。付いているときだけ、印刷でカード以外を隠す */
export const BLANK_CARD_PRINT_CLASS = "print-blank-card";
