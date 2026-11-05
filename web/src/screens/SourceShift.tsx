import {
  SHIFT_CAPTION,
  SHIFT_CHOSEN_STATE,
  SHIFT_KEPT_STATE,
  SHIFT_LOST_PREFIX,
  SHIFT_LOST_STATE,
  SHIFT_NONE_LOST,
  SOURCE_OPTIONS,
} from "../flow/content";
import type { EventId } from "../flow/types";
import { LOST_BY_EVENT, SourceIcon, sourceLabel, type DrawnSource } from "./SourceIcon";

/** ③確認の選択肢のうち、絵のある情報源（並びは ③確認と同じ） */
export const SHIFT_SOURCES: readonly DrawnSource[] = SOURCE_OPTIONS.flatMap((o) =>
  o.id === "none" ? [] : [o.id],
);

/**
 * 出来事のあとの情報源の並び（B-02、Issue #55）。後半（それでも伝えられる？）の最初の回答を受け取った後から、係の横に出す（出す時期は Dialogue.tsx の showsSourceShift）。
 * ③確認の5つの情報源を並べ、出来事で使えなくなったものに斜線を引き、残りはそのまま見せる。
 * 何が使えなくなったかは PRD「出来事で使えなくなるもの」の表（LOST_BY_EVENT）だけで決める。
 * 利用者の回答（原文）も Claude の判断も使わず、数（残りいくつ）も出さない（「評価の方針」）。
 * 絵は aria-hidden で、意味は文字で示す（見える文は「使えない：…」、各項目は読み上げ用の文）
 */
export function SourceShift({ event, chosen }: { event: EventId; chosen: DrawnSource | null }) {
  const lost = LOST_BY_EVENT[event];
  const lostLabels = SHIFT_SOURCES.filter((s) => lost.includes(s)).map(sourceLabel);
  return (
    <div className="source-shift" role="group" aria-label={SHIFT_CAPTION}>
      <ul className="source-shift-list">
        {SHIFT_SOURCES.map((s) => {
          const isLost = lost.includes(s);
          const isChosen = s === chosen;
          const className = [
            "source-shift-item",
            isLost ? "source-shift-lost" : "source-shift-kept",
            isChosen ? "source-shift-chosen" : "",
          ]
            .filter((c) => c !== "")
            .join(" ");
          const states = [isChosen ? SHIFT_CHOSEN_STATE : null, isLost ? SHIFT_LOST_STATE : SHIFT_KEPT_STATE]
            .filter((t) => t !== null)
            .join("・");
          return (
            <li key={s} className={className}>
              <span className="source-shift-icon" aria-hidden="true">
                <SourceIcon id={s} />
                {isLost && <span className="source-shift-slash" />}
              </span>
              <span className="visually-hidden">
                {sourceLabel(s)}：{states}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="source-shift-text" aria-hidden="true">
        {lostLabels.length > 0 ? `${SHIFT_LOST_PREFIX}${lostLabels.join("、")}` : SHIFT_NONE_LOST}
      </p>
    </div>
  );
}
