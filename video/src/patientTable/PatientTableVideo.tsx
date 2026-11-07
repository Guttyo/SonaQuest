// ボードのデモの架空の患者 100 人を、表として見せる短い部品（Issue #261、SUB-01）。1920×1080・30fps・5秒。
// 行が1行ずつ画面の右の外から飛んできて、約2秒で上の 20 人の表ができ、残りの約3秒は止めて名前を読ませる。
// データは web/src/board/patients.ts から、既定の種（DEFAULT_ARRIVAL_SEED）の到着の順で読む（boardMap/ と同じ読み方）。
// 人物・氏名・年齢・服薬はすべて架空。氏名は北海道の地名から作った遊び心のある架空の名前（Issue #151）、お薬は data.ts の仮名の品目。
// けが・体調の列と、1日の量は出さない（アプリはけがの重さ・緊急度を判断しない。量は用法・用量に見えるため）。
// 本編（SonaQuestVideo・sections.ts）への組み込みは、本編の組み直しの Issue（#262）で行う。音は入れない。
import type { CSSProperties, FC } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DEFAULT_ARRIVAL_SEED, SIM_PATIENTS, arrivalPlan, simPatient, type SimPatient } from "../../../web/src/board/patients";
import { INK, RED } from "../boardMap/MapLayer";
import { GOTHIC } from "../boardMap/style";

export const PATIENT_TABLE_FPS = 30;
export const PATIENT_TABLE_WIDTH = 1920;
export const PATIENT_TABLE_HEIGHT = 1080;
/** 全体の長さ（5秒） */
export const PATIENT_TABLE_TOTAL_FRAMES = 150;

/** 表に出す人数（到着の順の先頭から） */
export const PATIENT_TABLE_ROWS = 20;
/** 1行目が飛び始めるフレーム */
const FIRST_ROW_FRAME = 6;
/** 行と行の飛び始めの間（フレーム）。20行で約1.6秒、最後の行が落ち着くまで含めて約2秒で表ができる */
const ROW_STAGGER = 2.5;
/** 表ができ終わるころ（最後の行の飛び始め＋落ち着くまで） */
const TABLE_DONE_FRAME = FIRST_ROW_FRAME + ROW_STAGGER * (PATIENT_TABLE_ROWS - 1) + 14;

/** 既定の種の到着の順で、先頭の人たち */
export function arrivalRows(count: number): SimPatient[] {
  return arrivalPlan(DEFAULT_ARRIVAL_SEED)
    .slice(0, count)
    .map((a) => simPatient(a.no))
    .filter((p): p is SimPatient => p !== undefined);
}

/** 使っているお薬（仮名の品目だけ。複数は「、」でつなぐ。量は出さない） */
export function medsText(p: SimPatient): string {
  return p.meds.map((m) => m.item).join("、");
}

const ROWS = arrivalRows(PATIENT_TABLE_ROWS);
const REST = SIM_PATIENTS.length - ROWS.length;

const ROW_H = 41;
/** 列の幅（名前・年齢・性別・使っているお薬） */
const COLS = ["560px", "170px", "170px", "1fr"] as const;
const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: COLS.join(" "),
  alignItems: "center",
  columnGap: 24,
  padding: "0 28px",
};

const FictionalBadge: FC = () => (
  <div
    style={{
      border: `4px solid ${RED}`,
      color: RED,
      borderRadius: 12,
      padding: "8px 22px",
      fontSize: 34,
      fontWeight: 800,
      letterSpacing: "0.08em",
      backgroundColor: "#ffffff",
      whiteSpace: "nowrap",
    }}
  >
    架空データ
  </div>
);

const Row: FC<{ p: SimPatient; index: number }> = ({ p, index }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = spring({
    frame: frame - (FIRST_ROW_FRAME + index * ROW_STAGGER),
    fps,
    config: { damping: 18, stiffness: 170, mass: 0.7 },
  });
  // 画面の右の外から飛んでくる（少し傾いて入り、まっすぐに落ち着く）
  const x = interpolate(t, [0, 1], [width, 0]);
  const tilt = interpolate(t, [0, 1], [4, 0]);
  const opacity = interpolate(t, [0, 0.25], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        ...GRID,
        height: ROW_H,
        fontSize: 28,
        color: INK,
        backgroundColor: index % 2 === 0 ? "#ffffff" : "#f3f4f6",
        borderBottom: "1px solid #d9dce1",
        transform: `translateX(${x}px) rotate(${tilt}deg)`,
        transformOrigin: "left center",
        opacity,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</div>
      <div style={{ fontVariantNumeric: "tabular-nums" }}>{p.age}歳</div>
      <div>{p.sex}</div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{medsText(p)}</div>
    </div>
  );
};

export const PatientTableVideo: FC = () => {
  const frame = useCurrentFrame();
  const headIn = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const restIn = interpolate(frame, [TABLE_DONE_FRAME - 4, TABLE_DONE_FRAME + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff", fontFamily: GOTHIC, color: INK, padding: "30px 96px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", opacity: headIn, height: 112 }}>
        <div>
          <div style={{ fontSize: 46, fontWeight: 800 }}>救護所に到着する架空の患者 {SIM_PATIENTS.length} 人</div>
          <div style={{ fontSize: 24, marginTop: 8, color: "#4b5563" }}>
            氏名は北海道の地名から作った架空の名前、お薬は仮名の品目です。実在の人・薬とは関係ありません。
          </div>
        </div>
        <FictionalBadge />
      </div>
      <div
        style={{
          ...GRID,
          height: 50,
          fontSize: 26,
          fontWeight: 800,
          borderTop: `3px solid ${INK}`,
          borderBottom: `3px solid ${INK}`,
          opacity: headIn,
        }}
      >
        <div>名前</div>
        <div>年齢</div>
        <div>性別</div>
        <div>使っているお薬</div>
      </div>
      <div style={{ position: "relative" }}>
        {ROWS.map((p, i) => (
          <Row key={p.no} p={p} index={i} />
        ))}
      </div>
      <div style={{ fontSize: 26, marginTop: 12, color: "#4b5563", opacity: restIn, paddingLeft: 28 }}>
        …ほか {REST} 人（到着の順。並びは種 {DEFAULT_ARRIVAL_SEED} で決まる）
      </div>
    </AbsoluteFill>
  );
};
