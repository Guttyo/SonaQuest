// HQ のカルテ画面の、文字起こしの抽出型の要約（Issue #202 の2つめ、ADR-0061 の追記）。
// 送る前に、送り先と「架空の内容だけ」を出し、確かめの欄に印を付けてから「要約を作る」を押せる。
// 送るのは押したときの文字起こしだけ。返事（要約と1段目のコードでの確認の指摘）は部品のメモリにだけ持ち、
// 保存・ログ出力をしない。文字起こしを直したら、前の文の要約は出さない。監査役（2段目）には回さない。

import { useEffect, useRef, useState } from "react";
import { CODE_FINDING_LABELS } from "./codeCheck";
import { requestTranscriptSummary, type TranscriptSummaryOutcome } from "./client";
import { KARTE_ASPECTS } from "./contract";
import { KARTE_ASPECT_LABELS } from "./text";
import { MIN_TRANSCRIPT_FOR_SUMMARY, transcriptUtterances } from "./transcript";
import { TRANSCRIPT_SUMMARY_TEXT as S } from "./transcribeText";

type Result = { transcript: string; outcome: TranscriptSummaryOutcome };

export function TranscriptSummary({
  transcript,
  request = requestTranscriptSummary,
  initialAcked = false,
  initialResult = null,
}: {
  transcript: string;
  request?: (transcript: string) => Promise<TranscriptSummaryOutcome>;
  /** 試験用：確かめの欄と、前の結果を最初から渡す */
  initialAcked?: boolean;
  initialResult?: Result | null;
}) {
  const [acked, setAcked] = useState(initialAcked);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(initialResult);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const longEnough = transcriptUtterances(transcript).join("").length >= MIN_TRANSCRIPT_FOR_SUMMARY;
  const busy = pending !== null;
  // 文字起こしを直したら、前の文の要約は出さない
  const current = result !== null && result.transcript === transcript ? result.outcome : null;

  async function send() {
    if (!acked || !longEnough || busy) return;
    const sent = transcript;
    setPending(sent);
    const outcome = await request(sent);
    if (!mounted.current) return;
    setPending(null);
    setResult({ transcript: sent, outcome });
  }

  return (
    <section aria-labelledby="board-transcript-summary" className="board-transcribe board-transcript-summary">
      <h4 id="board-transcript-summary">{S.title}</h4>
      <div className="board-transcribe-before" role="note" aria-labelledby="board-transcript-before">
        <p id="board-transcript-before">
          <b>{S.beforeSendTitle}</b>
        </p>
        {S.beforeSend.map((line) => (
          <p key={line} className="board-note">
            {line}
          </p>
        ))}
        <label className="board-transcribe-ack">
          <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.currentTarget.checked)} />
          <span>{S.ack}</span>
        </label>
      </div>
      <div className="board-transcribe-foot">
        <button type="button" className="board-approve" disabled={!acked || !longEnough || busy} onClick={() => void send()}>
          {S.send}
        </button>
      </div>
      <p className="board-note" role="status">
        {busy ? S.sending : !longEnough ? S.tooShort : current !== null && !current.ok ? S.failures[current.failure] : ""}
      </p>
      {current !== null && current.ok && (
        <div className="board-transcript-result">
          <ol className="board-transcript-items">
            {current.summary.items.map((item, i) => {
              const findings = current.findings.filter((f) => f.itemIndex === i);
              return (
                <li key={i} data-summary-item={i}>
                  <p>
                    <b>{KARTE_ASPECT_LABELS[item.aspect]}</b>：{item.text}
                  </p>
                  <p className="board-note">
                    {S.quote}：「{item.quote}」
                  </p>
                  {findings.length > 0 && (
                    <ul className="board-transcript-findings">
                      {findings.map((f, j) => (
                        <li key={j} data-finding={f.kind}>
                          {CODE_FINDING_LABELS[f.kind]}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {current.summary.not_covered.length > 0 && (
            <p className="board-note">
              {S.notCovered}：{KARTE_ASPECTS.filter((a) => current.summary.not_covered.includes(a)).map((a) => KARTE_ASPECT_LABELS[a]).join("、")}
            </p>
          )}
          {current.findings.some((f) => f.itemIndex === null) && (
            <ul className="board-transcript-findings">
              {current.findings
                .filter((f) => f.itemIndex === null)
                .map((f, j) => (
                  <li key={j} data-finding={f.kind}>
                    {KARTE_ASPECT_LABELS[f.aspect]}：{CODE_FINDING_LABELS[f.kind]}
                  </li>
                ))}
            </ul>
          )}
          {current.findings.length === 0 && <p className="board-note">{S.noFindings}</p>}
          <p className="board-note">{S.confirmNote}</p>
        </div>
      )}
    </section>
  );
}
