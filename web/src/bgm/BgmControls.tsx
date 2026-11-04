import { useEffect, useId, useRef, useState } from "react";
import { BGM_LABELS } from "../flow/content";
import type { BgmSnapshot } from "./bgm";

/**
 * BGM の操作（B-03、ADR-0039）。ヘッダーの決まった1か所に置く。
 * ヘッダーのボタンに今の状態（オン・オフ）を文字で出し、押すと、鳴らす・止めるボタンと音量の欄が開く。
 * 鳴らす・止めるは aria-pressed で、音量は range（キーボードの矢印で変えられる）。
 * Web Audio が使えないときは、使えないことを文字で示し、訓練はそのまま進む
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

  // Esc と、欄の外を押したときに閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        openerRef.current?.focus();
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
    <div className="bgm" ref={rootRef}>
      <button
        ref={openerRef}
        type="button"
        className={snapshot.on ? "bgm-opener bgm-opener-on" : "bgm-opener"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{BGM_LABELS.name}</span>
        <span className="bgm-state">{snapshot.available ? state : "－"}</span>
      </button>
      {open && (
        <div id={panelId} className="bgm-panel" role="group" aria-label={BGM_LABELS.name}>
          {snapshot.available ? (
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
            <p className="small bgm-note">{BGM_LABELS.unavailable}</p>
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
