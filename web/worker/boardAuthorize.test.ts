import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const URL_LOCAL = "http://127.0.0.1:8787/api/board/authorize";
const URL_PUBLIC = "https://sonaquest.example.workers.dev/api/board/authorize";

function post(body: unknown, url = URL_LOCAL) {
  return createApp().request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("/api/board/authorize（Issue #141、ADR-0050）", () => {
  it("同じ救護所への書き込みは 200 で許可", async () => {
    const res = await post({ actor_site: "A", target_site: "A", kind: "chart_confirm" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true });
  });

  it("ほかの救護所への書き込みは 403 で拒否し、ログには種類だけを出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await post({ actor_site: "A", target_site: "B", kind: "chart_add" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ allowed: false, error: "forbidden" });
    expect(warn.mock.calls).toEqual([["board_authorize: denied"]]);
    expect(log).not.toHaveBeenCalled();
  });

  it("公開する版の宛先でも同じ判定（外部を呼ばないので、公開の切り替えを要らない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post({ actor_site: "C", target_site: "C", kind: "chart_add" }, URL_PUBLIC)).status).toBe(200);
    expect((await post({ actor_site: "C", target_site: "D", kind: "chart_add" }, URL_PUBLIC)).status).toBe(403);
  });

  it("形の違う入力・余計なキー（担当者名・カルテの中身）は 400", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const body of [
      "not json",
      [],
      { actor_site: "A", target_site: "B" },
      { actor_site: "A", target_site: "B", kind: "chart_add", staff: "見本 青葉" },
      { actor_site: "A", target_site: "本部", kind: "chart_add" },
      { actor_site: "A", target_site: "A", kind: "delete_all" },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    // ログに値（担当者名など）を出さない
    for (const call of warn.mock.calls) expect(String(call[0])).toBe("board_authorize: bad_request");
  });

  it("大きすぎる本文は読まずに 413", async () => {
    const res = await post({ actor_site: "A", target_site: "A", kind: "chart_add", pad: "x".repeat(500) });
    expect(res.status).toBe(413);
  });

  it("GET では受けない（ほかの /api と同じく 404）", async () => {
    const res = await createApp().request(URL_LOCAL);
    expect(res.status).toBe(404);
  });
});
