import assert from "node:assert/strict";
import { test } from "node:test";
import { CUTS, YOUTUBE_LOUDNESS, loudnormFilter, nextVersion, parseCut, parseLoudnormJson, quoteForShell, versionFileName } from "./render-versioned.mjs";

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

test("音の大きさを YouTube に合わせるのは v2 だけ（提出版は提出したときの音のまま）", () => {
  assert.equal(CUTS.v1.loudness, undefined);
  assert.deepEqual(CUTS.v2.loudness, YOUTUBE_LOUDNESS);
  assert.equal(YOUTUBE_LOUDNESS.i, -14);
});

test("loudnorm の測定値を、ffmpeg の出力の中から取り出す。無ければ null", () => {
  const out = 'Input #0\n[Parsed_loudnorm_0 @ 0000]\n{\n\t"input_i" : "-23.01",\n\t"input_tp" : "-4.30",\n\t"input_lra" : "3.30",\n\t"input_thresh" : "-33.50",\n\t"target_offset" : "0.12"\n}\n';
  assert.equal(parseLoudnormJson(out).input_i, "-23.01");
  assert.equal(parseLoudnormJson("no json here"), null);
  assert.equal(parseLoudnormJson('{"input_i":"-inf"}'), null);
});

test("loudnorm のフィルター：1回目は測るだけ、2回目は測った値を渡す", () => {
  assert.equal(loudnormFilter(YOUTUBE_LOUDNESS), "loudnorm=I=-14:TP=-1:LRA=11:print_format=json");
  const second = loudnormFilter(YOUTUBE_LOUDNESS, { input_i: "-23.01", input_tp: "-4.30", input_lra: "3.30", input_thresh: "-33.50", target_offset: "0.12" });
  assert.match(second, /measured_I=-23\.01:measured_TP=-4\.30:measured_LRA=3\.30:measured_thresh=-33\.50:offset=0\.12/);
});
