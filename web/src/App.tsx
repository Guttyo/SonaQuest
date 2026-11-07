import { useEffect, useReducer, useRef, useState } from "react";
import { bgmLocksOn, bgmStopsOn } from "./bgm/bgm";
import { BgmControls } from "./bgm/BgmControls";
import { getBgm, lockBgm, stopBgm, useBgmSnapshot } from "./bgm/browser";
import { requestTurn } from "./flow/api";
import { STOP_LABEL } from "./flow/content";
import { currentIntroMode } from "./flow/mode";
import { buildTurnRequest, initialState, trainingReducer } from "./flow/training";
import { boardStartFrom } from "./board/url";
import { Board } from "./screens/Board";
import { Dialogue } from "./screens/Dialogue";
import { Done } from "./screens/Done";
import { Intro } from "./screens/Intro";
import { Review } from "./screens/Review";
import { Stopped } from "./screens/Stopped";

export function App() {
  // 状態はメモリにだけ持つ。localStorage等には保存しない（ADR-0007）
  const [state, dispatch] = useReducer(trainingReducer, initialState);
  const { stage } = state;
  const mainRef = useRef<HTMLElement>(null);
  const bgm = useBgmSnapshot();
  // 地域本部のボード（試作。Issue #97）は訓練の流れの外の画面。はじめにの画面からだけ入り、戻る。
  // 訓練の状態（reducer）には持たせず、はじめに以外の段階では出さない。メモリにだけ持つ
  // 最初の表示だけ URL の ?view=board・?view=intake&site=A を読む（画面の確認・撮影のため。?mode=3d と同じ扱いで、保存しない。Issue #101、#114）
  const [start] = useState(() => boardStartFrom(typeof window !== "undefined" ? window.location.search : ""));
  const [view, setView] = useState<"training" | "board">(start.view);
  // カルテ入力の専用画面で開くのは最初の1回だけ（はじめにへ戻ってから開き直したら、ボードの本部から）
  const [intakeStart, setIntakeStart] = useState(start.intakeSite);
  const onBoard = stage.name === "intro" && view === "board";

  // 中断の画面（訓練をやめた・体調の訴え・自傷の案内）では BGM を止める（ADR-0011、ADR-0039）。
  // 振り返りでは鳴らし続け、終わりの画面ではゆっくり止めて、その画面では鳴らし直せないようにする
  // （2026-11-05 オーナー決定「振り返りで鳴らし終わりで止める」）。終わりの画面を離れたら、また押せば鳴らせる
  useEffect(() => {
    if (bgmLocksOn(stage.name)) {
      lockBgm(true);
      return;
    }
    lockBgm(false);
    if (bgmStopsOn(stage.name)) stopBgm();
  }, [stage.name]);

  // BGM はお薬の避難訓練の画面だけ（2026-11-05 オーナー決定、Issue #113）。はじめにで鳴らしてからボードへ移ったら止める。
  // 訓練の画面の BGM の動き（上の effect）は変えない。はじめにへ戻ったら、また押せば鳴らせる
  useEffect(() => {
    if (onBoard) stopBgm();
  }, [onBoard]);

  // 回答を受け取ったら Claude に1回だけ聞く（開発中の StrictMode で effect が2回動いても送り直さない）。
  // やめた・やり直した後に届いた返事は、reducer が回と件数を見て捨てる
  const { session, waiting } = state;
  const seq = state.answers.length;
  const sent = useRef("");
  useEffect(() => {
    if (!waiting) return;
    const key = `${session}:${seq}`;
    if (sent.current === key) return;
    const request = buildTurnRequest(state);
    if (request === null) return;
    sent.current = key;
    void requestTurn(request).then((result) =>
      dispatch({ type: "turn_result", session, seq, result }),
    );
  }, [state, session, seq, waiting]);

  // 場面が変わったら、いま答える箇所（質問・確認・出来事）へ焦点を移して見せる。
  // そうした箇所のない画面（はじめに・ふりかえり等）は本文の先頭へ移す
  // 聞き返し・質問し直しでは段階が同じまま発言が変わるので、回答の件数と待ち状態も見る
  const stageKey = stage.name === "first" || stage.name === "second"
    ? `${stage.name}-${stage.index}-${state.answers.length}-${state.waiting}`
    : `${stage.name}-${view}`;
  useEffect(() => {
    const main = mainRef.current;
    if (main === null) return;
    const target = main.querySelector<HTMLElement>("[data-scroll-target]");
    if (target !== null) {
      target.focus({ preventScroll: true });
      // 対話の画面の回答の欄と「考え中」は、新しい発言が下に足されるので、画面のいちばん下へ送る（Issue #46）
      if (target.dataset.scrollTarget === "end") {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else {
        target.scrollIntoView({ block: "start" });
      }
    } else {
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [stageKey]);

  return (
    <div className="app">
      {/* ボード（とカルテ入力の画面）は訓練ではないので、訓練の題の帯・BGM の操作・「訓練をやめる」を出さない
          （戻るボタンはボードの中。Issue #113、2026-11-05 オーナー決定） */}
      {!onBoard && (
        <header className="app-header">
          {/* 帯は「お薬の避難訓練」。はじめにの題がロゴ（SonaQuest）になったので、帯は何の訓練かを示す
              （Issue #263、2026-11-08 オーナー、チャット。Issue #190 の「帯はアプリの名前」を替えた。ADR-0066 の追記） */}
          {/* 狭い幅で2行になるときは「お薬の／避難訓練」で分ける（語の途中で折り返さない） */}
          <span className="app-title">
            <span className="app-title-part">お薬の</span>
            <span className="app-title-part">避難訓練</span>
          </span>
          {/* BGM の操作はヘッダーの決まった1か所。中断の画面では出さない（B-03） */}
          {stage.name !== "stopped" && (
            <BgmControls
              snapshot={bgm}
              onToggle={() => getBgm().toggle()}
              onVolume={(volume) => getBgm().setVolume(volume)}
            />
          )}
          {stage.name !== "stopped" && (
            <button
              type="button"
              className="stop-button"
              onClick={() => dispatch({ type: "stop" })}
            >
              {STOP_LABEL}
            </button>
          )}
        </header>
      )}
      <main ref={mainRef} tabIndex={-1} className="app-main">
        {onBoard && (
          <Board
            onBack={() => {
              setIntakeStart(null);
              setView("training");
            }}
            initialSite={intakeStart ?? undefined}
            initialIntake={intakeStart !== null}
          />
        )}
        {stage.name === "intro" && !onBoard && (
          <Intro
            initialMode={currentIntroMode(state.session)}
            onStart={(mode) => {
              // 初期状態がオンのときだけ、始めるボタンを押したところで鳴らす（下書きはオフ）
              getBgm().startIfDefaultOn();
              dispatch({ type: "start", mode });
            }}
            onOpenBoard={() => setView("board")}
          />
        )}
        {(stage.name === "first" ||
          stage.name === "confirm" ||
          stage.name === "event" ||
          stage.name === "second") && (
          <Dialogue state={state} dispatch={dispatch} />
        )}
        {stage.name === "review" && (
          <Review
            state={state}
            onChoose={(action, timing) =>
              dispatch({ type: "choose_prep", action, timing })
            }
          />
        )}
        {stage.name === "done" && (
          <Done
            action={stage.action}
            timing={stage.timing}
            judgments={state.ai === "on" ? state.judgments : null}
            event={state.event}
            onRestart={() => dispatch({ type: "restart" })}
          />
        )}
        {stage.name === "stopped" && (
          <Stopped
            reason={stage.reason}
            onRestart={() => dispatch({ type: "restart" })}
          />
        )}
      </main>
    </div>
  );
}
