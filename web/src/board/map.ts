// 架空の町の模式図（Issue #105）。本部と救護所の位置、碁盤目の道、川と橋、施設を SVG の座標で持つ。
// 町も道も川もすべて架空で、実在の地名・道路名・道路番号・施設名を使わない。外部の地図タイルは使わない（画像も持たない）。
// 経路の色は data.ts の ROUTES の状態から、拠点の印は summary.ts の siteOverview から決める（デモで動く）。

import { DEMAND, type RouteRow, type SiteId } from "./data";

export const TOWN_NAME = "架空の町";

/** 図の大きさ（viewBox） */
export const MAP_W = 1000;
export const MAP_H = 640;

/** 図の下の帯（架空の明記を置く）の上端 */
export const MAP_NOTE_Y = 614;

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
  { site: "本部備蓄", x: 760, y: 92, place: "本部（総合病院・集積所）", labelSide: "left" },
  { site: "救護所A", x: 590, y: 320, place: "小学校の体育館", labelSide: "top" },
  { site: "救護所B", x: 140, y: 320, place: "公民館", labelSide: "bottom" },
  { site: "救護所C", x: 330, y: 520, place: "中学校", labelSide: "right" },
  { site: "救護所D", x: 880, y: 540, place: "集会所", labelSide: "left" },
];

/** 道の上の印に添える文。dx・dy は印からの位置、anchor は文の寄せ方 */
export interface MapMarkLabel {
  x: number;
  y: number;
  label: string;
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
}

/** 本部から救護所への道（経路）。碁盤目に沿って直角に曲がる。迂回の道は detour、通れない場所は blocked */
export interface MapRoute {
  to: SiteId;
  /** 本来の道（SVG の path） */
  d: string;
  /** 迂回の道（迂回のときに点線で出す） */
  detour?: string;
  /** 通れない場所の印（× を道の上に置く） */
  blocked?: MapMarkLabel;
  /** 注意の場所（片側交互通行など） */
  caution?: MapMarkLabel;
}

export const MAP_ROUTES: readonly MapRoute[] = [
  // A：幹線道路（東回り）。本部から南の幹線を下り、東から入る
  { to: "救護所A", d: "M760,92 V320 H590" },
  // B：北の幹線で北の橋を渡り、川沿いの道を南へ（土砂で通行止め）。山側の道で迂回
  {
    to: "救護所B",
    d: "M760,92 V130 H235 L252,250 L282,320 H140",
    detour: "M235,130 H70 V320 H140",
    blocked: { x: 246, y: 214, label: "川沿いの道：土砂で通れない", dx: -14, dy: 40, anchor: "middle" },
  },
  // C：幹線道路（西回り）。南の幹線で南の橋を渡る。橋は片側交互通行
  {
    to: "救護所C",
    d: "M760,92 V440 H330 V520",
    caution: { x: 420, y: 440, label: "橋：片側交互通行", dx: 18, dy: 34, anchor: "start" },
  },
  // D：東の道が山すその土砂で車が通れない。連絡員が徒歩
  {
    to: "救護所D",
    d: "M760,92 V130 H880 V540",
    blocked: { x: 880, y: 400, label: "土砂：車は通れない", dx: -24, dy: 5, anchor: "end" },
  },
];

/** 碁盤目の生活道路の位置（この線の間が街区になる） */
const STREETS_H = [0, 60, 130, 200, 260, 320, 380, 440, 510, 570, MAP_NOTE_Y] as const;
const STREETS_V = [56, 70, 140, 210, 330, 400, 470, 540, 610, 680, 760, 830, 880, 920, 952] as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 街区（住宅地）。生活道路の線の間に、道の幅だけ内側へ寄せた四角を置く */
export const MAP_BLOCKS: readonly Rect[] = (() => {
  const gap = 4;
  const out: Rect[] = [];
  for (let i = 0; i < STREETS_H.length - 1; i++) {
    for (let j = 1; j < STREETS_V.length - 1; j++) {
      const x = STREETS_V[j] + gap;
      const y = STREETS_H[i] + (i === 0 ? 0 : gap);
      const w = STREETS_V[j + 1] - STREETS_V[j] - gap * 2;
      const h = STREETS_H[i + 1] - y - gap;
      if (w > 8 && h > 8) out.push({ x, y, w, h });
    }
  }
  return out;
})();

/** 幹線道路（太い道）。北の幹線（東西）、南の幹線（東西）、中央の幹線（南北） */
export const MAP_MAIN_ROADS: readonly string[] = ["M56,130 H952", "M56,440 H952", "M760,0 V614"];

/** 生活道路のうち、碁盤目に乗らない道（川沿いの道） */
export const MAP_LOCAL_ROADS: readonly string[] = ["M235,130 L252,250 L282,320"];

/** 高速道路（架空）。東端を南北に走る */
export const MAP_EXPRESSWAY = { x: 968, label: "高速道路" } as const;

/** 川（架空）。北西から南東へ、緩やかに折れて流れる */
export const MAP_RIVER = "M215,0 L240,80 L290,170 L305,260 L350,350 L410,430 L470,490 L540,545 L610,600 L660,640";

/** 橋。x・y は橋の中心、angle は道の向き（度） */
export const MAP_BRIDGES: readonly { x: number; y: number; angle: number }[] = [
  { x: 268, y: 130, angle: 0 },
  { x: 420, y: 440, angle: 0 },
  { x: 572, y: 570, angle: 0 },
];

/** 山林（西の山、東の山すそ） */
export const MAP_HILLS: readonly string[] = [
  "M0,0 H62 L52,110 L60,250 L50,400 L58,520 L52,614 H0 Z",
  "M892,340 L948,326 L952,470 L892,458 L900,400 Z",
];

/** 土砂が流れ込んだ場所（茶色の扇形） */
export const MAP_LANDSLIDES: readonly string[] = [
  "M206,190 L246,204 L250,226 L212,238 Z",
  "M900,380 L872,392 L870,412 L900,422 Z",
];

export type FacilityKind = "lot" | "hospital" | "parking" | "school" | "ground" | "hall" | "park";

/** 施設の図形（病院の建物と駐車場、学校の校舎とグラウンド、公民館・集会所、公園） */
export interface Facility {
  kind: FacilityKind;
  rect: Rect;
}

export const MAP_FACILITIES: readonly Facility[] = [
  // 本部（総合病院）：敷地、病棟、駐車場
  { kind: "lot", rect: { x: 688, y: 34, w: 182, h: 90 } },
  { kind: "hospital", rect: { x: 700, y: 46, w: 112, h: 30 } },
  { kind: "hospital", rect: { x: 724, y: 76, w: 30, h: 38 } },
  { kind: "parking", rect: { x: 818, y: 46, w: 44, h: 68 } },
  // 救護所A（小学校）：校舎とグラウンド
  { kind: "school", rect: { x: 546, y: 328, w: 126, h: 22 } },
  { kind: "ground", rect: { x: 552, y: 356, w: 114, h: 74 } },
  // 救護所B（公民館）
  { kind: "hall", rect: { x: 156, y: 270, w: 42, h: 26 } },
  // 救護所C（中学校）：校舎とグラウンド
  { kind: "school", rect: { x: 216, y: 448, w: 106, h: 22 } },
  { kind: "ground", rect: { x: 218, y: 478, w: 102, h: 82 } },
  // 救護所D（集会所）
  { kind: "hall", rect: { x: 888, y: 514, w: 28, h: 22 } },
  // 公園
  { kind: "park", rect: { x: 614, y: 444, w: 62, h: 62 } },
];

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
