import { describe, expect, it } from "vitest";
import { nextBoardTab } from "./tabs";

const TABS = ["overview", "stock", "supply", "records", "demo", "chat"] as const;

describe("ボードの上部タブの矢印キー（Issue #295）", () => {
  it("ArrowRight は次、ArrowLeft は前のタブ", () => {
    expect(nextBoardTab(TABS, "stock", "ArrowRight")).toBe("supply");
    expect(nextBoardTab(TABS, "stock", "ArrowLeft")).toBe("overview");
  });

  it("端では折り返す（最後の ArrowRight で先頭、先頭の ArrowLeft で最後）", () => {
    expect(nextBoardTab(TABS, "chat", "ArrowRight")).toBe("overview");
    expect(nextBoardTab(TABS, "overview", "ArrowLeft")).toBe("chat");
  });

  it("Home は先頭、End は最後", () => {
    expect(nextBoardTab(TABS, "records", "Home")).toBe("overview");
    expect(nextBoardTab(TABS, "records", "End")).toBe("chat");
  });

  it("ほかのキーでは何も返さない", () => {
    for (const key of ["Enter", " ", "Tab", "ArrowUp", "ArrowDown", "a"]) {
      expect(nextBoardTab(TABS, "supply", key)).toBeNull();
    }
  });

  it("タブが無い・今のタブが並びに無いときは何も返さない", () => {
    expect(nextBoardTab([] as string[], "x", "ArrowRight")).toBeNull();
    expect(nextBoardTab(["a", "b"], "c", "ArrowRight")).toBeNull();
  });
});
