import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HQ } from "../data";
import { sessionFor } from "../access";
import { Board } from "../../screens/Board";
import { KarteTranscribe, transcriptLimitStatus } from "./Transcribe";
import { TRANSCRIPT_MAX_LENGTH, appendTranscript } from "./transcript";
import { TRANSCRIBE_NOTICES, TRANSCRIBE_TEXT, TRANSCRIPT_SUMMARY_TEXT } from "./transcribeText";
import { TranscriptSummary } from "./TranscriptSummary";
import { requestTranscriptSummary } from "./client";
import { CODE_FINDING_LABELS } from "./codeCheck";
import type { KarteSummary } from "./contract";

const g = globalThis as unknown as Record<string, unknown>;
afterEach(() => {
  delete g.webkitSpeechRecognition;
});

const records = (site = HQ, login = HQ) =>
  renderToStaticMarkup(
    <Board onBack={() => {}} reducedMotion={false} initialSite={site} initialTab="records" initialSession={sessionFor(login)} />,
  );

describe("聞き取りの文字起こしの文のつなぎ方（Issue #202）", () => {
  it("聞き取った文を改行で区切って後ろに足す。言っていない句読点は足さない", () => {
    expect(appendTranscript("", " 薬の袋は家にあります ")).toBe("薬の袋は家にあります");
    expect(appendTranscript("一つ目", "二つ目")).toBe("一つ目\n二つ目");
    expect(appendTranscript("一つ目\n", "二つ目")).toBe("一つ目\n二つ目");
    expect(appendTranscript("そのまま", "  ")).toBe("そのまま");
  });

  it("上限の文字数で切る", () => {
    const long = "あ".repeat(TRANSCRIPT_MAX_LENGTH);
    expect(appendTranscript(long, "い")).toHaveLength(TRANSCRIPT_MAX_LENGTH);
  });
});

describe("HQ のカルテ画面の文字起こし（Issue #202、ADR-0061）", () => {
  it("HQ でログインしたときだけ出す。架空のデモであることと、アプリが判断しないことを出す", () => {
    const h = records();
    expect(h).toContain(`>${TRANSCRIBE_TEXT.title}</h3>`);
    expect(h).toContain(TRANSCRIBE_TEXT.demoNote);
    expect(h).toContain(TRANSCRIBE_TEXT.noJudge);
    expect(h).toContain("<textarea");
    const a = records(HQ, "救護所A");
    expect(a).not.toContain(TRANSCRIBE_TEXT.title);
    expect(a).toContain(TRANSCRIBE_TEXT.hqOnly);
    // 救護所の画面には出さない
    expect(records("救護所A", "救護所A")).not.toContain(TRANSCRIBE_TEXT.title);
  });

  it("文字数の表示は aria-live にしない。上限の知らせ（role=\"status\"）はいつも描き、上限に達したときだけ文を入れる（Issue #295）", () => {
    const h = renderToStaticMarkup(<KarteTranscribe />);
    const foot = h.slice(h.indexOf('class="board-transcribe-foot"'), h.indexOf("</div>", h.indexOf('class="board-transcribe-foot"')));
    expect(foot).toContain(`>${TRANSCRIBE_TEXT.count(0, TRANSCRIPT_MAX_LENGTH)}<`);
    expect(foot).not.toContain("aria-live");
    expect(foot).toContain('<span class="visually-hidden" role="status"></span>');
    expect(transcriptLimitStatus(0)).toBe("");
    expect(transcriptLimitStatus(TRANSCRIPT_MAX_LENGTH - 1)).toBe("");
    // 新しい文は足さず、今の文字数の文を使い回す
    expect(transcriptLimitStatus(TRANSCRIPT_MAX_LENGTH)).toBe(TRANSCRIBE_TEXT.count(TRANSCRIPT_MAX_LENGTH, TRANSCRIPT_MAX_LENGTH));
  });

  it("音声認識が無いブラウザでは、そう出して文字入力だけにする（マイクのボタンも確かめの欄も出さない）", () => {
    const h = renderToStaticMarkup(<KarteTranscribe />);
    expect(h).toContain(TRANSCRIBE_NOTICES.unsupported);
    expect(h).not.toContain("talk-button");
    expect(h).not.toContain(TRANSCRIBE_TEXT.ack);
    expect(h).toContain("<textarea");
  });

  it("音声認識があるブラウザでは、マイクを押す前に送り先と「架空の内容だけ」を出し、確かめるまでマイクのボタンを出さない", () => {
    g.webkitSpeechRecognition = function Fake() {};
    const h = renderToStaticMarkup(<KarteTranscribe />);
    for (const line of TRANSCRIBE_TEXT.beforeMic) expect(h).toContain(line);
    expect(h).toContain("事業者のサーバーに送られて");
    expect(h).toContain("実在の人");
    expect(h).toContain('type="checkbox"');
    expect(h).toContain(TRANSCRIBE_TEXT.ack);
    expect(h).toContain(TRANSCRIBE_TEXT.ackFirst);
    expect(h).not.toContain("talk-button");
  });
});

// 架空の試験用の文字起こし
const TX = ["お薬手帳はかばんに入れています", "スマホにも写真があります"].join("\n");
const SUMMARY: KarteSummary = {
  items: [{ aspect: "location", text: "お薬手帳はかばん", quote: "お薬手帳はかばんに入れています" }],
  not_covered: ["alternative", "current", "unrecorded", "proxy"],
};

describe("文字起こしの要約（Issue #202 の2つめ、ADR-0061 の追記）", () => {
  it("送る前に送り先（Workers を通して Claude）と「架空の内容だけ」を出し、確かめの欄に印を付けるまで送れない", () => {
    const h = renderToStaticMarkup(<TranscriptSummary transcript={TX} />);
    for (const line of TRANSCRIPT_SUMMARY_TEXT.beforeSend) expect(h).toContain(line);
    expect(h).toContain("Anthropic の Claude に送られます");
    expect(h).toContain("架空の内容だけ");
    expect(h).toMatch(/<button type="button" class="board-approve" disabled="">要約を作る（Claude に送る）<\/button>/);
    const acked = renderToStaticMarkup(<TranscriptSummary transcript={TX} initialAcked />);
    expect(acked).toMatch(/<button type="button" class="board-approve">要約を作る/);
    // 短すぎると押せない
    expect(renderToStaticMarkup(<TranscriptSummary transcript="短い" initialAcked />)).toContain(TRANSCRIPT_SUMMARY_TEXT.tooShort);
  });

  it("要約は観点・短い文・原文の引用を並べ、指摘が無ければそう出す。確定は人であることを出す", () => {
    const h = renderToStaticMarkup(<TranscriptSummary transcript={TX} initialResult={{ transcript: TX, outcome: { ok: true, summary: SUMMARY, findings: [] } }} />);
    expect(h).toContain("お薬手帳はかばん");
    expect(h).toContain("「お薬手帳はかばんに入れています」");
    expect(h).toContain(TRANSCRIPT_SUMMARY_TEXT.noFindings);
    expect(h).toContain(TRANSCRIPT_SUMMARY_TEXT.confirmNote);
    expect(h).toContain(TRANSCRIPT_SUMMARY_TEXT.notCovered);
  });

  it("コードでの確認の指摘を項目ごとに出す。文字起こしを直したら、前の文の要約は出さない", () => {
    const withFinding = { ok: true as const, summary: SUMMARY, findings: [{ kind: "quote_not_found" as const, itemIndex: 0, aspect: "location" as const }] };
    const h = renderToStaticMarkup(<TranscriptSummary transcript={TX} initialResult={{ transcript: TX, outcome: withFinding }} />);
    expect(h).toContain(CODE_FINDING_LABELS.quote_not_found);
    const edited = renderToStaticMarkup(<TranscriptSummary transcript={`${TX}\n追加の一行です`} initialResult={{ transcript: TX, outcome: withFinding }} />);
    expect(edited).not.toContain("「お薬手帳はかばんに入れています」");
  });

  it("使えないときは理由の文を出す（キーが無い）", () => {
    const h = renderToStaticMarkup(<TranscriptSummary transcript={TX} initialResult={{ transcript: TX, outcome: { ok: false, failure: "not_configured" } }} />);
    expect(h).toContain(TRANSCRIPT_SUMMARY_TEXT.failures.not_configured);
  });

  it("送るのは文字起こしだけで、宛先は /api/karte/transcript-summary。返事の形を確かめる", async () => {
    const calls: { url: string; body: string }[] = [];
    const reply = (status: number, json: unknown) => async (url: string, init: { body: string }) => {
      calls.push({ url, body: init.body });
      return { status, headers: { get: () => "application/json" }, json: async () => json };
    };
    const ok = await requestTranscriptSummary(TX, reply(200, { source: "model", summary: SUMMARY, findings: [] }));
    expect(ok).toEqual({ ok: true, summary: SUMMARY, findings: [] });
    expect(calls[0].url).toBe("/api/karte/transcript-summary");
    expect(JSON.parse(calls[0].body)).toEqual({ transcript: TX });
    expect(await requestTranscriptSummary(TX, reply(503, { error: "not_configured" }))).toEqual({ ok: false, failure: "not_configured" });
    expect(await requestTranscriptSummary(TX, reply(429, { error: "rate_limited" }))).toEqual({ ok: false, failure: "rate_limited" });
    expect(await requestTranscriptSummary(TX, reply(200, { source: "model", summary: { items: "x" }, findings: [] }))).toEqual({ ok: false, failure: "invalid" });
    expect(await requestTranscriptSummary(TX, undefined)).toEqual({ ok: false, failure: "network" });
  });
});
