import type { ReactNode } from "react";
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
      <ListenerLine>{answer.prompt}</ListenerLine>
      <div className="exchange-row exchange-row-user">
        <p className="exchange-answer">
          <span className="visually-hidden">あなた：</span>
          <span className="raw">{answer.text}</span>
        </p>
        <UserAvatar />
      </div>
      {answer.recall && <ListenerLine>{RECALL_NOW}</ListenerLine>}
      {notice != null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </li>
  );
}

/** 聞き取り係の吹き出し。毎回、光の存在（ADR-0020）を左に添える */
export function ListenerLine({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div className="exchange-row">
      <span className="listener-light listener-light-small" aria-hidden="true" />
      <p className="exchange-question" id={id}>
        <span className="bubble-name">聞き取り係</span>
        {children}
      </p>
    </div>
  );
}

/**
 * 利用者のアイコン。実在の人の写真は使わず、人の形を描いた飾り（モックアップ）。
 * 画面の読み上げでは読まない
 */
export function UserAvatar() {
  return (
    <svg className="user-avatar" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="20" fill="#cfe9dc" />
      <circle cx="20" cy="15" r="7" fill="#fffaf0" />
      <path d="M7 34c2-7 7-10 13-10s11 3 13 10" fill="#fffaf0" />
    </svg>
  );
}
