import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Board, type BoardTab } from "../screens/Board";
import { sessionFor } from "./access";
import { HQ, INBOUND, NEEDS, SHELTERS, SITES, STOCK, SYNC, type SiteId } from "./data";
import { demoReducer, initialDemo } from "./demo";
import { Fold } from "./Fold";
import { caseRows } from "./summary";

/** 発注の提案を承認・却下する人（本部でログインした架空の担当者。Issue #289） */
const HQ_ACTOR = sessionFor(HQ);

const render = (site: SiteId = HQ, tab: BoardTab = "overview", state = initialDemo()) =>
  renderToStaticMarkup(
    <Board onBack={() => {}} reducedMotion={false} initialSite={site} initialTab={tab} initialState={state} initialSession={sessionFor(site)} />,
  );

/** その見出しの id の欄の <details> が、最初に開いているか */
function foldOpen(html: string, id: string): boolean {
  const at = html.indexOf(`<section aria-labelledby="${id}" class="board-fold`);
  expect(at).toBeGreaterThanOrEqual(0);
  const tag = html.slice(html.indexOf("<details", at), html.indexOf(">", html.indexOf("<details", at)) + 1);
  return tag.includes("open");
}

describe("開閉できる欄（Issue #159）", () => {
  it("見出しは summary の中の h3 で、閉じていても件数が見える", () => {
    const closed = renderToStaticMarkup(
      <Fold id="x" title="一覧" count="3 件" open={false}>
        <p>中身</p>
      </Fold>,
    );
    expect(closed).toContain('<details><summary><h3 id="x">一覧 <span class="board-count">3 件</span></h3></summary>');
    expect(closed).toContain('<div class="board-fold-body"><p>中身</p></div>');
    const opened = renderToStaticMarkup(
      <Fold id="x" title="一覧" open>
        <p>中身</p>
      </Fold>,
    );
    expect(opened).toContain('<details open=""><summary><h3 id="x">一覧</h3></summary>');
  });

  it("本部の全体：在庫切れ・見込みがあれば確認・手配の一覧を開き、承認待ちがあれば提案を開く。患者の到着は受け入れの最中だけ開く", () => {
    const state = initialDemo();
    expect(state.proposals.some((p) => p.status === "提案")).toBe(true);
    const html = render();
    expect(foldOpen(html, "board-cases")).toBe(true);
    expect(foldOpen(html, "board-hq-orders")).toBe(true);
    expect(foldOpen(html, "board-arrivals")).toBe(false);
    // 地図の下の一覧：移動中の車両と地図の注意はふだん閉じる
    expect(foldOpen(html, "board-map-movers")).toBe(false);
    expect(foldOpen(html, "board-map-notes")).toBe(false);
    // 図の印を押したときの説明の欄は、閉じた一覧の中に入れない（押した結果が見えなくなるため）
    const info = html.indexOf('class="board-map-mover-info"');
    expect(info).toBeGreaterThanOrEqual(0);
    expect(info).toBeLessThan(html.indexOf('<section aria-labelledby="board-map-movers"'));
    const active = demoReducer(state, { type: "arrivals", active: true });
    expect(foldOpen(render(HQ, "overview", active), "board-arrivals")).toBe(true);
  });

  it("承認待ちが無ければ、本部の提案の欄は閉じる", () => {
    let state = initialDemo();
    for (const p of state.proposals.filter((x) => x.status === "提案")) state = demoReducer(state, { type: "reject_proposal", id: p.id, actor: HQ_ACTOR });
    expect(foldOpen(render(HQ, "overview", state), "board-hq-orders")).toBe(false);
  });

  it("救護所の詳細：不足の一覧は在庫切れ・見込みがあるときだけ開き、到着した患者とカルテはふだん閉じる", () => {
    const cases = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC);
    // SITES には本部備蓄も入るので、救護所（SHELTERS）だけを見る
    for (const site of SHELTERS) {
      const html = render(site, "overview");
      const urgent = cases.some((c) => c.site === site && (c.status === "在庫切れ" || c.status === "在庫切れ見込み"));
      expect(foldOpen(html, "board-detail-shortage")).toBe(urgent);
      expect(foldOpen(html, `board-arrivals-${site}`)).toBe(false);
      expect(foldOpen(html, "board-detail-charts")).toBe(false);
    }
  });

  it("架空の氏名であることと、けがの重さを判断しないことの注意は、たたまずに見せる", () => {
    const html = render("救護所A", "overview");
    const list = html.slice(html.indexOf('aria-labelledby="board-arrivals-救護所A"'));
    const help = list.indexOf('class="board-help"');
    expect(list.indexOf("実在の人とは関係がない")).toBeGreaterThanOrEqual(0);
    expect(list.indexOf("重さ・緊急度・処置を判断しない")).toBeGreaterThanOrEqual(0);
    if (help >= 0) {
      const helpEnd = list.indexOf("</details>", help);
      for (const t of ["実在の人とは関係がない", "重さ・緊急度・処置を判断しない"]) {
        const at = list.indexOf(t);
        expect(at < help || at > helpEnd).toBe(true);
      }
    }
  });

  it("現地への搬送があるとき、次の確認に到着の見込みの日付を繰り返さない（入荷・融通の文に出ている）", () => {
    const rows = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC).filter((c) => c.siteInbound.length > 0 && c.next.startsWith("搬送の到着"));
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) {
      expect(c.next).toBe("搬送の到着を確認する");
      expect(c.supply).toMatch(/到着見込み|到着未定/);
    }
  });
});
