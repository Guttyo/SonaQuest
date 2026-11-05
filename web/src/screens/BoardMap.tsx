import { HQ, ROUTES, type RouteRow } from "../board/data";
import { MAP_H, MAP_OTHER_ROADS, MAP_RIVER, MAP_ROUTES, MAP_SITES, MAP_STATUS, MAP_W, TOWN_NAME, areaNotes } from "../board/map";
import type { SiteOverview } from "../board/summary";
import { BOARD_MAP } from "../board/text";

interface Props {
  overview: readonly SiteOverview[];
  routes?: readonly RouteRow[];
}

const fmt = new Intl.NumberFormat("ja-JP");

const ROUTE_COLOR: Record<RouteRow["status"], string> = {
  通行可: "#2f7d63",
  迂回: "#c99a06",
  通行止め: "#c62828",
};

/**
 * 架空の町の模式図（Issue #105）。本部と救護所、本部からの経路の状態（通行可・迂回・通行止め）、拠点の不足の印、
 * このエリアの最新情報、気温・積雪・避難者数。外部の地図タイルも画像も使わず、SVG と架空のデータだけで描く
 */
export function BoardMap({ overview, routes = ROUTES }: Props) {
  const routeOf = (site: string) => routes.find((r) => r.to === site);
  const notes = areaNotes(routes);
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
            <rect width={MAP_W} height={MAP_H} fill="#fff" rx="12" />
            {/* 川 */}
            <path d={MAP_RIVER} fill="none" stroke="#9cc7e6" strokeWidth="14" strokeLinecap="round" />
            {/* そのほかの道 */}
            {MAP_OTHER_ROADS.map((d) => (
              <path key={d} d={d} fill="none" stroke="#cfc8b8" strokeWidth="6" strokeLinecap="round" />
            ))}
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
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={status === "迂回" ? "4 10" : undefined}
                    opacity={status === "通行止め" ? 0.8 : 1}
                  />
                  {status === "迂回" && m.detour && (
                    <path d={m.detour} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray="14 10" />
                  )}
                  {status === "通行止め" && m.blocked && (
                    <g transform={`translate(${m.blocked.x},${m.blocked.y})`}>
                      <circle r="16" fill="#c62828" />
                      <path d="M-7,-7 L7,7 M7,-7 L-7,7" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                      <text x="22" y="5" fontSize="15" fill="#c62828" fontWeight="700">
                        {m.blocked.label}
                      </text>
                    </g>
                  )}
                  {status === "迂回" && m.blocked && (
                    <g transform={`translate(${m.blocked.x},${m.blocked.y})`}>
                      <circle r="14" fill="#c62828" />
                      <path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                      <text x={m.blocked.below ? -14 : 20} y={m.blocked.below ? 34 : 5} fontSize="14" fill="#c62828">
                        {m.blocked.label}
                      </text>
                    </g>
                  )}
                  {m.caution && status !== "通行止め" && (
                    <g transform={`translate(${m.caution.x},${m.caution.y})`}>
                      <circle r="11" fill="#c99a06" />
                      <text x="0" y="5" fontSize="14" fill="#fff" textAnchor="middle" fontWeight="700">
                        !
                      </text>
                      <text x="18" y="5" fontSize="14" fill="#7a5c00">
                        {m.caution.label}
                      </text>
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
              const lx = s.labelSide === "left" ? -30 : s.labelSide === "right" ? 30 : 0;
              const ly = s.labelSide === "top" ? -34 : s.labelSide === "bottom" ? 46 : 6;
              const anchor = s.labelSide === "left" ? "end" : s.labelSide === "right" ? "start" : "middle";
              return (
                <g key={s.site} className="board-map-site" transform={`translate(${s.x},${s.y})`} data-site={s.site}>
                  <circle r={isHq ? 22 : 18} fill={isHq ? "#1f4e8c" : "#c62828"} stroke="#fff" strokeWidth="4" />
                  {isHq ? (
                    <text x="0" y="8" fontSize="22" fill="#fff" textAnchor="middle" fontWeight="800">
                      H
                    </text>
                  ) : (
                    <path d="M-8,0 H8 M0,-8 V8" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
                  )}
                  <text x={lx} y={ly} fontSize="18" fontWeight="700" fill="#111" textAnchor={anchor}>
                    {isHq ? "本部" : s.site}
                  </text>
                  <text x={lx} y={ly + 18} fontSize="13" fill="#555" textAnchor={anchor}>
                    {s.place}
                  </text>
                  {badges.map((b, i) => (
                    <g key={b} transform={`translate(${lx + (anchor === "middle" ? -60 : 0)}, ${ly + 26 + i * 22})`}>
                      <rect width="120" height="20" rx="10" fill="#fdecea" stroke="#c62828" />
                      <text x="60" y="14" fontSize="12" fill="#8a1c1c" textAnchor="middle" fontWeight="700">
                        {b}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
            <text x="16" y={MAP_H - 14} fontSize="13" fill="#666">
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
      </div>
    </section>
  );
}
