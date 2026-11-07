import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FIRST_HALF_QUESTIONS, RECOVERY_QUESTION } from "../flow/content";
import { initialState, type TrainingState } from "../flow/training";
import type { Answer, Judgments, PrepActionId, TimingId } from "../flow/types";
import "../styles.css";
import { Done } from "./Done";
import { Review } from "./Review";

/**
 * 振り返りと終わりの画面の見本のページ（開発用。web/review-preview.html。ADR-0054）。
 * 判定の組み合わせ（弱い観点が1つ・多い・無い・判定できない）を切り替えて、先頭のまとめの長さと並びを確かめる。
 * 回答はすべて架空の見本の文で、Claude も Workers も使わない。本番のビルドには入らない
 */

const answer = (questionId: string, half: Answer["half"], text: string): Answer => ({
  questionId,
  half,
  text,
  prompt: `${questionId} の質問（見本）`,
  kind: "answer",
  recall: false,
});

const SAMPLE_ANSWERS: Answer[] = [
  ...FIRST_HALF_QUESTIONS.map((q, i) => answer(q.id, "first", `見本の回答・前半${i + 1}`)),
  answer(RECOVERY_QUESTION.id, "second", "見本の回答・立て直し"),
];

const J = (patch: Partial<Judgments>): Judgments => ({
  location: "confirmed",
  alternative: "confirmed",
  current: "confirmed",
  unrecorded: "confirmed",
  proxy: "confirmed",
  ...patch,
});

const SAMPLES: { id: string; label: string; ai: TrainingState["ai"]; judgments: Judgments }[] = [
  { id: "one", label: "弱い観点が1つ", ai: "on", judgments: J({ proxy: "aware_unconfirmed" }) },
  {
    id: "three",
    label: "弱い観点が3つ",
    ai: "on",
    judgments: J({ alternative: "not_mentioned", current: "aware_unconfirmed", proxy: "not_mentioned" }),
  },
  {
    id: "five",
    label: "全部「確認していない」",
    ai: "on",
    judgments: J({
      location: "not_mentioned",
      alternative: "not_mentioned",
      current: "not_mentioned",
      unrecorded: "not_mentioned",
      proxy: "not_mentioned",
    }),
  },
  { id: "all", label: "全部「確認できた」", ai: "on", judgments: J({}) },
  { id: "off", label: "Claude を使わない回", ai: "off", judgments: J({}) },
  { id: "failed", label: "途中で失敗した回", ai: "failed", judgments: J({ proxy: "not_mentioned" }) },
];

function Preview() {
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [mode, setMode] = useState<TrainingState["mode"]>("2d");
  // 「これに決める」で選んだ準備行動といつやるかを、終わりの画面にそのまま渡す
  const [screen, setScreen] = useState<
    { name: "review" } | { name: "done"; action: PrepActionId; timing: TimingId }
  >({ name: "review" });
  const sample = SAMPLES.find((s) => s.id === sampleId)!;
  const state: TrainingState = {
    ...initialState,
    mode,
    stage: { name: "review" },
    ai: sample.ai,
    closingAck: "教えてくださってありがとうございます。",
    source: "notebook",
    event: "notebook_home",
    judgments: sample.judgments,
    answers: SAMPLE_ANSWERS,
  };

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">振り返りの見本（開発用）</span>
      </header>
      <main className="app-main">
        <div className="notice" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label>
            見本：
            <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            モード：
            <select value={mode} onChange={(e) => setMode(e.target.value as TrainingState["mode"])}>
              <option value="2d">2D（読み上げなし）</option>
              <option value="3d">3D（読み上げあり）</option>
            </select>
          </label>
          <button type="button" className="secondary" onClick={() => setScreen({ name: "review" })}>
            振り返り
          </button>
        </div>
        {screen.name === "review" ? (
          <Review
            key={`${sampleId}-${mode}`}
            state={state}
            onChoose={(action, timing) => setScreen({ name: "done", action, timing })}
          />
        ) : (
          <Done
            action={screen.action}
            timing={screen.timing}
            judgments={sample.ai === "on" ? sample.judgments : null}
            event={state.event}
            onRestart={() => setScreen({ name: "review" })}
          />
        )}
      </main>
    </div>
  );
}

// 開発中の HMR でこのファイルが再び動いても root を作り直さない（createRoot の二重呼び出しの警告を出さない）
const container = document.getElementById("root")! as HTMLElement & { __previewRoot?: ReturnType<typeof createRoot> };
const root = (container.__previewRoot ??= createRoot(container));
root.render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
