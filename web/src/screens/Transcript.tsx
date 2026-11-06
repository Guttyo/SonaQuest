import type { ReactNode } from "react";
import { Puppet2DFace } from "./Puppet2D";
import { EVENTS, FALLBACK_NOTICE, RECALL_NOW, listenerName } from "../flow/content";
import type { TrainingState } from "../flow/training";
import type { Answer } from "../flow/types";

/** これまでのやり取り。回答は入力そのものを表示する（ADR-0009） */
export function Transcript({ state }: { state: TrainingState }) {
  const first = state.answers.filter((a) => a.half === "first");
  const second = state.answers.filter((a) => a.half === "second");
  if (first.length === 0) return null;
  // 係の交代の後（後半）は、話し相手をクエとして出す（Issue #164）
  const relief = state.event === "handover";

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
        <Exchange key={`second-${i}`} answer={a} notice={notice(state, a)} relief={relief} />
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
 * 1回のやり取り。話し相手（ソナ、交代の後はクエ）の文は、そのとき実際に出した文（固定文か、検査を通った Claude の文）。
 * 思い出せないという回答の後には、その場の固定文を添える（docs/phase2-decisions.md 項目7）
 */
export function Exchange({
  answer,
  notice,
  relief = false,
}: {
  answer: Answer;
  notice?: string | null;
  /** 係の交代の後のやり取りか。名前をクエにする */
  relief?: boolean;
}) {
  return (
    <li className="exchange">
      <ListenerLine relief={relief}>{answer.prompt}</ListenerLine>
      <div className="exchange-row exchange-row-user">
        <p className="exchange-answer">
          <span className="visually-hidden">あなた：</span>
          <span className="raw">{answer.text}</span>
        </p>
        <UserAvatar />
      </div>
      {answer.recall && <ListenerLine relief={relief}>{RECALL_NOW}</ListenerLine>}
      {notice != null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </li>
  );
}

/** 話し相手の吹き出し。毎回、パペットの 2D 版の小さな顔（Issue #47、ADR-0038）を左に添える。名前は係の交代の後だけクエ（Issue #164） */
export function ListenerLine({ children, id, relief = false }: { children: ReactNode; id?: string; relief?: boolean }) {
  return (
    <div className="exchange-row">
      <Puppet2DFace />
      <p className="exchange-question" id={id}>
        <span className="bubble-name">{listenerName(relief)}</span>
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
