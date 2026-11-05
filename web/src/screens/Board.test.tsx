import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HQ, INBOUND, INTAKE_RECORDS, NEEDS, PATIENTS, SITES, STOCK, SYNC, type SiteId } from "../board/data";
import { demoReducer, initialDemo, type DemoAction } from "../board/demo";
import { caseRows, criticalItems, pendingSummary, todaySummary, unknownCounts } from "../board/summary";
import {
  BOARD_ACTIONS,
  BOARD_BACK_LABEL,
  BOARD_CHANGES,
  BOARD_DEMO,
  BOARD_DEMO_MENU,
  BOARD_INTAKE_FORM,
  BOARD_KPI,
  BOARD_LAYOUT,
  BOARD_OVERVIEW,
  BOARD_LEAD_TILE,
  BOARD_MOCK_BADGE,
  BOARD_ORDERS,
  BOARD_SUBTITLE,
  BOARD_TITLE,
  INTAKE_IMAGE,
} from "../board/text";
import { Board, type BoardTab } from "./Board";

/** 試験は DOM の無い環境で動くので、拠点とタブを最初の値で渡して文字列に描き、画面の切り替えを確かめる */
const render = (site: SiteId = HQ, tab: BoardTab = "overview", state = initialDemo()) =>
  renderToStaticMarkup(<Board onBack={() => {}} reducedMotion={false} initialSite={site} initialTab={tab} initialState={state} />);
const html = render();
const cases = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC);
const panel = (h: string) => h.slice(h.indexOf('id="board-panel"'));
const pane = (h: string) => h.slice(h.indexOf('class="board-pane"'), h.indexOf('class="board-main"'));

describe("ボードの題とレイアウト（Issue #107）", () => {
  it("題は SonaQuest と副題。App の画面遷移の焦点の目印（[data-scroll-target]）で、架空データの印と集計時点と架空の時刻が並ぶ", () => {
    expect(BOARD_TITLE).toBe("SonaQuest");
    expect(html).toContain(`<h1 id="board-title" data-scroll-target="true" tabindex="-1">SonaQuest</h1>`);
    expect(html).toContain(`<span class="board-subtitle">${BOARD_SUBTITLE}</span>`);
    const head = html.slice(html.indexOf('class="board-head"'), html.indexOf('class="board-body"'));
    expect(head).toContain(BOARD_MOCK_BADGE);
    expect(head).toContain("集計 11/05 09:30 時点");
    expect(head).toContain('data-testid="demo-clock">11/05 09:30<');
    expect(head).not.toMatch(/医薬品ボード|（試作）/);
  });

  it("左のペインは、上から本部（HQ）→ 地区の見出し → その地区の救護所。最初は本部が選ばれている", () => {
    const p = pane(html);
    const order = [BOARD_LAYOUT.hq, "東地区（架空）", "救護所A", "救護所D", "西地区（架空）", "救護所B", "救護所C"].map((s) => p.indexOf(s));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p.match(/<button type="button" class="board-pane-item/g)).toHaveLength(5);
    expect(p).toContain('class="board-pane-item hq current" aria-current="true" data-pane="本部備蓄"');
    // 印：救護所B は薬剤師の不足と、未着・転記待ちの数。救護所C は在庫切れ
    const b = p.slice(p.indexOf('data-pane="救護所B"'), p.indexOf('data-pane="救護所C"'));
    expect(b).toContain(">薬剤師 1人不足<");
    expect(b).toContain(">未着・転記待ち 42<");
    expect(p.slice(p.indexOf('data-pane="救護所C"'))).toContain(">在庫切れ 1<");
    expect(p).toContain(`>${BOARD_LAYOUT.marks.proposals} 2<`);
  });

  it("左のペインの拠点は、拠点名・最終報告・印2つまで（残りは「ほか N 件」）。患者数は出さない（Issue #113）", () => {
    const p = pane(html).slice(pane(html).indexOf('class="board-pane-list"'));
    expect(p).not.toContain(BOARD_OVERVIEW.patients);
    // 3つ以上の印があるときは、固定の順で2つと「ほか N 件」
    const s1 = demoReducer(initialDemo(), {
      type: "add_record",
      site: "救護所B",
      name: "架空 太郎",
      items: [],
      prescription: { item: "抗凝固薬F", qty: 60, days: 7 },
    });
    const b = pane(render(HQ, "overview", s1));
    const item = b.slice(b.indexOf('data-pane="救護所B"'), b.indexOf("</button>", b.indexOf('data-pane="救護所B"')));
    expect(item.match(/class="board-pane-mark (bad|warn)"/g)).toHaveLength(2);
    expect(item).toMatch(/>ほか \d+ 件</);
  });

  it("狭い幅のための拠点を選ぶ欄（select）が、本部と地区ごとの救護所を持つ。選択中の拠点が選ばれている（Issue #113）", () => {
    const sel = pane(render("救護所C"));
    expect(sel).toContain(`<span>${BOARD_LAYOUT.siteSelect}</span><select>`);
    expect(sel).toContain('<optgroup label="西地区（架空）">');
    expect(sel).toContain('<option value="救護所C" selected="">救護所C（在庫切れ 1）</option>');
  });

  it("デモ操作は開閉（details）にまとめて、ふだんは閉じている。時計と架空データの印・はじめにへ戻るは外に出す（Issue #113）", () => {
    const head = html.slice(html.indexOf('class="board-head"'), html.indexOf('class="board-body"'));
    expect(head).toContain(`<details class="board-demo-menu"><summary>${BOARD_DEMO_MENU.title}</summary>`);
    const menu = head.slice(head.indexOf('class="board-demo-menu"'), head.indexOf("</details>"));
    expect(menu).toContain(`>${BOARD_DEMO.hour}</button>`);
    expect(menu).not.toContain(BOARD_BACK_LABEL);
    expect(menu).not.toContain('data-testid="demo-clock"');
    expect(head.indexOf(BOARD_BACK_LABEL)).toBeGreaterThan(head.indexOf("</details>"));
  });

  it("上部タブは5つ（全体・在庫・発注・搬送・記録（カルテ）・デモ）で、選んだタブだけが aria-selected", () => {
    expect(html.match(/role="tab"/g)).toHaveLength(5);
    for (const label of Object.values(BOARD_LAYOUT.tabs)) expect(html).toContain(label);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('id="board-tab-overview" aria-selected="true"');
    const stock = render(HQ, "stock");
    expect(stock).toContain('id="board-tab-stock" aria-selected="true"');
    // 救護所を選ぶと、全体のタブは「詳細」になる
    expect(render("救護所A")).toContain(`>${BOARD_LAYOUT.siteTabs.overview}</button>`);
  });
});

describe("本部（HQ）の全体", () => {
  it("数字は架空データから計算したもの", () => {
    const today = todaySummary(PATIENTS);
    expect(html).toContain(`data-testid="today-patients">${today.patients}</b>`);
    expect(html).toContain(`data-testid="critical-count">${criticalItems(STOCK).length}</span>`);
    expect(html).toContain(`data-testid="pending-count">${pendingSummary(SYNC).pending}</span>`);
    expect(html).toContain(`data-testid="proposal-count">2</span>`);
    expect(html).toContain("（未着 97・転記待ち 6）");
    expect(html).toContain(BOARD_KPI.pending);
    expect(html).toContain(BOARD_KPI.proposals);
  });

  it("上段に指標の札が4つ横一列 → 直下に確認・手配が必要な事項の表 → 地図 → 活動状況の順（Issue #113）", () => {
    const p = panel(html);
    expect(p.match(/<div class="board-tile[ "]/g)).toHaveLength(4);
    const order = [
      'class="board-kpis"',
      `id="board-actions"`,
      'id="board-hq-orders"',
      'id="board-map-title"',
      'id="board-activity"',
      'data-testid="today-patients"',
    ].map((s) => p.indexOf(s));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 指標の札は右の列（aside）に置かない
    expect(p).not.toContain("board-hq-side");
  });

  it("在庫の数（10）と確認・手配の数（12）の関係を、同じ札と表の見出しで読める", () => {
    const u = unknownCounts(STOCK);
    const crit = criticalItems(STOCK).length;
    expect(cases.length).toBe(crit + u.unconfirmed + u.noPace);
    expect(html).toContain(BOARD_KPI.criticalBreakdown(cases.length, crit, u.unconfirmed, u.noPace));
    expect(panel(html)).toContain(
      `${BOARD_ACTIONS.title} <span class="board-count">${cases.length} 件（${BOARD_ACTIONS.breakdown(crit, u.unconfirmed, u.noPace)}）</span>`,
    );
  });

  it("確認・手配が必要な事項は「拠点／確認が必要なこと／現在の状況／次の確認」の表。並びは固定のルールで、緊急度を表さない注意書き", () => {
    const p = panel(html);
    for (const col of Object.values(BOARD_ACTIONS.cols)) expect(p).toContain(`<th>${col}</th>`);
    const rows = [...p.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(cases.map((c) => `${c.site}|${c.item}`));
    // 先頭は在庫切れ（救護所C の骨粗鬆症薬G）。次の確認は nextAction の固定文
    const first = p.slice(p.indexOf('data-action="'), p.indexOf("</tr>", p.indexOf('data-action="')));
    expect(first).toContain(">在庫切れ</span>");
    expect(first).toContain("骨粗鬆症薬G（週1）");
    expect(first).toContain(cases[0].next);
    expect(first).toContain("在庫確認 11/05 08:10");
    // 提案のある行には状態（承認待ち）が出る
    const c = p.slice(p.indexOf('data-action="救護所B|抗てんかん薬C"'));
    expect(c.slice(0, c.indexOf("</tr>"))).toContain(`${BOARD_ACTIONS.proposal} P-02：${BOARD_ORDERS.pending}`);
    expect(p).toContain(BOARD_ACTIONS.order);
  });

  it("模式図の拠点は押せるもの（role=button）で、活動状況のカードから詳細に入れる", () => {
    const p = panel(html);
    expect(p.match(/<g class="board-map-site pressable[^"]*"/g)).toHaveLength(5);
    expect(p).toContain('role="button" tabindex="0" aria-label="救護所A（小学校の体育館）を選ぶ"');
    expect(p).toContain('class="board-map-site pressable selected"');
    expect(p.match(/<li class="board-site-card">/g)).toHaveLength(4);
    expect(p).toContain('aria-label="救護所C' + BOARD_LAYOUT.openSite + '"');
  });

  it("発注の提案（提案中）が承認・却下のボタン付きで並ぶ", () => {
    const p = panel(html);
    expect(p.match(/<li class="board-order pending"/g)).toHaveLength(2);
    expect(p.match(new RegExp(`>${BOARD_ORDERS.approve}</button>`, "g"))).toHaveLength(2);
    expect(p.match(new RegExp(`>${BOARD_ORDERS.reject}</button>`, "g"))).toHaveLength(2);
    // 算数の内訳：救護所B の抗てんかん薬C は 24 ＋ 24 − 8 − 0 ＝ 40、本部 0・卸 40
    const b = p.slice(p.indexOf('data-proposal="P-02"'));
    expect(b).toContain("救護所B");
    expect(b).toContain("未交付・必要な数 24 ＋ 目安の日数分の出庫 24 − 現地の在庫 8 − 向かっている搬送・入荷 0 ＝ 40");
    expect(b).toContain("本部備蓄から 0錠・卸へ頼む 40錠");
  });
});

describe("救護所の詳細（左のペインか図で選ぶ）", () => {
  const c = render("救護所C");

  it("選んだ救護所が aria-current になり、メインの題が救護所と地区に変わる", () => {
    expect(pane(c)).toContain('class="board-pane-item current" aria-current="true" data-pane="救護所C"');
    expect(pane(c)).not.toContain('class="board-pane-item hq current"');
    expect(c).toContain('data-panel="救護所C|overview"');
    expect(c).toContain("西地区（架空）");
    // 本部の数字のカードは出ない
    expect(c).not.toContain('data-testid="today-patients"');
  });

  it("今日の患者人数、不足薬（救護所C の行だけ）、連絡先、経路、通信が出る", () => {
    const p = panel(c);
    expect(p).toContain('data-testid="site-patients">30 人<');
    const mine = cases.filter((x) => x.site === "救護所C");
    expect(p.match(/<li class="board-case">/g)).toHaveLength(mine.length);
    const first = p.slice(p.indexOf('<li class="board-case">'), p.indexOf("</li>", p.indexOf('<li class="board-case">')));
    expect(first).toContain(">在庫切れ</span>");
    expect(first).toContain("骨粗鬆症薬G（週1）");
    expect(first).toContain("現地</span> 0錠");
    expect(first).toContain("本部</span> 0錠");
    expect(first).toContain("卸に照会中・到着未定");
    expect(first).toContain("次の確認</span> 卸の回答を確認する");
    expect(first).toContain("3錠（11/08 09:00 まで）");
    expect(p).toContain("000-0000-0003（架空。携帯が断続的）");
    expect(p).toContain("校舎1階の保健室");
    expect(p).toContain(">通行可</span> 幹線道路（西回り）");
    expect(p).toContain("紙で記録・携帯が断続的");
    // 救護所の画面では承認・却下を押せない
    expect(p).not.toContain(`>${BOARD_ORDERS.approve}</button>`);
    expect(p).toContain(BOARD_ORDERS.approveOnlyHq);
  });

  it("カルテは救護所の詳細の中にある（救護所A：最初からある記録は番号だけ、医師の処方は人が入力する欄）", () => {
    const a = panel(render("救護所A"));
    const charts = a.slice(a.indexOf('id="board-intake"'));
    const rec = INTAKE_RECORDS.find((r) => r.site === "救護所A")!;
    expect(charts).toContain(`<b>番号 ${rec.id}</b>`);
    for (const it of rec.items) expect(charts).toContain(it.value);
    expect(charts).toContain("最新の記録（11/05 09:40・文字起こし（別のアプリ））");
    expect(charts).toContain(">処方あり</span>");
    expect(charts).toContain("医師の処方（医師が入力する欄。アプリは決めない）");
    expect(charts).not.toMatch(/患者名|さん<|様</);
    // 記録の無い救護所
    expect(panel(c)).toContain("記録はまだない");
  });

  it("通信なしの救護所D：代わりの手段と通行止めが出る。外部の地図は使わない", () => {
    const d = panel(render("救護所D"));
    expect(d).toContain("連絡員が本部へ持ち帰る（午後）");
    expect(d).toContain(">通行止め</span>");
    expect(d).toContain(">未確認</span>");
    expect(html).not.toMatch(/<iframe|tile\.|openstreetmap|google\.com\/maps/i);
  });
});

describe("在庫・発注・搬送・記録・デモのタブ", () => {
  it("在庫：本部は救護所×薬の表、救護所はその救護所の行だけ", () => {
    const heat = panel(render(HQ, "stock"));
    expect(heat.match(/<th class="site">/g)).toHaveLength(5);
    expect(heat.match(/<td class="item">/g)).toHaveLength(9);
    expect(heat).toContain(">切れ<");
    expect(heat).toContain(">算出不可<");
    const b = panel(render("救護所B", "stock"));
    expect(b.match(/<tr>/g)?.length).toBe(1 + 9);
    expect(b).toContain(">在庫切れ見込み</span>");
  });

  it("発注・搬送：本部は全部の提案と入荷・搬送の表。救護所はその救護所向けだけ", () => {
    const s = panel(render(HQ, "supply"));
    expect(s).toContain(BOARD_ORDERS.note);
    expect(s.match(/data-inbound="/g)).toHaveLength(INBOUND.length);
    const b = panel(render("救護所B", "supply"));
    expect(b.match(/data-inbound="/g)).toHaveLength(INBOUND.filter((r) => r.to === "救護所B" || r.from === "救護所B").length);
    expect(b).not.toContain('data-proposal="P-01"'); // 救護所C の提案は出ない
    expect(b).toContain('data-proposal="P-02"');
  });

  it("記録：本部は記録の届き方の表と救護所ごとのカルテの件数。救護所はカルテに登録するフォーム（救護所は固定）とカルテ", () => {
    const r = panel(render(HQ, "records"));
    expect(r).toContain("記録の届き方（通信の状態）");
    expect(r).toContain("カルテ 1 件");
    const a = panel(render("救護所A", "records"));
    expect(a).toContain('<form class="board-form">');
    expect(a).not.toMatch(/<form[^>]*(action|method)=/);
    expect(a).not.toContain(`<span>${BOARD_INTAKE_FORM.site}</span>`);
    expect(a).toContain('value="架空 太郎"');
    expect(a).toContain("<b>番号 A-012</b>");
  });

  it("デモ：時計の操作はデモ操作の開閉の中にあり、デモのタブに入力（救護所を選べる）と起きたこと。動きを減らす設定では自動進行を出さない", () => {
    expect(html).toContain(`>${BOARD_DEMO.start}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.hour}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.reset}</button>`);
    const d = panel(render(HQ, "demo"));
    expect(d).toContain(`<span>${BOARD_INTAKE_FORM.site}</span>`);
    expect(d).toContain(`>${BOARD_INTAKE_FORM.prescriptionNone}</option>`);
    expect(d).toContain(BOARD_DEMO.logEmpty);
    const reduced = renderToStaticMarkup(<Board onBack={() => {}} reducedMotion />);
    expect(reduced).not.toContain(`>${BOARD_DEMO.start}</button>`);
    expect(reduced).toContain(BOARD_DEMO.reducedMotion);
  });
});

describe("デモの状態を渡すと、登録 → 提案 → 承認が画面に出る", () => {
  const record: DemoAction = {
    type: "add_record",
    site: "救護所B",
    name: "架空 太郎",
    items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "白い錠剤を朝に1錠" }],
    prescription: { item: "抗凝固薬F", qty: 60, days: 7 },
  };
  const s1 = demoReducer(initialDemo(), record);

  it("登録すると、救護所の印に未交付あり、提案に「新」の印。同じ品目でもう一度登録すると「更新」の印", () => {
    const h = render(HQ, "overview", s1);
    // 左のペインは印2つまで。未交付あり は活動状況のカード（印をすべて出す）に出る
    const card = panel(h).slice(panel(h).indexOf(`aria-label="救護所B${BOARD_LAYOUT.openSite}"`));
    expect(card.slice(0, card.indexOf("</button>"))).toContain(`>${BOARD_LAYOUT.marks.undelivered}<`);
    const p = panel(h).slice(panel(h).indexOf('data-proposal="P-03"'));
    expect(p).toContain(`>${BOARD_ORDERS.newMark}<`);
    expect(p).toContain("未交付・必要な数 20 ＋ 目安の日数分の出庫 48 − 現地の在庫 0 − 向かっている搬送・入荷 0 ＝ 68");
    const again = panel(render(HQ, "overview", demoReducer(s1, record)));
    expect(again.slice(again.indexOf('data-proposal="P-03"'))).toContain(`>${BOARD_ORDERS.updatedMark}<`);
    // 救護所B の詳細に、登録したカルテ（架空の氏名）が開いて出る
    const b = panel(render("救護所B", "overview", s1));
    expect(b).toContain("<b>架空 太郎（架空）</b>");
    expect(b).toContain("board-chart-added");
  });

  it("承認すると、提案は承認済み（引当済み）になり、救護所向けの搬送が載る。承認・却下のボタンは消える", () => {
    const s2 = demoReducer(s1, { type: "approve_proposal", id: "P-03" });
    const h = panel(render(HQ, "supply", s2));
    const p = h.slice(h.indexOf('data-proposal="P-03"'), h.indexOf("</li>", h.indexOf('data-proposal="P-03"')));
    expect(p).toContain(">承認済み（引当済み）</span>");
    expect(p).not.toContain(`>${BOARD_ORDERS.approve}</button>`);
    expect(h).toContain('data-inbound="S-04"');
    const b = panel(render("救護所B", "supply", s2));
    expect(b).toContain('data-inbound="S-04"');
    expect(b).toContain(">引当済み</span>");
  });
});

describe("守ること", () => {
  it("文字起こしのイメージは、画像が無いうちは枠ごと出さない", () => {
    expect(INTAKE_IMAGE.src).toBe("");
    for (const t of ["overview", "demo"] as const) {
      const h = render(HQ, t);
      expect(h).not.toContain("board-image");
      expect(h).not.toContain("<img");
    }
  });

  it("点数・合否の言葉を使わず、電話リンク・外部リンクが無い。はじめにへ戻れる", () => {
    for (const site of [HQ, "救護所A", "救護所D"] as SiteId[]) {
      for (const tab of ["overview", "stock", "supply", "records", "demo"] as BoardTab[]) {
        const h = render(site, tab);
        expect(h).not.toMatch(/点数|合格|不合格|正解/);
        expect(h).not.toContain('href="tel:');
        expect(h).not.toContain("<a ");
        expect(h).toContain(">はじめにへ戻る</button>");
      }
    }
  });
});

describe("前回から変わったこと・最終報告・一番大きな数（Issue #107 の追加）", () => {
  const changes = (h: string) => h.slice(h.indexOf('data-testid="board-changes"'), h.indexOf('id="board-panel"'));
  const record: DemoAction = {
    type: "add_record",
    site: "救護所B",
    name: "架空 太郎",
    items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "白い錠剤を朝に1錠" }],
    prescription: { item: "抗凝固薬F", qty: 60, days: 7 },
  };

  it("記録が空のときは固定文。タブの下（パネルの外）にあり、本部でも救護所でも出る", () => {
    expect(changes(html)).toContain(`${BOARD_CHANGES.label}</span><span>${BOARD_CHANGES.none("09:30")}</span>`);
    expect(changes(render("救護所C"))).toContain(BOARD_CHANGES.none("09:30"));
    expect(html.indexOf('data-testid="board-changes"')).toBeGreaterThan(html.indexOf('class="board-tabs"'));
  });

  it("登録 → 承認 → 受領で件数が増える。救護所を選ぶとその救護所の分だけ。氏名・品目名・数量は1行に出ない", () => {
    const s1 = demoReducer(initialDemo(), record);
    expect(changes(render(HQ, "overview", s1))).toContain("09:30 以降：登録 1 件、未交付 +1 件、提案 1 件");
    expect(changes(render("救護所A", "overview", s1))).toContain(BOARD_CHANGES.none("09:30"));
    const s2 = demoReducer(s1, { type: "approve_proposal", id: "P-03" });
    expect(changes(render("救護所B", "overview", s2))).toContain("09:30 以降：登録 1 件、未交付 +1 件、提案 1 件、承認 1 件");
    const s3 = demoReducer(s2, { type: "tick", hours: 3 });
    const line = changes(render("救護所B", "overview", s3));
    expect(line).toMatch(/承認 1 件、受領 \d+ 件/);
    for (const h of [changes(render(HQ, "overview", s3)), line]) {
      expect(h).not.toMatch(/架空 太郎|抗凝固薬F|白い錠剤|60|68/);
    }
  });

  it("最終報告は、在庫の確認か記録が届いた新しいほうの時刻からの相対時間。デモの時計が進むと増える", () => {
    const report = (h: string, s: string) => pane(h).slice(pane(h).indexOf(`data-report="${s}"`)).slice(0, 200);
    expect(report(html, "救護所A")).toContain(`${BOARD_CHANGES.lastReport} 2 時間前`);
    expect(report(html, "救護所B")).toContain(`${BOARD_CHANGES.lastReport} 15 時間前`);
    const later = render(HQ, "overview", demoReducer(initialDemo(), { type: "tick", hours: 1 }));
    expect(report(later, "救護所A")).toContain(`${BOARD_CHANGES.lastReport} 3 時間前`);
  });

  it("救護所の詳細では、在庫確認・記録到着・経路確認の時刻を分けて出す。デモの時計が進むと相対時間が増える（Issue #113）", () => {
    const a = panel(render("救護所A"));
    expect(a).toContain('data-testid="fresh-stock">11/05 07:30（2 時間前）<');
    expect(a).toContain('data-testid="fresh-records">11/05 06:00（3 時間前）<');
    expect(a).toContain('data-testid="fresh-route">11/05 07:00（2 時間前）<');
    const later = panel(render("救護所A", "overview", demoReducer(initialDemo(), { type: "tick", hours: 1 })));
    expect(later).toContain('data-testid="fresh-route">11/05 07:00（3 時間前）<');
  });

  it("更新が無いときは小さな補助表示（empty）。更新があれば通常の表示", () => {
    expect(html).toContain('class="board-changes empty" data-testid="board-changes"');
    const s1 = demoReducer(initialDemo(), record);
    expect(render(HQ, "overview", s1)).toContain('class="board-changes" data-testid="board-changes"');
  });

  it("本部の全体の左上に、不足が出ている救護所の数を大きく出す。地区の見出しは折りたためる（既定は開く）", () => {
    const p = panel(html);
    expect(p.indexOf('data-testid="sites-short"')).toBeLessThan(p.indexOf('data-testid="today-patients"'));
    expect(p).toMatch(/data-testid="sites-short">\d+<\/span><span class="board-tile-of"> \/ 4 か所<\/span>/);
    expect(p).toContain(BOARD_LEAD_TILE.label);
    expect(pane(html)).toContain('<details class="board-pane-district" open="">');
  });
});
