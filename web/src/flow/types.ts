// 訓練の進行で使う型。値の意味は docs/PRD.md と ADR-0016・0017・0019 に合わせる。

/**
 * ③確認で本人が選ぶ情報源の分類（出来事の6候補の分類。ADR-0016）。
 * この一覧を正とし、型と、/api/turn で受け付ける値の集合（turnContract.ts）をここから作る（Issue #299）
 */
export const SOURCE_ID_LIST = ["smartphone", "online", "notebook", "family", "clinic", "none"] as const;
export type SourceId = (typeof SOURCE_ID_LIST)[number];

/** ④出来事。この一覧を正とし、型と、/api/turn で受け付ける値の集合（turnContract.ts）をここから作る（Issue #299） */
export const EVENT_ID_LIST = [
  "battery",
  "network",
  "notebook_home",
  "family_unreachable",
  "clinic_unreachable",
  "handover",
] as const;
export type EventId = (typeof EVENT_ID_LIST)[number];

/**
 * 固定の質問の ID（content.ts の ALL_QUESTIONS と同じものを同じ順に。試験で突き合わせる。Issue #299）。
 * 聞き返し・質問し直しの固定文（CLARIFY_TEXTS・REDIRECT_TEXTS）と、Worker のゴールの説明（GOAL_DESCRIPTIONS）は、
 * この型をキーにして、書き漏れを型の検査で見つける。second_recheck は 2026-11-07 から聞かないが、まだ受け付ける
 */
export const QUESTION_ID_LIST = [
  "first_medicines",
  "first_location",
  "first_other",
  "first_unrecorded",
  "first_medicines_more",
  "second_recovery",
  "second_handover",
  "second_recent",
  "second_proxy",
  "second_proxy_other",
  "second_recent_other",
  "second_recheck",
] as const;
export type QuestionId = (typeof QUESTION_ID_LIST)[number];

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

/** 手薄な判定（「確認していない」「未確認と気づいた」）。rules.ts の isWeak で絞り込む */
export type WeakJudgment = Extract<Judgment, "not_mentioned" | "aware_unconfirmed">;

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
  id: QuestionId;
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
 * redirected は関係のない話として受け止めて質問し直した入力で、回答の回数に数えない（ADR-0025）。
 * event_reasked は、出来事で使えなくなった手段に頼る回答として固定文で聞き返した入力で、回答の回数に数えず、
 * Claude にも送らない（Issue #246、ADR-0016 の追記）。どちらも振り返りには原文のまま出る
 */
export interface Answer {
  questionId: string;
  half: Half;
  text: string;
  /** その入力の直前にソナが言った文（固定文か、検査を通った Claude の文） */
  prompt: string;
  kind: "answer" | "redirected" | "event_reasked";
  /** 思い出せないという回答だったか（Claude の判定。docs/phase2-decisions.md 項目7） */
  recall: boolean;
}

/** ソナのいまの発言。ask は質問、clarify は聞き返し、redirect は質問し直し */
export interface Prompt {
  questionId: string;
  text: string;
  /** symptom_check は、体調の訴えらしい入力の後の確かめの問い（ADR-0011 の追記） */
  type: "ask" | "clarify" | "redirect" | "symptom_check";
}

export type PrepActionId =
  | "notebook_bag"
  | "photo_and_paper"
  | "wallet_memo"
  | "tell_family"
  | "pharmacy_contact"
  | "check_portal";

export type TimingId = "today" | "this_week" | "next_day_off";
