// 訓練の進行で使う型。値の意味は docs/PRD.md と ADR-0016・0017・0019 に合わせる。

/** ③確認で本人が選ぶ情報源の分類（出来事の6候補の分類。ADR-0016） */
export type SourceId =
  | "smartphone"
  | "online"
  | "notebook"
  | "family"
  | "clinic"
  | "none";

/** ④出来事 */
export type EventId =
  | "battery"
  | "network"
  | "notebook_home"
  | "family_unreachable"
  | "clinic_unreachable"
  | "handover";

/** 5観点 */
export type ViewpointId =
  | "location"
  | "alternative"
  | "current"
  | "unrecorded"
  | "proxy";

/** 観点ごとの判定（ADR-0017）。undetermined は API失敗時・Claude未使用時（ADR-0012） */
export type Judgment =
  | "confirmed"
  | "aware_unconfirmed"
  | "not_mentioned"
  | "undetermined";

export type Judgments = Record<ViewpointId, Judgment>;

/** 対話の前半（②問い）か後半（⑤立て直し）か */
export type Half = "first" | "second";

/**
 * 誰のこととして答えるか（ADR-0022 案B）。
 * self：本人のこととして振り返る（在りか・伝え方・知っている人・記録の新しさ）
 * fictional：架空の内容で答える（薬の中身）
 * both：手段は本人のこと、薬の中身は架空
 */
export type AnswerAs = "self" | "fictional" | "both";

export interface Question {
  id: string;
  text: string;
  /** 主に確かめる観点 */
  viewpoint: ViewpointId;
  answerAs: AnswerAs;
  /**
   * 聞き返すときだけ添えてよい例（Issue #110、2026-11-05 オーナー決定「聞き返すときだけ」）。
   * 最初の問いでは声にも画面にも出さない。Claude の聞き返しの文はこの言葉を使ってよい（prompt.ts、turn.ts）
   */
  examples?: string;
}

/**
 * 利用者の回答。text は入力そのもので、書き換えない（ADR-0009）。
 * redirected は関係のない話として受け止めて質問し直した入力で、回答の回数に数えない（ADR-0025）
 */
export interface Answer {
  questionId: string;
  half: Half;
  text: string;
  /** その入力の直前に聞き取り係が言った文（固定文か、検査を通った Claude の文） */
  prompt: string;
  kind: "answer" | "redirected";
  /** 思い出せないという回答だったか（Claude の判定。docs/phase2-decisions.md 項目7） */
  recall: boolean;
}

/** 聞き取り係のいまの発言。ask は質問、clarify は聞き返し、redirect は質問し直し */
export interface Prompt {
  questionId: string;
  text: string;
  type: "ask" | "clarify" | "redirect";
}

export type PrepActionId =
  | "notebook_bag"
  | "photo_and_paper"
  | "wallet_memo"
  | "tell_family"
  | "pharmacy_contact"
  | "check_portal";

export type TimingId = "today" | "this_week" | "next_day_off";
