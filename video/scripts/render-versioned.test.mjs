import assert from "node:assert/strict";
import { test } from "node:test";
import { CUTS, nextVersion, parseCut, quoteForShell, versionFileName } from "./render-versioned.mjs";

test("番号付きのファイルが無ければ 1 から", () => {
  assert.equal(nextVersion([]), 1);
  assert.equal(nextVersion(["memo.txt", "sonaquest.mp4", "sonaquest-preview.mp4"]), 1);
});

test("いちばん大きい番号の次にする（抜けがあっても戻らない）", () => {
  assert.equal(nextVersion(["sonaquest-v01-a716eeb.mp4", "sonaquest-v03-b1c2d3e-dirty.mp4"]), 4);
  assert.equal(nextVersion(["sonaquest-v09.mp4", "sonaquest-v10-abc1234.mp4"]), 11);
});

test("ファイル名は2桁の番号とコミット。未コミットの変更があれば -dirty", () => {
  assert.equal(versionFileName(3, "a716eeb", false), "sonaquest-v03-a716eeb.mp4");
  assert.equal(versionFileName(12, "a716eeb", true), "sonaquest-v12-a716eeb-dirty.mp4");
  assert.equal(versionFileName(1, null, false), "sonaquest-v01.mp4");
});

test("v2（Issue #315）は別の番号の列。提出版の列と互いに数えない", () => {
  const files = ["sonaquest-v11-cdb7062-trim179.mp4", "sonaquest-v2-v03-abc1234.mp4", "sonaquest-v2-v01-abc1234-dirty.mp4"];
  assert.equal(nextVersion(files), 12);
  assert.equal(nextVersion(files, CUTS.v2.prefix), 4);
  assert.equal(versionFileName(4, "abc1234", false, CUTS.v2.prefix), "sonaquest-v2-v04-abc1234.mp4");
  assert.equal(CUTS.v2.composition, "SonaQuestVideoV2");
});

test("--cut を取り出し、残りは remotion に渡す", () => {
  assert.deepEqual(parseCut([]), { cut: "v1", rest: [] });
  assert.deepEqual(parseCut(["--cut", "v2", "--frames=0-29"]), { cut: "v2", rest: ["--frames=0-29"] });
  assert.throws(() => parseCut(["--cut", "v3"]));
});

test("shell に渡す引数は空白があっても1つのまま（二重引用符で囲む）", () => {
  assert.equal(quoteForShell("out/versions/sonaquest-v02-ab162ee.mp4"), '"out/versions/sonaquest-v02-ab162ee.mp4"');
  assert.equal(quoteForShell("C:/a b/c.mp4"), '"C:/a b/c.mp4"');
  assert.equal(quoteForShell('x"y'), '"xy"');
});
