import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HQ, INBOUND, INTAKE_RECORDS, ITEMS, NEEDS, PATIENTS, SITES, STOCK, SYNC, type SiteId } from "../board/data";
import { clockText, demoReducer, initialDemo, type DemoAction } from "../board/demo";
import { caseRows, criticalItems, pendingSummary, todaySummary } from "../board/summary";
import {
  BOARD_CASES,
  BOARD_CHANGES,
  BOARD_DEMO,
  BOARD_INTAKE_FORM,
  BOARD_INTAKE_MODE,
  BOARD_LAYOUT,
  BOARD_LEAD_TILE,
  BOARD_MOCK_BADGE,
  BOARD_ORDERS,
  BOARD_SUBTITLE,
  BOARD_SUPPLY_LINK,
  BOARD_TITLE,
  INTAKE_IMAGE,
} from "../board/text";
import { Board, type BoardTab } from "./Board";
import { sessionFor, type DemoSession } from "../board/access";
import { ACCESS_LOG_TEXT, BOARD_LOGIN, BOARD_PERMISSION, CHART_REVIEW_TEXT } from "../board/accessText";
import { AccessLogPanel } from "../board/BoardAccess";
import { PLANTED_NOTICE, SAMPLE_NOTICE } from "../board/karte/contract";
import { auditToResult, summaryToDraft } from "../board/karte/client";
import { checkSummary, maskForbidden } from "../board/karte/codeCheck";
import { findSample, patientUtterances, plantedSummary } from "../board/karte/samples";
import { AUDIT_SESSION_LABELS, KARTE_PANEL_TEXT } from "../board/karte/text";

/** 試験は DOM の無い環境で動くので、拠点とタブを最初の値で渡して文字列に描き、画面の切り替えを確かめる */
const render = (site: SiteId = HQ, tab: BoardTab = "overview", state = initialDemo(), session: DemoSession | null = sessionFor(site)) =>
  renderToStaticMarkup(
    <Board onBack={() => {}} reducedMotion={false} initialSite={site} initialTab={tab} initialState={state} initialSession={session} />,
  );
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
    // 集計時点と架空の時刻は1つにまとめる（Issue #113）
    expect(head).toContain(`${BOARD_DEMO.asOf} <b data-testid="demo-clock">11/05 09:30</b>`);
    expect(head).not.toContain("集計 11/05 09:30 時点");
    // 時間を進める操作は「デモ操作」の開閉にたたみ、ふだんは閉じる。はじめにへ戻るは開閉の外
    expect(head).toContain(`<details class="board-demo-box"><summary>${BOARD_DEMO.controls}</summary>`);
    expect(head.indexOf(">はじめにへ戻る</button>")).toBeLessThan(head.indexOf("board-demo-box"));
    expect(head).not.toMatch(/医薬品ボード|（試作）/);
  });

  it("左のペインは、上から本部（HQ）→ 地区の見出し → その地区の救護所。最初は本部が選ばれている", () => {
    const p = pane(html);
    const order = [BOARD_LAYOUT.hq, "東地区（架空）", "救護所A", "救護所D", "西地区（架空）", "救護所B", "救護所C"].map((s) => p.indexOf(s));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p.match(/<button type="button" class="board-pane-item/g)).toHaveLength(5);
    expect(p).toContain('class="board-pane-item hq current" aria-current="true" data-pane="本部備蓄"');
    // 印：救護所B は記録の未着・転記待ちと薬剤師の不足（無彩色）。救護所C は在庫切れ。患者数はペインに出さない
    const b = p.slice(p.indexOf('data-pane="救護所B"'), p.indexOf('data-pane="救護所C"'));
    expect(b).toContain('<span class="board-pane-mark none">薬剤師 1人不足</span>');
    expect(b).toContain(">記録の未着・転記待ち 42件<");
    expect(b).not.toContain("今日の患者");
    expect(p.slice(p.indexOf('data-pane="救護所C"'))).toContain('<span class="board-pane-mark bad">在庫切れ 1</span>');
    // 最終報告が古い救護所（B・D）は、文字の注意が付く。A・C には付かない
    const stale = `<span class="board-stale">${BOARD_CHANGES.stale(BOARD_CHANGES.staleHours)}</span>`;
    expect(b).toContain(stale);
    expect(p.slice(p.indexOf('data-pane="救護所D"'), p.indexOf("西地区"))).toContain(stale);
    expect(p.slice(p.indexOf('data-pane="救護所A"'), p.indexOf('data-pane="救護所D"'))).not.toContain(stale);
    // 狭い幅で使う選択式は、ペインの前に置く
    expect(html.indexOf('class="board-pane-select"')).toBeLessThan(html.indexOf('class="board-pane"'));
    expect(p).toContain(`>${BOARD_LAYOUT.marks.proposals} 2<`);
  });

  it("上部タブは6つ（全体・在庫・発注・搬送・記録（カルテ）・デモ・連絡）で、選んだタブだけが aria-selected", () => {
    expect(html.match(/role="tab"/g)).toHaveLength(6);
    // 連絡のタブ（掲示板チャット、Issue #121）は、選んだときだけ中身を描く
    expect(html).not.toContain('class="board-chat"');
    const chat = render(HQ, "chat");
    expect(chat).toContain('id="board-tab-chat" aria-selected="true"');
    expect(chat).toContain('class="board-chat"');
    for (const label of Object.values(BOARD_LAYOUT.tabs)) expect(html).toContain(label);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('id="board-tab-overview" aria-selected="true"');
    const stock = render(HQ, "stock");
    expect(stock).toContain('id="board-tab-stock" aria-selected="true"');
    // 救護所を選ぶと、全体のタブは「詳細」になる。題の横に「／詳細」を重ねない
    expect(render("救護所A")).toContain(`>${BOARD_LAYOUT.siteTabs.overview}</button>`);
    expect(render("救護所A")).not.toContain('class="board-panel-tab"');
    expect(render("救護所A", "stock")).toContain('class="board-panel-tab"');
  });
});

describe("本部（HQ）の全体", () => {
  it("数字は架空データから計算したもの", () => {
    const today = todaySummary(PATIENTS);
    expect(html).toContain(`今日の患者（延べ・4か所）${today.patients}人`);
    expect(html).toContain(`data-testid="critical-count">${criticalItems(STOCK).length}</span>`);
    expect(html).toContain(`data-testid="pending-count">${pendingSummary(SYNC).pending}</span>`);
    expect(html).toContain(`data-testid="proposal-count">2</span>`);
    expect(html).toContain("未着 97・転記待ち 6");
    // 在庫の10件と確認・手配の12件の関係を同じ札で読める
    expect(html).toContain(`${criticalItems(STOCK).length}件 ＋ 未確認 1件 ＋ 見込み算出不可 1件 ＝ 確認・手配が必要な事項 ${cases.length}件`);
    expect(html).toContain('data-testid="stale-count">2</span>');
  });

  it("見る順は 指標 → 確認・手配が必要な事項（表）→ 承認待ちの提案 → 地図（Issue #113）。模式図の拠点は押せる", () => {
    const p = panel(html);
    const order = ['data-testid="sites-short"', 'data-testid="action-table"', 'id="board-hq-orders"', 'class="board-map-site'].map((x) => p.indexOf(x));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p.match(/<g class="board-map-site pressable[^"]*"/g)).toHaveLength(5);
    expect(p).toContain('role="button" tabindex="0" aria-label="救護所A（小学校の体育館）を選ぶ"');
    expect(p).toContain(`${BOARD_CASES.title} <span class="board-count">${cases.length} 件</span>`);
    // 表の行は caseRows の並び（業務のルール）のまま。列は 拠点／確認が必要なこと／現在の状況／次の確認
    const t = p.slice(p.indexOf('data-testid="action-table"'), p.indexOf("</table>", p.indexOf('data-testid="action-table"')));
    for (const h of Object.values(BOARD_CASES.table)) expect(t).toContain(`<th>${h}</th>`);
    expect((t.match(/data-case="([^"]+)"/g) ?? []).map((x) => x.slice(11, -1))).toEqual(cases.map((c) => `${c.site}|${c.item}`));
    const first = t.slice(t.indexOf("<tr data-case"), t.indexOf("</tr>", t.indexOf("<tr data-case")));
    expect(first).toContain('<span class="board-pill bad">在庫切れ</span>');
    expect(first).toContain("骨粗鬆症薬G（週1）");
    expect(first).toContain("現地 0錠・本部 0錠");
    expect(first).toContain(`${BOARD_CASES.proposal}：${BOARD_CASES.awaiting}`);
    expect(first).toContain(`${BOARD_CASES.table.next}</span>卸の回答を確認する</td>`);
    // 狭い幅で見出し行の代わりに見せる列名が、各セルにある（Issue #113 の PR レビュー）
    for (const h of Object.values(BOARD_CASES.table)) expect(first).toContain(`<span class="board-action-k" aria-hidden="true">${h}</span>`);
    // 在庫切れ見込みの札は「あと N 日」だけ（読み上げには状態の名前を添える）
    expect(t).toMatch(/<span class="board-pill warn"><span class="visually-hidden">在庫切れ見込み、<\/span>あと[\d.]+日<\/span>/);
    // 説明はヘルプの開閉の中
    expect(p).toContain(`<details class="board-help"><summary>${BOARD_CASES.help}</summary>`);
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
    expect(b).toContain("本部備蓄から 0錠・卸へ頼む 4シート（40錠）");
    // 救護所ごとの開閉できる欄にまとまる（Issue #167）。見出しに件数を出し、ふだんは閉じる
    expect(p).toContain('<details class="board-order-group" data-order-group="救護所B"><summary><b>救護所B</b><span class="board-pill warn">提案中 1 件</span>');
    expect(p).toContain('data-order-group="救護所C"');
    expect(p).not.toContain('data-order-group="救護所A"');
    // 根拠の算数は開閉の中（承認の前に開いて読める）
    expect(b).toContain(`<details class="board-order-basis-box"><summary>${BOARD_ORDERS.basisToggle}</summary>`);
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
    expect(c).not.toContain('data-testid="sites-short"');
    expect(c).not.toContain('data-testid="action-table"');
  });

  it("今日の患者人数、不足薬（救護所C の行だけ）、連絡先、経路、通信が出る", () => {
    const p = panel(c);
    expect(p).toContain('data-testid="site-patients">30 人<');
    // 最終報告の鮮度は3つに分けて出す（在庫確認・記録到着・経路確認）
    expect(p).toContain('data-testid="time-stock">11/05 08:10<');
    expect(p).toContain('data-testid="time-record">11/05 08:10<');
    expect(p).toMatch(/data-testid="time-route">\d\d\/\d\d \d\d:\d\d</);
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

  it("通信なしの救護所D：代わりの手段と迂回が出る。外部の地図は使わない", () => {
    const d = panel(render("救護所D"));
    expect(d).toContain("連絡員が本部へ持ち帰る（午後）");
    expect(d).toContain(">迂回</span>");
    expect(d).toContain(">未確認</span>");
    expect(html).not.toMatch(/<iframe|tile\.|openstreetmap|google\.com\/maps/i);
  });
});

describe("在庫・発注・搬送・記録・デモのタブ", () => {
  it("在庫：本部は救護所×薬の表、救護所はその救護所の行だけ", () => {
    const heat = panel(render(HQ, "stock"));
    expect(heat.match(/<th class="site">/g)).toHaveLength(5);
    expect(heat.match(/<td class="item">/g)).toHaveLength(ITEMS.length);
    expect(heat).toContain(">切れ<");
    expect(heat).toContain(">算出不可<");
    const b = panel(render("救護所B", "stock"));
    expect(b.match(/<tr>/g)?.length).toBe(1 + ITEMS.length);
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

  it("記録：本部は記録の届き方の表と救護所ごとのカルテの件数。救護所は「カルテを入力する」のボタンとカルテ（入力欄は専用画面へ。Issue #114）", () => {
    const r = panel(render(HQ, "records"));
    expect(r).toContain("記録の届き方（通信の状態）");
    expect(r).toContain("カルテ 1 件");
    const a = panel(render("救護所A", "records"));
    expect(a).not.toContain("<form");
    expect(a).toContain(`>${BOARD_INTAKE_MODE.open}</button>`);
    expect(a).toContain("<b>番号 A-012</b>");
  });

  it("デモ：時計の操作は上に常にあり、デモのタブに救護所ごとのカルテ入力の入口と起きたこと。動きを減らす設定では自動進行を出さない", () => {
    expect(html).toContain(`>${BOARD_DEMO.start}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.hour}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.reset}</button>`);
    const d = panel(render(HQ, "demo"));
    expect(d).not.toContain("<form");
    for (const s of ["救護所A", "救護所B", "救護所C", "救護所D"]) expect(d).toContain(`data-intake-open="${s}"`);
    expect(panel(render("救護所C", "demo")).match(/data-intake-open=/g)).toHaveLength(1);
    expect(d).toContain(BOARD_DEMO.logEmpty);
    const reduced = renderToStaticMarkup(<Board onBack={() => {}} reducedMotion initialSession={sessionFor(HQ)} />);
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
    expect(pane(h).slice(pane(h).indexOf('data-pane="救護所B"'))).toContain(`>${BOARD_LAYOUT.marks.undelivered}<`);
    const p = panel(h).slice(panel(h).indexOf('data-proposal="P-03"'));
    expect(p).toContain(`>${BOARD_ORDERS.newMark}<`);
    expect(p).toContain(
      `未交付・必要な数 20（${BOARD_INTAKE_MODE.basisFromCharts} 20） ＋ 目安の日数分の出庫 48 − 現地の在庫 0 − 向かっている搬送・入荷 0 ＝ 68`,
    );
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

  it("点数・合否の言葉を使わず、電話リンクが無い。外部リンクは本部の在庫タブの1つだけ。はじめにへ戻れる", () => {
    for (const site of [HQ, "救護所A", "救護所D"] as SiteId[]) {
      for (const tab of ["overview", "stock", "supply", "records", "demo"] as BoardTab[]) {
        const h = render(site, tab);
        expect(h).not.toMatch(/点数|合格|不合格|正解/);
        expect(h).not.toContain('href="tel:');
        // 国の医薬品供給状況へのリンク（Issue #143、2026-11-06 オーナーの指示）だけを、本部の在庫タブに置く
        expect(h.match(/<a /g) ?? []).toHaveLength(site === HQ && tab === "stock" ? 1 : 0);
        expect(h).toContain(">はじめにへ戻る</button>");
      }
    }
  });

  it("本部の在庫タブの外部リンクは、オーナーの指示の表示名・URL・添える文で、新しいタブで開く（データは取り込まない）", () => {
    expect(BOARD_SUPPLY_LINK.label).toBe("国の医薬品供給状況（厚生労働省）");
    expect(BOARD_SUPPLY_LINK.url).toBe("https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kouhatu-iyaku/04_00003.html");
    expect(BOARD_SUPPLY_LINK.note).toBe("メーカーの出荷状況です。救護所の在庫ではありません");
    expect(BOARD_SUPPLY_LINK.checkedOn).toBe("2026-11-06");
    const h = panel(render(HQ, "stock"));
    const link = h.slice(h.indexOf('data-testid="supply-link"'), h.indexOf("</div>", h.indexOf('data-testid="supply-link"')));
    expect(link).toContain(`<a href="${BOARD_SUPPLY_LINK.url}" target="_blank" rel="noopener noreferrer">${BOARD_SUPPLY_LINK.label}`);
    expect(link).toContain(BOARD_SUPPLY_LINK.newTab);
    expect(link).toContain(BOARD_SUPPLY_LINK.note);
    // 在庫の表のすぐ下。注意の色（bad・warn）の札を付けない
    expect(h.indexOf('data-testid="supply-link"')).toBeGreaterThan(h.indexOf("board-heat"));
    expect(link).not.toMatch(/class="[^"]*(bad|warn)/);
    // ほかのサイトへのリンクは無い
    expect(h.match(/href="https?:/g)).toHaveLength(1);
  });
});

describe("デザインの見直し（Issue #143）", () => {
  it("アクセス記録は帯（board-head）の中に置き、右下に浮かせない", () => {
    const h = render(HQ);
    const head = h.slice(h.indexOf('class="board-head"'), h.indexOf('class="board-body"'));
    expect(head).toContain('class="board-access-log"');
    expect(h.indexOf('class="board-access-log"')).toBeLessThan(h.indexOf('class="board-body"'));
    expect(head).toContain('data-testid="board-session"');
  });

  it("左の一覧で、ログイン中の救護所の名前の後ろに「（ログイン中）」を添える", () => {
    const p = pane(render(HQ, "overview", initialDemo(), sessionFor("救護所A")));
    const a = p.slice(p.indexOf('data-pane="救護所A"'), p.indexOf('data-pane="救護所D"'));
    expect(a).toContain(`<span class="board-pane-login">${BOARD_LOGIN.paneMark}</span>`);
    expect(p.match(/board-pane-login/g)).toHaveLength(1);
    // HQ でログインしているときは本部の行に添える（Issue #169）
    const h = pane(render(HQ));
    const hq = h.slice(h.indexOf(`data-pane="${HQ}"`), h.indexOf('data-pane="救護所A"'));
    expect(hq).toContain(`<span class="board-pane-login">${BOARD_LOGIN.paneMark}</span>`);
    expect(h.match(/board-pane-login/g)).toHaveLength(1);
  });

  it("発注の提案の承認・却下は HQ でログインしたときだけ押せる。救護所でログインすると押せず、理由を文で出す（Issue #169）", () => {
    const hq = panel(render(HQ));
    expect(hq.match(new RegExp(`>${BOARD_ORDERS.approve}</button>`, "g"))).toHaveLength(2);
    const a = panel(render(HQ, "overview", initialDemo(), sessionFor("救護所A")));
    expect(a).not.toContain(`>${BOARD_ORDERS.approve}</button>`);
    expect(a).not.toContain(`>${BOARD_ORDERS.reject}</button>`);
    expect(a).toContain(BOARD_ORDERS.approveOnlyHq);
    // HQ でログインしてもカルテは編集できない
    const rec = panel(render("救護所B", "records", initialDemo(), sessionFor(HQ)));
    expect(rec).toContain('data-permission="read"');
    expect(rec).toContain("本部（HQ）でログインしているため");
  });

  it("アクセス記録の、対象の無い行は横線の記号でなく「なし」と出す", () => {
    const open = renderToStaticMarkup(
      <AccessLogPanel log={[{ at: 0, site: "救護所A", staff: "見本 青葉", kind: "login", target: "" }]} defaultOpen />,
    );
    expect(open).toContain(`<td>${ACCESS_LOG_TEXT.noTarget}</td>`);
    expect(open).not.toContain("—");
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
    // 空のときは小さな補助表示（更新が無いことと、問題が無いことを分ける文）
    expect(html).toContain('class="board-changes empty"');
    expect(BOARD_CHANGES.none("09:30")).toContain("問題が無いという意味ではありません");
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
    expect(panel(render("救護所A"))).toContain('data-testid="site-last-report">2 時間前<');
    // 古い報告の注意は、救護所の数字の欄にも文字で付く（救護所D は 21 時間前）
    const d = panel(render("救護所D"));
    expect(d).toContain('<div class="stale"><dt>最終報告</dt>');
    expect(d).toContain(`<span class="board-stale">${BOARD_CHANGES.stale(BOARD_CHANGES.staleHours)}</span>`);
    expect(panel(render("救護所A"))).not.toContain("board-stale");
  });

  it("本部の全体の左上に、不足が出ている救護所の数を大きく出す。地区の見出しは折りたためる（既定は開く）", () => {
    const p = panel(html);
    expect(p.indexOf('data-testid="sites-short"')).toBeLessThan(p.indexOf('data-testid="critical-count"'));
    expect(p).toMatch(/data-testid="sites-short">\d+<span class="board-tile-of"> \/ 4 か所<\/span>/);
    expect(p).toContain(BOARD_LEAD_TILE.label);
    expect(pane(html)).toContain('<details class="board-pane-district" open="">');
  });
});

describe("カルテ入力の専用画面と処方の累計（Issue #114）", () => {
  const renderIntake = (site: SiteId, state = initialDemo()) =>
    renderToStaticMarkup(
      <Board onBack={() => {}} reducedMotion={false} initialSite={site} initialIntake initialState={state} initialSession={sessionFor(site)} />,
    );

  it("専用画面はボード全体を置き換える：左のペイン・上部タブ・デモ操作・在庫の表を出さず、救護所名・架空の印・時計・戻るが出る", () => {
    const h = renderIntake("救護所A");
    expect(h).toContain('data-intake="救護所A"');
    expect(h).toContain('<h1 id="board-intake-title" data-scroll-target="true" tabindex="-1">救護所A');
    expect(h).toContain(BOARD_MOCK_BADGE);
    expect(h).toContain('data-testid="demo-clock">11/05 09:30<');
    expect(h).not.toContain('class="board-pane"');
    expect(h).not.toContain('role="tablist"');
    expect(h).not.toContain(`>${BOARD_DEMO.reset}</button>`);
    expect(h).not.toContain("board-cases");
    expect(h.match(new RegExp(`>${BOARD_INTAKE_MODE.back}</button>`, "g"))).toHaveLength(2);
  });

  it("入力欄は救護所が固定で、送信先が無い（action・method なし）。架空の氏名の下書きと、処方は人が選ぶ欄", () => {
    const h = renderIntake("救護所B");
    expect(h).toContain('<form class="board-form">');
    expect(h).not.toMatch(/<form[^>]*(action|method)=/);
    expect(h).not.toContain(`<span>${BOARD_INTAKE_FORM.site}</span>`);
    expect(h).toContain('value="架空 太郎"');
    expect(h).toContain(`>${BOARD_INTAKE_FORM.prescriptionNone}</option>`);
    expect(h).toContain(BOARD_INTAKE_MODE.totalsEmpty);
  });

  it("本部備蓄を渡しても専用画面にしない（ボードの本部）", () => {
    const h = renderIntake(HQ);
    expect(h).not.toContain("data-intake=");
    expect(h).toContain('class="board-pane"');
  });

  it("登録すると、専用画面と救護所の状況に処方の累計（合計・渡せた数・未交付・件数）が出る。数量は入れた値を足すだけ", () => {
    const add = (qty: number): DemoAction => ({
      type: "add_record",
      site: "救護所B",
      name: "架空 花子",
      items: [],
      prescription: { item: "抗てんかん薬C", qty, days: 7 },
    });
    const s = demoReducer(demoReducer(initialDemo(), add(5)), add(6));
    for (const h of [renderIntake("救護所B", s), panel(render("救護所B", "overview", s))]) {
      const t = h.slice(h.indexOf('data-testid="rx-totals"'), h.indexOf("</table>", h.indexOf('data-testid="rx-totals"')));
      expect(t).toContain("<td>抗てんかん薬C</td>");
      expect(t).toContain('<td class="num">11錠</td><td class="num">8錠</td>');
      expect(t).toContain(">3錠</span>");
      expect(t).toContain('<td class="num">2</td>');
      expect(h).toContain(BOARD_INTAKE_MODE.totalsNote);
    }
    // 最初からある1枚＋同じ架空の氏名で2回入力した1枚
    expect(renderIntake("救護所B", s)).toContain(`${BOARD_INTAKE_MODE.count} 2 件`);
    // ほかの救護所には出ない
    expect(panel(render("救護所A", "overview", s))).not.toContain('data-testid="rx-totals"');
  });
});

describe("デモ用ログイン・救護所ごとの権限・カルテの確認状態（Issue #141）", () => {
  const added = (site: SiteId = "救護所B") =>
    demoReducer(initialDemo(), {
      type: "add_record",
      site,
      name: "架空 花子",
      items: [{ label: "薬の名前（架空）", value: "架空の錠剤" }],
      prescription: null,
    });
  const keyB = "救護所B|架空 花子";

  it("ログインしていなければ、デモ用のログインの画面だけを出す（「デモ用のログインです」、パスワードの欄なし）", () => {
    const h = render(HQ, "overview", initialDemo(), null);
    expect(h).toContain(BOARD_LOGIN.title);
    expect(h).toContain("デモ用のログインです");
    expect(h).toContain("デモ用の架空データ");
    expect(h).not.toContain('type="password"');
    expect(h).not.toContain('class="board-pane"');
    for (const s of ["救護所A", "救護所B", "救護所C", "救護所D"]) expect(h).toContain(`value="${s}"`);
    // 本部（HQ）でも入れる（Issue #169）
    expect(h).toContain('value="本部備蓄"/>本部（HQ）</label>');
  });

  it("右上に「救護所A／担当：○○（架空）」とログアウトを常に出す（ボードとカルテ入力の専用画面）", () => {
    const who = BOARD_LOGIN.who("救護所A", sessionFor("救護所A").staff);
    expect(render("救護所B", "overview", initialDemo(), sessionFor("救護所A"))).toContain(who);
    expect(render(HQ)).toContain(BOARD_LOGIN.logout);
    const intake = renderToStaticMarkup(
      <Board onBack={() => {}} reducedMotion={false} initialSite="救護所A" initialIntake initialSession={sessionFor("救護所A")} />,
    );
    expect(intake).toContain(who);
    expect(intake).toContain(BOARD_LOGIN.logout);
  });

  it("救護所A で入って救護所B を開くと、閲覧のみを文字で示し、カルテ入力のボタンを無効にする。拒否の確認のボタンを出す", () => {
    const h = panel(render("救護所B", "records", initialDemo(), sessionFor("救護所A")));
    expect(h).toContain(BOARD_PERMISSION.readOnly("救護所B"));
    expect(h).toContain('data-permission="read"');
    expect(h).toMatch(/<button type="button" class="board-approve board-intake-button" disabled=""/);
    expect(h).toContain('data-try-write="救護所B"');
    // 自分の救護所は編集できる
    const own = panel(render("救護所A", "records", initialDemo(), sessionFor("救護所A")));
    expect(own).toContain(BOARD_PERMISSION.editable("救護所A"));
    expect(own).not.toContain("data-try-write");
    expect(own).not.toMatch(/board-intake-button" disabled=""/);
  });

  it("URL でほかの救護所のカルテ入力の専用画面を開いても、登録のボタンは無効で閲覧のみと出る", () => {
    const h = renderToStaticMarkup(
      <Board onBack={() => {}} reducedMotion={false} initialSite="救護所B" initialIntake initialSession={sessionFor("救護所A")} />,
    );
    expect(h).toContain('data-intake="救護所B"');
    expect(h).toMatch(/<button type="submit" class="secondary" disabled=""/);
    expect(h).toContain(BOARD_PERMISSION.readOnly("救護所B"));
  });

  it("デモのタブのカルテ入力のボタンは、ログイン中の救護所だけ押せる", () => {
    const d = panel(render(HQ, "demo", initialDemo(), sessionFor("救護所C")));
    expect(d).toMatch(/data-intake-open="救護所C">/);
    expect(d).toMatch(/disabled="" data-intake-open="救護所A"|data-intake-open="救護所A" disabled=""/);
  });

  it("カルテの確認状態：下書きなし → 下書きを作るボタン、監査済み（指摘なし）でも確認待ち、確認済みで誰がいつ確認したかを出す", () => {
    const a = sessionFor("救護所B");
    let s = added();
    let h = panel(render("救護所B", "records", s, a));
    expect(h).toContain(CHART_REVIEW_TEXT.status.none);
    expect(h).toContain(KARTE_PANEL_TEXT.makeSummary);
    expect(h).toContain(KARTE_PANEL_TEXT.makePlanted);
    s = demoReducer(s, { type: "chart_draft", key: keyB, actor: a });
    s = demoReducer(s, { type: "chart_audit_start", key: keyB, actor: a });
    h = panel(render("救護所B", "records", s, a));
    expect(h).toContain(CHART_REVIEW_TEXT.status.ai_auditing);
    s = demoReducer(s, { type: "chart_audit_result", key: keyB, result: { ok: true, findings: [] } });
    h = panel(render("救護所B", "records", s, a));
    expect(h).toContain(CHART_REVIEW_TEXT.status.audited_clean);
    expect(h).toContain(CHART_REVIEW_TEXT.pendingFlag);
    expect(h).toContain(CHART_REVIEW_TEXT.confirm);
    s = demoReducer(s, { type: "chart_confirm", key: keyB, actor: a });
    h = panel(render("救護所B", "records", s, a));
    expect(h).toContain(CHART_REVIEW_TEXT.confirmedBy(a.staff, "救護所B", clockText(0)));
    expect(h).not.toContain(CHART_REVIEW_TEXT.confirm);
  });

  it("抽出型の要約（Issue #148）：誤りを混ぜた例を明示し、コードと監査役の指摘を該当する行に出し、セッションの削除を文字で出す", () => {
    const b = sessionFor("救護所B");
    const sample = findSample("karte-01")!;
    const summary = plantedSummary(sample);
    const findings = checkSummary(summary, patientUtterances(sample));
    const draft = summaryToDraft({ sampleId: sample.id, source: "planted", summary: maskForbidden(summary, findings), findings }, true)!;
    expect(draft.source).toBe("extractive");
    const plantedLine = summary.items.length - 1;
    expect(draft.codeFindings?.some((f) => f.line === plantedLine)).toBe(true);
    let s = demoReducer(added(), { type: "chart_draft", key: keyB, actor: b, draft });
    let h = panel(render("救護所B", "records", s, b));
    expect(h).toContain(PLANTED_NOTICE);
    expect(h).toContain(SAMPLE_NOTICE);
    expect(h).toContain(`data-line="${plantedLine}" data-finding=""`);
    expect(h).toContain(KARTE_PANEL_TEXT.codeFindings);
    expect(h).toContain(`${KARTE_PANEL_TEXT.quoteUnsupported}：「${summary.items[plantedLine].quote}」`);
    s = demoReducer(s, { type: "chart_audit_start", key: keyB, actor: b });
    const result = auditToResult(
      { status: "audited", findings: [{ kind: "not_in_conversation", aspect: summary.items[plantedLine].aspect, itemIndex: plantedLine, reason: "会話にありません" }], session: "deleted", ms: 3000 },
      summary,
    );
    s = demoReducer(s, { type: "chart_audit_result", key: keyB, result });
    h = panel(render("救護所B", "records", s, b));
    expect(h).toContain(CHART_REVIEW_TEXT.status.audited_findings(1));
    expect(h).toContain(KARTE_PANEL_TEXT.auditFindings);
    expect(h).toContain(AUDIT_SESSION_LABELS.deleted);
    expect(h).toContain(CHART_REVIEW_TEXT.confirm);
  });

  it("監査役が時間切れなら「監査できず」と理由とセッションの後片付けを出し、人の確認に進める", () => {
    const b = sessionFor("救護所B");
    const sample = findSample("karte-02")!;
    const draft = summaryToDraft({ sampleId: sample.id, source: "model", summary: sample.expected, findings: [] }, false)!;
    let s = demoReducer(added(), { type: "chart_draft", key: keyB, actor: b, draft });
    s = demoReducer(s, { type: "chart_audit_start", key: keyB, actor: b });
    s = demoReducer(s, { type: "chart_audit_result", key: keyB, result: auditToResult({ status: "unavailable", reason: "timeout", session: "pending", ms: 45000 }, sample.expected) });
    const h = panel(render("救護所B", "records", s, b));
    expect(h).toContain(CHART_REVIEW_TEXT.status.audit_unavailable);
    expect(h).toContain(KARTE_PANEL_TEXT.failure.timeout);
    expect(h).toContain(AUDIT_SESSION_LABELS.pending);
    expect(h).not.toContain(PLANTED_NOTICE);
    s = demoReducer(s, { type: "chart_confirm", key: keyB, actor: b });
    expect(s.chartReview[keyB].status).toBe("human_confirmed");
  });

  it("監査できず・監査の指摘ありを文字で出す。ほかの救護所の人には操作のボタンを出さない", () => {
    const b = sessionFor("救護所B");
    let s = demoReducer(added(), { type: "chart_draft", key: keyB, actor: b });
    s = demoReducer(s, { type: "chart_audit_start", key: keyB, actor: b });
    const failed = demoReducer(s, { type: "chart_audit_result", key: keyB, result: { ok: false, failure: "ai_stopped" } });
    expect(panel(render("救護所B", "records", failed, b))).toContain(CHART_REVIEW_TEXT.status.audit_unavailable);
    const found = demoReducer(s, {
      type: "chart_audit_result",
      key: keyB,
      result: { ok: true, findings: [{ where: "代わりに伝えられる人", kind: "会話にない内容", reason: "（見本）" }] },
    });
    const h = panel(render("救護所B", "records", found, b));
    expect(h).toContain(CHART_REVIEW_TEXT.status.audited_findings(1));
    // 監査の指摘ありは赤（stop）。ほかの確認待ちは黄（wait）（Issue #143、計画書 2.2）
    expect(h).toContain('class="board-review-status stop"');
    expect(h).toContain("会話にない内容");
    const other = panel(render("救護所B", "records", found, sessionFor("救護所A")));
    expect(other).not.toContain(CHART_REVIEW_TEXT.confirm);
    expect(other).toContain("data-readonly-review");
  });

  it("アクセス記録の一覧は開閉でき、「デモ用の記録です。保存していません」と、行は時刻・救護所・担当者・出来事・対象だけ", () => {
    const closed = render(HQ);
    expect(closed).toContain(ACCESS_LOG_TEXT.open);
    const log = [
      { at: 0, site: "救護所A" as const, staff: "見本 青葉", kind: "write_denied" as const, target: "救護所Bのカルテ" },
      { at: 0, site: "救護所A" as const, staff: "見本 青葉", kind: "login" as const, target: "" },
    ];
    const h = renderToStaticMarkup(<Board onBack={() => {}} reducedMotion={false} initialSession={sessionFor("救護所A")} initialAccessLog={log} />);
    expect(h).toContain(`${ACCESS_LOG_TEXT.open}（2 件）`);
    const open = renderToStaticMarkup(<AccessLogPanel log={log} defaultOpen />);
    expect(open).toContain(ACCESS_LOG_TEXT.notice);
    expect(open).toContain(ACCESS_LOG_TEXT.kinds.write_denied);
    expect(open).toContain("救護所Bのカルテ");
    expect(open.match(/<th>/g)).toHaveLength(5);
    // 8種類の出来事の名前がそろっている
    expect(Object.keys(ACCESS_LOG_TEXT.kinds)).toHaveLength(8);
  });
});
