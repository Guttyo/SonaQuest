import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./blankCard.css";
import {
  BLANK_CARD_BOX_HEADING,
  BLANK_CARD_BOX_TEXT,
  BLANK_CARD_FIELDS,
  BLANK_CARD_LEAD,
  BLANK_CARD_NOTES,
  BLANK_CARD_PRINT_BUTTON,
  BLANK_CARD_PRINT_CLASS,
  BLANK_CARD_TITLE,
} from "../flow/blankCard";

/**
 * 記入用のカードの用紙（Issue #278、ADR-0067）。印刷のときだけ見える。
 * 部品は何も受け取らない（props なし）。利用者の回答がカードに入ることは無い。
 */
export function BlankCardSheet() {
  return (
    <div className="blank-card-sheet" aria-hidden="true">
      <h1>{BLANK_CARD_TITLE}</h1>
      <p className="blank-card-lead">{BLANK_CARD_LEAD}</p>
      <dl className="blank-card-fields">
        {BLANK_CARD_FIELDS.map((f) => (
          <div key={f.id} className="blank-card-field">
            <dt>
              {f.label}
              {f.hint !== "" && <span className="blank-card-hint">{f.hint}</span>}
            </dt>
            {Array.from({ length: f.lines }, (_, i) => (
              <dd key={i} className="blank-card-line" />
            ))}
          </div>
        ))}
      </dl>
      <ul className="blank-card-notes">
        {BLANK_CARD_NOTES.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

/** 印刷のあいだだけ <html> にクラスを付け、終わったら外す */
export function printBlankCard(doc: Document = document, win: Window = window): void {
  const root = doc.documentElement;
  const done = () => {
    root.classList.remove(BLANK_CARD_PRINT_CLASS);
    win.removeEventListener("afterprint", done);
  };
  root.classList.add(BLANK_CARD_PRINT_CLASS);
  win.addEventListener("afterprint", done);
  try {
    win.print();
  } finally {
    // print() が戻った後に afterprint が来ないブラウザもあるので、ここでも外す
    done();
  }
}

/**
 * 振り返りの準備行動の近くに置く、印刷の箱（Issue #278）。
 * 用紙は body の直下に描く（印刷でカード以外を隠しやすくするため）。サーバー側の描画では用紙を出さない。
 */
export function BlankCardBox() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <section className="blank-card-box" aria-labelledby="blank-card-box-heading">
      <h3 id="blank-card-box-heading">{BLANK_CARD_BOX_HEADING}</h3>
      <p>{BLANK_CARD_BOX_TEXT}</p>
      <button type="button" className="secondary" onClick={() => printBlankCard()}>
        {BLANK_CARD_PRINT_BUTTON}
      </button>
      {mounted && createPortal(<BlankCardSheet />, document.body)}
    </section>
  );
}
