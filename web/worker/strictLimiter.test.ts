// 回数を1か所で数える Durable Object（ADR-0065、safety-test-plan P7）の単体試験。本物の Durable Object は使わず、偽の名前空間を渡す。

import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./ratelimit";
import { attachLimiter, durableLimiter, RateCounter, STRICT_LIMIT, STRICT_PERIOD_MS, takeSlot, type CounterNamespace } from "./strictLimiter";
import worker from "./index";

/** 名前ごとに1つの RateCounter を持つ偽の名前空間（どの拠点からでも同じ名前なら同じオブジェクトに届く、を写す） */
function fakeNamespace(now: () => number) {
  const objects = new Map<string, RateCounter>();
  const names: string[] = [];
  const ns: CounterNamespace = {
    idFromName: (name) => {
      names.push(name);
      return name;
    },
    get: (id) => {
      const name = id as string;
      if (!objects.has(name)) objects.set(name, new RateCounter({}, {}, now));
      return { fetch: (request) => objects.get(name)!.fetch(request) };
    },
  };
  return { ns, objects, names };
}

const req = (ip: string) => new Request("https://sonaquest.example/api/turn", { method: "POST", headers: { "cf-connecting-ip": ip } });

describe("takeSlot", () => {
  it("上限まで通し、上限を超えたら通さない", () => {
    const times: number[] = [];
    const results = Array.from({ length: STRICT_LIMIT + 2 }, () => takeSlot(times, 1_000, STRICT_LIMIT, STRICT_PERIOD_MS));
    expect(results.filter(Boolean)).toHaveLength(STRICT_LIMIT);
    expect(results[STRICT_LIMIT]).toBe(false);
  });

  it("期間を過ぎた分は数えなくなる（すべり窓）", () => {
    const times: number[] = [];
    for (let i = 0; i < STRICT_LIMIT; i++) takeSlot(times, i * 1_000, STRICT_LIMIT, STRICT_PERIOD_MS);
    expect(takeSlot(times, 59_000, STRICT_LIMIT, STRICT_PERIOD_MS)).toBe(false);
    // 最初の1回（0 ms）が窓の外に出たので、1回分だけ空く
    expect(takeSlot(times, 60_000, STRICT_LIMIT, STRICT_PERIOD_MS)).toBe(true);
    expect(takeSlot(times, 60_000, STRICT_LIMIT, STRICT_PERIOD_MS)).toBe(false);
  });

  it("通さなかった回は数えない（拒否が続いても、窓が過ぎれば通る）", () => {
    const times: number[] = [];
    for (let i = 0; i < STRICT_LIMIT + 5; i++) takeSlot(times, 0, STRICT_LIMIT, STRICT_PERIOD_MS);
    expect(times).toHaveLength(STRICT_LIMIT);
    expect(takeSlot(times, STRICT_PERIOD_MS + 1, STRICT_LIMIT, STRICT_PERIOD_MS)).toBe(true);
  });
});

describe("durableLimiter", () => {
  it("同じキーは1つのオブジェクトで数え、11回目から limited（別々の接続から来ても同じ）", async () => {
    const { ns } = fakeNamespace(() => 5_000);
    const limiter = durableLimiter(ns);
    const results: string[] = [];
    for (let i = 0; i < 12; i++) results.push(await checkRateLimit(req("198.51.100.7"), { enforce: true, limiter, prefix: "turn" }));
    expect(results.slice(0, 10).every((r) => r === "allowed")).toBe(true);
    expect(results.slice(10)).toEqual(["limited", "limited"]);
  });

  it("接続元と接頭辞が違えば、別のオブジェクトで数える", async () => {
    const { ns, objects } = fakeNamespace(() => 5_000);
    const limiter = durableLimiter(ns);
    for (let i = 0; i < 10; i++) await checkRateLimit(req("198.51.100.7"), { enforce: true, limiter, prefix: "turn" });
    expect(await checkRateLimit(req("198.51.100.8"), { enforce: true, limiter, prefix: "turn" })).toBe("allowed");
    expect(await checkRateLimit(req("198.51.100.7"), { enforce: true, limiter, prefix: "tts" })).toBe("allowed");
    expect([...objects.keys()].sort()).toEqual(["tts:198.51.100.7", "turn:198.51.100.7", "turn:198.51.100.8"]);
  });

  it("オブジェクトの応答が壊れていれば error（呼び出し口を閉じる）", async () => {
    const broken = (response: Response): CounterNamespace => ({ idFromName: (n) => n, get: () => ({ fetch: async () => response }) });
    const call = (ns: CounterNamespace) => checkRateLimit(req("198.51.100.7"), { enforce: true, limiter: durableLimiter(ns), prefix: "turn" });
    expect(await call(broken(new Response("x", { status: 500 })))).toBe("error");
    expect(await call(broken(new Response(JSON.stringify({ ok: true }))))).toBe("error");
    const throwing: CounterNamespace = { idFromName: (n) => n, get: () => ({ fetch: async () => { throw new Error("down"); } }) };
    expect(await call(throwing)).toBe("error");
  });

  it("オブジェクトに送るのは数を取る合図だけで、IP も本文も送らない", async () => {
    const seen: Request[] = [];
    const ns: CounterNamespace = {
      idFromName: (n) => n,
      get: () => ({ fetch: async (r) => { seen.push(r); return new Response(JSON.stringify({ success: true })); } }),
    };
    await checkRateLimit(req("198.51.100.7"), { enforce: true, limiter: durableLimiter(ns), prefix: "turn" });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).not.toContain("198.51.100.7");
    expect(await seen[0].text()).toBe("");
    expect([...seen[0].headers.keys()]).toEqual([]);
  });
});

describe("入口で渡す回数制限（attachLimiter）", () => {
  it("RATE_COUNTER があれば、呼び出し口に TURN_LIMITER として Durable Object の数え方を渡す", async () => {
    const { ns, names } = fakeNamespace(() => 5_000);
    const env = attachLimiter<{ PUBLIC_TURN: string; RATE_COUNTER?: CounterNamespace }>({ PUBLIC_TURN: "1", RATE_COUNTER: ns });
    expect(env.TURN_LIMITER).toBeDefined();
    expect(await env.TURN_LIMITER!.limit({ key: "turn:198.51.100.7" })).toEqual({ success: true });
    expect(names).toEqual(["turn:198.51.100.7"]);
  });

  it("RATE_COUNTER が無ければ TURN_LIMITER を渡さない（PUBLIC_TURN=1 のときは呼び出し口が閉じる）", () => {
    const env = attachLimiter<{ PUBLIC_TURN: string; RATE_COUNTER?: CounterNamespace }>({ PUBLIC_TURN: "1" });
    expect(env.TURN_LIMITER).toBeUndefined();
  });

  it("入口は default の fetch を出す", () => {
    expect(typeof worker.fetch).toBe("function");
  });
});
