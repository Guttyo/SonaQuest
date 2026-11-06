// ボードの「連絡」タブ（掲示板チャット、B-07、ADR-0047）の画面の試験（docs/safety-test-plan.md H11）。
// DOM の無い環境で動くので、文字列に描いて確かめる。

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialDemo } from "../demo";
import { BoardChat } from "./BoardChat";
import { chatStatus } from "./status";

const chatStatusOf = () => chatStatus(initialDemo());
import { ChatController, newViewMemory, OPENING_JOBS, type ChatViewMemory } from "./controller";
import { CHAT_BUBBLE_TEXT, CHAT_SEND_NOTICE, CHAT_TEXT, CHAT_VIEWS } from "./text";

const render = (memory: ChatViewMemory = newViewMemory(), controller = new ChatController(async () => new Response("{}"))) =>
  renderToStaticMarkup(<BoardChat state={initialDemo()} controller={controller} memory={memory} />);

describe("連絡（掲示板チャット）の画面", () => {
  const html = render();

  it("題と、送る前の注意文と、始めるボタンを出す", () => {
    expect(html).toContain(CHAT_TEXT.title);
    expect(html).toContain(CHAT_SEND_NOTICE);
    expect(html).toContain(CHAT_TEXT.start);
    expect(html).toContain(CHAT_BUBBLE_TEXT.aiStatus.intro);
    expect(html).toContain(CHAT_TEXT.startNote);
  });

  it("上の説明は短い文にし、もとの長い説明は「この掲示板について」の中に入れる（Issue #161）", () => {
    expect(html).toContain(CHAT_BUBBLE_TEXT.lead);
    expect(html).toMatch(/<details class="board-chat-about"><summary>この掲示板について<\/summary><p>/);
    expect(html).toContain(CHAT_TEXT.lead);
  });

  it("操作中の役割（本部）と、AI の発言でボードの状態は変わらないことを出す（Issue #161）", () => {
    expect(html).toContain('data-testid="chat-operating-role"');
    expect(html).toContain(CHAT_BUBBLE_TEXT.operatingRoleLabel);
    expect(html).toContain(CHAT_BUBBLE_TEXT.operatingRole);
    expect(html).toContain(CHAT_BUBBLE_TEXT.boardUnchanged);
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

  it("吹き出しは、本部を右（hq）、救護所を左（site）に分ける", () => {
    const hq = OPENING_JOBS.filter((j) => j.role === "HQ").length;
    expect(html.match(/data-side="hq"/g)).toHaveLength(hq);
    expect(html.match(/data-side="site"/g)).toHaveLength(OPENING_JOBS.length - hq);
  });

  it("エージェントの書き込みには「AI・訓練上の発言」の印を付ける", async () => {
    const controller = new ChatController(async (url) =>
      url.endsWith("/session")
        ? Response.json({ sessionId: "sesn_0123456789abcdef" })
        : Response.json({ text: "夕方の便で毛布を受け取ります。", rejected: null }),
    );
    controller.setStatusSource(() => chatStatusOf());
    controller.seed();
    controller.start();
    await controller.idle();
    const out = render(newViewMemory(), controller);
    expect(out).toContain('data-by="agent"');
    expect(out).toContain(`class="board-chat-badge agent">${CHAT_BUBBLE_TEXT.aiBadge}<`);
  });

  it("別のタブから戻ったときは、覚えていた欄を選んだ状態で描く（ブラウザのメモリだけ）", () => {
    const memory = newViewMemory();
    memory.view = "B";
    const out = render(memory);
    expect(out).toMatch(/aria-pressed="true" data-view="B"/);
    expect(out).toContain("<textarea");
    expect(out).toContain(CHAT_BUBBLE_TEXT.operatingRoleNote);
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
