// 最初の表示だけ読む URL の指定（Issue #101、#114）。画面の確認・撮影のため。?mode=3d と同じ扱いで、何も保存しない。
// ?view=board：ボード。?view=intake&site=A：救護所A のカルテ入力の専用画面（site が無い・違うときはボードの本部）

import { SHELTERS, type SiteId } from "./data";

export interface BoardStart {
  view: "training" | "board";
  /** 救護所のカルテ入力の専用画面で開く救護所（無ければ null） */
  intakeSite: SiteId | null;
}

/** site は「A」か「救護所A」。救護所（本部備蓄を除く）だけを受け付ける */
function siteFrom(value: string | null): SiteId | null {
  if (value === null) return null;
  const name = value.startsWith("救護所") ? value : `救護所${value.toUpperCase()}`;
  return SHELTERS.find((s) => s === name) ?? null;
}

export function boardStartFrom(search: string): BoardStart {
  const q = new URLSearchParams(search);
  const view = q.get("view");
  if (view === "board") return { view: "board", intakeSite: null };
  if (view === "intake") return { view: "board", intakeSite: siteFrom(q.get("site")) };
  return { view: "training", intakeSite: null };
}
