// 最初の表示の URL の指定（Issue #114）
import { describe, expect, it } from "vitest";
import { boardStartFrom } from "./url";

describe("URL の ?view=…（最初の表示だけ読む）", () => {
  it("指定が無ければ訓練、?view=board はボードの本部", () => {
    expect(boardStartFrom("")).toEqual({ view: "training", intakeSite: null });
    expect(boardStartFrom("?mode=3d")).toEqual({ view: "training", intakeSite: null });
    expect(boardStartFrom("?view=board")).toEqual({ view: "board", intakeSite: null });
  });

  it("?view=intake&site=A は救護所A のカルテ入力の専用画面。救護所の名前でも、小文字でもよい", () => {
    expect(boardStartFrom("?view=intake&site=A")).toEqual({ view: "board", intakeSite: "救護所A" });
    expect(boardStartFrom("?view=intake&site=d")).toEqual({ view: "board", intakeSite: "救護所D" });
    expect(boardStartFrom(`?view=intake&site=${encodeURIComponent("救護所C")}`)).toEqual({ view: "board", intakeSite: "救護所C" });
  });

  it("site が無い・違う・本部備蓄のときは、ボードの本部", () => {
    expect(boardStartFrom("?view=intake")).toEqual({ view: "board", intakeSite: null });
    expect(boardStartFrom("?view=intake&site=Z")).toEqual({ view: "board", intakeSite: null });
    expect(boardStartFrom(`?view=intake&site=${encodeURIComponent("本部備蓄")}`)).toEqual({ view: "board", intakeSite: null });
  });
});
