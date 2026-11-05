import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INBOUND, INTAKE_RECORDS, NEEDS, PATIENTS, SITES, STOCK, SYNC } from "../board/data";
import { caseRows, criticalItems, pendingSummary, todaySummary } from "../board/summary";
import { BOARD_CASES, BOARD_MOCK_BADGE, BOARD_TITLE, INTAKE_IMAGE } from "../board/text";
import { Board } from "./Board";

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる */
const html = renderToStaticMarkup(<Board onBack={() => {}} />);
const cases = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC);

describe("地域本部のボード（試作。Issue #97、#101）", () => {
  it("題は App の画面遷移の焦点の目印（[data-scroll-target]）で、直下に架空データの印と集計時点", () => {
    expect(html).toContain(`<h1 id="board-title" data-scroll-target="true" tabindex="-1">${BOARD_TITLE}</h1>`);
    const asof = html.slice(html.indexOf('class="board-asof"'), html.indexOf('id="board-cases"'));
    expect(asof).toContain(BOARD_MOCK_BADGE);
    expect(asof).toContain("集計 11/05 09:30 時点");
  });

  it("先頭は「確認・手配が必要な品目」、次に救護所ごとの一枚、集計のカードはその後", () => {
    const i = (needle: string) => html.indexOf(needle);
    expect(i('id="board-cases"')).toBeGreaterThan(0);
    expect(i('id="board-cases"')).toBeLessThan(i('id="board-overview"'));
    expect(i('id="board-overview"')).toBeLessThan(i('class="board-tiles"'));
    expect(i('class="board-tiles"')).toBeLessThan(i('id="board-sites"'));
    // 救護所ごとの一枚：4枚。人員の不足は「不足 N 人」と文字で出る（救護所A は 2/3 人）
    expect(html.match(/<li class="board-site">/g)).toHaveLength(4);
    const a = html.slice(i("<h3>救護所A</h3>"), i("<h3>救護所B</h3>"));
    expect(a).toContain("2 人");
    expect(a).toContain(">不足 1 人</span>");
    expect(a).toContain(">通行可</span>");
    expect(html).toContain(`${BOARD_CASES.title} <span class="board-count">${cases.length} 件</span>`);
  });

  it("救護所C の例：在庫切れ・現地0錠・本部0錠・卸に照会中・到着未定・次の確認が同じ行にある", () => {
    const first = html.slice(html.indexOf('<li class="board-case">'), html.indexOf("</li>"));
    expect(first).toContain(">在庫切れ</span>");
    expect(first).toContain("<b>救護所C</b>・骨粗鬆症薬G（週1）");
    expect(first).toContain("現地</span> 0錠");
    expect(first).toContain("本部</span> 0錠");
    expect(first).toContain("卸に照会中・到着未定");
    expect(first).toContain("次の確認</span> 卸の回答を確認する");
    // 行の詳細：架空の連絡先、薬剤師数、通信手段、記録が届いた時刻と在庫を確認した時刻は別
    expect(first).toContain("000-0000-0003（架空。携帯が断続的）");
    expect(first).toContain("対応できる薬剤師</dt><dd>2 人</dd>");
    expect(first).toContain("紙で記録・携帯が断続的");
    expect(first).toContain("最後に記録が届いた時刻</dt><dd>11/05 08:10</dd>");
    expect(first).toContain("在庫を確認した時刻</dt><dd>11/05 08:10</dd>");
    expect(first).toContain("3錠（11/08 09:00 まで）");
  });

  it("未確認・見込み算出不可は在庫切れと別の文字で出る。通信なしの拠点は代わりの手段を先に出す", () => {
    expect(html).toContain(">未確認</span>");
    expect(html).toContain(">見込み算出不可</span>");
    const d = html.slice(html.indexOf("<b>救護所D</b>・吸入薬D"));
    const detail = d.slice(d.indexOf('class="board-case-detail"'), d.indexOf("</details>"));
    expect(detail.indexOf("代わりの手段")).toBeLessThan(detail.indexOf("連絡先（架空）"));
    expect(detail).toContain("連絡員が本部へ持ち帰る（午後）");
    // 本部からの経路（文字だけ。地図は出さない）
    expect(detail).toContain("本部からの経路</dt>");
    expect(detail).toContain(">通行止め</span>");
    expect(html).not.toMatch(/<iframe|tile\.|openstreetmap|google\.com\/maps/i);
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
    expect(html).not.toMatch(/<details class="board-more" open/);
    const heat = html.slice(html.indexOf('class="board-tablebox board-heat"'), html.indexOf('id="board-inbound"'));
    expect(heat.match(/<th class="site">/g)).toHaveLength(5);
    expect(heat.match(/<td class="item">/g)).toHaveLength(9);
    expect(heat).toContain(">切れ<");
    expect(heat).toContain(">未確認<");
    expect(heat).toContain(">算出不可<");
    expect(html).toContain('<svg viewBox="0 0 560 220" aria-hidden="true">');
    expect(html).toContain("救護所ごとの、日ごとの延べ患者数</caption>");
  });

  it("問診の記録は架空の番号で、患者の名前が無く、医師の処方は人が入力する欄として出る", () => {
    for (const rec of INTAKE_RECORDS) {
      expect(html).toContain(`番号 ${rec.id}`);
      for (const it of rec.items) expect(html).toContain(it.value);
    }
    expect(html).toContain("医師の処方（医師が入力する欄。アプリは決めない）");
    expect(html).toContain("未入力");
    expect(html).not.toMatch(/氏名|患者名|さん<|様</);
  });

  it("文字起こしのイメージは、画像が無いうちは枠ごと出さない", () => {
    expect(INTAKE_IMAGE.src).toBe("");
    expect(html).not.toContain("board-image");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("画像は準備中");
  });

  it("点数・合否の言葉を使わず、送信・保存・電話リンクの部品が無い", () => {
    expect(html).not.toMatch(/点数|合格|不合格|正解/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain('href="tel:');
    expect(html).not.toContain("<a ");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(">はじめにへ戻る</button>");
  });
});
