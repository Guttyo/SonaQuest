import {
  DONE_NOTE,
  JUDGMENT_LABELS,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  TIMINGS,
  VIEWPOINT_SHORT_LABELS,
} from "../flow/content";
import { nextSteps } from "../flow/rules";
import type { Judgments, PrepActionId, TimingId } from "../flow/types";
import { PREP_ICON, SourceIcon } from "./SourceIcon";

interface Props {
  action: PrepActionId;
  timing: TimingId;
  /** 振り返りと同じ判定（判定が無い回は null）。終わりの画面で「まだ弱いところ」を1行で繰り返すために使う */
  judgments: Judgments | null;
  onRestart: () => void;
}

/**
 * 終わりの画面（ADR-0051）。持ち帰るのは3つだけ：決めた準備、いつやるか、まだ弱いところ。
 * 文はすべて固定文で、利用者の回答は引かない。保存はしない（DONE_NOTE）
 */
export function Done({ action, timing, judgments, onRestart }: Props) {
  const actionLabel = PREP_ACTIONS.find((a) => a.id === action)?.label;
  const timingLabel = TIMINGS.find((t) => t.id === timing)?.label;
  const steps = judgments === null ? [] : nextSteps(judgments);

  return (
    <section className="screen" aria-labelledby="done-title">
      <h1 id="done-title">訓練おつかれさまでした</h1>
      <div className="decision">
        <div className="decision-action">
          <SourceIcon id={PREP_ICON[action]} className="decision-icon" />
          <div>
            <p>
              <span className="label">次の準備：</span>
              {actionLabel}
            </p>
            <p className="small">{PREP_ACTION_EFFECTS[action]}</p>
          </div>
        </div>
        <p>
          <span className="label">いつ：</span>
          {timingLabel}
        </p>
      </div>
      {steps.length > 0 && (
        <p className="done-weak">
          <span className="label">まだ弱いところ：</span>
          {steps.map((s, i) => (
            <span key={s.viewpoint}>
              {i > 0 && "、"}
              {VIEWPOINT_SHORT_LABELS[s.viewpoint]}（{JUDGMENT_LABELS[s.judgment]}）
            </span>
          ))}
        </p>
      )}
      <p>{DONE_NOTE}</p>
      <button type="button" className="secondary" onClick={onRestart}>
        はじめからやり直す
      </button>
    </section>
  );
}
