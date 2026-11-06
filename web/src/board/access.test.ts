import { describe, expect, it } from "vitest";
import { ACCESS_LOG_MAX, appendAccess, authorizeWrite, canEdit, localAllowed, makeSession, siteCode, staffFor, type FetchLike } from "./access";
import { parseAuthorizeRequest, writeAllowed } from "./authorizeContract";
import { FICTIONAL_NAMES } from "./demo";
import { HQ, SHELTERS } from "./data";

const json = (status: number, body: unknown, type = "application/json"): ReturnType<FetchLike> =>
  Promise.resolve({ status, headers: { get: (n: string) => (n === "content-type" ? type : null) }, json: () => Promise.resolve(body) });

describe("デモ用ログイン（Issue #141）", () => {
  it("救護所A〜Dと、その救護所の架空の担当者だけで入れる。本部では入れない", () => {
    for (const s of SHELTERS) expect(staffFor(s).length).toBeGreaterThan(0);
    expect(makeSession("救護所A", staffFor("救護所A")[0])).toEqual({ site: "救護所A", staff: staffFor("救護所A")[0] });
    expect(makeSession("救護所A", staffFor("救護所B")[0])).toBeNull();
    expect(makeSession(HQ, "見本 青葉")).toBeNull();
  });

  it("担当者の架空の名前は、患者の架空の氏名と重ならない", () => {
    for (const s of SHELTERS) for (const n of staffFor(s)) expect(FICTIONAL_NAMES).not.toContain(n);
  });

  it("編集できるのは自分の救護所だけ。ほかの救護所と本部は閲覧のみ", () => {
    const a = makeSession("救護所A", staffFor("救護所A")[0]);
    expect(canEdit(a, "救護所A")).toBe(true);
    expect(canEdit(a, "救護所B")).toBe(false);
    expect(canEdit(a, HQ)).toBe(false);
    expect(canEdit(null, "救護所A")).toBe(false);
    expect(localAllowed(a!, "救護所A")).toBe(true);
    expect(localAllowed(a!, "救護所B")).toBe(false);
  });

  it("アクセス記録は新しいものが先で、上限を超えた古い行は消える", () => {
    let log = appendAccess([], { at: 0, site: "救護所A", staff: "見本 青葉", kind: "login", target: "" });
    log = appendAccess(log, { at: 5, site: "救護所A", staff: "見本 青葉", kind: "chart_open", target: "A-D01" });
    expect(log.map((l) => l.kind)).toEqual(["chart_open", "login"]);
    for (let i = 0; i < ACCESS_LOG_MAX + 5; i += 1) log = appendAccess(log, { at: i, site: "救護所A", staff: "x", kind: "logout", target: "" });
    expect(log.length).toBe(ACCESS_LOG_MAX);
  });

  it("アクセス記録の行は時刻・救護所・担当者・出来事・対象だけを持つ", () => {
    const [row] = appendAccess([], { at: 0, site: "救護所A", staff: "見本 青葉", kind: "login", target: "" });
    expect(Object.keys(row).sort()).toEqual(["at", "kind", "site", "staff", "target"]);
  });
});

describe("Worker への権限の確認（Issue #141）", () => {
  const a = { site: "救護所A" as const, staff: "見本 青葉" };

  it("送るのは3つの値だけ（担当者名・カルテの番号を送らない）", async () => {
    let sent: unknown = null;
    const f: FetchLike = (url, init) => {
      expect(url).toBe("/api/board/authorize");
      sent = JSON.parse(init.body);
      return json(200, { allowed: true });
    };
    await authorizeWrite(a, "救護所B", "chart_add", f);
    expect(sent).toEqual({ actor_site: "A", target_site: "B", kind: "chart_add" });
    expect(JSON.stringify(sent)).not.toContain("見本");
  });

  it("200 で許可、403 で拒否（Worker の判定）", async () => {
    expect(await authorizeWrite(a, "救護所A", "chart_confirm", () => json(200, { allowed: true }))).toEqual({ allowed: true, via: "worker" });
    expect(await authorizeWrite(a, "救護所B", "chart_add", () => json(403, { allowed: false }))).toEqual({ allowed: false, via: "worker" });
  });

  it("Worker が使えないとき（通信の失敗・JSON でない応答・5xx）は画面側の判定にする", async () => {
    const fail: FetchLike = () => Promise.reject(new Error("offline"));
    expect(await authorizeWrite(a, "救護所A", "chart_add", fail)).toEqual({ allowed: true, via: "local" });
    expect(await authorizeWrite(a, "救護所B", "chart_add", fail)).toEqual({ allowed: false, via: "local" });
    const html: FetchLike = () => json(200, null, "text/html");
    expect(await authorizeWrite(a, "救護所B", "chart_add", html)).toEqual({ allowed: false, via: "local" });
    expect(await authorizeWrite(a, "救護所A", "chart_add", () => json(502, { error: "x" }))).toEqual({ allowed: true, via: "local" });
    expect(await authorizeWrite(a, "救護所A", "chart_add", undefined)).toEqual({ allowed: true, via: "local" });
  });

  it("救護所の記号は A〜D だけ（本部備蓄は送らない）", () => {
    expect(siteCode("救護所C")).toBe("C");
    expect(siteCode(HQ)).toBeNull();
  });

  it("受け口の形の確認：3つのキーだけ、一覧にある値だけを受ける", () => {
    expect(parseAuthorizeRequest({ actor_site: "A", target_site: "B", kind: "chart_add" })).not.toBeNull();
    expect(parseAuthorizeRequest({ actor_site: "A", target_site: "B", kind: "chart_add", staff: "x" })).toBeNull();
    expect(parseAuthorizeRequest({ actor_site: "E", target_site: "B", kind: "chart_add" })).toBeNull();
    expect(parseAuthorizeRequest({ actor_site: "A", target_site: "B", kind: "delete" })).toBeNull();
    expect(parseAuthorizeRequest([])).toBeNull();
    expect(writeAllowed({ actor_site: "A", target_site: "A", kind: "chart_add" })).toBe(true);
    expect(writeAllowed({ actor_site: "A", target_site: "B", kind: "chart_add" })).toBe(false);
  });
});
