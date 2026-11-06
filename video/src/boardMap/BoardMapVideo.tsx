// ボードの「拠点と経路の図」の紹介動画（約30秒、1920×1080・30fps・900フレーム）。
// 題材は Issue #167（PR #168）：地図の車と搬送便が背景の道に沿って動く、救護所Dの迂回、錠の10錠単位。
// 町・拠点・経路・数字は web/src/board/ のデータと関数から描く（架空の町。外部の地図・画像は使わない）。
// 音は入れない（ナレーションを足すときは日本語だけ。ADR-0051）。字幕は日本語と英語。場面の切り替えは0.4秒。
import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { ROUTES } from "../../../web/src/board/data";
import { clockText } from "../../../web/src/board/demo";
import { parsePath, pointAt, travelLine, type Pt } from "../../../web/src/board/live";
import { MAP_ROUTES } from "../../../web/src/board/map";
import { orderQtyText } from "../../../web/src/board/text";
import { BlockedMark, GREEN, INK, Line, MapLayer, Mover, RED, Sites, YELLOW, partialLine } from "./MapLayer";
import { CHECK_BEFORE, CHECK_NOW, C_LEG, D_LEG, OLD_TICK_MINUTES, beforeAt, nowAt } from "./motion";
import { CROSSFADE, GOTHIC, MONO } from "./style";

/** 各場面の左上に、使った表現（10のコツの番号）を小さく出すか */
const SHOW_TIP_LABELS = true;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) } as const;

interface Scene {
  id: string;
  from: number;
  frames: number;
  tip: string;
  ja: string;
  en: string;
  body: FC;
}

// ===== 字幕と札 =====

const Subtitle: FC<{ ja: string; en: string }> = ({ ja, en }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 170,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: "#ffffff",
      borderTop: `2px solid ${INK}`,
    }}
  >
    <div style={{ fontFamily: GOTHIC, fontSize: 44, fontWeight: 700, color: INK }}>{ja}</div>
    <div style={{ fontFamily: GOTHIC, fontSize: 30, color: "#555555" }}>{en}</div>
  </div>
);

const TipLabel: FC<{ tip: string }> = ({ tip }) =>
  SHOW_TIP_LABELS ? (
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 28,
        fontFamily: MONO,
        fontSize: 22,
        color: INK,
        padding: "6px 14px",
        border: `2px solid ${INK}`,
        borderRadius: 8,
        backgroundColor: "#ffffff",
      }}
    >
      {tip}
    </div>
  ) : null;

const Clock: FC<{ minutes: number; note?: string; style?: CSSProperties }> = ({ minutes, note, style }) => (
  <div
    style={{
      position: "absolute",
      fontFamily: MONO,
      fontSize: 34,
      fontWeight: 700,
      color: INK,
      padding: "6px 16px",
      border: `2px solid ${INK}`,
      borderRadius: 10,
      backgroundColor: "#ffffff",
      ...style,
    }}
  >
    {clockText(Math.floor(minutes))}
    {note ? <span style={{ fontSize: 24, fontWeight: 400, marginLeft: 14 }}>{note}</span> : null}
  </div>
);

// ===== 経路の線（web/src/board/map.ts と live.ts から） =====

const routeOf = (to: string) => MAP_ROUTES.find((m) => m.to === to)!;
const statusOf = (to: string) => ROUTES.find((r) => r.to === to)!.status;
const lineTo = (to: string) => travelLine(to as Parameters<typeof travelLine>[0], statusOf(to));
const colorOf = (to: string) => (statusOf(to) === "迂回" ? YELLOW : statusOf(to) === "通行止め" ? RED : INK);

const D_ORIGINAL = parsePath(routeOf("救護所D").d);
const D_BLOCKED = routeOf("救護所D").blocked!;
/** 救護所Dの本来の道の、× の手前までの割合 */
const D_UNTIL_BLOCK = (() => {
  for (let i = 0; i <= 400; i++) {
    const p = pointAt(D_ORIGINAL, i / 400);
    if (Math.hypot(p.x - D_BLOCKED.x, p.y - D_BLOCKED.y) < 18) return i / 400;
  }
  return 0.75;
})();

/** 救護所Dの迂回の道と × （背景として置く） */
const DDetourBackdrop: FC<{ opacity?: number }> = ({ opacity = 0.55 }) => (
  <g>
    <Line pts={D_ORIGINAL} color={RED} width={5} dash="4 10" opacity={opacity * 0.6} />
    <Line pts={lineTo("救護所D")} color={YELLOW} width={7} dash="14 10" opacity={opacity} />
    <BlockedMark x={D_BLOCKED.x} y={D_BLOCKED.y} />
  </g>
);

/** 時刻 a から b までの通った跡（1分ごとの点をつなぐ） */
const trail = (at: (m: number) => Pt, a: number, b: number): Pt[] => {
  const pts: Pt[] = [];
  for (let m = a; m < b; m += 1) pts.push(at(m));
  pts.push(at(b));
  return pts;
};

// ===== 1：題（09 フォントの使い分け） =====

const TitleScene: FC = () => {
  const f = useCurrentFrame();
  const rise = interpolate(f, [0, 24], [30, 0], ease);
  const fade = interpolate(f, [0, 24], [0, 1], clamp);
  const mono = interpolate(f, [30, 50], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 170 }}>
      <div style={{ position: "absolute", left: 300, top: 60, opacity: 0.1 }}>
        <MapLayer width={1320} />
      </div>
      <div style={{ transform: `translateY(${rise}px)`, opacity: fade, textAlign: "center" }}>
        <div style={{ fontFamily: GOTHIC, fontSize: 132, fontWeight: 800, color: INK, letterSpacing: 6 }}>道に沿って、届ける。</div>
        <div style={{ fontFamily: GOTHIC, fontSize: 48, color: "#444444", marginTop: 18 }}>Along the roads, to every aid station.</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 34, color: INK, marginTop: 56, opacity: mono }}>
        Issue #167 · web/src/board/live.ts › travelLine()
      </div>
    </AbsoluteFill>
  );
};

// ===== 2：構成図のアニメーション（07） =====

const RoutesScene: FC = () => {
  const f = useCurrentFrame();
  const draw = (a: number, b: number) => interpolate(f, [a, b], [0, 1], ease);
  const pA = draw(12, 42);
  const pC = draw(34, 64);
  const pB = draw(56, 92);
  const pDorig = draw(88, 112) * D_UNTIL_BLOCK;
  const xPop = interpolate(f, [112, 120], [0, 1], { ...clamp, easing: Easing.out(Easing.back(3)) });
  const pDdet = draw(122, 165);
  const bBlocked = routeOf("救護所B").blocked!;
  const bPop = interpolate(f, [70, 78], [0, 1], clamp);
  const dLabel = interpolate(f, [118, 128], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 300, top: 70 }}>
        <MapLayer width={1320}>
          <Line pts={partialLine(lineTo("救護所A"), pA)} color={colorOf("救護所A")} />
          <Line pts={partialLine(lineTo("救護所C"), pC)} color={colorOf("救護所C")} />
          <Line pts={partialLine(lineTo("救護所B"), pB)} color={colorOf("救護所B")} dash="14 10" />
          {bPop > 0 ? (
            <g opacity={bPop}>
              <BlockedMark x={bBlocked.x} y={bBlocked.y} />
            </g>
          ) : null}
          <Line pts={partialLine(D_ORIGINAL, pDorig)} color={f >= 116 ? RED : INK} width={f >= 116 ? 5 : 7} dash={f >= 116 ? "4 10" : undefined} />
          {xPop > 0 ? <BlockedMark x={D_BLOCKED.x} y={D_BLOCKED.y} scale={xPop * 1.4} /> : null}
          {dLabel > 0 ? (
            <text
              x={D_BLOCKED.x - 30}
              y={D_BLOCKED.y + 7}
              fontFamily={GOTHIC}
              fontSize="20"
              fontWeight="700"
              fill={RED}
              textAnchor="end"
              stroke="#ffffff"
              strokeWidth="6"
              paintOrder="stroke"
              opacity={dLabel}
            >
              {D_BLOCKED.label}
            </text>
          ) : null}
          <Line pts={partialLine(lineTo("救護所D"), pDdet)} color={YELLOW} width={8} dash="14 10" />
          <Sites glow={f >= 160 ? "救護所D" : null} frame={f} />
        </MapLayer>
      </div>
    </AbsoluteFill>
  );
};

// ===== 3：ビフォーアフター分割（04） =====

// 救護所Cへ向かう移動を見せる。以前の動きは刻みの時刻に動き出して前の位置から直線で移るので、
// 着いた後の次の刻みの移動が終わるところまで見せる
const SPLIT_FROM = C_LEG.start;
const SPLIT_TO = Math.ceil(C_LEG.end / OLD_TICK_MINUTES) * OLD_TICK_MINUTES + OLD_TICK_MINUTES * 0.95;

const SplitScene: FC = () => {
  const f = useCurrentFrame();
  const m = interpolate(f, [18, 168], [SPLIT_FROM, SPLIT_TO], clamp);
  const half = (title: string, en: string, color: string, at: (x: number) => Pt) => {
    const p = at(m);
    return (
      <div style={{ width: 880 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginBottom: 14 }}>
          <div style={{ fontFamily: GOTHIC, fontSize: 46, fontWeight: 800, color }}>{title}</div>
          <div style={{ fontFamily: GOTHIC, fontSize: 28, color: "#555555" }}>{en}</div>
        </div>
        <div style={{ border: `3px solid ${color}` }}>
          <MapLayer width={874}>
            <Line pts={lineTo("救護所C")} color={INK} width={5} dash="3 9" opacity={0.5} />
            <Line pts={trail(at, SPLIT_FROM, m)} color={color} width={6} />
            <Sites showPlace={false} />
            <Mover x={p.x} y={p.y} color={color} />
          </MapLayer>
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 96, left: 60, right: 60, display: "flex", justifyContent: "space-between" }}>
        {half("以前", "Before：1時間ごとに直線で移す（再現）", RED, beforeAt)}
        {half("今", "Now：時刻ごとに道の上の位置を求める", GREEN, nowAt)}
      </div>
      <Clock minutes={m} style={{ top: 22, left: "50%", transform: "translateX(-50%)" }} />
    </AbsoluteFill>
  );
};

// ===== 4：クローズアップ・カーソル追従ズーム・ログの早回し（01・02・05） =====

const ZOOM_FROM = D_LEG.start - 30;
const ZOOM_TO = D_LEG.end + 8;

const ZoomScene: FC = () => {
  const f = useCurrentFrame();
  const m = interpolate(f, [0, 140], [ZOOM_FROM, ZOOM_TO], clamp);
  const car = nowAt(m);
  const z = interpolate(f, [8, 70], [0, 1], ease);
  const camera = {
    x: interpolate(z, [0, 1], [500, car.x]),
    y: interpolate(z, [0, 1], [307, car.y]),
    scale: interpolate(z, [0, 1], [1, 2.4]),
  };
  // 早回しの倍率：場面の 140 フレーム（約4.7秒）で ZOOM_TO − ZOOM_FROM 分進む
  const perSecond = Math.round(((ZOOM_TO - ZOOM_FROM) / 140) * 30);
  const arrived = m >= D_LEG.end;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 270, top: 30 }}>
        <MapLayer width={1380} camera={camera}>
          <DDetourBackdrop opacity={0.7} />
          <Line pts={trail(nowAt, Math.max(D_LEG.start, ZOOM_FROM), Math.max(m, D_LEG.start))} color={INK} width={6} />
          <Sites glow={arrived ? "救護所D" : null} frame={f} />
          <Mover x={car.x} y={car.y} label={arrived ? "到着" : "医療チームの車（架空）"} labelBelow />
        </MapLayer>
      </div>
      <Clock minutes={m} note={`▶▶ 1秒＝${perSecond}分`} style={{ top: 50, right: 70 }} />
    </AbsoluteFill>
  );
};

// ===== 5：テストの赤から緑へ・コードハイライト（06・03） =====

/** web/src/board/live.ts の travelLine（Issue #128 から。迂回の道につなぐところを光らせる） */
const CODE = [
  "export function travelLine(to, status) {",
  "  const m = MAP_ROUTES.find((r) => r.to === to);",
  "  if (!m) return [];",
  "  const pts = parsePath(m.d);",
  '  if (status !== "迂回" || !m.detour) return pts;',
  "  const det = parsePath(m.detour);",
  "  const at = pts.findIndex((p) => same(p, det[0]));",
  "  if (at < 0) return pts;",
  "  return [...pts.slice(0, at + 1), ...det.slice(1)];",
  "}",
];
const HIGHLIGHT = [5, 6, 8];

/** web/src/board/live.test.ts の試験の名前（Issue #167） */
const TEST_NAME = "医療チームの車は、巡回の1周のどの時刻でも背景の道の上にいる（救護所の間を直線で横切らない）";

const TestScene: FC = () => {
  const f = useCurrentFrame();
  const hl = interpolate(f, [10, 22], [0, 1], clamp);
  const progress = interpolate(f, [26, 92], [0, 1], ease);
  const row = (label: string, en: string, data: typeof CHECK_NOW) => {
    const checked = Math.round(progress * data.total);
    const fails = data.offRoadAt.filter((i) => i <= checked).length;
    const done = progress >= 1;
    const state = fails > 0 ? "fail" : done ? "pass" : "run";
    const color = state === "fail" ? RED : state === "pass" ? GREEN : "#777777";
    return (
      <div
        style={{
          border: `3px solid ${color}`,
          borderRadius: 14,
          padding: "20px 26px",
          display: "flex",
          alignItems: "center",
          gap: 26,
          backgroundColor: state === "fail" ? "#fdecea" : state === "pass" ? "#e8f5e9" : "#ffffff",
        }}
      >
        <div style={{ fontFamily: GOTHIC, fontSize: 64, fontWeight: 800, color, width: 64, textAlign: "center" }}>
          {state === "fail" ? "✗" : state === "pass" ? "✓" : "…"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: GOTHIC, fontSize: 32, fontWeight: 700, color: INK }}>{label}</div>
          <div style={{ fontFamily: GOTHIC, fontSize: 22, color: "#555555", marginTop: 4 }}>{en}</div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 30, color, textAlign: "right" }}>
          <div>
            道の上 {checked - fails}/{checked}
          </div>
          <div style={{ fontSize: 24 }}>{state === "fail" ? `外れ ${fails}` : state === "pass" ? "PASS" : "RUN"}</div>
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ flexDirection: "row", gap: 40, padding: "100px 60px 210px" }}>
      <div style={{ flex: "0 0 900px", border: `2px solid ${INK}`, borderRadius: 14, padding: "24px 0", backgroundColor: "#ffffff" }}>
        <div style={{ fontFamily: MONO, fontSize: 22, color: "#555555", padding: "0 28px 14px" }}>web/src/board/live.ts</div>
        {CODE.map((line, i) => {
          const on = HIGHLIGHT.includes(i);
          return (
            <div
              key={i}
              style={{
                fontFamily: MONO,
                fontSize: 23,
                lineHeight: "44px",
                whiteSpace: "pre",
                padding: "0 28px",
                color: on || hl === 0 ? INK : `rgba(17,17,17,${1 - hl * 0.6})`,
                backgroundColor: on ? `rgba(201,154,6,${hl * 0.28})` : "transparent",
                borderLeft: on ? `6px solid rgba(201,154,6,${hl})` : "6px solid transparent",
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 22, color: "#555555" }}>web/src/board/live.test.ts</div>
        <div style={{ fontFamily: GOTHIC, fontSize: 27, lineHeight: 1.5, color: INK }}>it(「{TEST_NAME}」)</div>
        <div style={{ fontFamily: GOTHIC, fontSize: 22, color: "#555555" }}>
          巡回の1周を0.5分ごとに {CHECK_NOW.total} 時刻 見る / {CHECK_NOW.total} moments, every 0.5 min
        </div>
        {row("以前の動き（1時間ごとに直線で移す。再現）", "Before (reconstructed): straight moves every hour", CHECK_BEFORE)}
        {row("今の動き（道に沿う）", "Now: position on the route at every moment", CHECK_NOW)}
      </div>
    </AbsoluteFill>
  );
};

// ===== 6：数値のカウントアップ（08） =====

const ORDER_QTY = 230;

const Pack: FC<{ kind: "box" | "sheet"; show: number }> = ({ kind, show }) => (
  <div style={{ opacity: show, transform: `translateY(${(1 - show) * 20}px)`, textAlign: "center" }}>
    {kind === "box" ? (
      <svg width="120" height="96" viewBox="0 0 120 96">
        <rect x="6" y="20" width="108" height="70" fill="#ffffff" stroke={INK} strokeWidth="4" />
        <path d="M6,20 L24,4 H96 L114,20" fill="none" stroke={INK} strokeWidth="4" />
        <text x="60" y="66" fontFamily={MONO} fontSize="24" fontWeight="700" textAnchor="middle" fill={INK}>
          100
        </text>
      </svg>
    ) : (
      <svg width="64" height="96" viewBox="0 0 64 96">
        <rect x="4" y="4" width="56" height="88" rx="6" fill="#ffffff" stroke={INK} strokeWidth="4" />
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1].map((c) => <circle key={`${r}${c}`} cx={22 + c * 20} cy={18 + r * 15} r="5.5" fill="none" stroke={INK} strokeWidth="2.5" />),
        )}
      </svg>
    )}
  </div>
);

const CountScene: FC = () => {
  const f = useCurrentFrame();
  const steps = Math.round(interpolate(f, [6, 44], [0, ORDER_QTY / 10], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const qty = steps * 10;
  const reveal = interpolate(f, [48, 60], [0, 1], clamp);
  const packs = [
    { kind: "box" as const, at: 50 },
    { kind: "box" as const, at: 54 },
    { kind: "sheet" as const, at: 58 },
    { kind: "sheet" as const, at: 61 },
    { kind: "sheet" as const, at: 64 },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 170, gap: 26 }}>
      <div style={{ fontFamily: GOTHIC, fontSize: 36, color: "#444444" }}>発注の提案（救護所ごと）／ Order proposal</div>
      <div style={{ fontFamily: MONO, fontSize: 168, fontWeight: 700, color: INK, lineHeight: 1 }}>{qty}錠</div>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-end", height: 100 }}>
        {packs.map((p, i) => (
          <Pack key={i} kind={p.kind} show={interpolate(f, [p.at, p.at + 6], [0, 1], clamp)} />
        ))}
      </div>
      <div style={{ fontFamily: GOTHIC, fontSize: 64, fontWeight: 800, color: INK, opacity: reveal }}>{orderQtyText(ORDER_QTY, "錠")}</div>
    </AbsoluteFill>
  );
};

// ===== 7：コミット履歴（10） =====

/** 地図（web/src/board/live.ts・map.ts・vehicles.ts・BoardMap.tsx）のコミットの1行目（git log から写した） */
const COMMITS = [
  { hash: "c524628", text: "便・車の操作を図の外の一覧のボタンにする（PR #130 のレビュー）" },
  { hash: "e29a30f", text: "ボードの色・帯・一覧・数字の列を計画書に沿って直す（Issue #143）" },
  { hash: "f5385ba", text: "地図の印を押したときの行き先と到着見込みを、閉じた一覧の外に出す（Issue #159）" },
  { hash: "b1b1ac7", text: "地図の印を道に沿って動かし、発注の提案を救護所ごとにまとめ、錠を10錠単位にする（Issue #167）" },
];

const CommitScene: FC = () => {
  const f = useCurrentFrame();
  const end = interpolate(f, [58, 70], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ padding: "110px 140px 210px", gap: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 28, color: "#555555", marginBottom: 22 }}>git log -- web/src/board/live.ts map.ts vehicles.ts</div>
      <div style={{ position: "relative", paddingLeft: 60 }}>
        <div style={{ position: "absolute", left: 17, top: 24, bottom: 24, width: 4, backgroundColor: INK }} />
        {COMMITS.map((c, i) => {
          const at = 4 + i * 9;
          const show = interpolate(f, [at, at + 8], [0, 1], ease);
          const last = i === COMMITS.length - 1;
          return (
            <div
              key={c.hash}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "16px 20px",
                marginBottom: 12,
                opacity: show,
                transform: `translateX(${(1 - show) * 40}px)`,
                backgroundColor: last ? "rgba(201,154,6,0.18)" : "transparent",
                border: last ? `3px solid ${YELLOW}` : "3px solid transparent",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: -55,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: last ? YELLOW : "#ffffff",
                  border: `4px solid ${INK}`,
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: INK }}>{c.hash}</div>
              <div style={{ fontFamily: GOTHIC, fontSize: 29, color: INK, fontWeight: last ? 700 : 400 }}>{c.text}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 34, opacity: end, display: "flex", alignItems: "baseline", gap: 26 }}>
        <div style={{ fontFamily: GOTHIC, fontSize: 52, fontWeight: 800, color: INK }}>SonaQuest</div>
        <div style={{ fontFamily: GOTHIC, fontSize: 34, color: INK }}>地域本部の医薬品ボード（架空の町のデモ）</div>
      </div>
    </AbsoluteFill>
  );
};

// ===== 場面の表（秒の割り振り） =====

const s = (sec: number) => Math.round(sec * 30);

export const BOARD_MAP_SCENES: Scene[] = [
  {
    id: "1 題",
    from: s(0),
    frames: s(3),
    tip: "09 フォントの使い分け",
    ja: "地域本部の医薬品ボード：拠点と経路の図",
    en: "Regional HQ medicine board: sites and routes map",
    body: TitleScene,
  },
  {
    id: "2 経路が描かれる",
    from: s(3),
    frames: s(6),
    tip: "07 構成図のアニメーション",
    ja: "本部から救護所A〜Dへ。Dへの道は土砂で通れず、南の幹線から回る",
    en: "HQ to stations A–D. Station D: landslide ahead, detour via the south main road",
    body: RoutesScene,
  },
  {
    id: "3 以前と今",
    from: s(9),
    frames: s(6),
    tip: "04 ビフォーアフター分割",
    ja: "以前は街区を斜めに横切っていた。今は道の上を通る",
    en: "Before: cutting across blocks. Now: staying on the roads",
    body: SplitScene,
  },
  {
    id: "4 寄って追う",
    from: s(15),
    frames: s(5),
    tip: "01 クローズアップ · 02 カーソル追従ズーム · 05 早回し",
    ja: "時計を早回し。医療チームの車（架空）が迂回の道で救護所Dへ",
    en: "Fast-forward: the (fictional) medical team car takes the detour to Station D",
    body: ZoomScene,
  },
  {
    id: "5 試験",
    from: s(20),
    frames: s(4),
    tip: "06 テストの赤から緑へ · 03 コードハイライト",
    ja: "同じ試験を以前の動きと今の動きに当てる。赤から緑へ",
    en: "Same test, old motion vs. new: red to green",
    body: TestScene,
  },
  {
    id: "6 数",
    from: s(24),
    frames: s(3),
    tip: "08 数値のカウントアップ",
    ja: "錠は 10錠＝1シート、100錠＝1箱 で示す（架空の発注単位）",
    en: "Tablets shown as 10 = 1 sheet, 100 = 1 box (fictional order units)",
    body: CountScene,
  },
  {
    id: "7 履歴",
    from: s(27),
    frames: s(3),
    tip: "10 コミット履歴",
    ja: "Issue #167 まで。町も人もすべて架空です",
    en: "Up to Issue #167. The town and everyone in it are fictional",
    body: CommitScene,
  },
];

export const BOARD_MAP_TOTAL_FRAMES = BOARD_MAP_SCENES.reduce((sum, sc) => Math.max(sum, sc.from + sc.frames), 0);

const SceneFrame: FC<{ scene: Scene; first: boolean; children: ReactNode }> = ({ scene, first, children }) => {
  const f = useCurrentFrame();
  // 0.4秒（12フレーム）で前の場面に重ねて現れる
  const opacity = first ? 1 : interpolate(f, [0, CROSSFADE], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity }}>
      {children}
      <TipLabel tip={scene.tip} />
      <Subtitle ja={scene.ja} en={scene.en} />
    </AbsoluteFill>
  );
};

export const BoardMapVideo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
    {BOARD_MAP_SCENES.map((scene, i) => {
      const last = i === BOARD_MAP_SCENES.length - 1;
      const Body = scene.body;
      return (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames + (last ? 0 : CROSSFADE)} name={scene.id}>
          <SceneFrame scene={scene} first={i === 0}>
            <Body />
          </SceneFrame>
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
