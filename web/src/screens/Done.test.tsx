import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DONE_NOTE,
  JUDGMENT_LABELS,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  VIEWPOINT_SHORT_LABELS,
} from "../flow/content";
import type { Judgments } from "../flow/types";
import { Done } from "./Done";

const mixed: Judgments = {
  location: "confirmed",
  alternative: "aware_unconfirmed",
  current: "not_mentioned",
  unrecorded: "confirmed",
  proxy: "confirmed",
};

const render = (judgments: Judgments | null) =>
  renderToStaticMarkup(
    <Done action="wallet_memo" timing="today" judgments={judgments} onRestart={() => {}} />,
  );

describe("終わりの画面（ADR-0051）：持ち帰るのは、決めた準備・いつ・まだ弱いところ", () => {
  it("決めた準備の名前と一言、いつやるか、まだ弱いところを短い名前と判定で1行に出す", () => {
    const html = render(mixed);
    expect(html).toContain(PREP_ACTIONS.find((a) => a.id === "wallet_memo")!.label);
    expect(html).toContain(PREP_ACTION_EFFECTS.wallet_memo);
    expect(html).toContain("今日中");
    const weak = html.slice(html.indexOf("まだ弱いところ："));
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
    expect(
      render({
        location: "confirmed",
        alternative: "confirmed",
        current: "confirmed",
        unrecorded: "confirmed",
        proxy: "confirmed",
      }),
    ).not.toContain("まだ弱いところ");
  });
});
