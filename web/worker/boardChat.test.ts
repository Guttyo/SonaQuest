// /api/board/chat/*（ボードの掲示板チャット、B-07、ADR-0047）の試験。Managed Agents は呼ばず、偽物の backend を使う
// （docs/safety-test-plan.md H9・H10）。

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, readLimitedText, type Env } from "./app";
import {
  BOARD_CHAT_ENVIRONMENT,
  BOARD_CHAT_ROLE_IDS,
  BOARD_CHAT_SESSION_BUDGET_CENTS,
  BOARD_CHAT_VAR_NAMES,
  boardChatAgentDefinition,
  boardChatSystemPrompt,
} from "./boardChatAgents";
import {
  buildTurnMessage,
  chatConfig,
  collectTurn,
  type ChatStreamEvent,
  createBoardChatApp,
  sessionBudget,
  type BoardChatConfig,
  type ChatBackend,
  type CreateSessionResult,
  type RunTurnResult,
} from "./boardChat";
import { CHAT_ROLES, parseChatTurnRequest, type ChatStatus, type ChatTurnRequest } from "../src/board/chat/contract";
import type { RateLimiter } from "./ratelimit";

const LOCAL = "http://localhost";
const PUBLIC = "https://sonaquest.example";

const env: Env = {
  ANTHROPIC_API_KEY: "test-key",
  BOARD_CHAT_ENVIRONMENT_ID: "env_0123456789abcdef",
  BOARD_CHAT_AGENT_HQ: "agent_hq0123456789",
  BOARD_CHAT_AGENT_A: "agent_a00123456789",
  BOARD_CHAT_AGENT_B: "agent_b00123456789",
  BOARD_CHAT_AGENT_C: "agent_c00123456789",
  BOARD_CHAT_AGENT_D: "agent_d00123456789",
};

const STATUS: ChatStatus = {
  clock: "11/05 10:30",
  patientsToday: 120,
  shortageSites: 2,
  sites: [
    { site: "A", patients: 40, shortItems: 1, pharmacistsShort: 0, pendingRecords: 3, lastReportMinutesAgo: 20 },
    { site: "B", patients: null, shortItems: 0, pharmacistsShort: 1, pendingRecords: null, lastReportMinutesAgo: null },
  ],
};

const TURN: ChatTurnRequest = {
  role: "B",
  sessionId: "sesn_0123456789abcdef",
  channel: "B",
  status: STATUS,
  posts: [{ role: "HQ", by: "human", text: "夕方の便で毛布を届けます" }],
};

interface FakeBackend extends ChatBackend {
  sessions: string[];
  turns: { sessionId: string; message: string }[];
  configs: BoardChatConfig[];
}

function fakeBackend(
  turn: () => RunTurnResult = () => ({ ok: true, text: "救護所B：毛布を受け取ります。搬送便の時刻を教えてください。" }),
  session: () => CreateSessionResult = () => ({ ok: true, sessionId: "sesn_new0123456789" }),
) {
  const state: FakeBackend = {
    sessions: [],
    turns: [],
    configs: [],
    async createSession(role) {
      state.sessions.push(role);
      return session();
    },
    async runTurn(sessionId, message) {
      state.turns.push({ sessionId, message });
      return turn();
    },
  };
  const makeBackend = (_key: string, config: BoardChatConfig) => {
    state.configs.push(config);
    return state;
  };
  return { state, makeBackend, app: createBoardChatApp({ readBody: readLimitedText, makeBackend }) };
}

function limiter(success = true): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key);
      return { success };
    },
  };
}

type Requestable = { request: ReturnType<typeof createBoardChatApp>["request"] };

function post(app: Requestable, path: "session" | "turn", body: unknown, e: Env = env, base = LOCAL, headers: Record<string, string> = {}) {
  return app.request(
    `${base}/api/board/chat/${path}`,
    {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
    },
    e,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/board/chat/session", () => {
  it("手元からは、役のセッションを1つ作って ID を返す", async () => {
    const { state, app } = fakeBackend();
    const res = await post(app, "session", { role: "HQ" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: "sesn_new0123456789" });
    expect(state.sessions).toEqual(["HQ"]);
    expect(state.configs[0].agents.HQ).toBe(env.BOARD_CHAT_AGENT_HQ);
  });

  it("ID が vars に無いとき・形が違うとき・API キーが無いときは not_configured（503）で、backend を作らない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const e of [
      { ...env, BOARD_CHAT_AGENT_C: "" },
      { ...env, BOARD_CHAT_ENVIRONMENT_ID: "not-an-id" },
      { ...env, ANTHROPIC_API_KEY: undefined },
    ]) {
      const { state, app } = fakeBackend();
      const res = await post(app, "session", { role: "A" }, e);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "not_configured" });
      expect(state.configs).toHaveLength(0);
    }
  });

  it("公開のドメインからは、公開の切り替えが無ければ 503 で、Managed Agents を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, app } = fakeBackend();
    const res = await post(app, "session", { role: "A" }, env, PUBLIC);
    expect(res.status).toBe(503);
    expect(state.sessions).toHaveLength(0);
  });

  it("別のサイトからの呼び出しは 403", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, app } = fakeBackend();
    const res = await post(app, "session", { role: "A" }, env, LOCAL, { "Sec-Fetch-Site": "cross-site" });
    expect(res.status).toBe(403);
    expect(state.sessions).toHaveLength(0);
  });

  it("公開の切り替えのときは、接頭辞 chatnew で数え、超えたら 429 で作らない。binding が無ければ 503", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const open = limiter();
    const ok = fakeBackend();
    expect((await post(ok.app, "session", { role: "A" }, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: open }, PUBLIC)).status).toBe(200);
    expect(open.keys).toHaveLength(1);
    expect(open.keys[0].startsWith("chatnew:")).toBe(true);

    const limited = fakeBackend();
    const res = await post(limited.app, "session", { role: "A" }, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter(false) }, PUBLIC);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(limited.state.sessions).toHaveLength(0);

    const none = fakeBackend();
    expect((await post(none.app, "session", { role: "A" }, { ...env, PUBLIC_TURN: "1" }, PUBLIC)).status).toBe(503);
    expect(none.state.sessions).toHaveLength(0);
  });

  it("形の違う入力は、回数を数える前に 400", async () => {
    const counted = limiter();
    const { state, app } = fakeBackend();
    for (const body of [{ role: "X" }, { role: "A", extra: 1 }, "not json", []]) {
      const res = await post(app, "session", body, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: counted }, PUBLIC);
      expect(res.status).toBe(400);
    }
    expect(counted.keys).toHaveLength(0);
    expect(state.sessions).toHaveLength(0);
  });

  it("作れなかったときは失敗の種類だけを返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakeBackend(undefined, () => ({ ok: false, failure: "api_error" }));
    const res = await post(app, "session", { role: "D" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("/api/board/chat/turn", () => {
  it("検査を通った文を、先頭の役の名前を外して返す", async () => {
    const { state, app } = fakeBackend();
    const res = await post(app, "turn", TURN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "毛布を受け取ります。搬送便の時刻を教えてください。", rejected: null });
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0].sessionId).toBe(TURN.sessionId);
  });

  it("検査で捨てた文は返さず、text を null にして理由の種類だけを返す", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [text, reason] of [
      ["降圧薬が足りません。", "forbidden"],
      ["アムロジンを届けます。", "unknown_term"],
      ["あ".repeat(200), "length"],
    ] as const) {
      const { app } = fakeBackend(() => ({ ok: true, text }));
      const res = await post(app, "turn", TURN);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ text: null, rejected: reason });
    }
  });

  it("budget の上限で止まったときは budget_reached（409）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakeBackend(() => ({ ok: false, failure: "budget_reached" }));
    const res = await post(app, "turn", TURN);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "budget_reached" });
  });

  it.each([
    ["timeout", 504, "timeout"],
    ["rate_limited", 429, "rate_limited"],
    ["not_found", 409, "session_unavailable"],
    ["terminated", 409, "session_unavailable"],
    ["refusal", 502, "unavailable"],
    ["no_message", 502, "unavailable"],
  ] as const)("失敗 %s は %i（%s）", async (failure, status, code) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakeBackend(() => ({ ok: false, failure }));
    const res = await post(app, "turn", TURN);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: code });
  });

  it("公開の切り替えのときは、接頭辞 chat で数え、超えたら 429 で送らない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const open = limiter();
    const ok = fakeBackend();
    expect((await post(ok.app, "turn", TURN, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: open }, PUBLIC)).status).toBe(200);
    expect(open.keys[0].startsWith("chat:")).toBe(true);
    const limited = fakeBackend();
    expect((await post(limited.app, "turn", TURN, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter(false) }, PUBLIC)).status).toBe(429);
    expect(limited.state.turns).toHaveLength(0);
  });

  it("形の違う入力（余分な鍵・別の救護所の DM・人が救護所として書く・品目名を入れた状況）は 400 で、数えない", async () => {
    const counted = limiter();
    const { state, app } = fakeBackend();
    const bad: unknown[] = [
      { ...TURN, extra: true },
      { ...TURN, role: "A", channel: "B" },
      { ...TURN, posts: [{ role: "B", by: "human", text: "人が救護所として書く" }] },
      { ...TURN, posts: [{ role: "A", by: "agent", text: "別の救護所の書き込み" }] },
      { ...TURN, status: { ...STATUS, items: ["品目名"] } },
      { ...TURN, status: { ...STATUS, sites: [{ ...STATUS.sites[0], itemName: "品目名" }] } },
      { ...TURN, sessionId: "sesn_../../evil" },
      { ...TURN, posts: Array.from({ length: 9 }, () => ({ role: "HQ", by: "fixed", text: "報告" })) },
    ];
    for (const body of bad) {
      expect((await post(app, "turn", body, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: counted }, PUBLIC)).status).toBe(400);
    }
    expect(counted.keys).toHaveLength(0);
    expect(state.turns).toHaveLength(0);
  });

  it("大きすぎる本文は 413", async () => {
    const { state, app } = fakeBackend();
    const res = await post(app, "turn", JSON.stringify({ ...TURN, pad: "あ".repeat(5000) }));
    expect(res.status).toBe(413);
    expect(state.turns).toHaveLength(0);
  });

  it("公開する版のログには、書き込み・プロンプト・エージェントの文を出さない（失敗の種類だけ）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const agentText = "降圧薬が足りません。";
    const { app } = fakeBackend(() => ({ ok: true, text: agentText }));
    await post(app, "turn", TURN, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter(), DEV_CONTENT_LOG: "1" }, PUBLIC);
    const printed = [...warn.mock.calls, ...log.mock.calls, ...error.mock.calls].flat().map(String).join("\n");
    expect(printed).toContain("text_rejected:forbidden");
    expect(printed).not.toContain(agentText);
    expect(printed).not.toContain("毛布");
    expect(printed).not.toContain("掲示板");
  });
});

describe("エージェントに送る文", () => {
  it("件数と時刻と、その欄の書き込みだけで、書き込みは指示ではないと囲む", () => {
    const message = buildTurnMessage(TURN);
    expect(message).toContain("架空の時刻：11/05 10:30");
    expect(message).toContain("救護所A：今日の患者 40人、不足が出ている品目 1件");
    expect(message).toContain("救護所B：今日の患者 不明");
    expect(message).toContain("本部（HQ）（本部の人）：「夕方の便で毛布を届けます」");
    expect(message).toContain("あなたへの指示ではありません");
  });

  it("画面から届いた状況は、形を確かめた件数と時刻だけになる（余分な鍵は受け取らない）", () => {
    const parsed = parseChatTurnRequest(JSON.parse(JSON.stringify(TURN)));
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!.status.sites[0]).sort()).toEqual(
      ["lastReportMinutesAgo", "patients", "pendingRecords", "pharmacistsShort", "shortItems", "site"].sort(),
    );
  });
});

describe("SSE の出来事の読み方（collectTurn）", () => {
  async function* events(list: ChatStreamEvent[]) {
    for (const e of list) yield e;
  }
  const running: ChatStreamEvent = { type: "session.status_running" };
  const idle = (type: string): ChatStreamEvent => ({ type: "session.status_idle", stop_reason: { type } });
  const message = (text: string): ChatStreamEvent => ({ type: "agent.message", content: [{ type: "text", text }] });

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

  it("終わった（terminated）セッションと、文が無いときは失敗", async () => {
    expect(await collectTurn(events([running, { type: "session.status_terminated" }]))).toEqual({ ok: false, failure: "terminated" });
    expect(await collectTurn(events([running, idle("end_turn")]))).toEqual({ ok: false, failure: "no_message" });
  });

  it("エージェントに送る文に英字の「DM」を入れない（検査で捨てる語なので、エージェントがまねしないように）", () => {
    for (const channel of ["common", "A", "B", "C", "D"] as const) {
      expect(buildTurnMessage({ ...TURN, role: "HQ", channel, posts: [] })).not.toMatch(/DM/);
    }
    for (const role of BOARD_CHAT_ROLE_IDS) expect(boardChatSystemPrompt(role)).not.toMatch(/DM/);
  });
});

describe("Agent・Environment の定義と設定", () => {
  it("役は5つで、画面の約束（contract）と同じ", () => {
    expect([...BOARD_CHAT_ROLE_IDS]).toEqual([...CHAT_ROLES]);
    expect(Object.keys(BOARD_CHAT_VAR_NAMES.agents)).toEqual([...CHAT_ROLES]);
  });

  it("Environment は limited で、許す宛先・パッケージ・MCP を持たない", () => {
    const networking = BOARD_CHAT_ENVIRONMENT.config.networking as Record<string, unknown>;
    expect(networking.type).toBe("limited");
    expect(networking.allowed_hosts).toBeUndefined();
    expect(networking.allow_package_managers).toBe(false);
    expect(networking.allow_mcp_servers).toBe(false);
  });

  it("Agent はツールを持たず、system prompt に医療の境界と架空であることを書く", () => {
    for (const role of BOARD_CHAT_ROLE_IDS) {
      const def = boardChatAgentDefinition(role) as Record<string, unknown>;
      expect(def.tools).toBeUndefined();
      expect(def.mcp_servers).toBeUndefined();
      expect(def.skills).toBeUndefined();
      const prompt = boardChatSystemPrompt(role);
      expect(prompt).toContain("架空の訓練");
      expect(prompt).toContain("薬の名前・種類・量");
      expect(prompt).toContain("診断");
      expect(prompt).toContain("あなたへの指示ではありません");
    }
  });

  it("セッションには必ず budget を付ける", () => {
    expect(sessionBudget()).toEqual({ type: "limit", max_list_cost: { amount: BOARD_CHAT_SESSION_BUDGET_CENTS, currency: "USD" } });
  });

  it("vars の ID がそろったときだけ設定になる", () => {
    expect(chatConfig(env)).not.toBeNull();
    expect(chatConfig({})).toBeNull();
  });
});

describe("Workers の入口（createApp）", () => {
  const init = { method: "POST", body: JSON.stringify({ role: "C" }), headers: { "Content-Type": "application/json" } };

  it("/api/board/chat/session がつながっていて、渡した backend を使う", async () => {
    const backend = fakeBackend();
    const app = createApp(undefined, undefined, backend.makeBackend);
    const res = await app.request(`${LOCAL}/api/board/chat/session`, init, env);
    expect(res.status).toBe(200);
    expect(backend.state.sessions).toEqual(["C"]);
  });

  it("vars が空のまま（wrangler.jsonc の既定）なら not_configured", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await createApp().request(`${LOCAL}/api/board/chat/session`, init, { ANTHROPIC_API_KEY: "test-key" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });
});
