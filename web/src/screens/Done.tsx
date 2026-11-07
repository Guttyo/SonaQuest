import { useRef, useState } from "react";
import {
  DONE_MEMO_COPIED,
  DONE_MEMO_COPY,
  DONE_MEMO_FAILED,
  DONE_MEMO_SHARE,
  DONE_MEMO_TITLE,
  DONE_NOTE,
  JUDGMENT_LABELS,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  TIMINGS,
  viewpointShortLabel,
} from "../flow/content";
import { nextSteps } from "../flow/rules";
import type { EventId, Judgments, PrepActionId, TimingId } from "../flow/types";
import { PREP_ICON, SourceIcon } from "./SourceIcon";

interface Props {
  action: PrepActionId;
  timing: TimingId;
  /** 振り返りと同じ判定（判定が無い回は null）。終わりの画面で「まだ弱いところ」を1行で繰り返すために使う */
  judgments: Judgments | null;
  /** 起きた出来事（係の交代のときは「代わりの手段」の名前を替える。ADR-0064） */
  event?: EventId | null;
  onRestart: () => void;
}

/** 「まだ弱いところ」の1行（固定文だけ）。判定が無い回・全部確認できた回は null */
export function weakLine(judgments: Judgments | null, event: EventId | null = null): string | null {
  const steps = judgments === null ? [] : nextSteps(judgments);
  if (steps.length === 0) return null;
  return steps
    .map((s) => `${viewpointShortLabel(s.viewpoint, event)}（${JUDGMENT_LABELS[s.judgment]}）`)
    .join("、");
}

/**
 * メモに写す文（ADR-0054 の追記10）。決めた準備・いつ・まだ弱いところの固定文だけで、
 * 利用者の回答の原文は入れない。アプリはこれを保存しない（端末のクリップボードや共有先に渡すだけ）
 */
export function doneMemoText(
  action: PrepActionId,
  timing: TimingId,
  judgments: Judgments | null,
  event: EventId | null = null,
): string {
  const actionLabel = PREP_ACTIONS.find((a) => a.id === action)?.label ?? "";
  const timingLabel = TIMINGS.find((t) => t.id === timing)?.label ?? "";
  const weak = weakLine(judgments, event);
  return [
    DONE_MEMO_TITLE,
    `次の準備：${actionLabel}`,
    `いつ：${timingLabel}`,
    ...(weak === null ? [] : [`まだ弱いところ：${weak}`]),
  ].join("\n");
}

/**
 * 終わりの画面（ADR-0054）。持ち帰るのは3つだけ：決めた準備、いつやるか、まだ弱いところ。
 * 「メモに写す」でその3つを端末のクリップボードに渡す（共有が使える端末では「共有する」も）。
 * 文はすべて固定文で、利用者の回答は引かない。保存はしない（DONE_NOTE）
 */
export function Done({ action, timing, judgments, event = null, onRestart }: Props) {
  const actionLabel = PREP_ACTIONS.find((a) => a.id === action)?.label;
  const timingLabel = TIMINGS.find((t) => t.id === timing)?.label;
  const weak = weakLine(judgments, event);
  const memo = doneMemoText(action, timing, judgments, event);
  const [memoState, setMemoState] = useState<"idle" | "copied" | "failed">("idle");
  const memoRef = useRef<HTMLPreElement>(null);
  const nav = typeof navigator === "undefined" ? null : navigator;
  const canCopy = nav?.clipboard?.writeText !== undefined;
  const canShare = typeof nav?.share === "function";

  /** クリップボードの API が拒否されたとき：画面の文を選択して、古い copy 命令で写す。それも駄目なら選んだままにして案内を出す */
  const copyBySelection = (): boolean => {
    const pre = memoRef.current;
    const selection = window.getSelection();
    if (pre === null || selection === null) return false;
    const range = document.createRange();
    range.selectNodeContents(pre);
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  };

  const copy = async () => {
    try {
      await nav!.clipboard.writeText(memo);
      setMemoState("copied");
    } catch {
      setMemoState(copyBySelection() ? "copied" : "failed");
    }
  };
  const share = async () => {
    try {
      await nav!.share({ title: DONE_MEMO_TITLE, text: memo });
    } catch {
      // 共有を取りやめたときは何もしない
    }
  };

  return (
    <section className="screen" aria-labelledby="done-title">
      <h1 id="done-title">訓練おつかれさまでした</h1>
      <div className="decision">
        <div className="decision-action">
          <SourceIcon id={PREP_ICON[action]} className="decision-icon" />
          <div>
            <p>
              <span className="label">次の準備：</span>
              {actionLabel}
            </p>
            <p className="small">{PREP_ACTION_EFFECTS[action]}</p>
          </div>
        </div>
        <p>
          <span className="label">いつ：</span>
          {timingLabel}
        </p>
      </div>
      {weak !== null && (
        <p className="done-weak">
          <span className="label">まだ弱いところ：</span>
          {weak}
        </p>
      )}
      {/* メモに写す：固定文だけを端末のクリップボードへ。アプリは保存しない。使えない端末では文を選んで写せる */}
      <div className="done-memo">
        {(canCopy || canShare) && (
          <div className="done-memo-actions">
            {canCopy && (
              <button type="button" className="secondary" onClick={copy}>
                {DONE_MEMO_COPY}
              </button>
            )}
            {canShare && (
              <button type="button" className="secondary" onClick={share}>
                {DONE_MEMO_SHARE}
              </button>
            )}
          </div>
        )}
        <p className="small done-memo-state" role="status" aria-live="polite">
          {memoState === "copied" ? DONE_MEMO_COPIED : memoState === "failed" ? DONE_MEMO_FAILED : ""}
        </p>
        <pre ref={memoRef} className="done-memo-text">
          {memo}
        </pre>
      </div>
      <p>{DONE_NOTE}</p>
      <button type="button" className="secondary" onClick={onRestart}>
        はじめからやり直す
      </button>
    </section>
  );
}
