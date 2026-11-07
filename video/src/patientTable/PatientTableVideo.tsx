// ボードのデモの架空の患者 100 人を、表として見せる短い部品（Issue #261、SUB-01）。1920×1080・30fps・5秒。
// 行が1行ずつ画面の右の外から飛んできて、約2秒で 20 人の表ができ、残りの約3秒は止めて名前を読ませる。
// 見せる 20 人は、名前の遊び心が伝わる人を選んで並べる（2026-11-08 オーナー、チャット：「動画で見せる20人を選んで」）。
// 19 人は web/src/board/patients.ts の 100 人から名前で引き（boardMap/ と同じ読み方）、年齢・性別・お薬もそこから出す。
// 「北海 シマ海老蔵」だけは動画だけの架空の人（2026-11-08 オーナー、チャット：「北海シマ海老蔵にしよう」）。アプリの 100 人には入っていない。
// 「石狩 鮭次郎」は、名簿の「石狩 鮭太郎」を動画でだけ名前を替えて出す（石狩市の公認キャラクター「さけ太郎」を思わせるため。
// 2026-11-08 オーナー、チャット：「太郎がだめなら次郎に」）。年齢・性別・お薬は名簿の「石狩 鮭太郎」のまま。
// 人物・氏名・年齢・服薬はすべて架空。氏名は北海道の地名から作った遊び心のある架空の名前（Issue #151）、お薬は data.ts の仮名の品目。
// けが・体調の列と、1日の量は出さない（アプリはけがの重さ・緊急度を判断しない。量は用法・用量に見えるため）。
// 本編（SonaQuestVideo・sections.ts）への組み込みは、本編の組み直しの Issue（#262）で行う。音は入れない。
import type { CSSProperties, FC } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SIM_PATIENTS, type SimPatient } from "../../../web/src/board/patients";
import { INK, RED } from "../boardMap/MapLayer";
import { GOTHIC } from "../boardMap/style";

export const PATIENT_TABLE_FPS = 30;
export const PATIENT_TABLE_WIDTH = 1920;
export const PATIENT_TABLE_HEIGHT = 1080;
/** 全体の長さ（5秒） */
export const PATIENT_TABLE_TOTAL_FRAMES = 150;

/** 1行目が飛び始めるフレーム */
const FIRST_ROW_FRAME = 6;
/** 行と行の飛び始めの間（フレーム）。20行で約1.6秒、最後の行が落ち着くまで含めて約2秒で表ができる */
const ROW_STAGGER = 2.5;

/** 動画だけの架空の人（アプリの 100 人には入っていない。年齢・お薬は動画のための架空の値） */
const VIDEO_ONLY: SimPatient = { no: 0, name: "北海 シマ海老蔵", sex: "男性", age: 58, meds: [{ item: "降圧薬A", perDay: 1 }], condition: "なし" };

/** 動画でだけ名前を替える人（動画に出す名前 → web/src/board/patients.ts の名前） */
const VIDEO_RENAMES: Readonly<Record<string, string>> = { "石狩 鮭次郎": "石狩 鮭太郎" };

/** 見せる順の名前（「北海 シマ海老蔵」と VIDEO_RENAMES のほかは、web/src/board/patients.ts の 100 人の名前と同じ字） */
export const PICKED_NAMES: readonly string[] = [
  "北海 太郎",
  VIDEO_ONLY.name,
  "石狩 花子",
  "石狩 鮭次郎",
  "札幌 清二郎",
  "幌加内 そば太郎",
  "小樽 ルタ夫",
  "夕張 メロン子",
  "猿払 ほたて",
  "函館 いか蔵",
  "富良野 ラベ子",
  "羊蹄 じゃが衛門",
  "十勝 豆助",
  "帯広 丼太",
  "阿寒 まりも",
  "積丹 うに子",
  "知床 熊吉",
  "紋別 蟹蔵",
  "長万部 かに子",
  "幸福 幸子",
];

/** 名前から見せる人を引く。100 人に無い名前があれば止める（名簿の字が変わったときに気づくため） */
export function pickedRows(names: readonly string[]): SimPatient[] {
  return names.map((name) => {
    if (name === VIDEO_ONLY.name) return VIDEO_ONLY;
    const source = VIDEO_RENAMES[name] ?? name;
    const p = SIM_PATIENTS.find((x) => x.name === source);
    if (!p) throw new Error(`架空の患者の名簿に無い名前：${source}`);
    return source === name ? p : { ...p, name };
  });
}

/** 使っているお薬（仮名の品目だけ。複数は「、」でつなぐ。量は出さない） */
export function medsText(p: SimPatient): string {
  return p.meds.map((m) => m.item).join("、");
}

const ROWS = pickedRows(PICKED_NAMES);
/** 表の外の人数（全体を 100 人として数える） */
const REST = SIM_PATIENTS.length - ROWS.length;
/** 表ができ終わるころ（最後の行の飛び始め＋落ち着くまで） */
const TABLE_DONE_FRAME = FIRST_ROW_FRAME + ROW_STAGGER * (ROWS.length - 1) + 14;


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
        …ほか {REST} 人
      </div>
    </AbsoluteFill>
  );
};
