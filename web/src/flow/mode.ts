// 訓練の見せ方（モード）。2D は文字で答え、3D はパペットと音声で会話する（ADR-0031）。
// 訓練の中のモードは、はじめにの画面で選んで start で渡した TrainingState.mode で決まる（A-14、ADR-0036）。
// 声を使うかどうかは、そのモードだけで決める。3D を描画できるか（WebGL・動きを減らす設定）では決めない（ADR-0033）。

export type TrainingMode = "2d" | "3d";

/**
 * URL に `?mode=3d` を付けたときは 3D、それ以外は 2D。
 * 以前はこの値がそのまま訓練のモードだったが、今は最初の表示の初期選択にだけ使う（introInitialMode）
 */
export function modeFromSearch(search: string): TrainingMode {
  return new URLSearchParams(search).get("mode") === "3d" ? "3d" : "2d";
}

/**
 * はじめにの1画面目の初期選択（Issue #83、ADR-0036 の追記3）。
 * ページを開いて最初の表示（session が 0）だけ、URL の `?mode=3d` を予備として読む。
 * 「はじめに戻る」で戻った後（restart で session が 1 以上）は、URL にかかわらず既定の 2D。利用者はカードで選び直す
 */
export function introInitialMode(search: string, session: number): TrainingMode {
  return session === 0 ? modeFromSearch(search) : "2d";
}

/** いまの URL から、はじめにの初期選択を決める。ブラウザの外（試験など）では 2D */
export function currentIntroMode(session: number): TrainingMode {
  if (typeof window === "undefined") return "2d";
  return introInitialMode(window.location.search, session);
}
