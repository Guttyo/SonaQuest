import { useState } from "react";
import {
  AI_FAILED_NOTE,
  EVENTS,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  PREP_ACTIONS,
  RECALL_FEEDBACK,
  TIMINGS,
  UNDETERMINED_NOTE,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
} from "../flow/content";
import { isWeak, orderPrepActions, undeterminedJudgments } from "../flow/rules";
import type { TrainingState } from "../flow/training";
import type { PrepActionId, TimingId } from "../flow/types";
import { Exchange } from "./Transcript";

interface Props {
  state: TrainingState;
  onChoose: (action: PrepActionId, timing: TimingId) => void;
}

export function Review({ state, onChoose }: Props) {
  // Claude を使わない版と、途中で失敗した回は、判定をすべて「判定できませんでした」にする（ADR-0012）
  const judgments =
    state.ai === "on" && state.judgments !== null ? state.judgments : undeterminedJudgments();
  const allUndetermined = VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined");
  const weak = VIEWPOINT_ORDER.filter((v) => isWeak(judgments[v]));
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  const orderedActions = orderPrepActions(judgments).map(
    (id) => PREP_ACTIONS.find((a) => a.id === id)!,
  );

  const [action, setAction] = useState<PrepActionId | null>(null);
  const [timing, setTiming] = useState<TimingId | null>(null);

  return (
    <section className="screen" aria-labelledby="review-title">
      <h1 id="review-title">ふりかえり</h1>
      <p>点数や合否はありません。伝えられたこと、まだ確かめていないことを振り返りましょう。</p>

      <h2>5つの観点</h2>
      {allUndetermined && (
        <p className="notice">{state.ai === "off" ? UNDETERMINED_NOTE : AI_FAILED_NOTE}</p>
      )}
      <dl className="viewpoints">
        {VIEWPOINT_ORDER.map((v) => (
          <div key={v} className="viewpoint">
            <dt>{VIEWPOINT_LABELS[v]}</dt>
            <dd>{JUDGMENT_LABELS[judgments[v]]}</dd>
          </div>
        ))}
      </dl>
      {weak.length > 0 && (
        <>
          <h3>手薄なところ</h3>
          <ul>
            {weak.map((v) => (
              <li key={v}>{VIEWPOINT_LABELS[v]}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small">{JUDGMENT_NOTE}</p>

      <h2>あなたの回答（入力したまま）</h2>
      <h3>出来事の前</h3>
      <ol className="transcript">
        {first.map((a, i) => (
          <Exchange key={`first-${i}`} answer={a} />
        ))}
      </ol>
      {state.event !== null && (
        <div className="event event-summary">
          <h3>出来事</h3>
          <p>{EVENTS[state.event].text}</p>
          {EVENTS[state.event].unavailable !== null && (
            <p>
              <span className="label">使えなくなったもの：</span>
              {EVENTS[state.event].unavailable}
            </p>
          )}
        </div>
      )}
      <h3>出来事の後</h3>
      <ol className="transcript">
        {second.map((a, i) => (
          <Exchange key={`second-${i}`} answer={a} />
        ))}
      </ol>

      {/* 思い出せなかったことは、候補を出さず、実物の確認と訓練の繰り返しに向ける（ADR-0022） */}
      <h2>今ここで確かめましょう</h2>
      <div className="notice recall">
        {RECALL_FEEDBACK.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <h2>次の準備を1つ決める</h2>
      <fieldset className="choices">
        <legend>準備行動</legend>
        {orderedActions.map((a) => (
          <label key={a.id} className="choice">
            <input
              type="radio"
              name="prep-action"
              value={a.id}
              checked={action === a.id}
              onChange={() => setAction(a.id)}
            />
            <span>{a.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choices">
        <legend>いつやるか</legend>
        {TIMINGS.map((t) => (
          <label key={t.id} className="choice">
            <input
              type="radio"
              name="prep-timing"
              value={t.id}
              checked={timing === t.id}
              onChange={() => setTiming(t.id)}
            />
            <span>{t.label}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="primary"
        disabled={action === null || timing === null}
        onClick={() => {
          if (action !== null && timing !== null) onChoose(action, timing);
        }}
      >
        これに決める
      </button>
    </section>
  );
}
