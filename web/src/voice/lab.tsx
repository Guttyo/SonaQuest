import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ALL_QUESTIONS, CONFIRM_PROMPT, EVENTS, RECALL_NOW, WAITING_TEXT } from "../flow/content";
import "../styles.css";

/**
 * 読み上げの聞き比べ（開発用。web/tts-lab.html）。/api/dev/tts を使う（worker/ttsLab.ts）。
 * 設定（モデル・速さ・抑揚・読みの補正・声）を列に、文を行に並べ、押すと鳴らす。
 * 一度作った音声は、このページを開いている間だけメモリに置き、同じ組み合わせをもう一度押しても呼び直さない（料金を抑える）。
 * 保存しない。手で入れる文に、実際の服薬情報を入れない。
 */

type Model = "eleven_flash_v2_5" | "eleven_multilingual_v2" | "eleven_v3" | "eleven_v4" | "eleven_v4_turbo";

interface Variant {
  name: string;
  model: Model;
  speed: number;
  stability: number;
  style: number;
  normalize: boolean;
  voice: "main" | "b";
}

const MODELS: Model[] = ["eleven_flash_v2_5", "eleven_multilingual_v2", "eleven_v3", "eleven_v4", "eleven_v4_turbo"];

const INITIAL: Variant[] = [
  // A は本番の /api/tts と同じ（worker/tts.ts。ADR-0045）
  { name: "A：今の設定（v4 turbo）", model: "eleven_v4_turbo", speed: 1, stability: 0.65, style: 0, normalize: false, voice: "main" },
  { name: "B：以前の設定（Flash v2.5）", model: "eleven_flash_v2_5", speed: 1, stability: 0.5, style: 0, normalize: false, voice: "main" },
  { name: "C：Flash＋読みの補正", model: "eleven_flash_v2_5", speed: 1, stability: 0.5, style: 0, normalize: true, voice: "main" },
  { name: "D：Multilingual v2", model: "eleven_multilingual_v2", speed: 0.95, stability: 0.5, style: 0, normalize: false, voice: "main" },
];

/** 聞き比べる文。アプリで実際に読み上げる固定文と、Claude が作る文の形に近い見本 */
const SENTENCES: { label: string; text: string }[] = [
  ...ALL_QUESTIONS.map((q, i) => ({ label: `質問${i + 1}`, text: q.text })),
  { label: "受け止め（見本）", text: "教えてくださってありがとうございます。ゆっくりで大丈夫です。" },
  { label: "思い出せないとき", text: RECALL_NOW },
  { label: "③確認", text: CONFIRM_PROMPT },
  ...Object.entries(EVENTS).map(([id, e]) => ({ label: `出来事：${id}`, text: e.text })),
  { label: "考え中", text: WAITING_TEXT },
];

interface Cell {
  state: "idle" | "loading" | "ready" | "error";
  url?: string;
  ms?: number;
  upstreamMs?: number;
  error?: string;
}

function variantKey(v: Variant): string {
  return JSON.stringify([v.model, v.speed, v.stability, v.style, v.normalize, v.voice]);
}

function Lab() {
  const [variants, setVariants] = useState<Variant[]>(INITIAL);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [custom, setCustom] = useState("");
  const [rows, setRows] = useState(SENTENCES);
  const [status, setStatus] = useState<"checking" | "ok" | "off">("checking");
  const [voiceB, setVoiceB] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/dev/tts")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const info = (await r.json()) as { voiceB: boolean };
        setVoiceB(info.voiceB);
        setStatus("ok");
      })
      .catch(() => setStatus("off"));
  }, []);

  // 最後に押したセル。前に押したセルの音声が後から届いても、自動では鳴らさない（重ならないように。PR #111 のレビュー）
  const latest = useRef<string | null>(null);
  const start = (url: string) => {
    audio.current?.pause();
    audio.current = new Audio(url);
    void audio.current.play();
  };

  const play = async (v: Variant, text: string) => {
    const key = `${variantKey(v)}|${text}`;
    latest.current = key;
    audio.current?.pause();
    const cached = cells[key];
    if (cached?.state === "ready" && cached.url !== undefined) {
      start(cached.url);
      return;
    }
    if (cached?.state === "loading") return;
    setCells((c) => ({ ...c, [key]: { state: "loading" } }));
    const started = performance.now();
    try {
      const r = await fetch("/api/dev/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model: v.model,
          speed: v.speed,
          stability: v.stability,
          style: v.style,
          normalize: v.normalize,
          voice: v.voice,
        }),
      });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string; status?: number; code?: string };
        throw new Error([e.error, e.status, e.code].filter((x) => x !== undefined && x !== "").join(" "));
      }
      const blob = await r.blob();
      const ms = Math.round(performance.now() - started);
      const upstreamMs = Number(r.headers.get("x-dev-upstream-ms") ?? NaN);
      const url = URL.createObjectURL(blob);
      setCells((c) => ({ ...c, [key]: { state: "ready", url, ms, upstreamMs } }));
      if (latest.current === key) start(url);
    } catch (e) {
      setCells((c) => ({ ...c, [key]: { state: "error", error: e instanceof Error ? e.message : "error" } }));
    }
  };

  const update = (i: number, patch: Partial<Variant>) =>
    setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <main style={{ padding: 16, maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>読み上げの聞き比べ（開発用）</h1>
      <p className="small">
        Workers を <code>npm --prefix web run dev:worker:lab</code> で動かしているときだけ使えます。押すと ElevenLabs
        を呼び、1回ごとに料金がかかります。同じ組み合わせは、このページを開いている間だけ覚えていて、呼び直しません。
        手で入れる文に、実際の服薬情報を入れないでください。
      </p>
      {status === "off" && (
        <p role="alert" style={{ color: "#a33", fontWeight: 700 }}>
          /api/dev/tts が使えません。Workers を dev:worker:lab で動かしてください。
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={th}>文</th>
              {variants.map((v, i) => (
                <th key={i} style={{ ...th, minWidth: 190 }}>
                  <input value={v.name} onChange={(e) => update(i, { name: e.target.value })} style={{ width: "100%", fontWeight: 700 }} />
                  <label style={lbl}>
                    モデル
                    <select value={v.model} onChange={(e) => update(i, { model: e.target.value as Model })}>
                      {MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Slider label="速さ" value={v.speed} min={0.7} max={1.2} onChange={(speed) => update(i, { speed })} />
                  <Slider label="stability（高いほど単調）" value={v.stability} min={0} max={1} onChange={(stability) => update(i, { stability })} />
                  <Slider label="style" value={v.style} min={0} max={1} onChange={(style) => update(i, { style })} />
                  <label style={lbl}>
                    <input type="checkbox" checked={v.normalize} onChange={(e) => update(i, { normalize: e.target.checked })} />
                    日本語の読みの補正
                  </label>
                  <label style={lbl}>
                    声
                    <select value={v.voice} onChange={(e) => update(i, { voice: e.target.value as "main" | "b" })}>
                      <option value="main">今の声</option>
                      <option value="b" disabled={!voiceB}>
                        比べる声{voiceB ? "" : "（未設定）"}
                      </option>
                    </select>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td style={{ ...td, maxWidth: 360 }}>
                  <strong>{row.label}</strong>
                  <div className="small">{row.text}</div>
                </td>
                {variants.map((v, i) => {
                  const cell = cells[`${variantKey(v)}|${row.text}`];
                  return (
                    <td key={i} style={{ ...td, textAlign: "center" }}>
                      <button type="button" disabled={status !== "ok" || cell?.state === "loading"} onClick={() => void play(v, row.text)}>
                        {cell?.state === "loading" ? "作っています…" : cell?.state === "ready" ? "▶ もう一度" : "▶ 鳴らす"}
                      </button>
                      {cell?.state === "ready" && (
                        <div className="small">
                          {cell.ms} ms（事業者 {Number.isNaN(cell.upstreamMs) ? "?" : cell.upstreamMs} ms）
                        </div>
                      )}
                      {cell?.state === "error" && <div className="small" style={{ color: "#a33" }}>{cell.error}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        style={{ marginTop: 16, display: "flex", gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          const text = custom.trim();
          if (text === "") return;
          setRows((rs) => [...rs, { label: "手で入れた文", text }]);
          setCustom("");
        }}
      >
        <input
          value={custom}
          maxLength={500}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="読みが気になる語や文（架空の内容で）"
          style={{ flex: 1 }}
        />
        <button type="submit">行に足す</button>
      </form>
    </main>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={lbl}>
      {label}：{value.toFixed(2)}
      <input type="range" min={min} max={max} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const th: React.CSSProperties = { border: "1px solid #ccc", padding: 8, verticalAlign: "top", textAlign: "left", background: "#f6f3ec" };
const td: React.CSSProperties = { border: "1px solid #ddd", padding: 8, verticalAlign: "top" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", fontWeight: 400, fontSize: 12, marginTop: 6 };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
