import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HQ } from "../data";
import { sessionFor } from "../access";
import { Board } from "../../screens/Board";
import { KarteTranscribe } from "./Transcribe";
import { TRANSCRIPT_MAX_LENGTH, appendTranscript } from "./transcript";
import { TRANSCRIBE_NOTICES, TRANSCRIBE_TEXT } from "./transcribeText";

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

  it("音声認識が無いブラウザでは、そう出して文字入力だけにする（マイクのボタンも確かめの欄も出さない）", () => {
    const h = renderToStaticMarkup(<KarteTranscribe />);
    expect(h).toContain(TRANSCRIBE_NOTICES.unsupported);
    expect(h).not.toContain("talk-button");
    expect(h).not.toContain('type="checkbox"');
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
