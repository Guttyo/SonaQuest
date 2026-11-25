// v2 の紹介動画（Issue #315）の6番と11番に、ソナの 3D パペットを大きく出す。
// 2026-11-25 オーナー決定（チャット）：three を video/ に足して動画の中で描く。大きく出して、話しているように動かす。
// ソナ自身の声は足さない。口も動かさない（2026-11-25 オーナー、v17 を見て、チャット：「ソナが僕の声で口パクパクしているの、なんか違和感あるな」。
// ナレーションはオーナーの声なので、ソナが話しているようには見せない）。ソナは聞き手として横に立ち、身ぶりだけをする。
// 姿勢は場面の頭からの秒数だけで決める（コマを順不同で描いても同じ絵になるように、前のコマから持ち越さない）。
import { useLayoutEffect, useRef, type FC } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MOUTH_REST, REST_GESTURE, idlePoseAt, mouthAt, speakingPoseAt, type GesturePose, type Pose } from "./sonaPose";
import { FPS, type Section } from "../sections";
import { createSonaScene, type SonaScene } from "./sonaScene";

/** 場面の中のソナの台本。時刻は場面の頭からの秒 */
export type SonaScript = {
  /** 出ている間（下からせり上がって出て、下へ下がって消える） */
  from: number;
  to: number;
  /** 描く正方形の1辺と、中心の横の位置（1920×1080 の中のピクセル）。下の縁は画面の下に少し沈める */
  size: number;
  centerX: number;
  /** 口を動かす間。ソナ自身の声を鳴らす場面のための口（今はどの場面も空。ナレーションには合わせない） */
  speak: Array<[number, number]>;
  /** 顔を横へ向ける間と量（ラジアン。負で画面の左） */
  look?: { from: number; to: number; turn: number };
  /** 片手を横へ差し出す間（画面の左の手） */
  point?: { from: number; to: number };
  /** 手を振る間（画面の右の手） */
  wave?: { from: number; to: number };
};

/**
 * 6番（お薬の避難訓練の紹介）：スマホの右に出て、見ている人のほうを向いて立つ（口は動かさない）。
 * 句の時刻は sectionsV2.ts の6番の覚え書き（足りないのは… 0.3〜2.45、ソナクエストは… 2.85〜6.1、お薬の避難訓練です 6.43〜7.93）。
 * 「お薬の避難訓練です」でスマホのほうを向いて手を差し出し、タップ（8.68 秒）で画面が寄る前に下がる
 */
const SONA_INTRO: SonaScript = {
  from: 0.4,
  to: 8.5,
  size: 760,
  centerX: 1560,
  speak: [],
  look: { from: 6.3, to: 8.2, turn: -0.5 },
  point: { from: 6.4, to: 8.2 },
};

/**
 * 11番（締め）：締めの文とロゴの左下に出て、ロゴが出る所（声の「ソナクエスト。」、場面の 5.35 秒）から手を振る。口は動かさない
 */
const SONA_CLOSING: SonaScript = {
  from: 0.5,
  to: 99,
  // 下のクレジット（画面の中央、左端は約 435）に掛からない大きさと位置
  size: 470,
  centerX: 210,
  speak: [],
  wave: { from: 5.3, to: 99 },
};

/** 場面の番号 → ソナの台本（v2 の11場面の番号） */
export const sonaScriptOf = (section: Section): SonaScript | null =>
  section.number === 6 ? SONA_INTRO : section.number === 11 ? SONA_CLOSING : null;

const smooth = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};
/** from で立ち上がり、to で下がる 0〜1 の重み（立ち上がり・下がりは edge 秒） */
const windowWeight = (t: number, from: number, to: number, edge: number) =>
  Math.min(smooth((t - from) / edge), smooth((to - t) / edge));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** 場面の頭からの秒数で、ソナの姿勢を決める */
export function sonaPoseAt(script: SonaScript, t: number): { pose: Pose; gesture: GesturePose } {
  const speaking = Math.max(0, ...script.speak.map(([from, to]) => windowWeight(t, from, to, 0.12)));
  const idle = idlePoseAt(t);
  const talk = speakingPoseAt(t);
  const look = script.look ? windowWeight(t, script.look.from, script.look.to, 0.35) : 0;
  const pose: Pose = {
    sway: mix(idle.sway, talk.sway, speaking),
    bob: mix(idle.bob, talk.bob, speaking),
    headTilt: mix(idle.headTilt, talk.headTilt, speaking),
    headNod: mix(idle.headNod, talk.headNod, speaking),
    // 待っている間の見回しは小さくして、見ている人のほうを向かせる
    headTurn: mix(mix(idle.headTurn * 0.3, talk.headTurn, speaking), script.look?.turn ?? 0, look),
    mouth: MOUTH_REST + (mouthAt(t) - MOUTH_REST) * speaking,
    lookUp: 0,
    eyeOpen: idle.eyeOpen,
  };
  const point = script.point ? windowWeight(t, script.point.from, script.point.to, 0.3) : 0;
  const wave = script.wave ? windowWeight(t, script.wave.from, script.wave.to, 0.3) : 0;
  const gesture: GesturePose = {
    ...REST_GESTURE,
    armLeft: 1.05 * point,
    // アプリの「手を振る」と同じ振り方（pose.ts の wave）
    armRight: wave * (2.0 + 0.35 * Math.sin(t * Math.PI * 2 * 1.6)),
  };
  return { pose, gesture };
}

const SonaCanvas: FC<{ script: SonaScript }> = ({ script }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SonaScene | null>(null);

  useLayoutEffect(() => {
    const scene = createSonaScene(script.size);
    scene.canvas.style.width = "100%";
    scene.canvas.style.height = "100%";
    hostRef.current?.appendChild(scene.canvas);
    sceneRef.current = scene;
    return () => {
      scene.canvas.remove();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [script.size]);

  // 上の effect の後に走るので、最初のコマでも描ける
  useLayoutEffect(() => {
    const { pose, gesture } = sonaPoseAt(script, t);
    sceneRef.current?.render(pose, gesture);
  }, [script, t]);

  // 下からせり上がって出て、下へ下がって消える（人形劇の舞台の縁から出る形）
  const shown = Math.min(
    interpolate(t, [script.from, script.from + 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(t, [script.to - 0.4, script.to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const rise = smooth(shown);
  return (
    <div
      ref={hostRef}
      style={{
        position: "absolute",
        left: script.centerX - script.size / 2,
        // 胴の下の切り口が見えないよう、枠の下を画面の外に沈める
        top: 1080 - script.size * 0.87 + (1 - rise) * script.size,
        width: script.size,
        height: script.size,
      }}
    />
  );
};

/** 場面に重ねるソナ。台本の無い場面と、出ていない間は何も描かない（描画の文脈を持たない） */
export const SonaOverlay: FC<{ section: Section }> = ({ section }) => {
  const frame = useCurrentFrame();
  const script = sonaScriptOf(section);
  if (script === null) return null;
  const t = frame / FPS;
  if (t < script.from || t > script.to) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <SonaCanvas script={script} />
    </AbsoluteFill>
  );
};
