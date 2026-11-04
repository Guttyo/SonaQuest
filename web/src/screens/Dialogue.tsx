import { useState, type Dispatch } from "react";
import {
  ANSWER_HINTS,
  CONFIRM_PROMPT,
  EVENTS,
  SCENE_INTRO,
  SKIP_CONFIRM_LABEL,
  SOURCE_OPTIONS,
  WAITING_TEXT,
} from "../flow/content";
import { currentMode } from "../flow/mode";
import { MAX_ANSWERS, MAX_ANSWER_LENGTH, isAcceptableAnswer } from "../flow/rules";
import {
  countedAnswers,
  currentQuestion,
  type TrainingAction,
  type TrainingState,
} from "../flow/training";
import type { SourceId } from "../flow/types";
import { SpeakerControls } from "../voice/SpeakerControls";
import { TalkButton } from "../voice/TalkButton";
import { usePushToTalk, useSpeakWhenChanged, useSpeaker } from "../voice/hooks";
import { appendRecognized, type MicStatus } from "../voice/talk";
import type { SpeakerSnapshot } from "../voice/speaker";
import { listenerSpeech, speechKey } from "../voice/speech";
import { listenerActivity, type ListenerActivity, type ListenerVoiceView } from "../voice/view";
import { Listener } from "./Listener";
import { Transcript } from "./Transcript";

interface Props {
  state: TrainingState;
  dispatch: Dispatch<TrainingAction>;
}

/** 3D の対話モードのときだけ渡す、読み上げの様子と操作（ADR-0033） */
interface VoiceControls {
  speech: SpeakerSnapshot;
  stopSpeech: () => void;
  replay: () => void;
  /** その回のうちに、マイクが使えないと分かった状態（拒否など）。次の質問でも文字入力だけにする */
  lostMic: MicStatus | null;
  onMicLost: (mic: MicStatus) => void;
}

export function Dialogue({ state, dispatch }: Props) {
  const { stage } = state;
  const question = currentQuestion(state);

  // 声を使うかは、3D の対話モードを選んだかだけで決める。3D を描画できるか（WebGL・動きを減らす設定）では決めない（ADR-0033）
  const [mode] = useState(currentMode);
  const voiceOn = mode === "3d";
  const { speaker, snapshot: speech } = useSpeaker(voiceOn, state.session);
  const spoken = voiceOn ? listenerSpeech(state) : null;
  useSpeakWhenChanged(speaker, spoken, spoken === null ? null : speechKey(state, spoken));
  const [lostMic, setLostMic] = useState<{ session: number; mic: MicStatus } | null>(null);
  const voice: VoiceControls | null = voiceOn
    ? {
        speech,
        stopSpeech: () => speaker?.stop(),
        replay: () => speaker?.replay(),
        lostMic: lostMic?.session === state.session ? lostMic.mic : null,
        onMicLost: (mic) => setLostMic({ session: state.session, mic }),
      }
    : null;

  // 聞き取り係の見せ方（Listener.tsx の props、Issue #37）。係の交代のあとは、別の係として見せる
  const relief = state.event === "handover" && stage.name === "second";
  const viewOf = (activity: ListenerActivity): ListenerVoiceView => ({ mode, activity, relief });
  const speakingView = viewOf(listenerActivity({ waiting: false, listening: false, speaking: speech.speaking }));

  return (
    <section className="screen" aria-label="対話">
      <p className="scene">{SCENE_INTRO}</p>
      <Transcript state={state} />

      {question !== null && state.waiting && <Thinking view={voiceOn ? viewOf("thinking") : null} />}

      {question !== null && !state.waiting && (
        <AnswerForm
          // 聞き取り係の発言が変わったら下書きを消す
          key={state.answers.length}
          questionText={state.prompt?.text ?? question.text}
          hint={ANSWER_HINTS[question.answerAs]}
          answered={countedAnswers(state.answers, "first") + countedAnswers(state.answers, "second")}
          onSubmit={(text) => dispatch({ type: "answer", text })}
          viewOf={viewOf}
          voice={voice}
        />
      )}

      {stage.name === "confirm" && (
        <ConfirmSource
          ack={state.closingAck}
          initial={state.sourceGuess}
          onConfirm={(source) => dispatch({ type: "confirm", source })}
          view={speakingView}
          voice={voice}
        />
      )}

      {stage.name === "event" && state.event !== null && (
        <div className="event" role="alert" data-scroll-target tabIndex={-1}>
          <h2>想定外の出来事</h2>
          <p className="event-text">{EVENTS[state.event].text}</p>
          {EVENTS[state.event].unavailable !== null && (
            <p>
              <span className="label">使えなくなったもの：</span>
              {EVENTS[state.event].unavailable}
            </p>
          )}
          {voice !== null && (
            <SpeakerControls snapshot={voice.speech} onStop={voice.stopSpeech} onReplay={voice.replay} />
          )}
          <button
            type="button"
            className="primary"
            onClick={() => dispatch({ type: "continue_after_event" })}
          >
            続ける
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * 返事を待つ間の「考え中」（ADR-0030）。聞き取り係の光がゆっくり明滅し、文の後ろに点が流れる。
 * 読み上げは文だけ（点は読まない）。動きを減らす設定では動きが止まり、文だけで示す（styles.css、ADR-0020）。
 * 3D の対話モードでは、聞き取り係（Listener）を thinking の様子で出す（Issue #37 のパペットが考え中を示す）
 */
function Thinking({ view }: { view: ListenerVoiceView | null }) {
  if (view !== null) {
    return (
      <div className="thinking" role="status" data-scroll-target tabIndex={-1}>
        <Listener {...view}>
          <p>
            {WAITING_TEXT}
            <span className="thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </p>
        </Listener>
      </div>
    );
  }
  return (
    <div className="exchange-row thinking" role="status" data-scroll-target tabIndex={-1}>
      <span className="listener-light listener-light-small listener-light-thinking" aria-hidden="true" />
      <p className="exchange-question">
        <span className="bubble-name">聞き取り係</span>
        {WAITING_TEXT}
        <span className="thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  );
}

function AnswerForm({
  questionText,
  hint,
  answered,
  onSubmit,
  viewOf,
  voice,
}: {
  questionText: string;
  /** 誰のこととして答えるか（ADR-0022） */
  hint: string;
  answered: number;
  onSubmit: (text: string) => void;
  viewOf: (activity: ListenerActivity) => ListenerVoiceView;
  /** 3D の対話モードのときだけ。2D は文字で答える（ADR-0031） */
  voice: VoiceControls | null;
}) {
  const [draft, setDraft] = useState("");
  const [inserted, setInserted] = useState(false);
  const canSubmit = isAcceptableAnswer(draft);
  const speaking = voice?.speech.speaking ?? false;
  // 認識した文は入力欄に入れるだけ。送るのは利用者が「答える」を押したとき（ADR-0010）。
  // 送るときに、文字入力と同じ緊急の照合を通る（training.ts の "answer"、docs/phase2-decisions.md 項目10）
  const { talk, snapshot: talkState } = usePushToTalk(
    voice !== null,
    speaking,
    (text) => {
      setDraft((current) => appendRecognized(current, text));
      setInserted(true);
    },
    () => voice?.stopSpeech(),
    voice?.lostMic ?? null,
    (mic) => voice?.onMicLost(mic),
  );
  const view = viewOf(listenerActivity({ waiting: false, listening: talkState.listening, speaking }));

  return (
    <form
      className="answer-form"
      data-scroll-target
      tabIndex={-1}
      // 焦点が移ったときに、新しい質問文が読み上げられるように
      aria-labelledby="current-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(draft);
      }}
    >
      <Listener {...view}>
        <p id="current-question">{questionText}</p>
      </Listener>
      {voice !== null && (
        <>
          <SpeakerControls snapshot={voice.speech} onStop={voice.stopSpeech} onReplay={voice.replay} />
          <TalkButton
            snapshot={talkState}
            inserted={inserted}
            onPress={() => talk?.press()}
            onRelease={() => talk?.release()}
          />
        </>
      )}
      <label className="field-label" htmlFor="answer">
        あなたの回答
      </label>
      {/* 入力を始めると消える placeholder だけに頼らず、常に見える位置にも示す */}
      <p id="answer-hint" className="small">
        {hint}
      </p>
      <textarea
        id="answer"
        aria-describedby="current-question answer-hint answer-count"
        value={draft}
        maxLength={MAX_ANSWER_LENGTH}
        rows={4}
        placeholder={hint}
        onChange={(e) => {
          setDraft(e.target.value);
          setInserted(false);
        }}
      />
      <div className="form-row">
        <span id="answer-count" className="count">
          回答 {answered + 1} / 最大 {MAX_ANSWERS}
        </span>
        <button type="submit" className="primary" disabled={!canSubmit}>
          答える
        </button>
      </div>
    </form>
  );
}

function ConfirmSource({
  ack,
  initial,
  onConfirm,
  view,
  voice,
}: {
  /** 前半の最後の回答への受け止め（ADR-0029 の2） */
  ack: string | null;
  /** 初期選択の候補（Claude）。本人がタップで確かめてから進む（ADR-0016、項目6） */
  initial: SourceId | null;
  onConfirm: (source: SourceId | null) => void;
  view: ListenerVoiceView;
  voice: VoiceControls | null;
}) {
  const [selected, setSelected] = useState<SourceId | null>(initial);

  return (
    <div
      className="confirm"
      data-scroll-target
      tabIndex={-1}
      role="group"
      aria-labelledby="confirm-prompt"
    >
      <Listener {...view}>
        {ack !== null && <p>{ack}</p>}
        <p id="confirm-prompt">{CONFIRM_PROMPT}</p>
      </Listener>
      {voice !== null && (
        <SpeakerControls snapshot={voice.speech} onStop={voice.stopSpeech} onReplay={voice.replay} />
      )}
      <fieldset className="options" aria-labelledby="confirm-prompt">
        {SOURCE_OPTIONS.map((option) => (
          <label key={option.id} className="option">
            <input
              type="radio"
              name="main-source"
              value={option.id}
              checked={selected === option.id}
              onChange={() => setSelected(option.id)}
            />
            <span className="option-text">
              <span className="option-label">{option.label}</span>
              {option.description !== "" && (
                <span className="option-description">{option.description}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="primary"
        disabled={selected === null}
        onClick={() => onConfirm(selected)}
      >
        これで進む
      </button>
      <button type="button" className="secondary" onClick={() => onConfirm(null)}>
        {SKIP_CONFIRM_LABEL}
      </button>
    </div>
  );
}
