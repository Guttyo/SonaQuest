// HQ のカルテ画面の、聞き取りの文字起こし（話す見本・架空。Issue #202、ADR-0061）。
// 話すのはオーナーが演じる架空の患者。音声認識はブラウザ標準（voice/talk.ts と voice/hooks.ts を使い回す）。
// 文はこの部品のメモリ（useState）にだけ持ち、保存（localStorage 等を含む）・ログ出力をしない。
// Claude に送るのは、要約の欄で「要約を作る」を押したときだけ（TranscriptSummary.tsx、ADR-0061 の追記）。
// 画面を離れると（部品が外れると）消え、マイクも閉じる。

import { useState } from "react";
import { TalkButton } from "../../voice/TalkButton";
import { usePushToTalk } from "../../voice/hooks";
import { browserRecognitionFactory, type MicStatus } from "../../voice/talk";
import { TRANSCRIPT_MAX_LENGTH, appendTranscript } from "./transcript";
import { TRANSCRIBE_NOTICES, TRANSCRIBE_TEXT as T } from "./transcribeText";
import { TranscriptSummary } from "./TranscriptSummary";
import "./transcribe.css";

const TALK_TEXTS = { hint: T.hint, inserted: T.inserted, notices: TRANSCRIBE_NOTICES };

/**
 * 上限の知らせ（role="status"）の中身。上限に達したときだけ、今の文字数の文（T.count）を入れる。それ以外は空（Issue #295）。
 * 文字数の表示そのものは aria-live にしない（打つたびに読み上げが割り込むため）
 */
export function transcriptLimitStatus(length: number): string {
  return length >= TRANSCRIPT_MAX_LENGTH ? T.count(length, TRANSCRIPT_MAX_LENGTH) : "";
}

export function KarteTranscribe() {
  const [draft, setDraft] = useState("");
  const [acked, setAcked] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [lostMic, setLostMic] = useState<MicStatus | null>(null);
  // 音声認識が無いブラウザでは、マイクの案内の前から「使えません」と出し、文字入力だけにする
  const [supported] = useState(() => browserRecognitionFactory() !== null);
  return (
    <section aria-labelledby="board-transcribe" className="board-transcribe">
      <h3 id="board-transcribe">{T.title}</h3>
      <p className="board-note board-transcribe-demo">{T.demoNote}</p>
      <p className="board-note">{T.noJudge}</p>
      {supported ? (
        <div className="board-transcribe-before" role="note" aria-labelledby="board-transcribe-before">
          <p id="board-transcribe-before">
            <b>{T.beforeMicTitle}</b>
          </p>
          {T.beforeMic.map((line) => (
            <p key={line} className="board-note">
              {line}
            </p>
          ))}
          <label className="board-transcribe-ack">
            <input
              type="checkbox"
              checked={acked}
              onChange={(e) => {
                setAcked(e.currentTarget.checked);
                setInserted(false);
              }}
            />
            <span>{T.ack}</span>
          </label>
        </div>
      ) : (
        <p className="board-note" role="status">
          {TRANSCRIBE_NOTICES.unsupported}
        </p>
      )}
      {supported && !acked && <p className="board-note">{T.ackFirst}</p>}
      {supported && acked && (
        <TranscribeMic
          inserted={inserted}
          lostMic={lostMic}
          onMicLost={setLostMic}
          onPress={() => setInserted(false)}
          onText={(text) => {
            setDraft((d) => appendTranscript(d, text));
            setInserted(true);
          }}
        />
      )}
      <label className="board-transcribe-field">
        <span>{T.field}</span>
        <textarea
          value={draft}
          rows={6}
          maxLength={TRANSCRIPT_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.currentTarget.value.slice(0, TRANSCRIPT_MAX_LENGTH));
            setInserted(false);
          }}
        />
      </label>
      <div className="board-transcribe-foot">
        <span className="board-note">{T.count(draft.length, TRANSCRIPT_MAX_LENGTH)}</span>
        {/* いつも描いておき（後から差し込むと読まれないことがある）、上限に達したときだけ中に文を入れる。見える文字数と同じ文なので隠す */}
        <span className="visually-hidden" role="status">
          {transcriptLimitStatus(draft.length)}
        </span>
        <button
          type="button"
          disabled={draft === ""}
          onClick={() => {
            setDraft("");
            setInserted(false);
          }}
        >
          {T.clear}
        </button>
      </div>
      <TranscriptSummary transcript={draft} />
    </section>
  );
}

/** マイクのボタン。確かめた後にだけ付ける（外すとマイクを閉じる）。最初の表示から使えるかを正しく出す */
function TranscribeMic({
  inserted,
  lostMic,
  onMicLost,
  onPress,
  onText,
}: {
  inserted: boolean;
  lostMic: MicStatus | null;
  onMicLost: (mic: MicStatus) => void;
  onPress: () => void;
  onText: (text: string) => void;
}) {
  const { talk, snapshot } = usePushToTalk(true, false, onText, () => {}, lostMic, onMicLost, "hold");
  return (
    <TalkButton
      snapshot={snapshot}
      inserted={inserted}
      onPress={() => {
        onPress();
        talk?.press();
      }}
      onRelease={() => talk?.release()}
      texts={TALK_TEXTS}
      style="hold"
    />
  );
}
