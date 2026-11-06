// ボードの「拠点と経路の図」を動画用に描き直したもの（約30秒の紹介動画。ADR-0051 の Remotion のパッケージ）。
// 図形と経路は web/src/board/map.ts の値をそのまま読む（架空の町。実在の地名・道路を使わない）。
// アプリの BoardMap.tsx は時計の刻み（requestAnimationFrame）で動くので使わず、ここではフレームから位置を決める。
// 動画の決まり（白地に黒の線）に合わせ、色は通れない（赤）・迂回（黄）・確認できた（緑）だけに使う。
import type { FC, ReactNode } from "react";
import {
  MAP_BLOCKS,
  MAP_BRIDGES,
  MAP_EXPRESSWAY,
  MAP_H,
  MAP_HILLS,
  MAP_LANDSLIDES,
  MAP_LOCAL_ROADS,
  MAP_MAIN_ROADS,
  MAP_NOTE_Y,
  MAP_RIVER,
  MAP_SITES,
  MAP_W,
} from "../../../web/src/board/map";
import { lineLength, pointAt, toPathD, type Pt } from "../../../web/src/board/live";
import { GOTHIC } from "./style";

export const INK = "#111111";
export const RED = "#c62828";
export const YELLOW = "#c99a06";
export const GREEN = "#2e7d32";

/** 線の始まりから割合 t（0〜1）までを切り出す（経路が順に描かれる見せ方に使う） */
export function partialLine(pts: readonly Pt[], t: number): Pt[] {
  if (pts.length < 2 || t <= 0) return pts.slice(0, 1);
  if (t >= 1) return [...pts];
  const target = lineLength(pts) * t;
  const out: Pt[] = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (run + seg >= target) {
      out.push(pointAt(pts, t));
      return out;
    }
    run += seg;
    out.push(pts[i]);
  }
  return out;
}

const SITE_LETTER: Record<string, string> = {
  本部備蓄: "本",
  救護所A: "A",
  救護所B: "B",
  救護所C: "C",
  救護所D: "D",
};

/** 背景の町（街区・幹線・川・橋・山林・土砂・高速道路） */
const Town: FC = () => {
  const ex = MAP_EXPRESSWAY.x;
  return (
    <g>
      <rect width={MAP_W} height={MAP_NOTE_Y} fill="#ffffff" />
      {MAP_HILLS.map((d) => (
        <path key={d} d={d} fill="#f2f2f2" stroke={INK} strokeWidth="1" strokeDasharray="5 5" />
      ))}
      {MAP_BLOCKS.map((b) => (
        <rect key={`${b.x},${b.y}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" stroke="#9a9a9a" strokeWidth="1" />
      ))}
      <path d={MAP_RIVER} fill="none" stroke={INK} strokeWidth="30" strokeLinejoin="round" />
      <path d={MAP_RIVER} fill="none" stroke="#ffffff" strokeWidth="27" strokeLinejoin="round" />
      <path d={MAP_RIVER} fill="none" stroke="#bdbdbd" strokeWidth="1.5" strokeDasharray="10 8" strokeLinejoin="round" />
      {MAP_MAIN_ROADS.map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={INK} strokeWidth="13" />
          <path d={d} fill="none" stroke="#ffffff" strokeWidth="10" />
        </g>
      ))}
      {MAP_LOCAL_ROADS.map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={INK} strokeWidth="9" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#ffffff" strokeWidth="6.5" strokeLinejoin="round" />
        </g>
      ))}
      {MAP_BRIDGES.map((b) => (
        <rect
          key={`${b.x},${b.y}`}
          x={b.x - 26}
          y={b.y - 8}
          width="52"
          height="16"
          fill="#ffffff"
          stroke={INK}
          strokeWidth="2"
          transform={`rotate(${b.angle} ${b.x} ${b.y})`}
        />
      ))}
      {MAP_LANDSLIDES.map((d) => (
        <path key={d} d={d} fill="#8a8a8a" stroke={INK} strokeWidth="1" />
      ))}
      <path d={`M${ex - 8},0 V${MAP_NOTE_Y} M${ex + 8},0 V${MAP_NOTE_Y}`} stroke={INK} strokeWidth="2" />
      <path d={`M${ex},0 V${MAP_NOTE_Y}`} stroke={INK} strokeWidth="1" strokeDasharray="8 8" />
    </g>
  );
};

/** 本部と救護所の印。glow に入れた拠点は輪を広げて目立たせる（frame はその輪の動きに使う） */
export const Sites: FC<{ glow?: string | null; frame?: number; showPlace?: boolean }> = ({ glow = null, frame = 0, showPlace = true }) => (
  <g>
    {MAP_SITES.map((s) => {
      const isHq = s.site === "本部備蓄";
      const on = glow === s.site;
      const pulse = (frame % 30) / 30;
      const name = isHq ? "本部" : s.site;
      const ty = s.labelSide === "top" ? -34 : s.labelSide === "bottom" ? 46 : 7;
      const tx = s.labelSide === "left" ? -32 : s.labelSide === "right" ? 32 : 0;
      const anchor = s.labelSide === "left" ? "end" : s.labelSide === "right" ? "start" : "middle";
      return (
        <g key={s.site} transform={`translate(${s.x},${s.y})`}>
          {on ? (
            <>
              <circle r={22 + pulse * 34} fill="none" stroke={YELLOW} strokeWidth="4" opacity={1 - pulse} />
              <circle r="30" fill={YELLOW} opacity="0.25" />
            </>
          ) : null}
          <circle r={isHq ? 21 : 18} fill={INK} stroke="#ffffff" strokeWidth="4" />
          <text y="8" fontSize="22" fontWeight="800" fill="#ffffff" textAnchor="middle" fontFamily={GOTHIC}>
            {SITE_LETTER[s.site]}
          </text>
          {showPlace ? (
            <g transform={`translate(${tx},${ty})`}>
              <text
                fontSize="19"
                fontWeight="700"
                fill={INK}
                textAnchor={anchor}
                fontFamily={GOTHIC}
                stroke="#ffffff"
                strokeWidth="6"
                paintOrder="stroke"
              >
                {name}
              </text>
            </g>
          ) : null}
        </g>
      );
    })}
  </g>
);

/** 道の上の × （通れない場所） */
export const BlockedMark: FC<{ x: number; y: number; scale?: number }> = ({ x, y, scale = 1 }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    <circle r="15" fill={RED} stroke="#ffffff" strokeWidth="3" />
    <path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
  </g>
);

/** 車・搬送便の印 */
export const Mover: FC<{ x: number; y: number; color?: string; label?: string; labelBelow?: boolean }> = ({
  x,
  y,
  color = INK,
  label,
  labelBelow = false,
}) => (
  <g transform={`translate(${x},${y})`}>
    <rect x="-17" y="-12" width="34" height="24" rx="6" fill={color} stroke="#ffffff" strokeWidth="3" />
    <path d="M-7,0 H7 M0,-7 V7" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
    {label ? (
      <text
        y={labelBelow ? 34 : -22}
        fontSize="16"
        fontWeight="700"
        fill={color}
        textAnchor="middle"
        fontFamily={GOTHIC}
        stroke="#ffffff"
        strokeWidth="5"
        paintOrder="stroke"
      >
        {label}
      </text>
    ) : null}
  </g>
);

/** 線（経路・通った跡） */
export const Line: FC<{ pts: readonly Pt[]; color: string; width?: number; dash?: string; opacity?: number }> = ({
  pts,
  color,
  width = 7,
  dash,
  opacity = 1,
}) =>
  pts.length < 2 ? null : (
    <path
      d={toPathD(pts)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      opacity={opacity}
    />
  );

/**
 * 図の本体。viewBox は map.ts と同じ（1000×614。下の注記の帯は描かない）。
 * camera を渡すと、その点を中心に scale 倍に寄せる（クローズアップ・カーソル追従ズーム）
 */
export const MapLayer: FC<{
  width: number;
  camera?: { x: number; y: number; scale: number };
  children?: ReactNode;
  under?: ReactNode;
}> = ({ width, camera, children, under }) => {
  const height = (width * MAP_NOTE_Y) / MAP_W;
  const cam = camera ?? { x: MAP_W / 2, y: MAP_NOTE_Y / 2, scale: 1 };
  const t = `translate(${MAP_W / 2},${MAP_NOTE_Y / 2}) scale(${cam.scale}) translate(${-cam.x},${-cam.y})`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${MAP_W} ${MAP_NOTE_Y}`} style={{ display: "block" }}>
      <g transform={t}>
        <Town />
        {under}
        {children}
      </g>
      <rect x="0.5" y="0.5" width={MAP_W - 1} height={MAP_NOTE_Y - 1} fill="none" stroke={INK} strokeWidth="2" />
    </svg>
  );
};

export { MAP_H };
