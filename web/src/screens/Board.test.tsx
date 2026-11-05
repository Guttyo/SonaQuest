import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INBOUND, INTAKE_RECORDS, NEEDS, PATIENTS, SITES, STOCK, SYNC } from "../board/data";
import { caseRows, criticalItems, pendingSummary, todaySummary } from "../board/summary";
import { BOARD_CASES, BOARD_DEMO, BOARD_INTAKE_FORM, BOARD_MOCK_BADGE, BOARD_TITLE, INTAKE_IMAGE } from "../board/text";
import { Board } from "./Board";

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる（最初の状態。デモの操作は demo.test.ts） */
const html = renderToStaticMarkup(<Board onBack={() => {}} reducedMotion={false} />);
const cases = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC);

describe("地域本部のボード（試作。Issue #97、#101、#102）", () => {
  it("題は App の画面遷移の焦点の目印（[data-scroll-target]）で、直下に架空データの印と集計時点", () => {
    expect(html).toContain(`<h1 id="board-title" data-scroll-target="true" tabindex="-1">${BOARD_TITLE}</h1>`);
    const asof = html.slice(html.indexOf('class="board-asof"'), html.indexOf('id="board-cases"'));
    expect(asof).toContain(BOARD_MOCK_BADGE);
    expect(asof).toContain("集計 11/05 09:30 時点");
  });

  it("先頭は救護所ごとの一覧（1タップ目）で、救護所の行に人員と薬の不足、開くと品目の行（2タップ目）。集計のカードはその後", () => {
    const i = (needle: string) => html.indexOf(needle);
    expect(i('id="board-cases"')).toBeGreaterThan(0);
    expect(i('id="board-cases"')).toBeLessThan(i('id="board-demo"'));
    expect(i('id="board-demo"')).toBeLessThan(i('class="board-tiles"'));
    expect(html).toContain(`${BOARD_CASES.title} <span class="board-count">${cases.length} 件</span>`);
    expect(html.match(/<li class="board-group">/g)).toHaveLength(4);
    // 救護所の行：薬剤師の不足は「不足 N 人」と文字で（救護所A は 2/3 人）、経路は文字で
    const a = html.slice(i("<b>救護所A</b>"), i("<b>救護所A</b>") + 1500);
    expect(a).toContain("2 人");
    expect(a).toContain(">不足 1 人</span>");
    expect(a).toContain(">通行可</span>");
    // 品目の行は救護所の行の中（details の中の details）
    expect(html.match(/<li class="board-case">/g)).toHaveLength(cases.length);
    expect(html).not.toMatch(/<details class="board-more" open/);
  });

  it("救護所C の例：在庫切れ・現地0錠・本部0錠・卸に照会中・到着未定・次の確認が同じ行にあり、詳細に連絡に要るものがそろう", () => {
    const c = html.slice(html.indexOf("<b>救護所C</b>"));
    const first = c.slice(c.indexOf('<li class="board-case">'), c.indexOf("</li>"));
    expect(first).toContain(">在庫切れ</span>");
    expect(first).toContain("骨粗鬆症薬G（週1）");
    expect(first).toContain("現地</span> 0錠");
    expect(first).toContain("本部</span> 0錠");
    expect(first).toContain("卸に照会中・到着未定");
    expect(first).toContain("次の確認</span> 卸の回答を確認する");
    expect(first).toContain("000-0000-0003（架空。携帯が断続的）");
    expect(first).toContain("対応できる薬剤師</dt><dd>2 人</dd>");
    expect(first).toContain("紙で記録・携帯が断続的");
    expect(first).toContain("最後に記録が届いた時刻</dt><dd>11/05 08:10</dd>");
    expect(first).toContain("在庫を確認した時刻</dt><dd>11/05 08:10</dd>");
    expect(first).toContain("3錠（11/08 09:00 まで）");
    expect(first).toContain("本部からの経路</dt>");
  });

  it("未確認・見込み算出不可は在庫切れと別の文字で出る。通信なしの拠点は代わりの手段を先に出す。地図は出さない", () => {
    expect(html).toContain(">未確認</span>");
    expect(html).toContain(">見込み算出不可</span>");
    const d = html.slice(html.indexOf("<b>救護所D</b>"));
    const row = d.slice(d.indexOf("吸入薬D"));
    const detail = row.slice(row.indexOf('class="board-case-detail"'), row.indexOf("</details>"));
    expect(detail.indexOf("代わりの手段")).toBeLessThan(detail.indexOf("連絡先（架空）"));
    expect(detail).toContain("連絡員が本部へ持ち帰る（午後）");
    expect(detail).toContain(">通行止め</span>");
    expect(html).not.toMatch(/<iframe|tile\.|openstreetmap|google\.com\/maps/i);
  });

  it("デモ：時計の操作のボタンと、架空の問診の入力（送信先なし）。最初は記録に入力したものが無い", () => {
    expect(html).toContain(`>${BOARD_DEMO.start}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.hour}</button>`);
    expect(html).toContain(`>${BOARD_DEMO.reset}</button>`);
    expect(html).toContain('<form class="board-form">');
    expect(html).not.toMatch(/<form[^>]*(action|method)=/);
    expect(html).toContain(BOARD_INTAKE_FORM.nameNote);
    expect(html).toContain('value="架空 太郎"');
    expect(html).toContain(`>${BOARD_INTAKE_FORM.prescriptionNone}</option>`);
    expect(html).toContain(`>${BOARD_INTAKE_FORM.submit}</button>`);
    expect(html).not.toContain("board-record-added");
    // 動きを減らす設定では自動進行のボタンを出さない
    const reduced = renderToStaticMarkup(<Board onBack={() => {}} reducedMotion />);
    expect(reduced).not.toContain(`>${BOARD_DEMO.start}</button>`);
    expect(reduced).toContain(BOARD_DEMO.reducedMotion);
  });

  it("数字は架空データから計算したものが出る", () => {
    const today = todaySummary(PATIENTS);
    expect(html).toContain(`<span class="board-tile-big" data-testid="today-patients">${today.patients}</span>`);
    expect(html).toContain(`<span class="board-tile-big" data-testid="critical-count">${criticalItems(STOCK).length}</span>`);
    expect(html).toContain(`<span class="board-tile-big" data-testid="pending-count">${pendingSummary(SYNC).pending}</span>`);
    expect(html).toContain("未着 97・転記待ち 6");
  });

  it("在庫の全表・推移・問診の例は閉じた詳細（details）の中。推移の図には同じ数字の表が添う", () => {
    expect(html.match(/<details class="board-more">/g)?.length).toBeGreaterThanOrEqual(8);
    const heat = html.slice(html.indexOf('class="board-tablebox board-heat"'), html.indexOf('id="board-inbound"'));
    expect(heat.match(/<th class="site">/g)).toHaveLength(5);
    expect(heat.match(/<td class="item">/g)).toHaveLength(9);
    expect(heat).toContain(">切れ<");
    expect(heat).toContain(">未確認<");
    expect(heat).toContain(">算出不可<");
    expect(html).toContain('<svg viewBox="0 0 560 220" aria-hidden="true">');
    expect(html).toContain("救護所ごとの、日ごとの延べ患者数</caption>");
  });

  it("問診の記録は架空の番号で、最初からあるものに患者の名前が無く、医師の処方は人が入力する欄として出る", () => {
    for (const rec of INTAKE_RECORDS) {
      expect(html).toContain(`番号 ${rec.id}`);
      for (const it of rec.items) expect(html).toContain(it.value);
    }
    expect(html).toContain("医師の処方（医師が入力する欄。アプリは決めない）");
    expect(html).toContain("未入力");
    // 名前の欄は入力のフォームにだけあり（架空の氏名）、最初からある記録には無い
    const records = html.slice(html.indexOf('id="board-intake"'), html.indexOf('id="board-sites"'));
    expect(records).not.toMatch(/患者名|さん<|様</);
    expect(records).not.toContain("（架空）<span");
  });

  it("文字起こしのイメージは、画像が無いうちは枠ごと出さない", () => {
    expect(INTAKE_IMAGE.src).toBe("");
    expect(html).not.toContain("board-image");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("画像は準備中");
  });

  it("点数・合否の言葉を使わず、電話リンク・外部リンクが無い", () => {
    expect(html).not.toMatch(/点数|合格|不合格|正解/);
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain("<a ");
    expect(html).toContain(">はじめにへ戻る</button>");
  });
});
