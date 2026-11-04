import type { ReactNode } from "react";
import { EVENTS } from "../flow/content";
import type { EventId } from "../flow/types";
import { sceneNumber } from "./ListenerStage";
import { EVENT_FOCUS, SourceIcon } from "./SourceIcon";

/**
 * ④出来事の場面（B-01、Issue #54）。6候補それぞれで、何が使えなくなったか（係の交代では何が起きたか）を
 * 絵と文の両方で示す。文は content.ts の固定文（EVENTS）だけを使い、新しい文は足さない。
 * 絵は飾り（aria-hidden）で、意味は必ず文で示す。動きは1回だけで繰り返さず、点滅させない。
 * 最後の姿を基本の見た目にしてあるので、動きを減らす設定では止まった絵になる（styles.css）。
 * 「続ける」は演出を待たずにすぐ押せる。中断の画面では対話の画面ごと外れるので、ここは出ない（App.tsx）
 */
export function EventScene({ event, onContinue }: { event: EventId; onContinue: () => void }) {
  const { text, unavailable } = EVENTS[event];
  return (
    <div className="event event-scene" role="alert" data-scroll-target tabIndex={-1}>
      <p className="event-kicker">{sceneNumber("event")}</p>
      <h2>想定外の出来事</h2>
      <EventVisual event={event} />
      <p className="event-text">{text}</p>
      {unavailable !== null && (
        <p>
          <span className="label">使えなくなったもの：</span>
          {unavailable}
        </p>
      )}
      <button type="button" className="primary" onClick={onContinue}>
        続ける
      </button>
    </div>
  );
}

/**
 * 出来事の絵。使えなくなったもの（EVENT_FOCUS）を大きく描いて色を落とし斜線を引き、
 * 横に、何が起きたかを表す小さな印を添える。係の交代では使えなくなるものが無いので、斜線は引かず、係が入れ替わる絵にする。
 * 期間中に描いた SVG（SourceIcon と同じ描き方）。実在のロゴ、薬の形・量、医療者の記号は描かない
 */
export function EventVisual({ event }: { event: EventId }) {
  const focus = EVENT_FOCUS[event];
  return (
    <div className={`event-visual event-visual-${event}`} aria-hidden="true">
      {event === "handover" || focus === null ? (
        <HandoverPicture />
      ) : (
        <>
          <span className="event-focus">
            <SourceIcon id={focus} className="source-icon event-icon" battery={event === "battery"} />
            {event === "clinic_unreachable" && <ClinicCrack />}
            <span className="event-slash" />
          </span>
          <EventMark event={event} />
        </>
      )}
    </div>
  );
}

function Svg({ className, viewBox = "0 0 48 48", children }: { className: string; viewBox?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 何が起きたかの小さな印（係の交代を除く5つ） */
function EventMark({ event }: { event: Exclude<EventId, "handover"> }) {
  switch (event) {
    case "battery":
      // 充電もできない：差し込み口から抜けたプラグ（どの製品の形にも似せない）
      return (
        <Svg className="event-mark event-mark-battery">
          <path d="M4 24h10" />
          <g className="event-mark-move">
            <rect x="14" y="16" width="10" height="16" rx="2" />
            <path d="M24 20h5M24 28h5" />
          </g>
          <rect x="37" y="12" width="7" height="24" rx="2" />
        </Svg>
      );
    case "network":
      // 通信がつながらない：電波の棒が、高いほうから順に消える
      return (
        <Svg className="event-mark event-mark-network">
          <path className="event-mark-bar" d="M9 40v-6" />
          <path className="event-mark-bar" d="M19 40v-12" />
          <path className="event-mark-bar" d="M29 40v-18" />
          <path className="event-mark-bar" d="M39 40v-24" />
        </Svg>
      );
    case "notebook_home":
      // 手帳は自宅にある：手帳の入った家が、遠くへ離れていく
      return (
        <Svg className="event-mark event-mark-notebook">
          <g className="event-mark-recede">
            <path d="M8 24L24 10l16 14" />
            <path d="M12 21v19h24V21" />
            <rect x="19" y="27" width="10" height="13" rx="1" />
          </g>
        </Svg>
      );
    case "family_unreachable":
      // 家族と連絡がつかない：呼びかけの吹き出しに、返事の点が消えていく
      return (
        <Svg className="event-mark event-mark-family">
          <path d="M8 10h32a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H22l-8 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" />
          <circle className="event-mark-dot" cx="16" cy="21" r="1.5" fill="currentColor" />
          <circle className="event-mark-dot" cx="24" cy="21" r="1.5" fill="currentColor" />
          <circle className="event-mark-dot" cx="32" cy="21" r="1.5" fill="currentColor" />
        </Svg>
      );
    case "clinic_unreachable":
      // かかりつけ先と連絡がつかない：両端をつないでいた線が途中で切れて離れる（薬の形に見える丸い粒は描かない）
      return (
        <Svg className="event-mark event-mark-clinic">
          <rect x="3" y="19" width="8" height="10" rx="1" />
          <g className="event-mark-apart-left">
            <path d="M11 24h9l2-4" />
          </g>
          <g className="event-mark-apart-right">
            <path d="M37 24h-9l-2 4" />
          </g>
          <rect x="37" y="19" width="8" height="10" rx="1" />
        </Svg>
      );
  }
}

/** かかりつけ先も被災した：建物に入るひび（1回だけ描かれる） */
function ClinicCrack() {
  return (
    <Svg className="source-icon event-icon event-crack">
      <path className="event-crack-line" pathLength={1} d="M30 12l-4 7 5 5-6 7 3 6" />
    </Svg>
  );
}

/**
 * 係の人が交代した：前の係が離れ（点線）、新しい係が入る。使えなくなるものは無いので斜線は引かない。
 * 人は丸い頭と肩だけで描き、医療者の記号（十字・腕章・聴診器など）は描かない。家族の絵とは向きと矢印で区別する
 */
function HandoverPicture() {
  return (
    <Svg className="event-handover" viewBox="0 0 120 56">
      <g className="event-handover-out">
        <circle cx="22" cy="18" r="7" strokeDasharray="3 4" />
        <path d="M8 48c1-9 6-15 14-15s13 6 14 15" strokeDasharray="3 4" />
      </g>
      <path className="event-handover-arrow" d="M44 20c8-8 24-8 32 0" />
      <path className="event-handover-arrow" d="M70 14l6 6-8 2" />
      <g className="event-handover-in">
        <circle cx="98" cy="18" r="7" />
        <path d="M84 48c1-9 6-15 14-15s13 6 14 15" />
      </g>
    </Svg>
  );
}
