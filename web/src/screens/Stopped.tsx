import { STOP_MESSAGE, STOP_SOURCE } from "../flow/content";

/** 中断の画面。キャラクターの演出は出さず、固定の案内だけを落ち着いて示す（ADR-0011、ADR-0020） */
export function Stopped({ onRestart }: { onRestart: () => void }) {
  const [title, ...body] = STOP_MESSAGE;
  return (
    <section className="screen stopped" aria-labelledby="stopped-title">
      <h1 id="stopped-title">{title}</h1>
      {body.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p className="small">
        出典：
        <a href={STOP_SOURCE.url} target="_blank" rel="noopener noreferrer">
          {STOP_SOURCE.label}
        </a>
        （参照日 {STOP_SOURCE.checkedOn}）
      </p>
      <button type="button" className="secondary" onClick={onRestart}>
        はじめに戻る
      </button>
    </section>
  );
}
