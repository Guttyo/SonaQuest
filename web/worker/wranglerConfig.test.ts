// 公開の設定（wrangler.jsonc）に、開発中だけの切り替え（DEV_ で始まる値）が入っていないことの試験（Issue #284 の指摘7、ADR-0007 の追記）。
// 本文のログ（DEV_CONTENT_LOG）・比較実験（DEV_EXPERIMENT）などは、ホスト名の判定（devlog.ts の LOCAL_HOSTS）と、
// デプロイの設定に DEV_ の値が無いことの2つで止めている。後者を機械的に確かめる。secrets はリポジトリから確かめられない。

import { describe, expect, it } from "vitest";
import wranglerSource from "../wrangler.jsonc?raw";

/** キーの形（"DEV_…":）だけを拾う。コメントの中の DEV_CONTENT_LOG などの語には当たらない */
const DEV_KEY_PATTERN = /"DEV_[A-Za-z0-9_]*"\s*:/g;

function devKeys(source: string): string[] {
  return [...source.matchAll(DEV_KEY_PATTERN)].map((m) => m[0]);
}

describe("公開の設定（wrangler.jsonc）", () => {
  it("設定のファイルを読めていて、vars がある", () => {
    expect(wranglerSource).toContain('"name": "sonaquest"');
    expect(wranglerSource).toContain('"vars"');
  });

  it("vars（ほかの環境の設定を含めファイル全体）に DEV_ で始まるキーが無い", () => {
    expect(devKeys(wranglerSource)).toEqual([]);
  });

  it("照合はキーの形を拾い、コメントの中の語には当たらない", () => {
    expect(devKeys('"vars": { "DEV_CONTENT_LOG": "1" }')).toEqual(['"DEV_CONTENT_LOG":']);
    expect(devKeys('"vars": {\n  "DEV_EXPERIMENT"  : "1",\n  "PUBLIC_TURN": "1"\n}')).toEqual(['"DEV_EXPERIMENT"  :']);
    expect(devKeys("// DEV_CONTENT_LOG もここには書かない")).toEqual([]);
    expect(devKeys('"vars": { "PUBLIC_TURN": "1", "KARTE_AUDIT_AGENT_ID": "agent_x" }')).toEqual([]);
    // 今のファイルのコメントには DEV_CONTENT_LOG の語があるが、キーとしては拾わない
    expect(wranglerSource).toContain("DEV_CONTENT_LOG");
  });
});
