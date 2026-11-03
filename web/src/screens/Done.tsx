import { DONE_NOTE, PREP_ACTIONS, TIMINGS } from "../flow/content";
import type { PrepActionId, TimingId } from "../flow/types";

interface Props {
  action: PrepActionId;
  timing: TimingId;
  onRestart: () => void;
}

export function Done({ action, timing, onRestart }: Props) {
  const actionLabel = PREP_ACTIONS.find((a) => a.id === action)?.label;
  const timingLabel = TIMINGS.find((t) => t.id === timing)?.label;

  return (
    <section className="screen" aria-labelledby="done-title">
      <h1 id="done-title">訓練おつかれさまでした</h1>
      <div className="decision">
        <p>
          <span className="label">次の準備：</span>
          {actionLabel}
        </p>
        <p>
          <span className="label">いつ：</span>
          {timingLabel}
        </p>
      </div>
      <p>{DONE_NOTE}</p>
      <button type="button" className="secondary" onClick={onRestart}>
        はじめからやり直す
      </button>
    </section>
  );
}
