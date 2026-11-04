import type { TrainingMode } from "../flow/mode";

/** モードのカードの絵。locked は将来構想（C-01）の押せないカードの鍵の印 */
export type ModeIconId = TrainingMode | "locked";

/**
 * はじめにのモード選択のカードの絵（A-14。期間中に描いた SVG。実在の製品・サービスのロゴや、医療者の記号は使わない）。
 * 絵は飾りで、意味は必ず隣の文字で示す（A-05）。SourceIcon と同じ描き方
 */
export function ModeIcon({ id, className }: { id: ModeIconId; className?: string }) {
  return (
    <svg
      className={className ?? "mode-card-icon"}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {id === "2d" && (
        <>
          {/* 文字で答える：文の入った吹き出し */}
          <path d="M8 10a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H22l-8 8v-8h-2a4 4 0 0 1-4-4z" />
          <path d="M16 15h16M16 22h11" />
        </>
      )}
      {id === "3d" && (
        <>
          {/* 声で答えて読み上げを聞く：パペットの顔（口が開いている）と、声の波 */}
          <circle cx="19" cy="22" r="13" />
          <circle cx="14" cy="19" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="24" cy="19" r="1.5" fill="currentColor" stroke="none" />
          <ellipse cx="19" cy="27" rx="4" ry="2.5" />
          <path d="M36 15a10 10 0 0 1 0 14M40 10a16 16 0 0 1 0 24" />
          <path d="M10 44c2-5 5-8 9-8s7 3 9 8" />
        </>
      )}
      {id === "locked" && (
        <>
          {/* 鍵：押せない扉の印 */}
          <rect x="11" y="21" width="26" height="21" rx="4" />
          <path d="M16 21v-6a8 8 0 0 1 16 0v6" />
          <circle cx="24" cy="31" r="2.5" fill="currentColor" stroke="none" />
          <path d="M24 33v4" />
        </>
      )}
    </svg>
  );
}
