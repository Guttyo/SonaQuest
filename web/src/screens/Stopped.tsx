import {
  SELF_HARM_MESSAGE,
  SELF_HARM_SOURCE,
  STOP_MESSAGE,
  STOP_SOURCE,
} from "../flow/content";
import type { StopReason } from "../flow/emergency";

/** 中断の画面。キャラクターの演出は出さず、固定の案内だけを落ち着いて示す（ADR-0011、ADR-0020） */
export function Stopped({
  reason,
  onRestart,
}: {
  reason: StopReason;
  onRestart: () => void;
}) {
  // 自傷のほのめかしでは、自傷用の案内を出す（ADR-0011）
  const [message, source] =
    reason === "self_harm"
      ? [SELF_HARM_MESSAGE, SELF_HARM_SOURCE]
      : [STOP_MESSAGE, STOP_SOURCE];
  const [title, ...body] = message;
  return (
    <section className="screen stopped" aria-labelledby="stopped-title">
      <h1 id="stopped-title">{title}</h1>
      {body.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p className="small">
        出典：
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.label}
        </a>
        （参照日 {source.checkedOn}）
      </p>
      <button type="button" className="secondary" onClick={onRestart}>
        はじめに戻る
      </button>
    </section>
  );
}
