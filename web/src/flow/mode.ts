// 訓練の見せ方（モード）。2D は文字で答え、3D はパペットと音声で会話する（ADR-0031）。
// 訓練の中のモードは、はじめにの画面で選んで start で渡した TrainingState.mode で決まる（A-14、ADR-0036）。
// 声を使うかどうかは、そのモードだけで決める。3D を描画できるか（WebGL・動きを減らす設定）では決めない（ADR-0033）。

export type TrainingMode = "2d" | "3d";

/**
 * URL に `?mode=3d` を付けたときは、はじめにのモード選択の初期選択を 3D にする（予備）。それ以外は 2D。
 * 以前はこの値がそのまま訓練のモードだったが、今は初期選択にだけ使う。利用者はラジオで選び直せる
 */
export function modeFromSearch(search: string): TrainingMode {
  return new URLSearchParams(search).get("mode") === "3d" ? "3d" : "2d";
}

/** URL から読んだ初期選択。ブラウザの外（試験など）では 2D */
export function currentMode(): TrainingMode {
  if (typeof window === "undefined") return "2d";
  return modeFromSearch(window.location.search);
}
