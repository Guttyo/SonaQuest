import { useState, type Dispatch } from "react";
import {
  ANSWER_PLACEHOLDER,
  CONFIRM_PROMPT,
  EVENTS,
  SCENE_INTRO,
  SKIP_CONFIRM_LABEL,
  SOURCE_OPTIONS,
} from "../flow/content";
import { MAX_ANSWERS, MAX_ANSWER_LENGTH, isAcceptableAnswer } from "../flow/rules";
import {
  currentQuestion,
  type TrainingAction,
  type TrainingState,
} from "../flow/training";
import type { SourceId } from "../flow/types";
import { Listener } from "./Listener";
import { Transcript } from "./Transcript";

interface Props {
  state: TrainingState;
  dispatch: Dispatch<TrainingAction>;
}

export function Dialogue({ state, dispatch }: Props) {
  const { stage } = state;
  const question = currentQuestion(state);

  return (
    <section className="screen" aria-label="対話">
      <p className="scene">{SCENE_INTRO}</p>
      <Transcript state={state} />

      {question !== null && (
        <AnswerForm
          // 質問が変わったら下書きを消す
          key={question.id}
          questionText={question.text}
          answered={state.answers.length}
          onSubmit={(text) => dispatch({ type: "answer", text })}
        />
      )}

      {stage.name === "confirm" && (
        <ConfirmSource
          onConfirm={(source) => dispatch({ type: "confirm", source })}
        />
      )}

      {stage.name === "event" && state.event !== null && (
        <div className="event" role="alert" data-scroll-target tabIndex={-1}>
          <h2>想定外の出来事</h2>
          <p className="event-text">{EVENTS[state.event].text}</p>
          {EVENTS[state.event].unavailable !== null && (
            <p>
              <span className="label">使えなくなったもの：</span>
              {EVENTS[state.event].unavailable}
            </p>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => dispatch({ type: "continue_after_event" })}
          >
            続ける
          </button>
        </div>
      )}
    </section>
  );
}

function AnswerForm({
  questionText,
  answered,
  onSubmit,
}: {
  questionText: string;
  answered: number;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const canSubmit = isAcceptableAnswer(draft);

  return (
    <form
      className="answer-form"
      data-scroll-target
      tabIndex={-1}
      // 焦点が移ったときに、新しい質問文が読み上げられるように
      aria-labelledby="current-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(draft);
      }}
    >
      <Listener>
        <p id="current-question">{questionText}</p>
      </Listener>
      <label className="field-label" htmlFor="answer">
        あなたの回答
      </label>
      <textarea
        id="answer"
        aria-describedby="current-question answer-count"
        value={draft}
        maxLength={MAX_ANSWER_LENGTH}
        rows={4}
        placeholder={ANSWER_PLACEHOLDER}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="form-row">
        <span id="answer-count" className="count">
          回答 {answered + 1} / 最大 {MAX_ANSWERS}
        </span>
        <button type="submit" className="primary" disabled={!canSubmit}>
          答える
        </button>
      </div>
    </form>
  );
}

function ConfirmSource({
  onConfirm,
}: {
  onConfirm: (source: SourceId | null) => void;
}) {
  const [selected, setSelected] = useState<SourceId | null>(null);

  return (
    <div
      className="confirm"
      data-scroll-target
      tabIndex={-1}
      role="group"
      aria-labelledby="confirm-prompt"
    >
      <Listener>
        <p id="confirm-prompt">{CONFIRM_PROMPT}</p>
      </Listener>
      <fieldset className="options" aria-labelledby="confirm-prompt">
        {SOURCE_OPTIONS.map((option) => (
          <label key={option.id} className="option">
            <input
              type="radio"
              name="main-source"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
            />
            <span className="option-text">
              <span className="option-label">{option.label}</span>
              {option.description !== "" && (
                <span className="option-description">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="primary"
        disabled={selected === null}
        onClick={() => onConfirm(selected)}
      >
        これで進む
      </button>
      <button type="button" className="secondary" onClick={() => onConfirm(null)}>
        {SKIP_CONFIRM_LABEL}
      </button>
    </div>
  );
}
