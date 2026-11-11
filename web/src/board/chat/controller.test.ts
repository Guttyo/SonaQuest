// ボードの掲示板チャット（B-07、ADR-0047）の進め方の試験。Workers は呼ばず、偽物の fetch を使う（docs/safety-test-plan.md H11）。

import { describe, expect, it } from "vitest";
import { initialDemo } from "../demo";
import { parseChatTurnRequest, type ChatTurnRequest } from "./contract";
import { ChatController, MAX_AGENT_TURNS, MAX_AUTO_TURNS, OPENING_JOBS, type ChatFetch } from "./controller";
import { chatStatus } from "./status";

const STATUS = chatStatus(initialDemo());

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** 偽の Workers。turn の応答は handler で替える */
function fakeFetch(turn: (req: ChatTurnRequest, n: number) => Response = () => json({ text: "毛布を受け取ります。", rejected: null })) {
  const calls: Call[] = [];
  let sessions = 0;
  let turns = 0;
  const fetchFn: ChatFetch = async (url, init) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (url === "/api/board/chat/session") {
      sessions += 1;
      return json({ sessionId: `sesn_fake000000${sessions}` });
    }
    turns += 1;
    return turn(body as unknown as ChatTurnRequest, turns);
  };
  return { calls, fetchFn };
}

function controller(fetchFn: ChatFetch) {
  const c = new ChatController(fetchFn);
  c.setStatusSource(() => STATUS);
  return c;
}

describe("掲示板チャットの進め方", () => {
  it("開いたときは固定の掲示だけを並べ、Workers を呼ばない", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    await c.idle();
    const snap = c.getSnapshot();
    expect(snap.phase).toBe("intro");
    expect(snap.posts).toHaveLength(OPENING_JOBS.length);
    expect(snap.posts.every((p) => p.by === "fixed")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("始めない間は、人の書き込みは画面にだけ出て、送らない。自動でも進まない", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    expect(c.sendHuman("B", "夕方の便で毛布を届けます")).toBe(true);
    c.autoTick();
    await c.idle();
    expect(calls).toHaveLength(0);
    expect(c.getSnapshot().posts.at(-1)).toMatchObject({ by: "human", role: "HQ", channel: "B" });
  });

  it("始めると、役ごとにセッションを1つ作り、救護所A〜Dの報告と本部の共通の連絡を順に頼む", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    const sessions = calls.filter((x) => x.url === "/api/board/chat/session").map((x) => x.body.role);
    expect(sessions).toEqual(["A", "B", "C", "D", "HQ"]);
    const turns = calls.filter((x) => x.url === "/api/board/chat/turn").map((x) => [x.body.role, x.body.channel]);
    expect(turns).toEqual(OPENING_JOBS.map((j) => [j.role, j.channel]));
    const snap = c.getSnapshot();
    expect(snap.phase).toBe("live");
    expect(snap.posts.filter((p) => p.by === "agent")).toHaveLength(OPENING_JOBS.length);
    expect(snap.waitingFor).toBeNull();
  });

  it("送るのは役・セッション・欄・件数と時刻・その欄の書き込みだけ", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    const turn = calls.find((x) => x.url === "/api/board/chat/turn")!;
    expect(Object.keys(turn.body).sort()).toEqual(["channel", "posts", "role", "sessionId", "status"]);
    expect(turn.body.status).toEqual(STATUS);
    const posts = turn.body.posts as { role: string }[];
    expect(posts.every((p) => p.role === "HQ" || p.role === turn.body.role)).toBe(true);
  });

  it("2回目からは同じ役のセッションを使い回す（人の書き込みへの返事）", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    c.sendHuman("C", "救護所Cへ。薬剤師1名を午後に回します");
    await c.idle();
    expect(calls.filter((x) => x.url === "/api/board/chat/session")).toHaveLength(5);
    const last = calls.at(-1)!;
    expect(last.body).toMatchObject({ role: "C", channel: "C" });
    expect((last.body.posts as { by: string; text: string }[]).at(-1)).toMatchObject({ by: "human", text: "救護所Cへ。薬剤師1名を午後に回します" });
  });

  it("検査で捨てた文（text が null）は、その1件を固定の掲示に替えて続ける", async () => {
    const { fetchFn } = fakeFetch((_req, n) => (n === 2 ? json({ text: null, rejected: "forbidden" }) : json({ text: "了解です。", rejected: null })));
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    const snap = c.getSnapshot();
    expect(snap.phase).toBe("live");
    const added = snap.posts.slice(OPENING_JOBS.length);
    expect(added.map((p) => p.by)).toEqual(["agent", "fixed", "agent", "agent", "agent"]);
  });

  it.each([
    ["budget_reached", 409],
    ["rate_limited", 429],
    ["not_configured", 503],
    ["timeout", 504],
  ])("失敗（%s）のときは固定の掲示に切り替え、もう呼ばない", async (code, status) => {
    const { calls, fetchFn } = fakeFetch(() => json({ error: code }, status));
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    const snap = c.getSnapshot();
    expect(snap.phase).toBe("fallback");
    expect(snap.reason).toBe(code);
    expect(snap.posts.at(-1)?.by).toBe("fixed");
    const before = calls.length;
    c.sendHuman("A", "まだ届いていますか");
    c.autoTick();
    await c.idle();
    expect(calls).toHaveLength(before);
  });

  it("通信に失敗したときも固定の掲示に切り替える", async () => {
    const fetchFn: ChatFetch = async () => {
      throw new Error("offline");
    };
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    expect(c.getSnapshot()).toMatchObject({ phase: "fallback", reason: "network" });
  });

  it("思いがけない失敗（応答の読み取りで例外）でも、固定の掲示に切り替えて待ちを残さない", async () => {
    const fetchFn: ChatFetch = async (url) => {
      if (url === "/api/board/chat/session") return json({ sessionId: "sesn_fake0000001" });
      return { ok: true, json: async () => ({ get text() { throw new Error("broken"); } }) } as unknown as Response;
    };
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    expect(c.getSnapshot()).toMatchObject({ phase: "fallback", reason: "unavailable", waitingFor: null });
  });

  it("自動で進むのは上限の回数まで", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    for (let i = 0; i < MAX_AUTO_TURNS + 5; i++) {
      c.autoTick();
      await c.idle();
    }
    const turns = calls.filter((x) => x.url === "/api/board/chat/turn");
    expect(turns).toHaveLength(OPENING_JOBS.length + MAX_AUTO_TURNS);
  });

  it("1ページで頼む文の数が上限に達したら止める", async () => {
    const { calls, fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    for (let i = 0; i < MAX_AGENT_TURNS + 5; i++) {
      c.sendHuman("common", `次の報告は${i}時です`);
      await c.idle();
    }
    expect(calls.filter((x) => x.url === "/api/board/chat/turn")).toHaveLength(MAX_AGENT_TURNS);
    expect(c.getSnapshot().phase).toBe("finished");
  });

  it("空の文と長すぎる文は書き込まない", () => {
    const { fetchFn } = fakeFetch();
    const c = controller(fetchFn);
    c.seed();
    expect(c.sendHuman("A", "   ")).toBe(false);
    expect(c.sendHuman("A", "あ".repeat(201))).toBe(false);
    expect(c.sendHuman("A", "\t\u0001\t")).toBe(false);
    expect(c.getSnapshot().posts).toHaveLength(OPENING_JOBS.length);
  });

  it("人の書き込みのタブなどの制御文字は空白に置き換えて書き込み、次の turn も Workers の形の検査を通って live のまま続く（Issue #293）", async () => {
    // 偽の Workers も、本物と同じ形の検査（parseChatTurnRequest）を当て、通らなければ 400 を返す
    const { calls, fetchFn } = fakeFetch((req) =>
      parseChatTurnRequest(req) === null ? json({ error: "bad_request" }, 400) : json({ text: "毛布を受け取ります。", rejected: null }),
    );
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    expect(c.sendHuman("B", "毛布\t20枚\r\n夕方の便で届けます")).toBe(true);
    expect(c.getSnapshot().posts.filter((p) => p.by === "human").at(-1)?.text).toBe("毛布 20枚 \n夕方の便で届けます");
    await c.idle();
    c.sendHuman("B", "受け取りの連絡をお願いします");
    await c.idle();
    const turns = calls.filter((x) => x.url === "/api/board/chat/turn");
    for (const t of turns) {
      for (const p of t.body.posts as { text: string }[]) expect(p.text).not.toMatch(/[\u0000-\u0009\u000B-\u001F\u007F]/);
    }
    expect(c.getSnapshot().phase).toBe("live");
    expect(c.getSnapshot().posts.filter((p) => p.by === "fixed")).toHaveLength(OPENING_JOBS.length);
  });

  it("エージェントの文に制御文字が混じっていても、次の turn では空白に置き換えて送る（Issue #293）", async () => {
    const { calls, fetchFn } = fakeFetch((req, n) =>
      parseChatTurnRequest(req) === null
        ? json({ error: "bad_request" }, 400)
        : json({ text: n === 2 ? "毛布を\t受け取ります。" : "了解です。", rejected: null }),
    );
    const c = controller(fetchFn);
    c.seed();
    c.start();
    await c.idle();
    c.sendHuman("B", "次の便の時刻を知らせます");
    await c.idle();
    expect(c.getSnapshot().phase).toBe("live");
    const last = calls.filter((x) => x.url === "/api/board/chat/turn").at(-1)!;
    expect((last.body.posts as { by: string; text: string }[]).some((p) => p.by === "agent" && p.text === "毛布を 受け取ります。")).toBe(true);
  });
});

describe("エージェントに渡す状況（件数と時刻だけ）", () => {
  it("薬の品目名・氏名を含まない", () => {
    const text = JSON.stringify(STATUS);
    const state = initialDemo();
    for (const row of state.stock) expect(text).not.toContain(row.item);
    expect(STATUS.sites.map((s) => s.site)).toEqual(["A", "B", "C", "D"]);
    expect(STATUS.clock).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
