// ボードの上部タブのキーボード操作（Issue #295）。role="tab" の並びとして、左右の矢印・Home・End で替える。
// 画面の部品から切り離した純粋な関数にして、DOM の無い試験で確かめる。

/**
 * 押したキーから、次に選ぶタブを返す。ArrowRight・ArrowLeft は端で折り返し、Home は先頭、End は最後。
 * ほかのキー（と、タブが無い・今のタブが並びに無いとき）は null
 */
export function nextBoardTab<T extends string>(tabs: readonly T[], current: T, key: string): T | null {
  const n = tabs.length;
  const i = tabs.indexOf(current);
  if (n === 0 || i < 0) return null;
  switch (key) {
    case "ArrowRight":
      return tabs[(i + 1) % n];
    case "ArrowLeft":
      return tabs[(i - 1 + n) % n];
    case "Home":
      return tabs[0];
    case "End":
      return tabs[n - 1];
    default:
      return null;
  }
}
