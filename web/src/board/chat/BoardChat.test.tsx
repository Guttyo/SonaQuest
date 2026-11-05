// ボードの「連絡」タブ（掲示板チャット、B-07、ADR-0047）の画面の試験（docs/safety-test-plan.md H11）。
// DOM の無い環境で動くので、文字列に描いて確かめる。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialDemo } from "../demo";
import { BoardChat } from "./BoardChat";
import { ChatController, OPENING_JOBS } from "./controller";
import { CHAT_SEND_NOTICE, CHAT_TEXT, CHAT_VIEWS } from "./text";

const render = () => renderToStaticMarkup(<BoardChat state={initialDemo()} controller={new ChatController(async () => new Response("{}"))} />);

describe("連絡（掲示板チャット）の画面", () => {
  const html = render();

  it("題と、送る前の注意文と、始めるボタンを出す", () => {
    expect(html).toContain(CHAT_TEXT.title);
    expect(html).toContain(CHAT_SEND_NOTICE);
    expect(html).toContain(CHAT_TEXT.start);
    expect(html).toContain(CHAT_TEXT.phase.intro);
  });

  it("左に、本部のすべての欄・共通の欄・救護所A〜Dの DM の6つを並べる", () => {
    for (const v of CHAT_VIEWS) expect(html).toContain(`data-view="${v}"`);
    expect(html.match(/class="board-chat-view[ "]/g)).toHaveLength(6);
    expect(html).toContain('aria-pressed="true"');
  });

  it("最初は固定の掲示を吹き出しで並べる（エージェントを呼ばない）", () => {
    expect(html.match(/data-by="fixed"/g)).toHaveLength(OPENING_JOBS.length);
    expect(html).not.toContain('data-by="agent"');
    expect(html).toContain(CHAT_TEXT.fictional);
  });

  it("すべての欄のときは書き込まず、欄を選ぶよう案内する。タブを閉じると消えることを書く", () => {
    expect(html).toContain(CHAT_TEXT.chooseChannel);
    expect(html).not.toContain("<textarea");
    expect(html).toContain(CHAT_TEXT.memoryNote);
  });
});

describe("掲示板チャットは、ブラウザの保存領域を使わない", () => {
  it("chat/ のコードに localStorage・sessionStorage・IndexedDB・Cookie が無い", () => {
    const sources = import.meta.glob<string>(["./*.ts", "./*.tsx", "!./*.test.*"], { query: "?raw", import: "default", eager: true });
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(5);
    for (const code of Object.values(sources)) {
      expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.log/);
    }
  });
});
