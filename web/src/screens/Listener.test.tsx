import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Listener } from "./Listener";

/**
 * 試験は DOM の無い環境で動くので、文字列に描いて確かめる。
 * この環境では WebGL が無いので、"3d" を頼んでも 2D の聞き取り係になる（ADR-0032 の戻り先）。
 */
describe("Listener の props（ADR-0032）", () => {
  it("props を省くと、これまでと同じ表示（止まった光と発言）", () => {
    const html = renderToStaticMarkup(
      <Listener>
        <p>質問の文</p>
      </Listener>,
    );
    expect(html).toBe(
      '<div class="listener"><span class="listener-light" aria-hidden="true"></span>' +
        '<div class="listener-speech"><span class="listener-name">聞き取り係</span><p>質問の文</p></div></div>',
    );
  });

  it("3D を頼んでも、WebGL が使えないときは 2D の聞き取り係で続け、状態を文字で示す", () => {
    const html = renderToStaticMarkup(
      <Listener mode="3d" activity="speaking">
        <p>質問の文</p>
      </Listener>,
    );
    expect(html).not.toContain("canvas");
    expect(html).not.toContain("listener-3d");
    expect(html).toContain('class="listener-light"');
    expect(html).toContain("（話しています）");
    expect(html).toContain("<p>質問の文</p>");
  });

  it("状態を渡すと文字でも示す。3D で状態を省くと「待っています」", () => {
    expect(renderToStaticMarkup(<Listener activity="listening">x</Listener>)).toContain(
      "（聞いています）",
    );
    expect(renderToStaticMarkup(<Listener activity="thinking">x</Listener>)).toContain(
      "（考えています）",
    );
    expect(renderToStaticMarkup(<Listener mode="3d">x</Listener>)).toContain("（待っています）");
  });

  it("係の交代では、2D の光も別の色にする", () => {
    const html = renderToStaticMarkup(<Listener relief>x</Listener>);
    expect(html).toContain('class="listener-light listener-light-relief"');
  });
});
