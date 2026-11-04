import { SOURCE_OPTIONS } from "../flow/content";
import type { EventId, PrepActionId, SourceId, ViewpointId } from "../flow/types";

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
 * 情報源のほかに描く、薬のまわりのもの（A-04）。③確認の選択肢には足さない（SOURCE_OPTIONS は変えない）。
 * leaflet：お薬の説明書、bag：薬の袋。中の文字・薬の形・量は描かない
 */
export type ExtraIllustration =
  | "leaflet"
  | "bag"
  /** 非常持ち出し袋（背負う袋）。振り返りの準備行動に使う */
  | "pack"
  /** 財布。振り返りの準備行動に使う */
  | "wallet"
  /** 日付の欄だけの暦（数字は描かない）。観点「今の服用状況と、記録が最新か」に使う */
  | "calendar"
  /** 吹き出し。観点「記録に載っていない可能性のある情報」（記録の外で伝えること）に使う */
  | "talk";

/** SourceIcon で描ける絵 */
export type IllustrationId = DrawnSource | ExtraIllustration;

/**
 * 情報源と薬のまわりのものの絵（A-04 の一部。期間中に描いた SVG。実在の製品・サービスのロゴ、医療者の記号、
 * 実在の薬の名前・形、薬効や量は描かない）。絵は飾りで、意味は必ず隣の文字で示す（A-05）
 */
export function SourceIcon({
  id,
  className,
  battery = false,
}: {
  id: IllustrationId;
  className?: string;
  /** スマホの画面に電池の印を出す。電池切れの出来事の場面だけで使う（カードやほかの場所では出さない） */
  battery?: boolean;
}) {
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
          {/* 本体と、上の受話口・下のボタンだけの、どの製品にも似せないスマホ */}
          <rect x="13" y="4" width="22" height="40" rx="4" />
          <path d="M21 9h6" />
          <path d="M22 39h4" />
          {battery && (
            <>
              {/* 電池の印。電池切れの場面では中の量が減る（styles.css の .battery-level） */}
              <rect x="18" y="17" width="12" height="16" rx="2" />
              <path d="M22 15h4" />
              <rect className="battery-level" x="20.5" y="19.5" width="7" height="11" rx="1" fill="currentColor" stroke="none" />
            </>
          )}
        </>
      )}
      {id === "online" && (
        // インターネットにつないで見るもの：雲だけ（下の波線は外した）。上下の中ほどに置く
        <path d="M14 37a9 9 0 0 1 1-18 12 12 0 0 1 22 3 8 8 0 0 1-1 15z" />
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
      {id === "leaflet" && (
        <>
          {/* お薬の説明書：角を折った1枚の紙。中の文字は線で表し、読める字は書かない */}
          <path d="M12 5h17l9 9v29H12z" />
          <path d="M29 5v9h9" />
          <path d="M18 22h14M18 29h14M18 36h9" />
        </>
      )}
      {id === "bag" && (
        <>
          {/* 薬の袋：口を折った紙の袋と、名前を書く欄（中の字・薬の形は描かない） */}
          <path d="M10 14l4-8h20l4 8" />
          <path d="M10 14h28v29H10z" />
          <rect x="16" y="22" width="16" height="11" rx="2" />
        </>
      )}
      {id === "pack" && (
        <>
          {/* 非常持ち出し袋：持ち手と、ふたの付いた背負う袋（中身や字は描かない） */}
          <path d="M19 10a5 5 0 0 1 10 0" />
          <rect x="10" y="10" width="28" height="33" rx="7" />
          <path d="M10 22h28" />
          <rect x="18" y="29" width="12" height="8" rx="2" />
        </>
      )}
      {id === "wallet" && (
        <>
          {/* 財布：二つ折りの財布と留め具（お金・カード・字は描かない） */}
          <path d="M8 16l24-8 3 8" />
          <rect x="6" y="16" width="36" height="24" rx="4" />
          <path d="M42 24h-9a4 4 0 0 0 0 8h9" />
          <circle cx="33" cy="28" r="1" />
        </>
      )}
      {id === "calendar" && (
        <>
          {/* 暦：綴じ具と、日付の欄を表す格子（数字は描かない） */}
          <rect x="7" y="10" width="34" height="32" rx="4" />
          <path d="M7 19h34" />
          <path d="M16 6v8M32 6v8" />
          <path d="M14 27h4M22 27h4M30 27h4M14 34h4M22 34h4" />
        </>
      )}
      {id === "talk" && (
        <>
          {/* 吹き出し：記録に無いことを言葉で伝える（中の字は線で表す） */}
          <path d="M8 10h32a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H22l-9 8v-8H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" />
          <path d="M14 19h20M14 25h13" />
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

/**
 * 振り返りで、観点に添える絵（A-05 の⑥）。絵は飾りで、意味は必ず隣の観点の名前で示す。
 * 薬の形・薬効・量・医療者の記号は描かない
 */
export const VIEWPOINT_ICON: Record<ViewpointId, IllustrationId> = {
  location: "notebook",
  alternative: "leaflet",
  current: "calendar",
  unrecorded: "talk",
  proxy: "family",
};

/** 振り返りで、準備行動に添える絵（A-05 の⑥）。意味は必ず準備行動の文で示す */
export const PREP_ICON: Record<PrepActionId, IllustrationId> = {
  notebook_bag: "pack",
  photo_and_paper: "smartphone",
  wallet_memo: "wallet",
  tell_family: "family",
  pharmacy_contact: "clinic",
  check_portal: "online",
};

/**
 * 出来事で使えなくなったもの（振り返りの「出来事と立て直し」と回答の区切り）。LOST_BY_EVENT の表から出し、
 * 本人が選んだ情報源（state.source）では決めない（電池切れではスマホとアプリの2つ）。
 * 絵には斜線を引き、文字でも「（使えない）」と示す。係の交代のように使えなくなるものが無いときは何も出さない
 */
export function LostSources({ event }: { event: EventId }) {
  const lost = LOST_BY_EVENT[event];
  if (lost.length === 0) return null;
  return (
    <ul className="lost-sources">
      {lost.map((id) => (
        <li key={id} className="source-chip source-chip-lost">
          <span className="source-chip-icon">
            <SourceIcon id={id} />
            <span className="source-chip-slash" aria-hidden="true" />
          </span>
          <span>
            {sourceLabel(id)}
            <span className="source-chip-state">（使えない）</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
