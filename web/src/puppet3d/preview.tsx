import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ListenerStage } from "../screens/ListenerStage";
import "../styles.css";
import { ACTIVITY_LABELS, type ListenerActivity, type ListenerMode } from "./types";

/**
 * ソナの見本のページ（開発用。web/puppet-preview.html。ADR-0032）。
 * 状態・係の交代・見せ方を切り替えて、形と 2D への戻りを確かめる。実際の会話は使わない。
 * 対話の画面と同じ ListenerStage で描く（場面は「普段の薬を伝える」に固定。Issue #299）。
 * ?webgl=off で WebGL が使えない場合を、?motion=reduce で動きを減らす設定を、まねて確かめる。
 * まねるための置き換えはこのページの中だけで、アプリの画面には入れない。
 */

const params = new URLSearchParams(window.location.search);

if (params.get("webgl") === "off") {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    kind: string,
    ...rest: unknown[]
  ) {
    if (kind.startsWith("webgl")) return null;
    return (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
}

if (params.get("motion") === "reduce") {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    const result = original(query);
    if (!query.includes("prefers-reduced-motion")) return result;
    return { ...result, matches: true, addEventListener() {}, removeEventListener() {} } as MediaQueryList;
  };
}

const ACTIVITIES: ListenerActivity[] = ["idle", "listening", "speaking", "thinking"];
const SAMPLE_TEXT = "これは見本の文です。実際の訓練の質問ではありません。";

function Preview() {
  const [mode, setMode] = useState<ListenerMode>("3d");
  const [activity, setActivity] = useState<ListenerActivity>("idle");
  const [relief, setRelief] = useState(false);
  const [shown, setShown] = useState(true);
  const [canvasCount, setCanvasCount] = useState(0);

  // 中断の画面に移ったときと同じく、ソナを外したら描画の領域が消えるかを数える
  useEffect(() => {
    const count = () => setCanvasCount(document.querySelectorAll("canvas").length);
    count();
    const observer = new MutationObserver(count);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">ソナの見本（開発用）</span>
      </header>
      <main className="app-main">
        <section className="screen" aria-label="見本">
          {shown ? (
            <ListenerStage mode={mode} activity={activity} relief={relief} showState scene="tell">
              <p>{SAMPLE_TEXT}</p>
            </ListenerStage>
          ) : (
            <p className="small">ソナを外しました（中断の画面に移ったときと同じ）。</p>
          )}

          <fieldset className="options">
            <legend>見せ方</legend>
            {(["2d", "3d"] as const).map((m) => (
              <label key={m} className="option">
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                <span className="option-text">{m.toUpperCase()}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="options">
            <legend>状態</legend>
            {ACTIVITIES.map((a) => (
              <label key={a} className="option">
                <input
                  type="radio"
                  name="activity"
                  checked={activity === a}
                  onChange={() => setActivity(a)}
                />
                <span className="option-text">{ACTIVITY_LABELS[a]}</span>
              </label>
            ))}
          </fieldset>

          <label className="option">
            <input type="checkbox" checked={relief} onChange={(e) => setRelief(e.target.checked)} />
            <span className="option-text">係の交代（別の色）</span>
          </label>

          <div className="form-row">
            <button type="button" className="primary" onClick={() => setShown((v) => !v)}>
              {shown ? "ソナを外す" : "ソナを戻す"}
            </button>
          </div>

          <p className="small" id="preview-status">
            描画の領域（canvas）：{canvasCount} 個。WebGL：{params.get("webgl") === "off" ? "使えないことにしている" : "そのまま"}。
            動きを減らす設定：{params.get("motion") === "reduce" ? "オンにしている" : "ブラウザの設定のまま"}。
          </p>
          <p className="small">
            <a href="?">そのまま</a>／<a href="?webgl=off">WebGL を使えないことにする</a>／
            <a href="?motion=reduce">動きを減らす設定にする</a>
          </p>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
