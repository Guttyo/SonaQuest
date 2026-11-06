import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DONE_MEMO_COPY,
  DONE_MEMO_TITLE,
  DONE_NOTE,
  JUDGMENT_LABELS,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  VIEWPOINT_SHORT_LABELS,
} from "../flow/content";
import type { Judgments } from "../flow/types";
import { Done, doneMemoText } from "./Done";

const mixed: Judgments = {
  location: "confirmed",
  alternative: "aware_unconfirmed",
  current: "not_mentioned",
  unrecorded: "confirmed",
  proxy: "confirmed",
};
const allConfirmed: Judgments = {
  location: "confirmed",
  alternative: "confirmed",
  current: "confirmed",
  unrecorded: "confirmed",
  proxy: "confirmed",
};

const render = (judgments: Judgments | null) =>
  renderToStaticMarkup(
    <Done action="wallet_memo" timing="today" judgments={judgments} onRestart={() => {}} />,
  );

describe("終わりの画面（ADR-0054）：持ち帰るのは、決めた準備・いつ・まだ弱いところ", () => {
  it("決めた準備の名前と一言、いつやるか、まだ弱いところを短い名前と判定で1行に出す", () => {
    const html = render(mixed);
    expect(html).toContain(PREP_ACTIONS.find((a) => a.id === "wallet_memo")!.label);
    expect(html).toContain(PREP_ACTION_EFFECTS.wallet_memo);
    expect(html).toContain("今日中");
    const weak = html.slice(html.indexOf("まだ弱いところ："), html.indexOf('class="done-memo"'));
    expect(weak).toContain(`${VIEWPOINT_SHORT_LABELS.current}（${JUDGMENT_LABELS.not_mentioned}）`);
    expect(weak).toContain(`${VIEWPOINT_SHORT_LABELS.alternative}（${JUDGMENT_LABELS.aware_unconfirmed}）`);
    expect(weak).not.toContain(VIEWPOINT_SHORT_LABELS.location);
    // 「確認していない」が先
    expect(weak.indexOf(VIEWPOINT_SHORT_LABELS.current)).toBeLessThan(
      weak.indexOf(VIEWPOINT_SHORT_LABELS.alternative),
    );
    expect(html).toContain(DONE_NOTE);
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toContain('aria-hidden="true"');
  });

  it("判定が無い回（Claude を使わない・失敗）と、全部「確認できた」の回は、まだ弱いところの行を出さない", () => {
    expect(render(null)).not.toContain("まだ弱いところ");
    expect(render(allConfirmed)).not.toContain("まだ弱いところ");
  });
});

describe("メモに写す（ADR-0054 の追記10）：固定文だけで、回答は入れない", () => {
  it("写す文は、題・次の準備・いつ・まだ弱いところの4行。弱いところが無い回は3行", () => {
    const text = doneMemoText("wallet_memo", "this_week", mixed);
    expect(text.split("\n")).toEqual([
      DONE_MEMO_TITLE,
      `次の準備：${PREP_ACTIONS.find((a) => a.id === "wallet_memo")!.label}`,
      "いつ：今週中",
      `まだ弱いところ：${VIEWPOINT_SHORT_LABELS.current}（${JUDGMENT_LABELS.not_mentioned}）、${VIEWPOINT_SHORT_LABELS.alternative}（${JUDGMENT_LABELS.aware_unconfirmed}）`,
    ]);
    expect(doneMemoText("tell_family", "today", null).split("\n")).toHaveLength(3);
    expect(doneMemoText("tell_family", "today", allConfirmed).split("\n")).toHaveLength(3);
  });

  it("画面には写す文を選べる形で出し、クリップボードが無い環境（この試験）ではボタンを出さない。知らせの領域は aria-live", () => {
    const html = render(mixed);
    expect(html).toContain('<pre class="done-memo-text">');
    expect(html).toContain(DONE_MEMO_TITLE);
    expect(html).not.toContain(DONE_MEMO_COPY);
    expect(html).toContain('role="status" aria-live="polite"');
  });
});
