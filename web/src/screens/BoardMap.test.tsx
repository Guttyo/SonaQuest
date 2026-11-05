import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS, ROUTES, SITES, STOCK, SYNC, type RouteRow } from "../board/data";
import { MAP_ROUTES, MAP_SITES, areaNotes } from "../board/map";
import { siteOverview } from "../board/summary";
import { BoardMap } from "./BoardMap";

const overview = siteOverview(STOCK, PATIENTS, SITES, SYNC, ROUTES);
const html = renderToStaticMarkup(<BoardMap overview={overview} />);

describe("架空の町の模式図（Issue #105）", () => {
  it("本部と救護所4か所の拠点、本部からの経路4本がある", () => {
    expect(MAP_SITES).toHaveLength(5);
    expect(MAP_ROUTES.map((r) => r.to).sort()).toEqual(["救護所A", "救護所B", "救護所C", "救護所D"]);
    expect(html.match(/<g class="board-map-site"/g)).toHaveLength(5);
    expect(html).toContain('data-site="本部備蓄"');
    expect(html.match(/<g class="board-map-route /g)).toHaveLength(4);
  });

  it("経路と迂回の道は碁盤目に沿って直角に曲がる（川沿いの道だけ斜め）", () => {
    for (const r of MAP_ROUTES) {
      const paths = [r.d, r.detour].filter((p): p is string => !!p);
      for (const p of paths) {
        const turns = p.match(/[A-Z]/g) ?? [];
        expect(turns.every((c) => c === "M" || c === "H" || c === "V" || (r.to === "救護所B" && c === "L"))).toBe(true);
      }
    }
  });

  it("経路の色と印は ROUTES の状態に合う（通行可＝緑、迂回＝黄の点線と迂回の道、通行止め＝赤の×）", () => {
    for (const r of ROUTES) {
      expect(html).toContain(`data-status="${r.status}"`);
    }
    const b = html.slice(html.indexOf('class="board-map-route 迂回"'), html.indexOf('class="board-map-route 通行可"', html.indexOf('class="board-map-route 迂回"')));
    expect(b).toContain('stroke-dasharray="14 10"');
    expect(b).toContain("川沿いの道：土砂で通れない");
    const d = html.slice(html.indexOf('class="board-map-route 通行止め"'));
    expect(d).toContain("土砂：車は通れない");
    expect(d).toContain('stroke="#c62828"');
    // 状態を変えると色も変わる
    const changed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行可" } : r));
    const html2 = renderToStaticMarkup(<BoardMap overview={overview} routes={changed} />);
    expect(html2).not.toContain("土砂：車は通れない");
    expect(html2.match(/data-status="通行可"/g)).toHaveLength(3);
  });

  it("拠点に不足の印（在庫切れ・薬剤師の不足）が文字で付く", () => {
    const c = html.slice(html.indexOf('data-site="救護所C"'), html.indexOf("</g>", html.indexOf('data-site="救護所C"')) + 100);
    expect(c).toContain("在庫切れ 1");
    const b = html.slice(html.indexOf('data-site="救護所B"'));
    expect(b.slice(0, 1200)).toContain("薬剤師 1人不足");
  });

  it("凡例・架空の明記・状況の欄・最新情報があり、外部の地図や画像を使わない", () => {
    expect(html).toContain("架空の町・模式図");
    expect(html).toContain("実在の地名・道路・施設ではない");
    expect(html).toContain(">通行可<");
    expect(html).toContain("気温");
    expect(html).toContain("1,750 人");
    for (const n of areaNotes(ROUTES)) expect(html).toContain(n);
    expect(html).not.toMatch(/<img|<iframe|https?:\/\/|tile\.|openstreetmap/i);
  });
});
