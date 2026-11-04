import { EVENTS, FALLBACK_NOTICE, RECALL_NOW } from "../flow/content";
import type { TrainingState } from "../flow/training";
import type { Answer } from "../flow/types";

/** これまでのやり取り。回答は入力そのものを表示する（ADR-0009） */
export function Transcript({ state }: { state: TrainingState }) {
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  if (first.length === 0) return null;

  return (
    <ol className="transcript" aria-label="これまでのやり取り">
      {first.map((a, i) => (
        <Exchange key={`first-${i}`} answer={a} notice={notice(state, a)} />
      ))}
      {/* 出来事の段階では Dialogue が出来事を大きく示すので、ここでは後半に入ってから示す */}
      {state.event !== null && state.stage.name !== "event" && (
        <li className="transcript-event">{EVENTS[state.event].text}</li>
      )}
      {second.map((a, i) => (
        <Exchange key={`second-${i}`} answer={a} notice={notice(state, a)} />
      ))}
    </ol>
  );
}

/** 固定の進行に切り替えた回答の後に、1回だけ知らせを出す（ADR-0029 の4） */
function notice(state: TrainingState, answer: Answer): string | null {
  return state.failedAfter !== null && state.answers[state.failedAfter - 1] === answer
    ? FALLBACK_NOTICE
    : null;
}

/**
 * 1回のやり取り。聞き取り係の文は、そのとき実際に出した文（固定文か、検査を通った Claude の文）。
 * 思い出せないという回答の後には、その場の固定文を添える（docs/phase2-decisions.md 項目7）
 */
export function Exchange({ answer, notice }: { answer: Answer; notice?: string | null }) {
  return (
    <li className="exchange">
      <p className="exchange-question">
        <span className="label">聞き取り係：</span>
        {answer.prompt}
      </p>
      <p className="exchange-answer">
        <span className="label">あなた：</span>
        <span className="raw">{answer.text}</span>
      </p>
      {answer.recall && (
        <p className="exchange-question">
          <span className="label">聞き取り係：</span>
          {RECALL_NOW}
        </p>
      )}
      {notice != null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </li>
  );
}
