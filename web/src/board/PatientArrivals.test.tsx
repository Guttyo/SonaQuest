// 架空の患者の到着の画面（Issue #122）。DOM の無い環境で文字列に描いて確かめる
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Board, type BoardTab } from "../screens/Board";
import { HQ, type SiteId } from "./data";
import { arrivalRows, demoReducer, initialDemo, type DemoState } from "./demo";
import { DEFAULT_ARRIVAL_SEED, SIM_PATIENTS } from "./patients";
import { PatientArrivals } from "./PatientArrivals";
import { BOARD_ARRIVALS } from "./text";
import { sessionFor } from "./access";

const render = (site: SiteId, tab: BoardTab, state: DemoState) =>
  renderToStaticMarkup(
    <Board onBack={() => {}} reducedMotion={false} initialSite={site} initialTab={tab} initialState={state} initialSession={sessionFor(site)} />,
  );

let arrived = demoReducer(initialDemo(), { type: "arrivals", active: true });
for (let i = 0; i < 30; i += 1) arrived = demoReducer(arrived, { type: "tick", hours: 1 });

describe("本部：到着の累計とけがのある人の人数（件数だけ）・種と操作", () => {
  it("最初は 0 / 100 人で、種が出る。「到着を始める」と「別の並びで」がある。氏名は出さない", () => {
    const h = renderToStaticMarkup(<PatientArrivals state={initialDemo()} dispatch={() => {}} />);
    expect(h).toContain("0 / 100 人");
    expect(h).toContain(`>${DEFAULT_ARRIVAL_SEED}<`);
    expect(h).toContain(`>${BOARD_ARRIVALS.start}</button>`);
    expect(h).toContain(`>${BOARD_ARRIVALS.reseed}</button>`);
    expect(h).toContain(BOARD_ARRIVALS.nameNote);
  });

  it("到着した後も、本部の表示は人数だけで、氏名・品目名を出さない", () => {
    const h = renderToStaticMarkup(<PatientArrivals state={arrived} dispatch={() => {}} />);
    const rows = arrivalRows(arrived);
    expect(h).toContain(`${rows.length} / 100 人`);
    expect(h).toContain(`${rows.filter((r) => r.hasCondition).length} 人`);
    expect(h).toContain(`>${BOARD_ARRIVALS.stop}</button>`);
    for (const p of SIM_PATIENTS) expect(h).not.toContain(p.name);
    expect(h).not.toContain("降圧薬A");
  });

  it("本部の全体とデモのタブに出る。前回から変わったことの1行は件数だけ", () => {
    for (const tab of ["overview", "demo"] as BoardTab[]) expect(render(HQ, tab, arrived)).toContain('data-testid="arrivals-summary"');
    const h = render(HQ, "overview", arrived);
    const line = h.slice(h.indexOf('data-testid="board-changes"'), h.indexOf('id="board-panel"'));
    expect(line).toMatch(/到着 \d+ 件/);
    for (const p of SIM_PATIENTS) expect(line).not.toContain(p.name);
    expect(line).not.toContain("降圧薬A");
  });
});

describe("救護所：到着した患者の一覧", () => {
  const site = arrivalRows(arrived)[0].site;

  it("救護所の詳細と記録タブに、番号・架空の氏名・性別・年齢・けが・服薬の品目が出る。ほかの救護所の人は出ない", () => {
    for (const tab of ["overview", "records"] as BoardTab[]) {
      const h = render(site, tab, arrived);
      expect(h).toContain('data-testid="arrivals-list"');
      expect(h).toContain(BOARD_ARRIVALS.nameNote);
      expect(h).toContain(BOARD_ARRIVALS.conditionNote);
      for (const r of arrivalRows(arrived, site)) {
        const row = h.slice(h.indexOf(`data-arrival="${r.no}"`));
        expect(row).toContain(`No.${r.no}（${r.recordId}）`);
        expect(row).toContain(r.name);
        expect(row).toContain(r.sex);
        expect(row).toContain(r.condition);
        expect(row).toContain(r.meds[0].item);
      }
      for (const r of arrivalRows(arrived).filter((x) => x.site !== site)) expect(h).not.toContain(`data-arrival="${r.no}"`);
    }
  });

  it("まだ誰も来ていなければ、その旨の文だけ", () => {
    const h = renderToStaticMarkup(<PatientArrivals state={initialDemo()} site="救護所A" />);
    expect(h).toContain(BOARD_ARRIVALS.empty);
    expect(h).not.toContain("<table");
  });

  it("点数・合否・緊急度の言葉を使わない", () => {
    // この部品の出力だけを確かめる（ボードのほかの欄の「判断しない」の説明文を拾わないように）。「判断しない」の注意書きも除く
    const h = (
      renderToStaticMarkup(<PatientArrivals state={arrived} site={site} />) + renderToStaticMarkup(<PatientArrivals state={arrived} dispatch={() => {}} />)
    )
      .split(BOARD_ARRIVALS.conditionNote)
      .join("");
    expect(h).not.toMatch(/点数|合格|不合格|正解|緊急度|重症|軽症|トリアージ/);
  });
});
