import { useState, type KeyboardEvent } from "react";
import { HQ, INBOUND, ROUTES, SYNC, type RouteRow, type SiteId, type SyncRow } from "../board/data";
import { clockText, type DemoInbound } from "../board/demo";
import { STALE_REPORT_HOURS, shipmentMarkers, siteGlows, toPathD, travelLine } from "../board/live";
import { vehicleAt } from "../board/vehicles";
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
import { Fold, Help } from "../board/Fold";
import { BOARD_MAP, BOARD_MAP_LIVE } from "../board/text";


/** 動く地図（Issue #128）に使う、デモの状態の一部。渡さなければ始まりの架空データ（時計 0 分）で描く */
export interface MapLive {
  minutes: number;
  inbound: readonly DemoInbound[];
  sync: readonly SyncRow[];
}

const START_LIVE: MapLive = { minutes: 0, inbound: INBOUND, sync: SYNC };

interface Props {
  /** デモの時計・入荷と搬送・記録の届き方（Issue #128）。光・搬送便・車の位置をここから求める */
  live?: MapLive;
  /** 動きを減らす設定。光の脈打ち・道筋の流れ・印の移動の動きを止める（CSS の prefers-reduced-motion でも止める） */
  reducedMotion?: boolean;
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
  通行可: "#555555", // 正常は色なし（Issue #143、計画書 2.3）
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
      return <rect x={x} y={y} width={w} height={h} rx="4" fill="#f4f4f4" stroke="#c8c8c8" />;
    case "hospital":
      return <rect x={x} y={y} width={w} height={h} fill="#dcdcdc" stroke="#8a8a8a" strokeWidth="1.5" />;
    case "parking": {
      const lines = [];
      for (let yy = y + 10; yy < y + h - 4; yy += 10) {
        lines.push(<path key={yy} d={`M${x + 6},${yy} H${x + w - 6}`} stroke="#fff" strokeWidth="1.5" />);
      }
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="#c4c4c4" />
          {lines}
          <circle cx={x + w / 2} cy={y + h / 2} r="10" fill="#555555" />
          <text x={x + w / 2} y={y + h / 2 + 5} fontSize="14" fontWeight="800" fill="#fff" textAnchor="middle">
            P
          </text>
        </g>
      );
    }
    case "school":
      return <rect x={x} y={y} width={w} height={h} fill="#e6e6e6" stroke="#9a9a9a" strokeWidth="1.5" />;
    case "ground":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx="6" fill="#dedede" />
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2 - 10} ry={h / 2 - 10} fill="none" stroke="#fff" strokeWidth="2.5" />
        </g>
      );
    case "hall":
      return <rect x={x} y={y} width={w} height={h} fill="#e2e2e2" stroke="#949494" strokeWidth="1.5" />;
    case "park":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx="4" fill="#e6e6e6" />
          {[0.25, 0.5, 0.75].map((p) => (
            <circle key={p} cx={x + w * p} cy={y + h * (p === 0.5 ? 0.65 : 0.35)} r="7" fill="#c8c8c8" />
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
export function BoardMap({ overview, routes = ROUTES, onSelect, selected, side = true, live = START_LIVE, reducedMotion = false }: Props) {
  const routeOf = (site: string) => routes.find((r) => r.to === site);
  const notes = areaNotes(routes);
  const ex = MAP_EXPRESSWAY.x;
  // 道筋を浮かび上がらせる救護所：カーソル・焦点 → 経路の行で押したもの → 選んでいる救護所
  const [focused, setFocused] = useState<SiteId | null>(null);
  const [pinned, setPinned] = useState<SiteId | null>(null);
  // 押した「便」「車」（行き先と到着見込みを出す）
  const [mover, setMover] = useState<string | null>(null);
  const emph = focused ?? pinned ?? (selected && selected !== HQ ? selected : null);
  const emphRoute = emph ? routeOf(emph) : undefined;
  const glows = siteGlows(overview, live.sync, live.minutes);
  const shipments = shipmentMarkers(live.inbound, live.minutes, routes);
  const car = vehicleAt(live.minutes, routes);
  const placeName = (site: SiteId) => (site === HQ ? "本部" : site);
  const carText =
    car.state === "移動中"
      ? BOARD_MAP_LIVE.vehicleMoving(placeName(car.to), clockText(car.arriveAt))
      : BOARD_MAP_LIVE.vehicleStopped(placeName(car.at ?? HQ), placeName(car.to), clockText(car.arriveAt));
  const shipmentText = (s: (typeof shipments)[number]) => BOARD_MAP_LIVE.shipment(s.mode, s.item, s.qty, s.to, clockText(s.arriveAt));
  const moverText =
    mover === "car" ? `${BOARD_MAP_LIVE.vehicleName}：${carText}` : (() => {
      const s = shipments.find((x) => `s-${x.id}` === mover);
      return s ? shipmentText(s) : null;
    })();
  const toggleMover = (id: string) => setMover((cur) => (cur === id ? null : id));
  // 図（role="img"）の中の印は、マウス・タッチで押せるだけにする。キーボード・読み上げでは、図の下の一覧のボタンで同じ操作をする
  // （画像として扱われる SVG の中の操作要素は読み上げに出ないため。PR #130 のレビュー）
  const moverPress = (id: string) => ({ onClick: () => toggleMover(id) });
  const moverRows = [
    { id: "car", text: `${BOARD_MAP_LIVE.vehicleName}：${carText}` },
    ...shipments.map((sh) => ({ id: `s-${sh.id}`, text: shipmentText(sh) })),
  ];
  return (
    <section className={`board-map${reducedMotion ? " board-map-still" : ""}`} aria-labelledby="board-map-title">
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
                  <rect x="2" y="2" width="11" height="9" fill="#d8d8d8" />
                </pattern>
              </defs>
              {/* 地面（生活道路の色）と街区（住宅地） */}
              <rect width={MAP_W} height={MAP_H} fill="#f7f7f7" />
              {MAP_BLOCKS.map((b) => (
                <g key={`${b.x},${b.y}`}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#e0e0e0" />
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="url(#board-map-houses)" />
                </g>
              ))}
              {/* 山林 */}
              {MAP_HILLS.map((d) => (
                <g key={d}>
                  <path d={d} fill="#e4e4e4" />
                  <path d={d} fill="none" stroke="#bdbdbd" strokeWidth="1.5" strokeDasharray="10 6" transform="translate(-6,0)" />
                </g>
              ))}
              {/* 施設 */}
              {MAP_FACILITIES.map((f) => (
                <FacilityShape key={`${f.kind}${f.rect.x},${f.rect.y}`} f={f} />
              ))}
              {/* 碁盤目に乗らない生活道路（川沿いの道）と幹線道路 */}
              {MAP_LOCAL_ROADS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#f7f7f7" strokeWidth="8" strokeLinejoin="round" />
              ))}
              {MAP_MAIN_ROADS.map((d) => (
                <path key={`c${d}`} d={d} fill="none" stroke="#c4c4c4" strokeWidth="16" />
              ))}
              {MAP_MAIN_ROADS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#ffffff" strokeWidth="12" />
              ))}
              {/* 川（街区と道を覆う。道が川を渡るのは橋だけ） */}
              <path d={MAP_RIVER} fill="none" stroke="#e2e2e2" strokeWidth="44" strokeLinejoin="round" />
              <path d={MAP_RIVER} fill="none" stroke="#d4d4d4" strokeWidth="26" strokeLinejoin="round" />
              {/* 土砂が流れ込んだ場所 */}
              {MAP_LANDSLIDES.map((d) => (
                <path key={d} d={d} fill="#a8a8a8" opacity="0.85" />
              ))}
              {/* 橋 */}
              {MAP_BRIDGES.map((b) => (
                <g key={`${b.x},${b.y}`} transform={`translate(${b.x},${b.y}) rotate(${b.angle})`}>
                  <rect x="-30" y="-9" width="60" height="18" fill="#ffffff" stroke="#666" strokeWidth="2" />
                </g>
              ))}
              {/* 高速道路（架空） */}
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#8a8378" strokeWidth="20" />
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#d6d6d6" strokeWidth="15" />
              <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke="#fff" strokeWidth="1.5" strokeDasharray="10 8" />
              <g transform={`translate(${ex},250)`}>
                <rect x="-13" y="-46" width="26" height="80" rx="5" fill="#5d5a55" />
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
                const on = emph === m.to;
                return (
                  <g key={m.to} className={`board-map-route ${status}`} data-status={status} data-emph={emph === null ? undefined : on ? "on" : "dim"}>
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
                    {/* 浮かび上がった道筋：実際に通る線を太く縁取り、本部から救護所へ流れる破線で向きを示す（Issue #128） */}
                    {on && (
                      <g className="board-map-path">
                        <path d={toPathD(travelLine(m.to, status))} fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
                        {/* 通行止めは車が通れないので流さない（× と文で示す） */}
                        {status !== "通行止め" && (
                          <path
                            className="board-map-flow"
                            d={toPathD(travelLine(m.to, status))}
                            fill="none"
                            stroke="#fff"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="6 14"
                          />
                        )}
                      </g>
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
              {/* 光る救護所（Issue #128）。既存の状態（在庫切れ＝赤、切れる見込み・薬剤師の不足・最終報告が古い＝黄）だけで決める。
                  ゆっくり脈打つ（1周 2.4 秒。1秒に3回を超えて点滅しない）。動きを減らす設定では動かない光 */}
              <g className="board-map-glows" aria-hidden="true">
                {glows.map((g) => {
                  const s = MAP_SITES.find((x) => x.site === g.site);
                  if (!s) return null;
                  const color = g.level === "bad" ? ROUTE_COLOR.通行止め : ROUTE_COLOR.迂回;
                  return (
                    <g key={g.site} transform={`translate(${s.x},${s.y})`} data-glow-site={g.site} data-level={g.level}>
                      <circle r="46" fill={color} opacity="0.16" />
                      <circle className="board-map-glow" r="32" fill={color} opacity="0.4" />
                    </g>
                  );
                })}
              </g>
              {/* 拠点 */}
              {MAP_SITES.map((s) => {
                const o = overview.find((x) => x.site === s.site);
                const isHq = s.site === HQ;
                // 在庫切れは赤、薬剤師の不足は無彩色（職種は残し、目立たせ方を抑える。Issue #113）
                const badges: { text: string; bad: boolean }[] = [];
                if (o && o.outOfStock > 0) badges.push({ text: `${BOARD_MAP.outOfStock} ${fmt.format(o.outOfStock)}`, bad: true });
                if (o && o.pharmacistsShort > 0) badges.push({ text: BOARD_MAP.pharmacistsShort(o.pharmacistsShort), bad: false });
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
                // カーソル・焦点で、本部からの道筋を浮かび上がらせる（本部は道筋を持たない）
                const hover =
                  isHq
                    ? {}
                    : {
                        onMouseEnter: () => setFocused(s.site),
                        onMouseLeave: () => setFocused((cur) => (cur === s.site ? null : cur)),
                        onFocus: () => setFocused(s.site),
                        onBlur: () => setFocused((cur) => (cur === s.site ? null : cur)),
                      };
                return (
                  <g
                    key={s.site}
                    className={`board-map-site${onSelect ? " pressable" : ""}${isSelected ? " selected" : ""}`}
                    transform={`translate(${s.x},${s.y})`}
                    data-site={s.site}
                    {...press}
                    {...hover}
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
                      stroke={isHq ? "#222222" : "#5d5a55"}
                      strokeWidth={isSelected ? 4 : 1.5}
                    />
                    <text x={cx} y={top + 20} fontSize="18" fontWeight="700" fill="#111" textAnchor="middle">
                      {name}
                    </text>
                    <text x={cx} y={top + 36} fontSize="13" fill="#444" textAnchor="middle">
                      {s.place}
                    </text>
                    {badges.map((b, i) => (
                      <g key={b.text} transform={`translate(${cx - 62}, ${top + 42 + i * 24})`}>
                        <rect width="124" height="20" rx="4" fill={b.bad ? "#fdecea" : "#f1f3f5"} stroke={b.bad ? "#c62828" : "#8a8f96"} />
                        <text x="62" y="14" fontSize="12" fill={b.bad ? "#8a1c1c" : "#2f3439"} textAnchor="middle" fontWeight={b.bad ? 700 : 400}>
                          {b.text}
                        </text>
                      </g>
                    ))}
                    <circle r={isHq ? 20 : 17} fill={isHq ? "#222222" : "#3d3a36"} stroke="#fff" strokeWidth="4" />
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
              {/* 動いているもの（Issue #128。架空・模擬）：搬送中の便と医療チームの車。位置はデモ時計から求め、時計が進むと滑らかに移る。
                  印は点の上（便）と下（車）に置き、重なる便は横にずらす。押すと行き先と到着見込みを図の下に出す */}
              <g className="board-map-movers">
                {shipments.map((sh, i) => {
                  const k = shipments.slice(0, i).filter((o) => Math.hypot(o.x - sh.x, o.y - sh.y) < 28).length;
                  const id = `s-${sh.id}`;
                  return (
                    <g
                      key={id}
                      className={`board-map-mover shipment${mover === id ? " active" : ""}`}
                      style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}
                      data-mover={id}
                      {...moverPress(id)}
                    >
                      <g transform={`translate(${k * 32},0)`}>
                        <path d="M0,0 V-16" stroke="#3d3a36" strokeWidth="2" />
                        <circle r="4" fill="#3d3a36" />
                        <rect x="-15" y="-38" width="30" height="22" rx="4" fill="#fff" stroke="#3d3a36" strokeWidth={mover === id ? 3.5 : 2} />
                        <text y="-22" fontSize="13" fontWeight="800" fill="#3d3a36" textAnchor="middle">
                          便
                        </text>
                      </g>
                    </g>
                  );
                })}
                <g
                  className={`board-map-mover vehicle${mover === "car" ? " active" : ""}`}
                  style={{ transform: `translate(${car.x}px, ${car.y}px)` }}
                  data-mover="car"
                  {...moverPress("car")}
                >
                  <path d="M0,0 V16" stroke="#222222" strokeWidth="2" />
                  <circle r="4" fill="#222222" />
                  <rect x="-19" y="16" width="38" height="22" rx="6" fill="#222222" stroke="#fff" strokeWidth={mover === "car" ? 3.5 : 2} />
                  <text y="32" fontSize="13" fontWeight="800" fill="#fff" textAnchor="middle">
                    車
                  </text>
                </g>
              </g>
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
            <span>
              <i className="glow bad" /> {BOARD_MAP_LIVE.legendGlowBad}
            </span>
            <span>
              <i className="glow warn" /> {BOARD_MAP_LIVE.legendGlowWarn}
            </span>
            <span>
              <i className="mk shipment">便</i> {BOARD_MAP_LIVE.legendShipment}
            </span>
            <span>
              <i className="mk vehicle">車</i> {BOARD_MAP_LIVE.legendVehicle}
            </span>
          </figcaption>
          {/* 図と同じことを文字でも示す（動きを減らす設定でも、静止した図とこの文で分かる） */}
          <div className="board-map-live">
            <p className="board-map-route-info" aria-live="polite">
              {emph && emphRoute
                ? BOARD_MAP_LIVE.routeLine(emph, emphRoute.status, emphRoute.via, emphRoute.minutes)
                : BOARD_MAP_LIVE.routeHint}
            </p>
            {/* 開閉できる欄（Issue #159）。赤（在庫切れ）があるときだけ開いておく */}
            <Fold
              id="board-map-glows"
              title={BOARD_MAP_LIVE.glowTitle}
              count={`${glows.length} か所`}
              open={glows.some((g) => g.level === "bad")}
            >
              {glows.length === 0 ? (
                <p>{BOARD_MAP_LIVE.glowNone}</p>
              ) : (
                <ul className="board-map-glow-list">
                  {glows.map((g) => (
                    <li key={g.site}>
                      <span className={`board-pill ${g.level}`}>{g.level === "bad" ? "赤" : "黄"}</span>{" "}
                      {`${g.site}：${g.reasons.map((r) => BOARD_MAP_LIVE.glowReason[r.kind](r.value)).join("・")}`}
                    </li>
                  ))}
                </ul>
              )}
              <Help>
                <p className="board-note">{BOARD_MAP_LIVE.staleNote(STALE_REPORT_HOURS)}</p>
              </Help>
            </Fold>
            {/* 図の印を押したときの行き先と到着見込みは、一覧を閉じていても見えるよう欄の外に出す（Issue #159） */}
            <p className="board-map-mover-info" aria-live="polite">
              {moverText ?? BOARD_MAP_LIVE.pressHint}
            </p>
            {/* 一覧はふだん閉じておく（Issue #159） */}
            <Fold id="board-map-movers" title={BOARD_MAP_LIVE.moversTitle} count={`${moverRows.length} 件`} open={false}>
              {/* 一覧の行は SVG の外の本物のボタン。押すと図の印を太くし、上の欄に行き先と到着見込みを出す（もう一度押すと戻す） */}
              <ul className="board-map-mover-list">
                {moverRows.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="board-map-mover-btn" aria-pressed={mover === r.id} onClick={() => toggleMover(r.id)}>
                      {r.text}
                    </button>
                  </li>
                ))}
                {shipments.length === 0 && <li>{BOARD_MAP_LIVE.noShipment}</li>}
              </ul>
              <Help>
                <p className="board-note">{BOARD_MAP_LIVE.moversNote}</p>
              </Help>
            </Fold>
          </div>
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
                  {/* 押すと図の道筋を浮かび上がらせる（タッチでも使える。Issue #128）。もう一度押すと戻す */}
                  <button
                    type="button"
                    className="board-map-route-btn"
                    aria-pressed={pinned === r.to}
                    onClick={() => setPinned((cur) => (cur === r.to ? null : r.to))}
                  >
                    <span className={`board-pill ${r.status === "通行可" ? "ok" : r.status === "迂回" ? "warn" : "bad"}`}>{r.status}</span> {r.to}
                    {r.minutes !== null && `（約${fmt.format(r.minutes)}分）`}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {/* ふだんは閉じておく（Issue #159） */}
          <Fold id="board-map-notes" title={BOARD_MAP.notesTitle} count={`${notes.length} 件`} open={false}>
            <ul className="board-map-notes">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Fold>
        </div>
        )}
      </div>
    </section>
  );
}
