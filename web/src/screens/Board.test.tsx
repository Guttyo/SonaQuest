import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INTAKE_RECORDS, PATIENTS, STOCK } from "../board/data";
import { criticalItems, todaySummary } from "../board/summary";
import { BOARD_MOCK_BADGE, BOARD_TITLE, INTAKE_IMAGE } from "../board/text";
import { Board } from "./Board";

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる */
const html = renderToStaticMarkup(<Board onBack={() => {}} />);

describe("地域本部のボード（試作。Issue #97）", () => {
  it("題と、架空であることの印が出る", () => {
    expect(html).toContain(`<h1 id="board-title" tabindex="-1">${BOARD_TITLE}</h1>`);
    expect(html).toContain(BOARD_MOCK_BADGE);
  });

  it("数字は架空データから計算したものが出る", () => {
    const today = todaySummary(PATIENTS);
    expect(html).toContain(`<b data-testid="today-patients">${today.patients}</b>`);
    expect(html).toContain(`<b data-testid="critical-count">${criticalItems(STOCK).length}</b>`);
    expect(html).toContain(`<b data-testid="pending-count">103</b>`);
  });

  it("在庫の表は救護所4つと本部備蓄の列、9つの薬の行", () => {
    const heat = html.slice(html.indexOf('class="board-tablebox board-heat"'), html.indexOf('id="board-trend"'));
    expect(heat.match(/<th class="site">/g)).toHaveLength(5);
    expect(heat.match(/<td class="item">/g)).toHaveLength(9);
    expect(heat).toContain('class="cell bad" title="救護所A：血糖降下薬B。');
    expect(heat).toContain(">切れ<");
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

  it("文字起こしのイメージは枠だけで、別のアプリが提出物に含まれないことと、QR の連携が構想であることを示す", () => {
    expect(html).toContain(INTAKE_IMAGE.placeholder);
    expect(html).toContain("この提出物には含まれません");
    expect(html).toContain("構想。実装していません");
    expect(html).not.toContain("<img");
  });

  it("点数・合否の言葉を使わず、送信・保存の部品が無い", () => {
    expect(html).not.toMatch(/点数|合格|不合格|正解/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(">はじめにへ戻る</button>");
  });
});
