import { useState } from "react";
import {
  AI_FAILED_NOTE,
  DETAILS_SUMMARY,
  EVENTS,
  HANDOVER_QUESTION,
  INTERRUPTION_NOTE,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  NEXT_STEPS_HEADING,
  NEXT_STEP_FIRST_TAG,
  NEXT_STEP_LABEL,
  NEXT_STEP_PICK,
  NEXT_STEP_PICKED,
  NO_WEAK_POINTS_NOTE,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  RECALL_FEEDBACK,
  RECOVERY_QUESTION,
  REVIEW_EVENT_HEADING,
  REVIEW_RECOVERY_LABEL,
  REVIEW_SOURCES_HEADING,
  REVIEW_SOURCES_NOTE,
  STRONG_POINTS_LABEL,
  TIMINGS,
  UNDETERMINED_NOTE,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
  VIEWPOINT_SHORT_LABELS,
  WEAK_POINT_LINES,
} from "../flow/content";
import {
  nextSteps,
  orderPrepActions,
  undeterminedJudgments,
  verifiedSourcesFor,
  type PublicSource,
} from "../flow/rules";
import type { TrainingState } from "../flow/training";
import type { EventId, PrepActionId, TimingId } from "../flow/types";
import { SpeakerControls } from "../voice/SpeakerControls";
import { useSpeakWhenChanged, useSpeaker } from "../voice/hooks";
import { reviewSpeech, speechKey } from "../voice/speech";
import { SceneBar } from "./ListenerStage";
import { RecordCard } from "./RecordCard";
import { LostSources, PREP_ICON, SourceIcon, VIEWPOINT_ICON } from "./SourceIcon";
import { Exchange, ListenerLine } from "./Transcript";

interface Props {
  state: TrainingState;
  onChoose: (action: PrepActionId, timing: TimingId) => void;
  /** 準備行動ごとの確認済みの公的資料（A-06）。試験で差し替えるときだけ渡す */
  sourcesFor?: (action: PrepActionId) => PublicSource[];
}

/** 出来事の立て直しの問い（係の交代のときは説明し直しの問い）。振り返りの「出来事と立て直し」で原文を出す */
const RECOVERY_IDS: readonly string[] = [RECOVERY_QUESTION.id, HANDOVER_QUESTION.id];

/** 準備行動のカードの置き場所。「次の一手」のボタンからここへ送る */
const PREP_CARDS_ID = "prep-cards";

/**
 * ⑥振り返り（A-05 の⑥、Issue #49、ADR-0054）。
 * 先に見せるのは「まだ弱いところ → 次の一手」だけ：手薄な観点ごとに、短い名前・判定・一言・準備行動1つ。
 * 「これを準備する」で準備行動のカードが選ばれ、いつやるかを選んで決める。
 * 出来事と立て直し、5つの観点の一覧、回答の原文、記録の形は「くわしく見る」（details）に畳む。消さない。
 * 文はすべて固定文で、利用者の回答は原文のまま出すだけ（要約・言い換えなし）。
 * 絵はすべて飾り（aria-hidden）で、意味は必ず隣の文字で示す。色だけで区別しない（✓・「（使えない）」・判定の文字）
 */
export function Review({ state, onChoose, sourcesFor = verifiedSourcesFor }: Props) {
  // Claude を使わない版と、途中で失敗した回は、判定をすべて「判定できませんでした」にする（ADR-0012）
  const judgments =
    state.ai === "on" && state.judgments !== null ? state.judgments : undeterminedJudgments();
  const allUndetermined = VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined");
  // 判定が無い回は「まだ弱いところ」を出さない（判定できていないものを手薄とは言わない）
  const steps = allUndetermined ? [] : nextSteps(judgments);
  const strong = allUndetermined ? [] : VIEWPOINT_ORDER.filter((v) => judgments[v] === "confirmed");
  const recommended = new Set(steps.map((s) => s.action));
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  const recovery = second.filter((a) => a.kind === "answer" && RECOVERY_IDS.includes(a.questionId));
  const orderedActions = orderPrepActions(judgments).map(
    (id) => PREP_ACTIONS.find((a) => a.id === id)!,
  );
  const labelOf = (id: PrepActionId) => PREP_ACTIONS.find((a) => a.id === id)!.label;

  const [action, setAction] = useState<PrepActionId | null>(null);
  const [timing, setTiming] = useState<TimingId | null>(null);

  // 3D の対話モードでは、先頭のまとめ（固定文だけ。回答は読まない）を読み上げる（ADR-0033、ADR-0054）
  const voiceOn = state.mode === "3d";
  const { speaker, snapshot: speech } = useSpeaker(voiceOn, state.session);
  const spoken = voiceOn ? reviewSpeech(state) : null;
  useSpeakWhenChanged(speaker, spoken, spoken === null ? null : speechKey(state, spoken));

  /** 「これを準備する」：準備行動を選び、カードの場所へ送る（キーボードの焦点は動かさない） */
  const pick = (id: PrepActionId) => {
    setAction(id);
    if (typeof document !== "undefined") {
      document.getElementById(PREP_CARDS_ID)?.scrollIntoView({ block: "start" });
    }
  };

  return (
    <section className="screen" aria-labelledby="review-title">
      <SceneBar scene="review" />
      <h1 id="review-title">ふりかえり</h1>
      {/* 後半の最後の回答への受け止め（ADR-0029 の2） */}
      {state.closingAck !== null && (
        <ListenerLine>{state.closingAck}</ListenerLine>
      )}
      {voiceOn && (
        <SpeakerControls
          snapshot={speech}
          onStop={() => speaker?.stop()}
          onReplay={() => speaker?.replay()}
        />
      )}

      {steps.length > 0 && (
        <>
          <h2>{NEXT_STEPS_HEADING}</h2>
          <ol className="next-step-list">
            {/* 最初の1枚だけ一言と大きなボタン。2枚目からは短い行（読み上げも最初の一言だけ。reviewSpeech） */}
            {steps.map((s, i) => (
              <li key={s.viewpoint} className={i === 0 ? "next-step" : "next-step next-step-compact"}>
                <div className="next-step-head">
                  <SourceIcon id={VIEWPOINT_ICON[s.viewpoint]} className="source-icon next-step-icon" />
                  <span className="next-step-label">{VIEWPOINT_SHORT_LABELS[s.viewpoint]}</span>
                  <span className="next-step-judgment">{JUDGMENT_LABELS[s.judgment]}</span>
                  {i === 0 && steps.length > 1 && (
                    <span className="next-step-tag">{NEXT_STEP_FIRST_TAG}</span>
                  )}
                </div>
                {i === 0 && (
                  <p className="next-step-why">
                    {WEAK_POINT_LINES[s.viewpoint][s.judgment as "not_mentioned" | "aware_unconfirmed"]}
                  </p>
                )}
                <div className="next-step-action">
                  <span className="next-step-action-text">
                    <span className="label">{NEXT_STEP_LABEL}：</span>
                    {labelOf(s.action)}
                  </span>
                  <button
                    type="button"
                    className="next-step-pick"
                    aria-label={`${NEXT_STEP_PICK}：${labelOf(s.action)}`}
                    aria-pressed={action === s.action}
                    onClick={() => pick(s.action)}
                  >
                    {action === s.action ? `✓ ${NEXT_STEP_PICKED}` : NEXT_STEP_PICK}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {!allUndetermined && steps.length === 0 && <p className="notice">{NO_WEAK_POINTS_NOTE}</p>}
      {/* 確認できた観点は、弱い観点の有無にかかわらず1行で示す（全部確認できた回にも出す。PR #138 のレビュー） */}
      {strong.length > 0 && (
        <p className="strong-points">
          <span className="label">{STRONG_POINTS_LABEL}：</span>
          {strong.map((v) => (
            <span key={v} className="strong-point">
              <span aria-hidden="true">✓ </span>
              {VIEWPOINT_SHORT_LABELS[v]}
            </span>
          ))}
        </p>
      )}
      {allUndetermined && (
        <p className="notice">{state.ai === "off" ? UNDETERMINED_NOTE : AI_FAILED_NOTE}</p>
      )}
      {!allUndetermined && <p className="small">{JUDGMENT_NOTE}</p>}

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
        {/* 中断すると体調を崩しやすい薬の名前も言えるように（Issue #94）。薬の種類は挙げず、飲む・やめるの助言はしない */}
        <p className="interruption-note">{INTERRUPTION_NOTE}</p>
      </div>

      {/* 準備行動といつやるかは、はじめに・③確認と同じ大きなカード（.mode-card。中は見えないラジオ） */}
      <h2 id={PREP_CARDS_ID}>次の準備を1つ決める</h2>
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
              {recommended.has(a.id) && (
                <span className="mode-card-badge">{NEXT_STEP_LABEL}</span>
              )}
              <span className="mode-card-label">{a.label}</span>
              <span className="mode-card-description">{PREP_ACTION_EFFECTS[a.id]}</span>
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

      <PublicSources actions={orderedActions} sourcesFor={sourcesFor} />

      {/* ここから下は畳んでおく。出来事と立て直し、5つの観点、回答の原文、記録の形（消さない。PRD ⑥） */}
      <details className="review-details">
        <summary>{DETAILS_SUMMARY}</summary>

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
        <dl className="viewpoints">
          {VIEWPOINT_ORDER.map((v) => (
            <div key={v} className="viewpoint">
              <dt>{VIEWPOINT_LABELS[v]}</dt>
              <dd>{JUDGMENT_LABELS[judgments[v]]}</dd>
            </div>
          ))}
        </dl>

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

        {/* 救護所に渡す記録の形（Issue #97）。回答を原文のまま項目に並べるだけで、要約しない */}
        <RecordCard answers={state.answers} />
      </details>
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

/**
 * 準備行動ごとの、確認済みの公的資料（A-06、ADR-0044）。準備行動の名前の下に、発行元・題・見出し・確認日を出す。
 * リンクは準備行動のカード（label）の外に置く（カードの中だと、押したときにラジオも切り替わるため）。
 * 確認済みの資料が1件も無いときは、見出しも含めて何も出さない。資料の説明は固定文だけで、Claude に作らせない
 */
function PublicSources({
  actions,
  sourcesFor,
}: {
  actions: readonly { id: PrepActionId; label: string }[];
  sourcesFor: (action: PrepActionId) => PublicSource[];
}) {
  const groups = actions
    .map((a) => ({ action: a, sources: sourcesFor(a.id) }))
    .filter((g) => g.sources.length > 0);
  if (groups.length === 0) return null;
  return (
    <>
      <h2>{REVIEW_SOURCES_HEADING}</h2>
      <p className="small">{REVIEW_SOURCES_NOTE}</p>
      {groups.map(({ action, sources }) => (
        <div key={action.id} className="public-sources">
          <h3>{action.label}</h3>
          <ul className="public-source-list">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.publisher}「{s.title}」
                </a>
                <span className="small public-source-meta">
                  （{s.section}。確認日 {s.checkedOn}）
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
