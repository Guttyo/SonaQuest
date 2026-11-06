import { useEffect, useRef, useState } from "react";
import {
  BACK_LABEL,
  COMING_SOON_C01,
  MODE_CHOSEN_LABEL,
  MODE_LEGEND,
  MODE_OPTIONS,
  NEXT_LABEL,
  NOTES_TITLE,
} from "../flow/content";
import type { TrainingMode } from "../flow/mode";
import { BOARD_ENTRY_LABEL, COMING_SOON_INTAKE } from "../board/text";
import { IntroNotes } from "./IntroNotes";
import { ModeIcon } from "./ModeIcon";

/** はじめにの2画面。choose：カードで答え方を選ぶ。notes：はじめる前に必ず見せる説明の全文と開始 */
export type IntroView = "choose" | "notes";

interface Props {
  onStart: (mode: TrainingMode) => void;
  /** 地域本部のボード（試作。Issue #97）を開く。訓練の流れの外の画面。省くと押しても何もしない（試験・見本） */
  onOpenBoard?: () => void;
  /** 試験・見本のため。省くと1画面目（choose） */
  initialView?: IntroView;
  /**
   * 1画面目の初期選択。省くと 2D。App が currentIntroMode で決めて渡す
   * （最初の表示だけ URL の ?mode=3d を読み、はじめに戻った後は 2D。Issue #83、ADR-0036 の追記3）
   */
  initialMode?: TrainingMode;
}

/**
 * はじめにの画面（A-14、Issue #51。2026-11-05 オーナー決定「2画面目に全文」、ADR-0036）。
 * 1画面目：問いかけ → 題 → 2D／3D の大きなカード（中はラジオ）→ C-01 の鍵付きの押せないカード → 次へ。長い文は置かない。
 * 2画面目「はじめる前に」：選んだ答え方 → 必ず見せる説明の全文（文は変えない。3D なら声の送信先を先頭に）→ 訓練をはじめる／選び直す。
 * 「訓練をはじめる」は2画面目にだけあり、1画面目から訓練は始められない。色はクリーム・ミント・オレンジのまま（ADR-0020）
 */
export function Intro({ onStart, onOpenBoard, initialView = "choose", initialMode }: Props) {
  // 選んだ値と画面はメモリにだけ持ち、保存しない（ADR-0007）。やり直すと部品ごと作り直され、1画面目の既定の 2D に戻る。
  // 「答え方を選び直す」は画面だけを戻すので、選んだ値はそのまま
  const [mode, setMode] = useState<TrainingMode>(initialMode ?? "2d");
  const [view, setView] = useState<IntroView>(initialView);
  const chosen = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0];

  // 画面が変わったら、題へ焦点を移して上から見せる（押したボタンが消えて焦点が失われないように）。最初の表示は App が焦点を扱う
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shownView = useRef(view);
  useEffect(() => {
    if (shownView.current === view) return;
    shownView.current = view;
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [view]);

  if (view === "notes") {
    return (
      <section className="screen" aria-labelledby="notes-title">
        <h1 id="notes-title" ref={titleRef} tabIndex={-1}>
          {NOTES_TITLE}
        </h1>
        <p className="chosen-mode">
          <ModeIcon id={chosen.id} className="chosen-mode-icon" />
          <span>
            <span className="label">{MODE_CHOSEN_LABEL}</span>
            {chosen.result}
          </span>
        </p>
        <p>
          災害で普段の情報源が使えなくなったとき、自分の薬のことをどう伝えるかを、約5〜10分の対話で体験し、伝える準備を振り返って復習します。
        </p>
        <IntroNotes voiceProminent={mode === "3d"} />
        <button type="button" className="primary" onClick={() => onStart(mode)}>
          訓練をはじめる
        </button>
        <button type="button" className="secondary" onClick={() => setView("choose")}>
          {BACK_LABEL}
        </button>
      </section>
    );
  }

  return (
    <section className="screen" aria-labelledby="intro-title">
      {/* 上の帯（Issue #183。2026-11-06 オーナー「1ページ目のヘッダーはA案がいいね」）：問いかけと題を淡いミントの帯に置き、お薬手帳と薬の袋の絵を添える */}
      <div className="intro-hero">
        <div className="intro-hero-text">
          <p className="tagline">もしもの時、自分の薬のことを伝えられますか？</p>
          <h1 id="intro-title" ref={titleRef} tabIndex={-1}>
            お薬の避難訓練
          </h1>
        </div>
        <IntroHeroArt />
      </div>

      {/* 答え方の選択（Issue #183 で呼び方を「文字で答える」「自分の声で答える」に。内部の値は 2d／3d のまま）。
          カード全体がタップの的で、中のラジオで選ぶ（キーボードは Tab と矢印）。広さがあれば2枚を横に並べる（案B） */}
      <fieldset className="mode-cards intro-modes">
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

      {/* C-01 は将来構想。鍵の印付きの押せないカード。ボタン・リンクにせず、焦点も当たらない（PRD「Coming soon の表示の決まり」、ADR-0031） */}
      <p className="mode-card locked" aria-disabled="true">
        <ModeIcon id="locked" />
        <span className="mode-card-text">
          <span className="mode-card-label">{COMING_SOON_C01}</span>
        </span>
      </p>

      {/* 訓練はここからは始められない。2画面目で必ず見せる説明を読んでから */}
      <button type="button" className="primary" onClick={() => setView("notes")}>
        {NEXT_LABEL}
      </button>

      {/* 医療者側（Issue #97、#101、ADR-0042）。「次へ」の直下にボードへのボタン（架空データの試作で、訓練の外の画面）。
          問診モードは将来構想で、その下の説明にまとめる（押せるものにしない。PRD「Coming soon の表示の決まり」） */}
      {/* Issue #162：見えづらいので、絵を付けて文字を大きくし、「次へ」との間をあける。主の操作は「次へ」なので塗りつぶしにはしない */}
      <button type="button" className="secondary board-entry" onClick={() => onOpenBoard?.()}>
        <ModeIcon id="board" className="board-entry-icon" />
        <span>{BOARD_ENTRY_LABEL}</span>
      </button>
      <p className="intro-aside">{COMING_SOON_INTAKE}</p>
    </section>
  );
}

/** はじめにの上の帯の絵（お薬手帳と薬の袋）。飾りなので読み上げない */
function IntroHeroArt() {
  return (
    <svg className="intro-hero-art" viewBox="0 0 104 104" aria-hidden="true" focusable="false">
      <rect x="10" y="22" width="52" height="66" rx="6" fill="#fff" stroke="#2f7d63" strokeWidth="3" />
      <rect x="10" y="22" width="12" height="66" rx="4" fill="#2f7d63" />
      <path d="M32 40h20M32 50h20M32 60h14" stroke="#2f7d63" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 46h34l-4 46H60z" fill="#fff1e3" stroke="#a94e17" strokeWidth="3" strokeLinejoin="round" />
      <path d="M62 46c0-8 6-12 11-12s11 4 11 12" fill="none" stroke="#a94e17" strokeWidth="3" />
      <path d="M73 60v16M65 68h16" stroke="#a94e17" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
