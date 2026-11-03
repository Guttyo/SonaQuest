import { EVENTS } from "../flow/content";
import { firstHalfQuestions, secondHalfQuestions } from "../flow/rules";
import type { TrainingState } from "../flow/training";
import type { Answer } from "../flow/types";

/** これまでのやり取り。回答は入力そのものを表示する（ADR-0009） */
export function Transcript({ state }: { state: TrainingState }) {
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  if (first.length === 0) return null;

  return (
    <ol className="transcript" aria-label="これまでのやり取り">
      {first.map((a) => (
        <Exchange key={a.questionId} answer={a} question={questionText(state, a)} />
      ))}
      {/* 出来事の段階では Dialogue が出来事を大きく示すので、ここでは後半に入ってから示す */}
      {state.event !== null && state.stage.name !== "event" && (
        <li className="transcript-event">{EVENTS[state.event].text}</li>
      )}
      {second.map((a) => (
        <Exchange key={a.questionId} answer={a} question={questionText(state, a)} />
      ))}
    </ol>
  );
}

export function questionText(state: TrainingState, answer: Answer): string {
  const questions =
    answer.half === "first"
      ? firstHalfQuestions()
      : secondHalfQuestions(state.event ?? "handover");
  return questions.find((q) => q.id === answer.questionId)?.text ?? "";
}

export function Exchange({ answer, question }: { answer: Answer; question: string }) {
  return (
    <li className="exchange">
      <p className="exchange-question">
        <span className="label">聞き取り係：</span>
        {question}
      </p>
      <p className="exchange-answer">
        <span className="label">あなた：</span>
        <span className="raw">{answer.text}</span>
      </p>
    </li>
  );
}
