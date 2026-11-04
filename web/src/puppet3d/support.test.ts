import { afterEach, describe, expect, it } from "vitest";
import {
  REDUCED_MOTION_QUERY,
  decideRenderMode,
  detectWebGL,
  markPuppetFailed,
  prefersReducedMotion,
  puppetFailed,
  resetSupportForTests,
  subscribePuppetFailed,
  webglAvailable,
} from "./support";

afterEach(() => resetSupportForTests());

describe("decideRenderMode（3D を出すか、2D で続けるか。ADR-0032）", () => {
  const ok = { webgl: true, reducedMotion: false, failed: false };

  it("3D を頼まれ、出せる環境なら 3D", () => {
    expect(decideRenderMode({ requested: "3d", ...ok })).toBe("3d");
  });

  it("2D を頼まれたら、環境によらず 2D", () => {
    expect(decideRenderMode({ requested: "2d", ...ok })).toBe("2d");
  });

  it("WebGL が使えないときは 2D に戻る", () => {
    expect(decideRenderMode({ requested: "3d", ...ok, webgl: false })).toBe("2d");
  });

  it("動きを減らす設定のときは 2D に戻る", () => {
    expect(decideRenderMode({ requested: "3d", ...ok, reducedMotion: true })).toBe("2d");
  });

  it("この画面で 3D が失敗した後は 2D のまま", () => {
    expect(decideRenderMode({ requested: "3d", ...ok, failed: true })).toBe("2d");
  });
});

describe("detectWebGL", () => {
  it("WebGL 2 の文脈を作れたら使える。確かめた文脈はすぐ手放す", () => {
    let released = false;
    const requested: string[] = [];
    const canvas = {
      getContext(kind: string) {
        requested.push(kind);
        return {
          getExtension: (name: string) =>
            name === "WEBGL_lose_context" ? { loseContext: () => (released = true) } : null,
        };
      },
    };
    expect(detectWebGL(() => canvas)).toBe(true);
    expect(requested).toEqual(["webgl2"]);
    expect(released).toBe(true);
  });

  it("文脈を作れないときは使えない（WebGL 1 だけの環境も、three が対応しないので使えない）", () => {
    expect(detectWebGL(() => ({ getContext: () => null }))).toBe(false);
  });

  it("文脈を作るときに例外が出たら使えない", () => {
    const canvas = {
      getContext(): unknown {
        throw new Error("blocked");
      },
    };
    expect(detectWebGL(() => canvas)).toBe(false);
  });

  it("canvas を作れないときは使えない", () => {
    expect(detectWebGL(() => null)).toBe(false);
  });

  it("document の無い環境（試験）では使えない", () => {
    expect(webglAvailable()).toBe(false);
  });
});

describe("prefersReducedMotion（動きを減らす設定）", () => {
  it("設定がオンなら true", () => {
    const asked: string[] = [];
    const matchMedia = (query: string) => {
      asked.push(query);
      return { matches: true };
    };
    expect(prefersReducedMotion(matchMedia)).toBe(true);
    expect(asked).toEqual([REDUCED_MOTION_QUERY]);
  });

  it("設定がオフなら false", () => {
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it("matchMedia が無い・例外が出るときは「設定なし」として扱う", () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(
      prefersReducedMotion(() => {
        throw new Error("unsupported");
      }),
    ).toBe(false);
  });
});

describe("markPuppetFailed（3D の失敗を覚える）", () => {
  it("一度失敗したら知らせ、その後は 2D のまま。知らせは1回だけ", () => {
    let calls = 0;
    const unsubscribe = subscribePuppetFailed(() => calls++);
    expect(puppetFailed()).toBe(false);
    markPuppetFailed();
    markPuppetFailed();
    expect(puppetFailed()).toBe(true);
    expect(calls).toBe(1);
    unsubscribe();
  });
});
