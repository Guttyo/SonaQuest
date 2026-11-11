// Fold が開閉の最初の状態だけを決め、その後に渡す値が変わっても人の開け閉めを上書きしないこと（Issue #296 の案A）。
// この試験の環境には DOM が無い（vitest の environment は node）ので、react の useState を、呼んだ順に値を覚える
// 小さな代わりに差し替え、Fold を関数として2回呼んで「2回目の描画」を再現する。
// react-dom/server を読み込む試験とは分ける（react-dom の中の react には、この差し替えが届かないため）。

import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Fold } from "./Fold";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], at: 0 }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      const k = hooks.at++;
      if (!(k in hooks.slots)) hooks.slots[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [hooks.slots[k], () => {}];
    },
  };
});

/** 同じ部品のもう1回の描画（覚えた state はそのまま） */
function render(defaultOpen: boolean): ReactElement {
  hooks.at = 0;
  return Fold({ id: "x", title: "一覧", defaultOpen, children: null });
}

/** 描いた要素の中の <details> の open */
function detailsOpen(el: ReactElement): unknown {
  const section = el as ReactElement<{ children: ReactElement<{ open?: boolean }> }>;
  const details = section.props.children;
  expect(isValidElement(details)).toBe(true);
  expect(details.type).toBe("details");
  return details.props.open;
}

describe("開閉できる欄は最初の状態だけを決める（Issue #296）", () => {
  beforeEach(() => {
    hooks.slots = [];
    hooks.at = 0;
  });

  it("最初に閉じた欄は、後から defaultOpen が true になっても DOM の open を書き換えない（急ぐものが現れても勝手に開かない）", () => {
    expect(detailsOpen(render(false))).toBe(false);
    expect(detailsOpen(render(true))).toBe(false);
    expect(detailsOpen(render(true))).toBe(false);
  });

  it("最初に開いた欄は、後から defaultOpen が false になっても閉じない（最後の承認待ちを承認した・受け入れを止めた、など）", () => {
    expect(detailsOpen(render(true))).toBe(true);
    expect(detailsOpen(render(false))).toBe(true);
  });

  it("作り直したとき（救護所の切り替えで key が変わったとき）は、その時の値で最初の状態を決め直す", () => {
    expect(detailsOpen(render(true))).toBe(true);
    hooks.slots = [];
    expect(detailsOpen(render(false))).toBe(false);
  });
});
