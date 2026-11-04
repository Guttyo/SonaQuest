// 訓練の見せ方（モード）。2D は文字で答え、3D はパペットと音声で会話する（ADR-0031）。
// 声を使うかどうかは、このモードだけで決める。3D を描画できるか（WebGL・動きを減らす設定）では決めない（ADR-0033）。

export type TrainingMode = "2d" | "3d";

/**
 * 仮の作り：URL に `?mode=3d` を付けたときだけ 3D の対話モードにする。それ以外は 2D。
 * モード選択の画面（A-14、Issue #51）ができたら、そこで選んだ値に置き換える。
 */
export function modeFromSearch(search: string): TrainingMode {
  return new URLSearchParams(search).get("mode") === "3d" ? "3d" : "2d";
}

/** いまのモード。ブラウザの外（試験など）では 2D */
export function currentMode(): TrainingMode {
  if (typeof window === "undefined") return "2d";
  return modeFromSearch(window.location.search);
}
