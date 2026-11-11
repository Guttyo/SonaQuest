// Managed Agents のセッションの共通の部品（Issue #294）の試験。Managed Agents は呼ばず、偽物を使う。
// collectTurn の試験は boardChat.test.ts から移した（振る舞いは同じ）。

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_ID_PATTERN,
  classify,
  cleanupSession,
  CLEANUP_DEADLINE_MS,
  collectTurn,
  ENV_ID_PATTERN,
  interruptSession,
  runSessionTurn,
  type SessionOps,
} from "./managedSession";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Event = { type: string; [key: string]: unknown };

describe("SSE の出来事の読み方（collectTurn）", () => {
  async function* events(list: Event[]) {
    for (const e of list) yield e;
  }
  const running: Event = { type: "session.status_running" };
  const idle = (type: string): Event => ({ type: "session.status_idle", stop_reason: { type } });
  const message = (text: string): Event => ({ type: "agent.message", content: [{ type: "text", text }] });

  it("動き出しの前に来た止まり（開いた時点の状態）は数えず、この回の文を読む", async () => {
    const result = await collectTurn(events([idle("end_turn"), running, message("毛布を"), message("受け取ります。"), idle("end_turn")]));
    expect(result).toEqual({ ok: true, text: "毛布を受け取ります。" });
  });

  it("止まった後の出来事は読まない", async () => {
    const result = await collectTurn(events([running, message("了解です。"), idle("end_turn"), message("後の文")]));
    expect(result).toEqual({ ok: true, text: "了解です。" });
  });

  it.each([
    ["budget_reached", "budget_reached"],
    ["requires_action", "requires_action"],
    ["retries_exhausted", "retries_exhausted"],
    ["refusal", "refusal"],
    ["something_new", "unknown"],
  ])("止まった理由 %s は失敗 %s", async (reason, failure) => {
    expect(await collectTurn(events([running, message("途中"), idle(reason)]))).toEqual({ ok: false, failure });
  });

  it("止まった（end_turn）を見ないままストリームが終わったときは、文があっても失敗（incomplete）", async () => {
    expect(await collectTurn(events([running, message("途中の文")]))).toEqual({ ok: false, failure: "incomplete" });
    expect(await collectTurn(events([idle("end_turn"), message("途中の文")]))).toEqual({ ok: false, failure: "incomplete" });
  });

  it("終わった（terminated）セッションと、文が無いときは失敗", async () => {
    expect(await collectTurn(events([running, { type: "session.status_terminated" }]))).toEqual({ ok: false, failure: "terminated" });
    expect(await collectTurn(events([running, idle("end_turn")]))).toEqual({ ok: false, failure: "no_message" });
  });

  it("文でない部品・形の違う出来事は読まない（型を強制せずに確かめる）", async () => {
    const result = await collectTurn(
      events([
        running,
        { type: "agent.message", content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "了解" }, null, { type: "text", text: 3 }] },
        { type: "agent.message", content: "文字列" },
        { type: "agent.tool_use" },
        { type: "session.status_idle" },
        message("です。"),
        idle("end_turn"),
      ]),
    );
    expect(result).toEqual({ ok: true, text: "了解です。" });
  });
});

describe("失敗の種類（classify）", () => {
  const headers = new Headers();
  it.each([
    [new Anthropic.APIUserAbortError(), "timeout"],
    [new Anthropic.APIConnectionTimeoutError(), "timeout"],
    [new Anthropic.APIConnectionError({ message: "x" }), "connection"],
    [new Anthropic.RateLimitError(429, undefined, "x", headers), "rate_limited"],
    [new Anthropic.BadRequestError(400, undefined, "x", headers), "bad_request"],
    [new Anthropic.NotFoundError(404, undefined, "x", headers), "not_found"],
    [new Anthropic.InternalServerError(500, undefined, "x", headers), "api_error"],
    [new Error("x"), "unknown"],
    ["x", "unknown"],
  ] as const)("%s は %s", (error, failure) => {
    expect(classify(error)).toBe(failure);
  });
});

describe("ID の形", () => {
  it("Agent と Environment の ID の形だけを通す", () => {
    expect(AGENT_ID_PATTERN.test("agent_0123456789")).toBe(true);
    expect(AGENT_ID_PATTERN.test("agent_x")).toBe(false);
    expect(ENV_ID_PATTERN.test("env_0123456789")).toBe(true);
    expect(ENV_ID_PATTERN.test("env_../../x")).toBe(false);
  });
});

describe("1回分の送って読む処理（runSessionTurn）", () => {
  function fakeClient(stream: () => Promise<AsyncIterable<Event>>, send: () => Promise<unknown> = async () => ({})) {
    const order: string[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const client = {
      beta: {
        sessions: {
          events: {
            stream: async (_id: string, _p: unknown, o?: { signal?: AbortSignal }) => {
              order.push("stream");
              signals.push(o?.signal);
              return stream();
            },
            send: async (_id: string, _p: unknown, o?: { signal?: AbortSignal }) => {
              order.push("send");
              signals.push(o?.signal);
              return send();
            },
          },
        },
      },
    } as unknown as Anthropic;
    return { client, order, signals };
  }
  async function* ok() {
    yield { type: "session.status_running" };
    yield { type: "agent.message", content: [{ type: "text", text: "了解です。" }] };
    yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
  }

  it("SSE を先に開いてから送り、同じ signal を渡す", async () => {
    const { client, order, signals } = fakeClient(async () => ok());
    const abort = new AbortController();
    expect(await runSessionTurn(client, "sesn_x", "本文", abort.signal)).toEqual({ ok: true, text: "了解です。" });
    expect(order).toEqual(["stream", "send"]);
    expect(signals).toEqual([abort.signal, abort.signal]);
  });

  it("signal が止まった後の失敗は timeout、そうでなければ例外の種類", async () => {
    const abort = new AbortController();
    abort.abort();
    const timedOut = fakeClient(async () => Promise.reject(new Error("aborted")));
    expect(await runSessionTurn(timedOut.client, "sesn_x", "本文", abort.signal)).toEqual({ ok: false, failure: "timeout" });
    const missing = fakeClient(async () => ok(), async () => Promise.reject(new Anthropic.NotFoundError(404, undefined, "x", new Headers())));
    expect(await runSessionTurn(missing.client, "sesn_x", "本文", new AbortController().signal)).toEqual({ ok: false, failure: "not_found" });
  });
});

describe("後片付け", () => {
  function ops(statuses: string[], deleteFailsWhileRunning = true) {
    const calls: string[] = [];
    let current = "running";
    const o: SessionOps = {
      async delete() {
        calls.push(`delete:${current}`);
        if (deleteFailsWhileRunning && current === "running") throw new Error("running");
      },
      async interrupt() {
        calls.push("interrupt");
      },
      async status() {
        current = statuses.shift() ?? current;
        calls.push(`status:${current}`);
        return current;
      },
      sleep: async () => {},
    };
    return { o, calls };
  }
  const never = <T>() => new Promise<T>(() => {});

  it("動いているセッションは、中断を送り、止まってから削除する", async () => {
    const { o, calls } = ops(["running", "idle"]);
    expect(await cleanupSession(o, "sesn_x")).toBe("deleted");
    expect(calls).toEqual(["delete:running", "interrupt", "status:running", "status:idle", "delete:idle"]);
  });

  it("止まっていればすぐ削除する", async () => {
    const { o, calls } = ops([], false);
    expect(await cleanupSession(o, "sesn_x")).toBe("deleted");
    expect(calls).toEqual(["delete:running"]);
  });

  it("止まらなければ failed", async () => {
    const { o } = ops([]);
    expect(await cleanupSession(o, "sesn_x")).toBe("failed");
  });

  it("削除・状態の読み取りがずっと返らなくても、全体の上限の時間で failed を返す", async () => {
    vi.useFakeTimers();
    const o: SessionOps = { delete: never, interrupt: never, status: never, sleep: never };
    let state: string | null = null;
    void cleanupSession(o, "sesn_x").then((s) => (state = s));
    await vi.advanceTimersByTimeAsync(CLEANUP_DEADLINE_MS - 1);
    expect(state).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(state).toBe("failed");
  });

  it("上限は、waitUntil の猶予（応答の後 30 秒）より短い", () => {
    expect(CLEANUP_DEADLINE_MS).toBeLessThan(30_000);
  });

  it("上限を過ぎた後は、次の呼び出しをしない", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const o: SessionOps = {
      delete: async () => {
        calls.push("delete");
        throw new Error("running");
      },
      interrupt: async () => void calls.push("interrupt"),
      status: async () => (calls.push("status"), "running"),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms * 10)),
    };
    const done = cleanupSession(o, "sesn_x", 15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await done).toBe("failed");
    const count = calls.length;
    await vi.advanceTimersByTimeAsync(200_000);
    expect(calls).toHaveLength(count);
  });

  it("中断だけを送る：送れたら true、失敗したら false（削除はしない）", async () => {
    const { o, calls } = ops([]);
    expect(await interruptSession(o, "sesn_x")).toBe(true);
    expect(calls).toEqual(["interrupt"]);
    expect(await interruptSession({ ...o, interrupt: async () => Promise.reject(new Error("x")) }, "sesn_x")).toBe(false);
  });
});
