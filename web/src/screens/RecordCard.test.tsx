import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ALL_QUESTIONS } from "../flow/content";
import { RECORD_EMPTY, RECORD_ITEMS, RECORD_TITLE, recordRows } from "../flow/record";
import type { Answer } from "../flow/types";
import { RecordCard } from "./RecordCard";

const answer = (questionId: string, text: string, kind: Answer["kind"] = "answer"): Answer => ({
  questionId,
  half: questionId.startsWith("first") ? "first" : "second",
  text,
  prompt: `${questionId} の質問`,
  kind,
  recall: false,
});

describe("救護所に渡す記録の形（Issue #97）", () => {
  it("すべての固定の質問が、どれかの項目に対応している", () => {
    const covered = new Set(RECORD_ITEMS.flatMap((i) => i.questionIds));
    for (const q of ALL_QUESTIONS) expect(covered.has(q.id), q.id).toBe(true);
  });

  it("回答を原文のまま項目に並べ、関係のない話は入れず、同じ項目の複数の回答は順に並べる", () => {
    const rows = recordRows([
      answer("first_medicines", "試験：A薬を朝に。量は分かりません"),
      answer("first_medicines", "試験：言い直し、A薬を1錠", "answer"),
      answer("first_location", "試験：関係のない話", "redirected"),
      answer("second_recovery", "試験：薬局に電話します"),
    ]);
    const med = rows.find((r) => r.id === "medicines")!;
    expect(med.values).toEqual(["試験：A薬を朝に。量は分かりません", "試験：言い直し、A薬を1錠"]);
    expect(rows.find((r) => r.id === "location")!.values).toEqual([]);
    expect(rows.find((r) => r.id === "alternative")!.values).toEqual(["試験：薬局に電話します"]);
  });

  it("画面では、項目ごとに原文を出し、無い項目は（回答なし）。要約・言い換えの文は無い", () => {
    const html = renderToStaticMarkup(
      <RecordCard answers={[answer("first_medicines", "試験：A薬を朝に。量は分かりません")]} />,
    );
    expect(html).toContain(`<h2>${RECORD_TITLE}</h2>`);
    expect(html).toContain('<dd class="record-value">試験：A薬を朝に。量は分かりません</dd>');
    expect(html.match(new RegExp(RECORD_EMPTY, "g"))).toHaveLength(RECORD_ITEMS.length - 1);
    expect(html).toContain("要約や言い換えはしていません");
    expect(html).not.toMatch(/点数|合格|正解/);
  });
});
