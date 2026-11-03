import { useEffect, useReducer, useRef } from "react";
import { STOP_LABEL } from "./flow/content";
import { initialState, trainingReducer } from "./flow/training";
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

  // 場面が変わったら、いま答える箇所（質問・確認・出来事）へ焦点を移して見せる。
  // そうした箇所のない画面（はじめに・ふりかえり等）は本文の先頭へ移す
  const stageKey = stage.name === "first" || stage.name === "second"
    ? `${stage.name}-${stage.index}`
    : stage.name;
  useEffect(() => {
    const main = mainRef.current;
    if (main === null) return;
    const target = main.querySelector<HTMLElement>("[data-scroll-target]");
    if (target !== null) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    } else {
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [stageKey]);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">お薬の避難訓練</span>
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
          <Intro onStart={() => dispatch({ type: "start" })} />
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
