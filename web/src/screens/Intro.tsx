import { useState } from "react";
import {
  AI_CONNECTED,
  COMING_SOON_C01,
  INTRO_LEAD,
  INTRO_POINTS,
  MODE_CHOSEN_LABEL,
  MODE_LEGEND,
  MODE_OPTIONS,
  PRIVACY_EXTERNAL,
  PRIVACY_OWN,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
} from "../flow/content";
import { currentMode, type TrainingMode } from "../flow/mode";

/**
 * はじめにの画面（A-14、Issue #51）。並びは、問いかけ → 題 → 短い説明 → 必須の説明（文は変えない）→
 * 2D／3D のモード選択（3D の近くに声の送信先）→ C-01 の Coming soon（押せない文字）→ 開始。
 * 必須の説明は、開く操作なしで全文が見える位置に置く（privacy.md、A-08）
 */
export function Intro({ onStart }: { onStart: (mode: TrainingMode) => void }) {
  // 初期選択は URL の ?mode=3d を予備として読む（既定は 2D）。選んだ値はメモリにだけ持ち、保存しない（ADR-0007）
  const [mode, setMode] = useState<TrainingMode>(currentMode);
  const chosen = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0];

  return (
    <section className="screen" aria-labelledby="intro-title">
      <p className="tagline">もしもの時、自分の薬のことを伝えられますか？</p>
      <h1 id="intro-title">お薬の避難訓練</h1>
      <p>
        災害で普段の情報源が使えなくなったとき、自分の薬のことをどう伝えるかを、約5〜10分の対話で体験し、伝える準備を振り返って復習します。
      </p>
      {/* 送信の説明は実際の動作に合わせて一方だけを出す */}
      {AI_CONNECTED ? (
        <p>{INTRO_LEAD}</p>
      ) : (
        <p className="notice" role="note">
          {PROTOTYPE_LEAD}
        </p>
      )}
      <ul className="points">
        {INTRO_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <h2>会話の扱い</h2>
      <ul className="points">
        <li>{PRIVACY_OWN}</li>
        <li>{PRIVACY_EXTERNAL}</li>
      </ul>

      {/* 2D／3D のモード選択。3D は押せる選択肢、Coming soon は C-01 だけ（ADR-0036） */}
      <fieldset className="options mode-options">
        <legend>{MODE_LEGEND}</legend>
        {MODE_OPTIONS.map((option) => (
          <label key={option.id} className="option">
            <input
              type="radio"
              name="training-mode"
              value={option.id}
              checked={mode === option.id}
              onChange={() => setMode(option.id)}
              // 3D の声の送信先の説明を、3D の選択肢から参照する（ADR-0033、A-08）
              aria-describedby={option.id === "3d" ? "privacy-voice" : undefined}
            />
            <span className="option-text">
              <span className="option-label">{option.label}</span>
              <span className="option-description">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p>
        <span className="label">{MODE_CHOSEN_LABEL}</span>
        {chosen.result}
      </p>
      {/* 3D の対話モードの声の送信先は、3D を選ぶ操作の近くに置く（ADR-0033、A-08） */}
      <p id="privacy-voice">{PRIVACY_VOICE}</p>

      {/* C-01 は将来構想。ボタンにせず、押せない文字で出す（PRD「Coming soon の表示の決まり」、ADR-0031） */}
      <p className="coming-soon">{COMING_SOON_C01}</p>

      <button type="button" className="primary" onClick={() => onStart(mode)}>
        訓練をはじめる
      </button>
    </section>
  );
}
