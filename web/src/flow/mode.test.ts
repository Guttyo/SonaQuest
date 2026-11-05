import { describe, expect, it } from "vitest";
import { currentIntroMode, introInitialMode } from "./mode";
import { initialState, trainingReducer, type TrainingAction, type TrainingState } from "./training";

function run(actions: TrainingAction[], from: TrainingState = { ...initialState, ai: "off" }): TrainingState {
  return actions.reduce(trainingReducer, from);
}

describe("はじめにの初期選択（Issue #83、ADR-0036 の追記3）", () => {
  it("最初の表示（session 0）だけ、URL の ?mode=3d で 3D が初期選択になる", () => {
    expect(introInitialMode("?mode=3d", 0)).toBe("3d");
    expect(introInitialMode("", 0)).toBe("2d");
    expect(introInitialMode("?mode=2d", 0)).toBe("2d");
  });

  it("はじめに戻った後（session 1 以上）は、URL にかかわらず既定の 2D", () => {
    expect(introInitialMode("?mode=3d", 1)).toBe("2d");
    expect(introInitialMode("?mode=3d", 5)).toBe("2d");
    expect(introInitialMode("", 1)).toBe("2d");
  });

  it("3D で始めて「訓練をやめる」→「はじめに戻る」と、state も初期選択も 2D に戻る（?mode=3d 付き・無しとも）", () => {
    const back = run([{ type: "start", mode: "3d" }, { type: "stop" }, { type: "restart" }]);
    expect(back.stage.name).toBe("intro");
    expect(back.mode).toBe("2d");
    expect(back.session).toBe(1);
    expect(introInitialMode("?mode=3d", back.session)).toBe("2d");
    expect(introInitialMode("", back.session)).toBe("2d");
  });

  it("訓練を最後まで終えずに、はじめにの画面から「訓練をやめる」→「はじめに戻る」でも 2D", () => {
    const back = run([{ type: "stop" }, { type: "restart" }]);
    expect(back.stage.name).toBe("intro");
    expect(introInitialMode("?mode=3d", back.session)).toBe("2d");
  });

  it("開いたばかりの状態では、URL の指定どおり", () => {
    expect(introInitialMode("?mode=3d", initialState.session)).toBe("3d");
    expect(introInitialMode("", initialState.session)).toBe("2d");
  });

  it("ブラウザの外では 2D", () => {
    expect(currentIntroMode(0)).toBe("2d");
    expect(currentIntroMode(1)).toBe("2d");
  });
});
