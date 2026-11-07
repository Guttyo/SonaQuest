// エージェントに渡す状況（件数と時刻だけ）の作り方の試験（Issue #161：未着と転記待ちを分ける）。

import { describe, expect, it } from "vitest";
import { initialDemo } from "../demo";
import { chatStatus, pendingSplit } from "./status";

describe("未着と転記待ちを分ける", () => {
  const state = initialDemo();
  const status = chatStatus(state);
  const site = (s: string) => status.sites.find((x) => x.site === s)!;

  it("同期の行の種類が未着なら未着の数に、転記待ちなら転記待ちの数に入れる", () => {
    for (const row of state.sync) {
      const split = pendingSplit(state, row.site);
      if (row.pendingKind === "未着") expect(split).toEqual({ notArrived: row.pending, awaitingEntry: 0 });
      else if (row.pendingKind === "転記待ち") expect(split).toEqual({ notArrived: 0, awaitingEntry: row.pending });
      else expect(split).toEqual({ notArrived: 0, awaitingEntry: 0 });
    }
  });

  it("架空データの始まりでは、救護所Bは未着だけ、救護所Dは未着の件数が不明（報告なし。Issue #217）、救護所Cは転記待ちだけになる", () => {
    expect(site("B").notArrivedRecords).toBeGreaterThan(0);
    expect(site("B").awaitingEntryRecords).toBe(0);
    expect(site("D").notArrivedRecords).toBeNull();
    expect(site("D").awaitingEntryRecords).toBe(0);
    expect(site("C").notArrivedRecords).toBe(0);
    expect(site("C").awaitingEntryRecords).toBeGreaterThan(0);
  });

  it("同期の行が無い救護所は、どちらも不明（null）にする", () => {
    const empty = { ...state, sync: [] };
    expect(pendingSplit(empty, "救護所A")).toEqual({ notArrived: null, awaitingEntry: null });
  });

  it("渡す鍵は件数と時刻だけで、もとの1つの数（pendingRecords）は持たない", () => {
    expect(Object.keys(site("A")).sort()).toEqual(
      ["awaitingEntryRecords", "lastReportMinutesAgo", "notArrivedRecords", "patients", "pharmacistsShort", "shortItems", "site"].sort(),
    );
  });
});
