import { useEffect, useId, useRef, useState } from "react";
import { BGM_EXTRA_LABELS, BGM_LABELS } from "../flow/content";
import type { BgmSnapshot } from "./bgm";

/**
 * BGM の操作（B-03、ADR-0039）。ヘッダーの決まった1か所に置く。
 * ヘッダーの「BGM」ボタンは1回押すだけで鳴らす・止める（aria-pressed、今の状態を文字で出す。
 * 2026-11-05 オーナー決定「1回で消音できる形にする」）。隣の「音量」で、音量の欄が開く。
 * 音量は range（キーボードの矢印で変えられる）。
 * Web Audio が使えない・動きを減らす設定・終わりの画面では「BGM」を押せなくし、欄に理由を文字で出す。
 * どれでも訓練はそのまま進む
 */
export function BgmControls({
  snapshot,
  onToggle,
  onVolume,
  initialOpen = false,
}: {
  snapshot: BgmSnapshot;
  onToggle: () => void;
  onVolume: (volume: number) => void;
  /** 静的描画の試験のため */
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const state = snapshot.on ? BGM_LABELS.on : BGM_LABELS.off;
  // 鳴らせないときの理由（使えない → 動きを減らす設定 → 終わりの画面の順に見る）
  const blockedNote = !snapshot.available
    ? BGM_LABELS.unavailable
    : snapshot.reducedMotion
      ? BGM_EXTRA_LABELS.reducedMotion
      : snapshot.locked
        ? BGM_EXTRA_LABELS.ended
        : null;

  // Esc と、欄の外を押したときに閉じる。Esc で「音量」へ焦点を戻すのは、焦点が欄の中にあったときだけ
  // （欄の外の入力欄などで押した Esc で、焦点を奪わない。Issue #295）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const inside = rootRef.current !== null && rootRef.current.contains(document.activeElement);
        setOpen(false);
        if (inside) openerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div
      className="bgm"
      ref={rootRef}
      // Tab などで焦点が欄の外へ出たら閉じる（Issue #295）。行き先が分からないとき（relatedTarget が null）は閉じない：
      // Safari などでは欄の中のボタンを押しても焦点が移らず null になるので、ここで閉じるとボタンが押せなくなる。欄の外を押したときは pointerdown で閉じる
      onBlur={(e) => {
        if (open && e.relatedTarget !== null && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={snapshot.on ? "bgm-opener bgm-opener-on" : "bgm-opener"}
        aria-pressed={snapshot.on}
        disabled={blockedNote !== null}
        onClick={onToggle}
      >
        <span>{BGM_LABELS.name}</span>
        <span className="bgm-state" aria-hidden="true">
          {snapshot.available ? state : "－"}
        </span>
      </button>
      <button
        ref={openerRef}
        type="button"
        className="bgm-volume-opener"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {BGM_EXTRA_LABELS.volumeOpener}
      </button>
      {open && (
        <div id={panelId} className="bgm-panel" role="group" aria-label={BGM_LABELS.name}>
          {blockedNote === null ? (
            <>
              <button
                type="button"
                className="bgm-toggle"
                aria-pressed={snapshot.on}
                onClick={onToggle}
              >
                {BGM_LABELS.toggle}
                <span className="bgm-state" aria-hidden="true">：{state}</span>
              </button>
              <label className="bgm-volume">
                <span>
                  {BGM_LABELS.volume}：{snapshot.volume}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={snapshot.volume}
                  aria-valuetext={`${snapshot.volume}%`}
                  onChange={(e) => onVolume(Number(e.target.value))}
                />
              </label>
              <p className="small bgm-note">{BGM_LABELS.note}</p>
            </>
          ) : (
            <p className="small bgm-note">{blockedNote}</p>
          )}
          <button
            type="button"
            className="bgm-close"
            onClick={() => {
              setOpen(false);
              openerRef.current?.focus();
            }}
          >
            {BGM_LABELS.close}
          </button>
        </div>
      )}
    </div>
  );
}
