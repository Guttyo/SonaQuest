import { useState } from "react";
import {
  COMING_SOON_C01,
  MODE_CHOSEN_LABEL,
  MODE_LEGEND,
  MODE_OPTIONS,
} from "../flow/content";
import { currentMode, type TrainingMode } from "../flow/mode";
import { IntroNotes } from "./IntroNotes";
import { ModeIcon } from "./ModeIcon";

/**
 * はじめにの画面（A-14、Issue #51）。問いかけ → 題 → 短い説明 → 2D／3D のカード（大きくタップできる。
 * 中はラジオ）→ C-01 の鍵付きの押せないカード → 必ず見せる説明（IntroNotes。置き場所はオーナーの答え待ち）→ 開始。
 * 色はクリーム・ミント・オレンジのまま（ADR-0020）
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

      {/* 2D／3D のモード選択。カード全体がタップの的で、中のラジオで選ぶ（キーボードは Tab と矢印）。3D は押せる選択肢（ADR-0036） */}
      <fieldset className="mode-cards">
        <legend>{MODE_LEGEND}</legend>
        {MODE_OPTIONS.map((option) => (
          <label key={option.id} className="mode-card">
            <input
              type="radio"
              className="mode-card-input"
              name="training-mode"
              value={option.id}
              checked={mode === option.id}
              onChange={() => setMode(option.id)}
              // 3D の声の送信先の説明を、3D の選択肢から参照する（ADR-0033、A-08）
              aria-describedby={option.id === "3d" ? "privacy-voice" : undefined}
            />
            <ModeIcon id={option.id} />
            <span className="mode-card-text">
              <span className="mode-card-label">{option.label}</span>
              <span className="mode-card-description">{option.description}</span>
            </span>
            {/* 選んでいる印。色だけに頼らない */}
            <span className="mode-card-mark" aria-hidden="true">
              ✓
            </span>
          </label>
        ))}
      </fieldset>
      <p>
        <span className="label">{MODE_CHOSEN_LABEL}</span>
        {chosen.result}
      </p>

      {/* C-01 は将来構想。鍵の印付きの押せないカード。ボタン・リンクにせず、焦点も当たらない（PRD「Coming soon の表示の決まり」、ADR-0031） */}
      <p className="mode-card locked" aria-disabled="true">
        <ModeIcon id="locked" />
        <span className="mode-card-text">
          <span className="mode-card-label">{COMING_SOON_C01}</span>
        </span>
      </p>

      <IntroNotes />

      <button type="button" className="primary" onClick={() => onStart(mode)}>
        訓練をはじめる
      </button>
    </section>
  );
}
