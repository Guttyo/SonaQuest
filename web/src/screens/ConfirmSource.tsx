import { useState } from "react";
import { CONFIRM_PROMPT, SKIP_CONFIRM_LABEL, SOURCE_OPTIONS } from "../flow/content";
import type { SourceId } from "../flow/types";
import { SourceIcon } from "./SourceIcon";
import { ListenerLine } from "./Transcript";

/**
 * ③確認：いちばん頼りにしている情報源を、本人がタップで選ぶ（A-04・A-05 の③、Issue #48・#49）。
 * はじめにのモード選択と同じ大きなカード（.mode-card）。カード全体がタップの的で、中は見えないラジオ
 * （キーボードは Tab と矢印、Space）。絵は飾りで、意味は必ずカードの文字で示す。選んだカードには✓を出し、色だけに頼らない。
 * 文は SOURCE_OPTIONS のまま（web/worker/prompt.ts でも使う）
 */
export function ConfirmSource({
  ack,
  initial,
  onConfirm,
}: {
  /** 前半の最後の回答への受け止め（ADR-0029 の2） */
  ack: string | null;
  /** 初期選択の候補（Claude）。本人がタップで確かめてから進む（ADR-0016、項目6） */
  initial: SourceId | null;
  onConfirm: (source: SourceId | null) => void;
}) {
  const [selected, setSelected] = useState<SourceId | null>(initial);

  return (
    <div
      className="confirm"
      data-scroll-target
      tabIndex={-1}
      role="group"
      aria-labelledby="confirm-prompt"
    >
      {ack !== null && <ListenerLine>{ack}</ListenerLine>}
      <ListenerLine id="confirm-prompt">{CONFIRM_PROMPT}</ListenerLine>
      <fieldset className="mode-cards source-cards" aria-labelledby="confirm-prompt">
        {SOURCE_OPTIONS.map((option) => (
          <label key={option.id} className="mode-card">
            <input
              type="radio"
              className="mode-card-input"
              name="main-source"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
            />
            {/* 「どれにも当てはまらない」には絵を付けない。文字の位置をほかのカードとそろえる */}
            {option.id === "none" ? (
              <span className="mode-card-icon" aria-hidden="true" />
            ) : (
              <SourceIcon id={option.id} className="mode-card-icon" />
            )}
            <span className="mode-card-text">
              <span className="mode-card-label">{option.label}</span>
              {option.description !== "" && (
                <span className="mode-card-description">{option.description}</span>
              )}
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
