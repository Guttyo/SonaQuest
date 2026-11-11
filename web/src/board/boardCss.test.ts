import { describe, expect, it } from "vitest";

// vitest は CSS を空の文字列として読み込む（`?raw` でも空になる）ので、ファイルをそのまま読む。
// このプロジェクトは Node の型を入れていないため、node:fs は形を書いて読み込む
const { readFileSync } = (await import(/* @vite-ignore */ "node:" + "fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const css = readFileSync(new URL("./board.css", import.meta.url), "utf8");

// board.css を文字列として読み、規則（セレクタと中身）に分ける小さな読み取り（Issue #297）。
// 見た目は確かめられないので、整理した状態が後の改修で崩れないことだけを確かめる。
type Rule = { selector: string; body: string; atRules: string[] };

function parseRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      const head = text.slice(start, i).trim();
      if (head.startsWith("@")) {
        stack.push(head);
        start = i + 1;
        continue;
      }
      const end = text.indexOf("}", i);
      rules.push({ selector: head.replace(/\s+/g, " "), body: text.slice(i + 1, end), atRules: [...stack] });
      i = end;
      start = end + 1;
    } else if (ch === "}") {
      stack.pop();
      start = i + 1;
    }
  }
  return rules;
}

const rules = parseRules(css);
const topLevel = rules.filter((r) => r.atRules.length === 0);
const definesVariables = (r: Rule) => /(^|;)\s*--[\w-]+\s*:/.test(r.body);

describe("board.css の整理（Issue #297）", () => {
  it("読み取りが規則を拾えている", () => {
    expect(topLevel.length).toBeGreaterThan(300);
    expect(topLevel.some((r) => r.selector === ".board")).toBe(true);
  });

  it("ボードの変数を定義している規則は、Issue #143 の節の .board の1つだけ", () => {
    const withVariables = rules.filter(definesVariables);
    expect(withVariables.map((r) => r.selector)).toEqual([".board"]);
    expect(withVariables[0].atRules).toEqual([]);
    // 色の土台と、名前と中身が合わない向け直しの変数が、その1か所にある
    for (const name of ["--b-ground", "--b-ink", "--b-stop", "--b-check", "--mint-strong", "--orange", "--board-warn", "--board-accent", "--focus"]) {
      expect(withVariables[0].body).toMatch(new RegExp(`(^|;)\\s*${name}\\s*:`));
    }
  });

  it("前の節の、上書きされて効いていなかった色の変数の定義が戻っていない", () => {
    // 1601 行・1961 行にあった .board の変数（黄の --board-warn、青緑の --board-accent など）は、
    // Issue #143 の節の .board で同じ名前に定義し直され、効いていなかった
    expect(css).not.toMatch(/--board-warn:\s*#c99a06/);
    expect(css).not.toMatch(/--board-accent:\s*#1d6f86/);
  });

  it(".app:has(.board) の背景は1か所だけで決めている", () => {
    const backgrounds = topLevel.filter((r) => r.selector.split(",").some((s) => s.trim() === ".app:has(.board)") && /(^|;)\s*background\s*:/.test(r.body));
    expect(backgrounds).toHaveLength(1);
  });
});
