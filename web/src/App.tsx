import { useEffect, useReducer, useRef } from "react";
import { bgmStopsOn } from "./bgm/bgm";
import { BgmControls } from "./bgm/BgmControls";
import { getBgm, stopBgm, useBgmSnapshot } from "./bgm/browser";
import { requestTurn } from "./flow/api";
import { STOP_LABEL } from "./flow/content";
import { buildTurnRequest, initialState, trainingReducer } from "./flow/training";
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

  // 中断の画面（訓練をやめた・体調の訴え・自傷の案内）では BGM を止める（ADR-0011、ADR-0039）。
  // 終わりの画面でも止める（下書き。bgm.ts のマーカー）。振り返りでは鳴らし続ける
  useEffect(() => {
    if (bgmStopsOn(stage.name)) stopBgm();
  }, [stage.name]);

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
    : stage.name;
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
      <header className="app-header">
        <span className="app-title">お薬の避難訓練</span>
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
      <main ref={mainRef} tabIndex={-1} className="app-main">
        {stage.name === "intro" && (
          <Intro
            onStart={(mode) => {
              // 初期状態がオンのときだけ、始めるボタンを押したところで鳴らす（下書きはオフ）
              getBgm().startIfDefaultOn();
              dispatch({ type: "start", mode });
            }}
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
