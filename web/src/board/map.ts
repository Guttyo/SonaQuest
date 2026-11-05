// 架空の町の模式図（Issue #105）。本部と救護所の位置、道、川を SVG の座標で持つ。
// 町も道も川もすべて架空で、実在の地名・道路名・施設名を使わない。外部の地図タイルは使わない（画像も持たない）。
// 経路の色は data.ts の ROUTES の状態から、拠点の印は summary.ts の siteOverview から決める（デモで動く）。

import { DEMAND, type RouteRow, type SiteId } from "./data";

export const TOWN_NAME = "架空の町";

/** 図の大きさ（viewBox） */
export const MAP_W = 1000;
export const MAP_H = 640;

export interface MapSite {
  site: SiteId;
  x: number;
  y: number;
  /** 施設の呼び名（架空） */
  place: string;
  /** 名前の札を置く向き */
  labelSide: "left" | "right" | "top" | "bottom";
}

export const MAP_SITES: readonly MapSite[] = [
  { site: "本部備蓄", x: 740, y: 140, place: "本部（総合病院・集積所）", labelSide: "top" },
  { site: "救護所A", x: 470, y: 330, place: "体育館", labelSide: "top" },
  { site: "救護所B", x: 165, y: 255, place: "公民館", labelSide: "top" },
  { site: "救護所C", x: 560, y: 500, place: "校舎", labelSide: "bottom" },
  { site: "救護所D", x: 880, y: 470, place: "集会所", labelSide: "bottom" },
];

/** 本部から救護所への道（経路）。迂回の道は detour、通れない場所は blocked */
export interface MapRoute {
  to: SiteId;
  /** 本来の道（SVG の path） */
  d: string;
  /** 迂回の道（迂回のときに点線で出す） */
  detour?: string;
  /** 通れない場所の印の位置と文。below は文を印の下に置く（ほかの札と重ならないように） */
  blocked?: { x: number; y: number; label: string; below?: boolean };
  /** 注意の場所（片側交互通行など） */
  caution?: { x: number; y: number; label: string };
}

export const MAP_ROUTES: readonly MapRoute[] = [
  // A：幹線道路（東回り）。本部から南西へ
  { to: "救護所A", d: "M740,140 C700,220 600,250 470,330" },
  // B：川沿いの道が通行止め。山側の道で迂回
  {
    to: "救護所B",
    d: "M470,330 C380,330 300,320 240,300 C210,290 185,275 165,255",
    detour: "M470,330 C420,250 330,180 240,170 C200,170 175,210 165,255",
    blocked: { x: 255, y: 305, label: "川沿いの道：土砂で通れない", below: true },
  },
  // C：幹線道路（西回り）。橋は片側交互通行
  { to: "救護所C", d: "M470,330 C480,400 520,450 560,500", caution: { x: 505, y: 420, label: "橋：片側交互通行" } },
  // D：土砂で車が通れない。連絡員が徒歩
  { to: "救護所D", d: "M740,140 C800,250 860,360 880,470", blocked: { x: 830, y: 330, label: "土砂：車は通れない" } },
];

/** そのほかの道（色を付けない） */
export const MAP_OTHER_ROADS: readonly string[] = [
  "M60,120 C250,110 420,80 740,140",
  "M740,140 C820,120 900,110 980,100",
  "M470,330 C560,330 650,320 760,300 C820,290 880,280 980,270",
  "M560,500 C650,520 760,500 880,470",
  "M165,255 C150,350 180,460 300,560 C400,610 480,560 560,500",
  "M880,470 C900,540 940,590 990,620",
];

/** 川（架空） */
export const MAP_RIVER = "M40,60 C120,160 200,240 280,330 C360,420 420,520 520,600 C560,630 600,635 640,640";

/** 本部の周りの状況（架空の天候と避難者数） */
export const MAP_STATUS = {
  temp: "6℃",
  snow: "なし",
  rain: "小雨",
  evacuees: DEMAND.reduce((a, d) => a + d.evacuees, 0),
} as const;

/** このエリアの最新情報（架空。経路の備考から作る固定文） */
export function areaNotes(routes: readonly RouteRow[]): string[] {
  const notes: string[] = [];
  for (const r of routes) {
    if (r.status === "通行止め") notes.push(`${r.to}への道：${r.via}`);
    else if (r.status === "迂回") notes.push(`${r.to}への道：${r.via}`);
  }
  for (const r of routes) {
    if (r.status === "通行可" && r.via.includes("橋")) notes.push(`${r.to}への道：${r.via}`);
  }
  notes.push("各救護所で問診を実施中。記録は紙で、搬送便・連絡員で本部に届く");
  return notes;
}
