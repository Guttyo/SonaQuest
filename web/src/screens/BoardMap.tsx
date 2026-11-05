import type { KeyboardEvent } from "react";
import { HQ, ROUTES, type RouteRow, type SiteId } from "../board/data";
import {
  MAP_BLOCKS,
  MAP_BRIDGES,
  MAP_EXPRESSWAY,
  MAP_FACILITIES,
  MAP_H,
  MAP_HILLS,
  MAP_LANDSLIDES,
  MAP_LOCAL_ROADS,
  MAP_MAIN_ROADS,
  MAP_NOTE_Y,
  MAP_RIVER,
  MAP_ROUTES,
  MAP_SITES,
  MAP_STATUS,
  MAP_W,
  TOWN_NAME,
  areaNotes,
  type Facility,
  type MapMarkLabel,
} from "../board/map";
import type { SiteOverview } from "../board/summary";
import { BOARD_MAP } from "../board/text";

interface Props {
  overview: readonly SiteOverview[];
  routes?: readonly RouteRow[];
  /** 拠点を押したとき（Issue #107）。渡すと拠点が押せるもの（role="button"）になる */
  onSelect?: (site: SiteId) => void;
  /** 選んでいる拠点（札の枠を太くする） */
  selected?: SiteId;
  /** 図の横の欄（状況・経路・最新情報）を出すか。救護所の詳細では図だけにする */
  side?: boolean;
}

const fmt = new Intl.NumberFormat("ja-JP");

const ROUTE_COLOR: Record<RouteRow["status"], string> = {
  通行可: "#2f7d63",
  迂回: "#c99a06",
  通行止め: "#c62828",
};

/** 文字の幅の見積もり（全角は1字、半角は0.6字） */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += /[\x20-\x7e]/.test(ch) ? size * 0.6 : size;
  return w;
}

/** 道の上の印に添える文。白い札に載せ、地図の線と重なっても読めるようにする */
function MarkLabel({ m, color, border }: { m: MapMarkLabel; color: string; border: string }) {
  const size = 14;
  const w = textWidth(m.label, size) + 12;
  const left = m.anchor === "start" ? m.dx - 6 : m.anchor === "end" ? m.dx - w + 6 : m.dx - w / 2;
  return (
    <g>
      <rect x={left} y={m.dy - size - 2} width={w} height={size + 9} rx="5" fill="#fff" fillOpacity="0.95" stroke={border} />
      <text x={m.dx} y={m.dy} fontSize={size} fill={color} textAnchor={m.anchor} fontWeight="700">
        {m.label}
      </text>
    </g>
  );
}

/** 施設の図形 */
function FacilityShape({ f }: { f: Facility }) {
  const { x, y, w, h } = f.rect;
  switch (f.kind) {
    case "lot":
      return <rect x={x} y={y} width={w} height={h} rx="4" fill="#f4f1ea" stroke="#d8cfbd" />;
    case "hospital":
      return <rect x={x} y={y} width={w} height={h} fill="#d6e0ee" stroke="#6f86a8" strokeWidth="1.5" />;
    case "parking": {
      const lines = [];
      for (let yy = y + 10; yy < y + h - 4; yy += 10) {
        lines.push(<path key={yy} d={`M${x + 6},${yy} H${x + w - 6}`} stroke="#fff" strokeWidth="1.5" />);
      }
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#c4c4c4" />
          {lines}
          <circle cx={x + w / 2} cy={y + h / 2} r="10" fill="#4a6fa5" />
          <text x={x + w / 2} y={y + h / 2 + 5} fontSize="14" fontWeight="800" fill="#fff" textAnchor="middle">
            P
          </text>
        </g>
      );
    }
    case "school":
      return <rect x={x} y={y} width={w} height={h} fill="#efe2c8" stroke="#a88f62" strokeWidth="1.5" />;
    case "ground":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx="6" fill="#e3cfa6" />
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2 - 10} ry={h / 2 - 10} fill="none" stroke="#fff" strokeWidth="2.5" />
        </g>
      );
    case "hall":
      return <rect x={x} y={y} width={w} height={h} fill="#e8d6c6" stroke="#9a7a5e" strokeWidth="1.5" />;
    case "park":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx="4" fill="#cfe2c0" />
          {[0.25, 0.5, 0.75].map((p) => (
            <circle key={p} cx={x + w * p} cy={y + h * (p === 0.5 ? 0.65 : 0.35)} r="7" fill="#9cc48a" />
          ))}
        </g>
      );
  }
}

/**
 * 架空の町の模式図（Issue #105）。碁盤目の街区、川と橋、幹線道路と高速道路、本部（病院）と救護所（学校・公民館・集会所）、
 * 本部からの経路の状態（通行可・迂回・通行止め）、拠点の不足の印、方位とスケール。
 * 外部の地図タイルも画像も使わず、SVG と架空のデータだけで描く
 */
export function BoardMap({ overview, routes = ROUTES, onSelect, selected, side = true }: Props) {
  const routeOf = (site: string) => routes.find((r) => r.to === site);
  const notes = areaNotes(routes);
  const ex = MAP_EXPRESSWAY.x;
  return (
    <section className="board-map" aria-labelledby="board-map-title">
      <h2 id="board-map-title">
        {BOARD_MAP.title} <span className="board-count">{TOWN_NAME}・{BOARD_MAP.mock}</span>
      </h2>
      <div className="board-map-grid">
        <figure className="board-map-figure">
          <div className="board-map-scroll">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-labelledby="board-map-desc">
              <title id="board-map-desc">{BOARD_MAP.svgTitle}</title>
              <defs>
                <pattern id="board-map-houses" width="16" height="14" patternUnits="userSpaceOnUse">
                  <rect x="2" y="2" width="11" height="9" fill="#ddd0b8" />
                </pattern>
              </defs>
              {/* 地面（生活道路の色）と街区（住宅地） */}
              <rect width={MAP_W} height={MAP_H} fill="#fbfaf6" />
              {MAP_BLOCKS.map((b) => (
                <g key={`${b.x},${b.y}`}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ede5d4" />
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#board-map-houses)" />
                </g>
              ))}
              {/* 山林 */}
              {MAP_HILLS.map((d) => (
                <g key={d}>
                  <path d={d} fill="#cddfbc" />
                  <path d={d} fill="none" stroke="#a7c290" strokeWidth="1.5" strokeDasharray="10 6" transform="translate(-6,0)" />
                </g>
              ))}
              {/* 施設 */}
              {MAP_FACILITIES.map((f) => (
                <FacilityShape key={`${f.kind}${f.rect.x},${f.rect.y}`} f={f} />
              ))}
              {/* 碁盤目に乗らない生活道路（川沿いの道）と幹線道路 */}
              {MAP_LOCAL_ROADS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#fbfaf6" strokeWidth="8" strokeLinejoin="round" />
              ))}
              {MAP_MAIN_ROADS.map((d) => (
                <path key={`c${d}`} d={d} fill="none" stroke="#d3bf86" strokeWidth="16" />
              ))}
              {MAP_MAIN_ROADS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#f8eec8" strokeWidth="12" />
              ))}
              {/* 川（街区と道を覆う。道が川を渡るのは橋だけ） */}
              <path d={MAP_RIVER} fill="none" stroke="#d5e7f3" strokeWidth="44" strokeLinejoin="round" />
              <path d={MAP_RIVER} fill="none" stroke="#8fbfe0" strokeWidth="26" strokeLinejoin="round" />
              {/* 土砂が流れ込んだ場所 */}
              {MAP_LANDSLIDES.map((d) => (
                <path key={d} d={d} fill="#b98a5a" opacity="0.85" />
              ))}
              {/* 橋 */}
              {MAP_BRIDGES.map((b) => (
                <g key={`${b.x},${b.y}`} transform={`translate(${b.x},${b.y}) rotate(${b.angle})`}>
                  <rect x="-30" y="-9" width="60" height="18" fill="#f8eec8" stroke="#666" strokeWidth="2" />
                </g>
              ))}
              {/* 高速道路（架空） */}
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#5f8f6f" strokeWidth="20" />
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#9ccbac" strokeWidth="15" />
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#fff" strokeWidth="1.5" strokeDasharray="10 8" />
              <g transform={`translate(${ex},250)`}>
                <rect x="-13" y="-46" width="26" height="80" rx="5" fill="#2f6e4a" />
                <text fontSize="14" fill="#fff" fontWeight="700" textAnchor="middle">
                  {[...MAP_EXPRESSWAY.label].map((ch, i) => (
                    <tspan key={i} x="0" y={-28 + i * 17}>
                      {ch}
                    </tspan>
                  ))}
                </text>
              </g>
              {/* 本部からの経路。状態で色と線を変える */}
              {MAP_ROUTES.map((m) => {
                const r = routeOf(m.to);
                const status = r?.status ?? "通行可";
                const color = ROUTE_COLOR[status];
                return (
                  <g key={m.to} className={`board-map-route ${status}`} data-status={status}>
                    <path
                      d={m.d}
                      fill="none"
                      stroke={color}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={status === "迂回" ? "4 9" : undefined}
                      opacity={status === "通行止め" ? 0.85 : 1}
                    />
                    {status === "迂回" && m.detour && (
                      <path d={m.detour} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14 10" />
                    )}
                    {(status === "通行止め" || status === "迂回") && m.blocked && (
                      <g transform={`translate(${m.blocked.x},${m.blocked.y})`}>
                        <circle r="14" fill="#c62828" stroke="#fff" strokeWidth="2.5" />
                        <path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                        <MarkLabel m={m.blocked} color="#a31f1f" border="#c62828" />
                      </g>
                    )}
                    {m.caution && status !== "通行止め" && (
                      <g transform={`translate(${m.caution.x},${m.caution.y})`}>
                        <circle r="11" fill="#c99a06" stroke="#fff" strokeWidth="2" />
                        <text x="0" y="5" fontSize="14" fill="#fff" textAnchor="middle" fontWeight="700">
                          !
                        </text>
                        <MarkLabel m={m.caution} color="#6b5000" border="#c99a06" />
                      </g>
                    )}
                  </g>
                );
              })}
              {/* 拠点 */}
              {MAP_SITES.map((s) => {
                const o = overview.find((x) => x.site === s.site);
                const isHq = s.site === HQ;
                const badges: string[] = [];
                if (o && o.outOfStock > 0) badges.push(`${BOARD_MAP.outOfStock} ${fmt.format(o.outOfStock)}`);
                if (o && o.pharmacistsShort > 0) badges.push(`${BOARD_MAP.pharmacistsShort} ${fmt.format(o.pharmacistsShort)}`);
                const name = isHq ? "本部" : s.site;
                // 札：名前（18）、施設名（13）、不足の印（高さ20、間隔24）。印の向きに合わせて札ごと置き、印と重ねない
                const blockH = 42 + badges.length * 24;
                const plateW = Math.max(textWidth(name, 18), textWidth(s.place, 13), badges.length ? 124 : 0) + 16;
                const top = s.labelSide === "top" ? -26 - blockH : s.labelSide === "bottom" ? 26 : -blockH / 2;
                const left = s.labelSide === "left" ? -28 - plateW : s.labelSide === "right" ? 28 : -plateW / 2;
                const cx = left + plateW / 2;
                const isSelected = selected === s.site;
                const press = onSelect
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `${name}（${s.place}）を選ぶ`,
                      "aria-pressed": isSelected,
                      onClick: () => onSelect(s.site),
                      onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(s.site);
                        }
                      },
                    }
                  : {};
                return (
                  <g
                    key={s.site}
                    className={`board-map-site${onSelect ? " pressable" : ""}${isSelected ? " selected" : ""}`}
                    transform={`translate(${s.x},${s.y})`}
                    data-site={s.site}
                    {...press}
                  >
                    {/* 押せる範囲（札と印を囲む透明の枠） */}
                    {onSelect && <rect x={Math.min(left, -22) - 6} y={Math.min(top, -22) - 6} width={Math.max(left + plateW, 22) - Math.min(left, -22) + 12} height={Math.max(top + blockH, 22) - Math.min(top, -22) + 12} fill="transparent" />}
                    <rect
                      x={left}
                      y={top}
                      width={plateW}
                      height={blockH}
                      rx="8"
                      fill="#fff"
                      fillOpacity="0.95"
                      stroke={isHq ? "#1f4e8c" : "#c62828"}
                      strokeWidth={isSelected ? 4 : 1.5}
                    />
                    <text x={cx} y={top + 20} fontSize="18" fontWeight="700" fill="#111" textAnchor="middle">
                      {name}
                    </text>
                    <text x={cx} y={top + 36} fontSize="13" fill="#444" textAnchor="middle">
                      {s.place}
                    </text>
                    {badges.map((b, i) => (
                      <g key={b} transform={`translate(${cx - 62}, ${top + 42 + i * 24})`}>
                        <rect width="124" height="20" rx="10" fill="#fdecea" stroke="#c62828" />
                        <text x="62" y="14" fontSize="12" fill="#8a1c1c" textAnchor="middle" fontWeight="700">
                          {b}
                        </text>
                      </g>
                    ))}
                    <circle r={isHq ? 20 : 17} fill={isHq ? "#1f4e8c" : "#c62828"} stroke="#fff" strokeWidth="4" />
                    {isHq ? (
                      <text x="0" y="8" fontSize="22" fill="#fff" textAnchor="middle" fontWeight="800">
                        H
                      </text>
                    ) : (
                      <path d="M-8,0 H8 M0,-8 V8" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
                    )}
                  </g>
                );
              })}
              {/* 方位とスケール（架空） */}
              <g transform="translate(912,66)">
                <circle r="24" fill="#fff" fillOpacity="0.92" stroke="#888" />
                <path d="M0,-17 L9,12 L0,5 L-9,12 Z" fill="#333" />
                <text y="-29" fontSize="15" fontWeight="800" textAnchor="middle" fill="#333">
                  N
                </text>
              </g>
              <g transform="translate(86,596)">
                <rect x="-14" y="-24" width="232" height="36" rx="6" fill="#fff" fillOpacity="0.92" />
                <rect x="0" y="-3" width="100" height="6" fill="#333" />
                <rect x="100" y="-3" width="100" height="6" fill="#fff" stroke="#333" />
                <text x="0" y="-9" fontSize="12" fill="#333" textAnchor="middle">
                  0
                </text>
                <text x="100" y="-9" fontSize="12" fill="#333" textAnchor="middle">
                  0.5 km
                </text>
                <text x="200" y="-9" fontSize="12" fill="#333" textAnchor="middle">
                  1 km
                </text>
              </g>
              {/* 架空の明記 */}
              <rect x="0" y={MAP_NOTE_Y} width={MAP_W} height={MAP_H - MAP_NOTE_Y} fill="#fff" />
              <text x="16" y={MAP_H - 9} fontSize="13" fill="#555">
                {BOARD_MAP.svgNote}
              </text>
            </svg>
          </div>
          <figcaption className="board-map-legend">
            <span>
              <i className="sw" style={{ background: ROUTE_COLOR.通行可 }} /> {BOARD_MAP.legendOk}
            </span>
            <span>
              <i className="sw dashed" style={{ background: ROUTE_COLOR.迂回 }} /> {BOARD_MAP.legendDetour}
            </span>
            <span>
              <i className="sw" style={{ background: ROUTE_COLOR.通行止め }} /> × {BOARD_MAP.legendBlocked}
            </span>
            <span>
              <i className="dot hq" /> {BOARD_MAP.legendHq}
            </span>
            <span>
              <i className="dot site" /> {BOARD_MAP.legendSite}
            </span>
          </figcaption>
        </figure>
        {side && (
        <div className="board-map-side">
          <section aria-labelledby="board-map-status">
            <h3 id="board-map-status">{BOARD_MAP.statusTitle}</h3>
            <dl className="board-map-status">
              <div>
                <dt>{BOARD_MAP.temp}</dt>
                <dd>{MAP_STATUS.temp}</dd>
              </div>
              <div>
                <dt>{BOARD_MAP.snow}</dt>
                <dd>{MAP_STATUS.snow}</dd>
              </div>
              <div>
                <dt>{BOARD_MAP.rain}</dt>
                <dd>{MAP_STATUS.rain}</dd>
              </div>
              <div>
                <dt>{BOARD_MAP.evacuees}</dt>
                <dd>{fmt.format(MAP_STATUS.evacuees)} 人</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="board-map-routes">
            <h3 id="board-map-routes">{BOARD_MAP.routesTitle}</h3>
            <ul className="board-map-routes">
              {routes.map((r) => (
                <li key={r.to}>
                  <span className={`board-pill ${r.status === "通行可" ? "ok" : r.status === "迂回" ? "warn" : "bad"}`}>{r.status}</span> {r.to}
                  {r.minutes !== null && `（約${fmt.format(r.minutes)}分）`}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="board-map-notes">
            <h3 id="board-map-notes">{BOARD_MAP.notesTitle}</h3>
            <ul className="board-map-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        </div>
        )}
      </div>
    </section>
  );
}
