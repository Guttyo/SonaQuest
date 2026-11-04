import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONFIRM_PROMPT, SKIP_CONFIRM_LABEL, SOURCE_OPTIONS } from "../flow/content";
import { ConfirmSource } from "./ConfirmSource";

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる */
const render = (initial: (typeof SOURCE_OPTIONS)[number]["id"] | null, ack: string | null = null) =>
  renderToStaticMarkup(<ConfirmSource ack={ack} initial={initial} onConfirm={() => {}} />);

const withGuess = render("notebook");
const radios = withGuess.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
const cards = withGuess.match(/<label class="mode-card">/g) ?? [];

describe("③確認の情報源のカード（A-04・A-05 の③、Issue #48・#49）", () => {
  it("SOURCE_OPTIONS の選択肢がすべて、同じ順番で、はじめにと同じカードとして並ぶ", () => {
    expect(radios).toHaveLength(SOURCE_OPTIONS.length);
    expect(cards).toHaveLength(SOURCE_OPTIONS.length);
    SOURCE_OPTIONS.forEach((option, i) => {
      expect(radios[i]).toContain(`value="${option.id}"`);
      expect(radios[i]).toContain('name="main-source"');
    });
  });

  it("カードの文は SOURCE_OPTIONS のまま（変えない・短くしない）", () => {
    for (const option of SOURCE_OPTIONS) {
      expect(withGuess).toContain(`<span class="mode-card-label">${option.label}</span>`);
      if (option.description !== "") {
        expect(withGuess).toContain(`<span class="mode-card-description">${option.description}</span>`);
      }
    }
    expect(withGuess).toContain(CONFIRM_PROMPT);
    expect(withGuess).toContain(SKIP_CONFIRM_LABEL);
  });

  it("候補があればそのラジオが1つだけ選ばれ、候補が無ければどれも選ばれていない", () => {
    const checked = radios.filter((r) => r.includes('checked=""'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="notebook"');

    const none = render(null);
    expect(none).not.toContain('checked=""');
    // 選ばないうちは「これで進む」を押せない
    expect(none).toMatch(/<button type="button" class="primary" disabled="">/);
  });

  it("絵は「どれにも当てはまらない」以外の5枚にあり、すべて aria-hidden（意味は文字で示す）", () => {
    // 吹き出しの横の聞き取り係の小さな顔（Puppet2DFace、Issue #47）は数えない
    const svgs = (withGuess.match(/<svg[^>]*>/g) ?? []).filter((svg) => !svg.includes('class="puppet2d"'));
    expect(svgs).toHaveLength(SOURCE_OPTIONS.filter((o) => o.id !== "none").length);
    for (const svg of svgs) {
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
    }
    // 選んだ印（✓）も読み上げない。色だけに頼らない印として全カードにある
    expect(withGuess.match(/<span class="mode-card-mark" aria-hidden="true">/g)).toHaveLength(
      SOURCE_OPTIONS.length,
    );
  });

  it("スクロールと焦点の目印・まとまりの名前を保つ（App.tsx の [data-scroll-target]）", () => {
    expect(withGuess).toMatch(
      /^<div class="confirm" data-scroll-target="true" tabindex="-1" role="group" aria-labelledby="confirm-prompt">/,
    );
    expect(withGuess).toContain('id="confirm-prompt"');
  });

  it("受け止めの一言があれば問いの前に出す", () => {
    const html = render(null, "教えてくださってありがとうございます。");
    expect(html.indexOf("教えてくださってありがとうございます。")).toBeLessThan(html.indexOf(CONFIRM_PROMPT));
  });
});
