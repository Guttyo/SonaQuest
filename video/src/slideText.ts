// Remotion で描く画面の文（Issue #262）。docs/demo-script.md の13場面の台本と合わせる。
// 薬の名前・量・病名・助言は書かない（.claude/rules/safety.md）。

/** 1番：冒頭の問い（ナレーションと同じ文を2行に分けて大きく出す） */
export const QUESTION_LINES = ["お薬手帳も、スマホも使えない。", "そのとき、自分の薬のことを、どう伝えますか。"] as const;

/**
 * 2番：震度5弱以上の地震の回数と出典。
 * 21回＝2026-01-06〜10-29 に最大震度5弱以上を観測した地震を1つずつ数えた数（docs/demo-script.md の 2026-11-05 の案と決定の行）。
 * 撮る日までの地震を数え直すかは docs/demo-script.md のマーカー（2番の回数）。数え直したらここも直す。
 */
export const QUAKE_COUNT = {
  value: "21回",
  label: "2026年に起きた、震度5弱以上の地震",
  range: "観測日：2026年1月6日〜10月29日（地震ごとに数えた）",
  source: "出典：気象庁 震度データベース検索（確認日 2026-11-05）",
} as const;

/**
 * 5番：スマホの横の空きに出す、訓練の文が画面に出るまでの経路（提案 B、Issue #258）。
 * 実装：web/worker/claude.ts（MODEL）→ web/worker/checks.ts → web/worker/audit.ts（AUDIT_MODEL）。
 * 訓練の文に限る。掲示板の文は監査役を通らない。立て直しの問いなどの固定文は Claude が作らない。
 */
export const PIPELINE = {
  title: "訓練の文が画面に出るまで",
  steps: [
    { title: "Claude Opus 5.5", sub: "質問の言い回しを作る" },
    { title: "Workers の検査", sub: "決まりで確かめる（コード）" },
    { title: "Claude Haiku 5.5", sub: "監査役が確かめる" },
    { title: "画面へ", sub: "止めたら固定文に戻す" },
  ],
  note: "利用者の回答は監査役に送らない",
} as const;

/** 13番：締めの文（2026-11-08 オーナー決定。2026-11-05 の「平時の練習が、災害時の備えになる。」から変更） */
export const CLOSING_LINE = "普段からの練習が、いざというときの備えになる。";
