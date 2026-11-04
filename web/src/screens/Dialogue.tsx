import { useEffect, useState, type Dispatch } from "react";
import {
  ANSWER_HINTS,
  CONFIRM_PROMPT,
  EVENTS,
  SCENE_INTRO,
  SKIP_CONFIRM_LABEL,
  SOURCE_OPTIONS,
  WAITING_TEXT,
} from "../flow/content";
import { MAX_ANSWER_LENGTH, isAcceptableAnswer } from "../flow/rules";
import { currentQuestion, type TrainingAction, type TrainingState } from "../flow/training";
import type { SourceId } from "../flow/types";
import { SpeakerControls } from "../voice/SpeakerControls";
import { TalkButton } from "../voice/TalkButton";
import { usePushToTalk, useSpeakWhenChanged, useSpeaker } from "../voice/hooks";
import { appendRecognized, type MicStatus } from "../voice/talk";
import type { SpeakerSnapshot } from "../voice/speaker";
import { listenerSpeech, speechKey } from "../voice/speech";
import { listenerActivity } from "../voice/view";
import { ListenerStage, sceneNumber, type SceneId } from "./ListenerStage";
import { EVENT_FOCUS, LOST_BY_EVENT, SourceChip, SourceIcon } from "./SourceIcon";
import { ListenerLine, Transcript } from "./Transcript";
import { Puppet2DFace } from "./Puppet2D";

interface Props {
  state: TrainingState;
  dispatch: Dispatch<TrainingAction>;
}

/** 3D の対話モードのときだけ渡す、読み上げの様子と操作（ADR-0033） */
interface VoiceControls {
  speech: SpeakerSnapshot;
  stopSpeech: () => void;
  /** その回のうちに、マイクが使えないと分かった状態（拒否など）。次の質問でも文字入力だけにする */
  lostMic: MicStatus | null;
  onMicLost: (mic: MicStatus) => void;
}

/**
 * 対話の画面（Issue #46）。上に聞き取り係を固定し、やり取りは真ん中で上から下へ流れ、
 * 回答の欄は下に固定する。新しい発言は下に足され、App.tsx が画面のいちばん下へ送る
 */
export function Dialogue({ state, dispatch }: Props) {
  const { stage } = state;
  const question = currentQuestion(state);

  // 声を使うかは、はじめにの画面で 3D の対話モードを選んだか（state.mode、A-14）だけで決める。
  // 3D を描画できるか（WebGL・動きを減らす設定）では決めない（ADR-0033）
  const { mode } = state;
  const voiceOn = mode === "3d";
  const { speaker, snapshot: speech } = useSpeaker(voiceOn, state.session);
  const spoken = voiceOn ? listenerSpeech(state) : null;
  useSpeakWhenChanged(speaker, spoken, spoken === null ? null : speechKey(state, spoken));
  const [lostMic, setLostMic] = useState<{ session: number; mic: MicStatus } | null>(null);
  const [listening, setListening] = useState(false);
  // 回答・確認を受け取るたびに、係が1回うなずく
  const [nods, setNods] = useState(0);
  const voice: VoiceControls | null = voiceOn
    ? {
        speech,
        stopSpeech: () => speaker?.stop(),
        lostMic: lostMic?.session === state.session ? lostMic.mic : null,
        onMicLost: (mic) => setLostMic({ session: state.session, mic }),
      }
    : null;

  // 係の交代のあとは、別の係として見せる。状態はアプリの状態だけで決める（Claude の出力は使わない）
  const relief = state.event === "handover" && stage.name === "second";
  const activity = listenerActivity({ waiting: state.waiting, listening, speaking: speech.speaking });
  const scene: SceneId =
    stage.name === "event"
      ? "event"
      : stage.name === "second"
        ? "retell"
        : stage.name === "first" && state.answers.length === 0
          ? "arrive"
          : "tell";
  const answering = question !== null && !state.waiting;
  // 頼りにしているもの：③確認で本人が選んだものだけ（Claude の候補は初期選択に使うだけ）
  const chosen = state.source !== null && state.source !== "none" ? state.source : null;
  const lost = chosen !== null && state.event !== null && LOST_BY_EVENT[state.event].includes(chosen);

  return (
    <section className={stage.name === "event" ? "screen dialogue scene-event" : "screen dialogue"} aria-label="対話">
      <ListenerStage mode={mode} activity={activity} relief={relief} showState scene={scene} nodKey={nods}>
        {voiceOn && (
          <SpeakerControls
            snapshot={speech}
            onStop={() => speaker?.stop()}
            onReplay={() => speaker?.replay()}
          />
        )}
        {chosen !== null && <SourceChip source={chosen} lost={lost} />}
      </ListenerStage>

      <div className="dialogue-log">
        <p className="scene">{SCENE_INTRO}</p>
        <Transcript state={state} />

        {question !== null && state.waiting && <Thinking />}

        {answering && (
          // 聞き取り係の発言が変わるたびに、下から入る（key で作り直す）
          <div key={`${state.answers.length}-${state.prompt?.text ?? question.id}`} className="enter-up">
            <ListenerLine id="current-question">{state.prompt?.text ?? question.text}</ListenerLine>
          </div>
        )}

        {stage.name === "confirm" && (
          <ConfirmSource
            ack={state.closingAck}
            initial={state.sourceGuess}
            onConfirm={(source) => {
              setNods((n) => n + 1);
              dispatch({ type: "confirm", source });
            }}
          />
        )}

        {stage.name === "event" && state.event !== null && (
          <div className="event event-scene" role="alert" data-scroll-target tabIndex={-1}>
            <p className="event-kicker">{sceneNumber("event")}</p>
            <h2>想定外の出来事</h2>
            {EVENT_FOCUS[state.event] !== null && (
              <div className={`event-visual event-visual-${state.event}`} aria-hidden="true">
                <SourceIcon id={EVENT_FOCUS[state.event]!} className="source-icon event-icon" />
                <span className="event-slash" />
              </div>
            )}
            <p className="event-text">{EVENTS[state.event].text}</p>
            {EVENTS[state.event].unavailable !== null && (
              <p>
                <span className="label">使えなくなったもの：</span>
                {EVENTS[state.event].unavailable}
              </p>
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
      </div>

      {answering && (
        <AnswerForm
          // 聞き取り係の発言が変わったら下書きを消す
          key={state.answers.length}
          hint={ANSWER_HINTS[question.answerAs]}
          onSubmit={(text) => {
            setNods((n) => n + 1);
            dispatch({ type: "answer", text });
          }}
          onListeningChange={setListening}
          voice={voice}
        />
      )}
    </section>
  );
}

/**
 * 返事を待つ間の「考え中」（ADR-0030）。小さな顔が上を見て（止まった姿勢）、文の後ろに点が流れる。
 * 読み上げは文だけ（点は読まない）。動きを減らす設定では動きが止まり、文だけで示す（styles.css、ADR-0020）。
 * 3D の対話モードでは、上のパペットも考え中の様子になる（ListenerStage）
 */
function Thinking() {
  return (
    <div className="exchange-row thinking" role="status" data-scroll-target="end" tabIndex={-1}>
      <Puppet2DFace activity="thinking" />
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

/** 下に固定する回答の欄。質問文はやり取りの欄の最後（id="current-question"）にある */
function AnswerForm({
  hint,
  onSubmit,
  onListeningChange,
  voice,
}: {
  /** 誰のこととして答えるか（ADR-0022） */
  hint: string;
  onSubmit: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
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

  // マイクが開いている間は、上の聞き取り係を「聞いています」にする
  useEffect(() => {
    onListeningChange(talkState.listening);
  }, [talkState.listening, onListeningChange]);
  useEffect(() => () => onListeningChange(false), [onListeningChange]);

  return (
    <form
      className="answer-form dialogue-dock"
      data-scroll-target="end"
      tabIndex={-1}
      // 焦点が移ったときに、新しい質問文が読み上げられるように
      aria-labelledby="current-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(draft);
      }}
    >
      {voice !== null && (
        <TalkButton
          snapshot={talkState}
          inserted={inserted}
          onPress={() => talk?.press()}
          onRelease={() => talk?.release()}
        />
      )}
      <label className="visually-hidden" htmlFor="answer">
        あなたの回答
      </label>
      {/* 誰のこととして答えるかは、入力を始めても消えない位置に1か所だけ示す */}
      <p id="answer-hint" className="small answer-hint">
        {hint}
      </p>
      <div className="dock-row">
        <textarea
          id="answer"
          aria-describedby="current-question answer-hint"
          value={draft}
          maxLength={MAX_ANSWER_LENGTH}
          rows={2}
          onChange={(e) => {
            setDraft(e.target.value);
            setInserted(false);
          }}
        />
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
}: {
  /** 前半の最後の回答への受け止め（ADR-0029 の2） */
  ack: string | null;
  /** 初期選択の候補（Claude）。本人がタップで確かめてから進む（ADR-0016、項目6） */
  initial: SourceId | null;
  onConfirm: (source: SourceId | null) => void;
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
      {ack !== null && <ListenerLine>{ack}</ListenerLine>}
      <ListenerLine id="confirm-prompt">{CONFIRM_PROMPT}</ListenerLine>
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
