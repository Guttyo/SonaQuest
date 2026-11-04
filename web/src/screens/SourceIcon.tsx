import { SOURCE_OPTIONS } from "../flow/content";
import type { EventId, SourceId } from "../flow/types";

/** 絵を描く情報源（「どれにも当てはまらない」には絵を付けない） */
export type DrawnSource = Exclude<SourceId, "none">;

/**
 * 出来事ごとに、使えなくなる情報源（docs/PRD.md「出来事で使えなくなるもの」の表）。
 * 電池切れはスマホ本体ごと使えないので、アプリ・マイナポータルも使えない。通信の途絶では、端末に保存したものは見られる。
 * 係の交代では使えなくなるものがない
 */
export const LOST_BY_EVENT: Record<EventId, readonly DrawnSource[]> = {
  battery: ["smartphone", "online"],
  network: ["online"],
  notebook_home: ["notebook"],
  family_unreachable: ["family"],
  clinic_unreachable: ["clinic"],
  handover: [],
};

/** 出来事の場面で大きく示す、使えなくなったもの */
export const EVENT_FOCUS: Record<EventId, DrawnSource | null> = {
  battery: "smartphone",
  network: "online",
  notebook_home: "notebook",
  family_unreachable: "family",
  clinic_unreachable: "clinic",
  handover: null,
};

export function sourceLabel(id: DrawnSource): string {
  return SOURCE_OPTIONS.find((o) => o.id === id)?.label ?? "";
}

/**
 * 情報源の絵（A-04 の一部。期間中に描いた SVG。実在の製品・サービスのロゴや、医療者の記号は使わない）。
 * 絵は飾りで、意味は必ず隣の文字で示す（A-05）
 */
export function SourceIcon({ id, className }: { id: DrawnSource; className?: string }) {
  return (
    <svg
      className={className ?? "source-icon"}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {id === "smartphone" && (
        <>
          <rect x="13" y="4" width="22" height="40" rx="4" />
          <path d="M21 9h6" />
          {/* 電池の印。電池切れの場面では中の量が減る（styles.css の .battery-level） */}
          <rect x="18" y="19" width="12" height="16" rx="2" />
          <path d="M22 17h4" />
          <rect className="battery-level" x="20.5" y="21.5" width="7" height="11" rx="1" fill="currentColor" stroke="none" />
        </>
      )}
      {id === "online" && (
        <>
          <path d="M14 34a9 9 0 0 1 1-18 12 12 0 0 1 22 3 8 8 0 0 1-1 15z" />
          <path d="M18 40l3-3 3 3 3-3 3 3" />
        </>
      )}
      {id === "notebook" && (
        <>
          <rect x="10" y="5" width="28" height="38" rx="3" />
          <path d="M16 5v38" />
          <path d="M21 15h11M21 22h11M21 29h7" />
        </>
      )}
      {id === "family" && (
        <>
          <circle cx="17" cy="15" r="6" />
          <circle cx="33" cy="18" r="5" />
          <path d="M6 40c1-8 5-13 11-13s10 5 11 13" />
          <path d="M26 40c1-6 3-10 7-10s7 4 8 10" />
        </>
      )}
      {id === "clinic" && (
        <>
          <path d="M7 42V20l17-12 17 12v22z" />
          <path d="M19 42V30h10v12" />
          <path d="M20 20h8" />
        </>
      )}
    </svg>
  );
}

/**
 * 係の横に出す「頼りにしているもの」（Issue #55 の一部）。③確認で本人がタップで選んだものだけを出す
 * （Claude が回答を読んで決めることはしない）。出来事で使えなくなったら、色を落として斜線を引き、文字でも示す
 */
export function SourceChip({ source, lost }: { source: DrawnSource; lost: boolean }) {
  return (
    <p className={lost ? "source-chip source-chip-lost" : "source-chip"}>
      <span className="source-chip-icon">
        <SourceIcon id={source} />
        {lost && <span className="source-chip-slash" aria-hidden="true" />}
      </span>
      <span className="source-chip-text">
        <span className="source-chip-caption">頼りにしているもの</span>
        <span>
          {sourceLabel(source)}
          {lost && <span className="source-chip-state">（使えない）</span>}
        </span>
      </span>
    </p>
  );
}
