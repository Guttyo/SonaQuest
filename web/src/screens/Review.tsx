import { useState } from "react";
import {
  AI_FAILED_NOTE,
  EVENTS,
  HANDOVER_QUESTION,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  PREP_ACTIONS,
  RECALL_FEEDBACK,
  RECOVERY_QUESTION,
  REVIEW_EVENT_HEADING,
  REVIEW_RECOVERY_LABEL,
  TIMINGS,
  UNDETERMINED_NOTE,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
} from "../flow/content";
import { isWeak, orderPrepActions, undeterminedJudgments } from "../flow/rules";
import type { TrainingState } from "../flow/training";
import type { EventId, PrepActionId, TimingId } from "../flow/types";
import { SceneBar } from "./ListenerStage";
import { LostSources, PREP_ICON, SourceIcon, VIEWPOINT_ICON } from "./SourceIcon";
import { Exchange, ListenerLine } from "./Transcript";

interface Props {
  state: TrainingState;
  onChoose: (action: PrepActionId, timing: TimingId) => void;
}

/** 出来事の立て直しの問い（係の交代のときは説明し直しの問い）。振り返りの「出来事と立て直し」で原文を出す */
const RECOVERY_IDS: readonly string[] = [RECOVERY_QUESTION.id, HANDOVER_QUESTION.id];

/**
 * ⑥振り返り（A-05 の⑥、Issue #49）。並びは、受け止め → 手薄なところ → 出来事と立て直しの回答 →
 * 5つの観点の判定 → 回答の原文 → 今ここで確かめましょう → 次の準備。
 * 絵はすべて飾り（aria-hidden）で、意味は必ず隣の文字で示す。色だけで区別しない（✓・「（使えない）」・判定の文字）
 */
export function Review({ state, onChoose }: Props) {
  // Claude を使わない版と、途中で失敗した回は、判定をすべて「判定できませんでした」にする（ADR-0012）
  const judgments =
    state.ai === "on" && state.judgments !== null ? state.judgments : undeterminedJudgments();
  const allUndetermined = VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined");
  // 判定が無い回は「手薄なところ」を出さない（判定できていないものを手薄とは言わない）
  const weak = allUndetermined ? [] : VIEWPOINT_ORDER.filter((v) => isWeak(judgments[v]));
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  const recovery = second.filter((a) => a.kind === "answer" && RECOVERY_IDS.includes(a.questionId));
  const orderedActions = orderPrepActions(judgments).map(
    (id) => PREP_ACTIONS.find((a) => a.id === id)!,
  );

  const [action, setAction] = useState<PrepActionId | null>(null);
  const [timing, setTiming] = useState<TimingId | null>(null);

  return (
    <section className="screen" aria-labelledby="review-title">
      <SceneBar scene="review" />
      <h1 id="review-title">ふりかえり</h1>
      {/* 後半の最後の回答への受け止め（ADR-0029 の2） */}
      {state.closingAck !== null && (
        <ListenerLine>{state.closingAck}</ListenerLine>
      )}
      <p>点数や合否はありません。伝えられたこと、まだ確かめていないことを振り返りましょう。</p>

      {weak.length > 0 && (
        <>
          <h2>手薄なところ</h2>
          <ul className="weak-list">
            {weak.map((v) => (
              <li key={v} className="weak-item">
                <SourceIcon id={VIEWPOINT_ICON[v]} className="source-icon weak-icon" />
                <span className="weak-text">
                  <span className="weak-label">{VIEWPOINT_LABELS[v]}</span>
                  <span className="weak-judgment">{JUDGMENT_LABELS[judgments[v]]}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {state.event !== null && (
        <>
          <h2>{REVIEW_EVENT_HEADING}</h2>
          <div className="event event-summary">
            <EventSummary event={state.event} />
            {recovery.length > 0 && (
              <>
                <h3>{REVIEW_RECOVERY_LABEL}</h3>
                <ol className="transcript">
                  {recovery.map((a, i) => (
                    <Exchange key={`recovery-${i}`} answer={a} />
                  ))}
                </ol>
              </>
            )}
          </div>
        </>
      )}

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
      <p className="small">{JUDGMENT_NOTE}</p>

      <h2>あなたの回答（入力したまま）</h2>
      <h3>出来事の前</h3>
      <ol className="transcript">
        {first.map((a, i) => (
          <Exchange key={`first-${i}`} answer={a} />
        ))}
      </ol>
      {state.event !== null && (
        <div className="event event-divider">
          <h3>出来事</h3>
          <EventSummary event={state.event} />
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
        {/* 下の文が名前を挙げる、お薬手帳と薬の袋の絵（A-04・A-05）。飾りで、意味は文で示す */}
        <div className="recall-visual" aria-hidden="true">
          <SourceIcon id="notebook" className="source-icon recall-icon" />
          <SourceIcon id="bag" className="source-icon recall-icon" />
        </div>
        {RECALL_FEEDBACK.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {/* 準備行動といつやるかは、はじめに・③確認と同じ大きなカード（.mode-card。中は見えないラジオ） */}
      <h2>次の準備を1つ決める</h2>
      <fieldset className="mode-cards prep-cards">
        <legend>準備行動</legend>
        {orderedActions.map((a) => (
          <label key={a.id} className="mode-card">
            <input
              type="radio"
              className="mode-card-input"
              name="prep-action"
              value={a.id}
              checked={action === a.id}
              onChange={() => setAction(a.id)}
            />
            <SourceIcon id={PREP_ICON[a.id]} className="mode-card-icon" />
            <span className="mode-card-text">
              <span className="mode-card-label">{a.label}</span>
            </span>
            <span className="mode-card-mark" aria-hidden="true">
              ✓
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="mode-cards timing-cards">
        <legend>いつやるか</legend>
        {TIMINGS.map((t) => (
          <label key={t.id} className="mode-card">
            <input
              type="radio"
              className="mode-card-input"
              name="prep-timing"
              value={t.id}
              checked={timing === t.id}
              onChange={() => setTiming(t.id)}
            />
            <span className="mode-card-text">
              <span className="mode-card-label">{t.label}</span>
            </span>
            <span className="mode-card-mark" aria-hidden="true">
              ✓
            </span>
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

/** 出来事の文と、使えなくなったもの（絵と斜線と文字。LOST_BY_EVENT と PRD「出来事で使えなくなるもの」） */
function EventSummary({ event }: { event: EventId }) {
  return (
    <>
      <p className="event-text">{EVENTS[event].text}</p>
      <LostSources event={event} />
      {EVENTS[event].unavailable !== null && (
        <p>
          <span className="label">使えなくなったもの：</span>
          {EVENTS[event].unavailable}
        </p>
      )}
    </>
  );
}
