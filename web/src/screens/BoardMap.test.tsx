import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PATIENTS, ROUTES, SITES, STOCK, SYNC, type RouteRow } from "../board/data";
import { MAP_ROUTES, MAP_SITES, areaNotes } from "../board/map";
import { siteOverview } from "../board/summary";
import { demoReducer, initialDemo } from "../board/demo";
import { STALE_REPORT_HOURS } from "../board/live";
import { BOARD_MAP_LIVE } from "../board/text";
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

  it("経路の色と印は ROUTES の状態に合う（通行可＝灰、迂回＝黄の点線と迂回の道、通行止め＝赤の×）", () => {
    for (const r of ROUTES) {
      expect(html).toContain(`data-status="${r.status}"`);
    }
    const b = html.slice(html.indexOf('class="board-map-route 迂回"'), html.indexOf('class="board-map-route 通行可"', html.indexOf('class="board-map-route 迂回"')));
    expect(b).toContain('stroke-dasharray="14 10"');
    expect(b).toContain("川沿いの道：土砂で通れない");
    // 救護所D も迂回（Issue #167）：土砂の場所に × を置き、南の幹線から回る迂回の道を点線で出す
    const d = html.slice(html.lastIndexOf('class="board-map-route 迂回"'));
    expect(d).toContain("山すその道：土砂で通れない");
    expect(d).toContain('d="M760,130 V440 H880 V540"');
    expect(d).toContain('stroke="#c62828"');
    // 状態を変えると色も変わる。通行止めは赤の × だけ
    const closed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行止め", minutes: null } : r));
    const html1 = renderToStaticMarkup(<BoardMap overview={overview} routes={closed} />);
    expect(html1.slice(html1.indexOf('class="board-map-route 通行止め"'))).toContain("山すその道：土砂で通れない");
    const changed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行可" } : r));
    const html2 = renderToStaticMarkup(<BoardMap overview={overview} routes={changed} />);
    expect(html2).not.toContain("山すその道：土砂で通れない");
    expect(html2.match(/data-status="通行可"/g)).toHaveLength(3);
  });

  it("拠点に不足の印（在庫切れ・薬剤師の不足）が文字で付く", () => {
    const c = html.slice(html.indexOf('data-site="救護所C"'), html.indexOf("</g>", html.indexOf('data-site="救護所C"')) + 100);
    expect(c).toContain("在庫なし 1");
    const b = html.slice(html.indexOf('data-site="救護所B"'));
    expect(b.slice(0, 1200)).toContain("薬剤師 1人不足");
  });

  it("凡例・架空の明記・状況の欄・最新情報があり、外部の地図や画像を使わない", () => {
    expect(html).toContain("デモの町・模式図");
    expect(html).toContain("実在の地名・道路・施設ではない");
    expect(html).toContain(">通行可<");
    expect(html).toContain("気温");
    expect(html).toContain("1,750 人");
    for (const n of areaNotes(ROUTES)) expect(html).toContain(n);
    expect(html).not.toMatch(/<img|<iframe|https?:\/\/|tile\.|openstreetmap/i);
  });
});

describe("動く地図（Issue #128）", () => {
  it("光る救護所：在庫切れのある救護所C は赤、ほかは黄。本部は光らない。理由を文字でも出す", () => {
    expect(html).toContain('data-glow-site="救護所C" data-level="bad"');
    expect(html).toContain('data-glow-site="救護所B" data-level="warn"');
    expect(html).not.toContain('data-glow-site="本部備蓄"');
    const b = overview.find((o) => o.site === "救護所B")!;
    expect(html).toContain(`救護所B：在庫なしの見込み ${b.forecast}・薬剤師 不足 ${b.pharmacistsShort}・最終更新 15 時間前`);
    expect(html).toContain(BOARD_MAP_LIVE.staleNote(STALE_REPORT_HOURS));
    // 光の色は状態の色（赤・黄）だけ
    const glows = html.slice(html.indexOf('class="board-map-glows"'), html.indexOf('class="board-map-site'));
    for (const c of glows.match(/fill="#[0-9a-f]{6}"/g) ?? []) expect(['fill="#c62828"', 'fill="#c99a06"']).toContain(c);
  });

  it("選んでいる救護所への道筋が浮かび上がり、ほかの経路は薄くなる。経路の理由を文字で出す", () => {
    expect(html).not.toContain('data-emph="on"');
    expect(html).toContain(BOARD_MAP_LIVE.routeHint);
    const h = renderToStaticMarkup(<BoardMap overview={overview} selected="救護所B" />);
    expect(h.match(/data-emph="on"/g)).toHaveLength(1);
    expect(h.match(/data-emph="dim"/g)).toHaveLength(3);
    const b = h.slice(h.indexOf('data-emph="on"'), h.indexOf("</g></g>", h.indexOf('data-emph="on"')));
    // 迂回の道の上を流れる破線（本部 → 救護所B）
    expect(b).toContain('class="board-map-flow"');
    expect(b).toContain('d="M760,92 L760,130 L235,130 L70,130 L70,320 L140,320"');
    const route = ROUTES.find((r) => r.to === "救護所B")!;
    expect(h).toContain(BOARD_MAP_LIVE.routeLine("救護所B", route.status, route.via, route.minutes));
    // 救護所D は土砂を避けた迂回の道の上を流す（Issue #167）
    const d = renderToStaticMarkup(<BoardMap overview={overview} selected="救護所D" />);
    expect(d).toContain('d="M760,92 L760,130 L760,440 L880,440 L880,540"');
    // 通行止めの救護所は流さない
    const closed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行止め", minutes: null } : r));
    const dc = renderToStaticMarkup(<BoardMap overview={overview} routes={closed} selected="救護所D" />);
    expect(dc).toContain('class="board-map-path"');
    expect(dc).not.toContain('class="board-map-flow"');
  });

  it("経路の行は押せるボタンで、タッチでも道筋を出せる", () => {
    expect(html.match(/class="board-map-route-btn" aria-pressed="false"/g)).toHaveLength(4);
  });

  it("搬送中の便と医療チームの車が図に出て、図の外の一覧のボタンで選べる。「架空・模擬」と書く", () => {
    expect(html.match(/data-mover="s-/g)).toHaveLength(2);
    expect(html).toContain('data-mover="car"');
    // 図（role="img"）の中の印は操作要素にしない（読み上げに出ないため。PR #130 のレビュー）。図の外に本物のボタンを置く
    const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
    const movers = svg.slice(svg.indexOf('class="board-map-movers"'));
    expect(movers).not.toContain('role="button"');
    expect(movers).not.toContain("tabindex");
    expect(html.match(/<button type="button" class="board-map-mover-btn" aria-pressed="false">/g)).toHaveLength(3);
    expect(html).toContain(BOARD_MAP_LIVE.legendVehicle);
    expect(html).toContain(BOARD_MAP_LIVE.moversTitle);
    expect(html).toContain("医療チームの車（模擬）：本部で停車中。次の行き先 救護所A（到着見込み 11/05 10:15）");
    expect(html).toContain("搬送便：血糖降下薬B 300 → 救護所A（到着見込み 11/06 10:00）");
  });

  it("デモ時計が進むと、便と車の位置が変わり、受領した便は消える", () => {
    const start = initialDemo();
    const later = demoReducer(start, { type: "tick", hours: 6 });
    const h = renderToStaticMarkup(<BoardMap overview={overview} live={later} />);
    const pos = (s: string, id: string) => s.slice(s.indexOf(`data-mover="${id}"`) - 120, s.indexOf(`data-mover="${id}"`));
    expect(pos(h, "car")).not.toBe(pos(html, "car"));
    expect(pos(h, "s-3")).not.toBe(pos(html, "s-3"));
    const done = demoReducer(start, { type: "tick", hours: 26 });
    const h2 = renderToStaticMarkup(<BoardMap overview={overview} live={done} />);
    expect(h2).not.toContain('data-mover="s-2"');
    expect(h2).not.toContain('data-mover="s-3"');
  });

  it("動きを減らす設定では、動きを止める印（board-map-still）が付く", () => {
    expect(html).not.toContain("board-map-still");
    const h = renderToStaticMarkup(<BoardMap overview={overview} reducedMotion />);
    expect(h).toContain('class="board-map board-map-still"');
  });
});
