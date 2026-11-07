import { describe, expect, it } from "vitest";
import { currentIntroMode, introInitialMode } from "./mode";
import { initialState, trainingReducer, type TrainingAction, type TrainingState } from "./training";

function run(actions: TrainingAction[], from: TrainingState = { ...initialState, ai: "off" }): TrainingState {
  return actions.reduce(trainingReducer, from);
}

describe("はじめにの初期選択（Issue #83・#240、ADR-0036 の追記3・追記5）", () => {
  it("最初の表示（session 0）だけ、URL の ?mode=3d で 3D が初期選択になる。それ以外は選んでいない状態", () => {
    expect(introInitialMode("?mode=3d", 0)).toBe("3d");
    expect(introInitialMode("", 0)).toBeNull();
    expect(introInitialMode("?mode=2d", 0)).toBeNull();
  });

  it("はじめに戻った後（session 1 以上）は、URL にかかわらず選んでいない状態", () => {
    expect(introInitialMode("?mode=3d", 1)).toBeNull();
    expect(introInitialMode("?mode=3d", 5)).toBeNull();
    expect(introInitialMode("", 1)).toBeNull();
  });

  it("3D で始めて「訓練をやめる」→「はじめに戻る」と、state は 2D、初期選択は選んでいない状態に戻る（?mode=3d 付き・無しとも）", () => {
    const back = run([{ type: "start", mode: "3d" }, { type: "stop" }, { type: "restart" }]);
    expect(back.stage.name).toBe("intro");
    expect(back.mode).toBe("2d");
    expect(back.session).toBe(1);
    expect(introInitialMode("?mode=3d", back.session)).toBeNull();
    expect(introInitialMode("", back.session)).toBeNull();
  });

  it("訓練を最後まで終えずに、はじめにの画面から「訓練をやめる」→「はじめに戻る」でも選んでいない状態", () => {
    const back = run([{ type: "stop" }, { type: "restart" }]);
    expect(back.stage.name).toBe("intro");
    expect(introInitialMode("?mode=3d", back.session)).toBeNull();
  });

  it("開いたばかりの状態では、URL の指定どおり", () => {
    expect(introInitialMode("?mode=3d", initialState.session)).toBe("3d");
    expect(introInitialMode("", initialState.session)).toBeNull();
  });

  it("ブラウザの外では選んでいない状態", () => {
    expect(currentIntroMode(0)).toBeNull();
    expect(currentIntroMode(1)).toBeNull();
  });
});
