// v2 の紹介動画（Issue #315）の 3〜5番の画面。文と時刻は cardsText.ts。左上の見出し語は SonaQuestVideo.tsx の Caption が出す。
// 2026-11-13 オーナー（v05 を見て、チャット）：「ただスライドでのプレゼンになっている」「大事な情報は前面に押し出す」。
// カードを並べる形をやめて、次の作り方にした：
// - 1画面に1つのことだけ。数字は画面いっぱいに出す
// - 割合は棒ではなく、100人の絵の並びで見せる。無いものは点線で描く（v06 を見ての依頼で、3つの数字を同じ100人の中で減らす形にした）
// - 文字と絵は、声がその句を言う瞬間に出す
// - いちばん言いたい 27.4% の所だけ、地を濃い色に反転する
// 依存は足さず、remotion の部品と SVG だけで描く。書体は Zen Maru Gothic（video/public/fonts/）。
import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type Section } from "../sections";
import { COLORS, FONT_FAMILY, baseText, hasStaticFile } from "../theme";
import { DMODE, FUNNEL, GAP, HOOK, QUAKE, REACH } from "./cardsText";

const sec = (s: number) => Math.round(s * FPS);

/**
 * 3〜5番の書体：Zen Maru Gothic（SIL OFL。2026-11-13 オーナーが見本から選んだ）。丸みのある太いゴシックで、数字にも使う。
 * ファイルは video/public/fonts/（Git の対象外）。無ければ今までのゴシックで描く
 */
const V2_FONT = `"Zen Maru Gothic", ${FONT_FAMILY}`;
const NUM = V2_FONT;
const FONT_FILES = [
  { file: "fonts/ZenMaruGothic-Bold.ttf", weight: "700" },
  { file: "fonts/ZenMaruGothic-Black.ttf", weight: "900" },
];
if (typeof document !== "undefined") {
  for (const { file, weight } of FONT_FILES) {
    if (!hasStaticFile(file)) continue;
    const handle = delayRender(`書体 ${file}`);
    new FontFace("Zen Maru Gothic", `url(${staticFile(file)})`, { weight })
      .load()
      .then((face) => {
        document.fonts.add(face);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }
}
/** ✗ と「使えない」の色（2番の地図の点と同じ赤） */
const RED = "#d23c2c";
/** 色を付けていない絵の色 */
const MUTED = "#c9c6bd";
/** 色が外れた人の薄い色 */
const PALE = "#8fb1c2";
/** 濃い地の上の赤 */
const RED_ON_DARK = "#ff6a57";
/** 濃い地の上の、強める言葉の色 */
const ACCENT_ON_DARK = "#7fc4e3";
/** 地図の録画の「21回」と同じ赤 */
const QUAKE_RED = "#cc2929";
const MARKER = "#ffe08a";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** at 秒から 0 → 1 に進むばね（弾ませるときは bouncy） */
const useSpringAt = (at: number, bouncy = false) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - sec(at), fps, config: bouncy ? { damping: 11, stiffness: 150 } : { damping: 200 } });
};

/** 下から上がって現れる */
const useRise = (at: number, distance = 28): CSSProperties => {
  const p = useSpringAt(at);
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [distance, 0])}px)` };
};

/**
 * 小さい所から、ぷにっと弾んで収まる（大きな数字・✗・大事な言葉）。行き過ぎた分だけ横に広がって縦につぶれ、戻るときは逆になる
 * （2026-11-13 オーナー：「数字を一瞬ニョキって動かしたり…弾力を持たせたり」）
 */
const usePop = (at: number): CSSProperties => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - sec(at), fps, config: { damping: 7.5, stiffness: 170, mass: 0.9 } });
  const size = interpolate(p, [0, 1], [0.45, 1]);
  const squash = (p - 1) * 0.55;
  return { opacity: frame >= sec(at) ? 1 : 0, transform: `scale(${size * (1 + squash)}, ${size * (1 - squash)})` };
};

/** at 秒から 1.2 秒で 0 → value に数える（終わりはゆっくり） */
const useCountUp = (value: number, at: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [sec(at), sec(at + 1.2)], [0, value], { ...clamp, easing: Easing.out(Easing.cubic) }).toFixed(1);
};

/** 1つの画面。from〜to の間だけ描き、頭と終わりで短く溶かす。中の時刻は場面の頭からの秒のまま */
const Shot: FC<{ from: number; to?: number; background?: string; children: ReactNode }> = ({ from, to, background, children }) => {
  const frame = useCurrentFrame();
  const start = sec(from);
  const end = to === undefined ? Infinity : sec(to);
  if (frame < start || frame >= end) return null;
  const fadeIn = from === 0 ? 1 : interpolate(frame, [start, start + 8], [0, 1], clamp);
  const fadeOut = to === undefined ? 1 : interpolate(frame, [end - 7, end], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ ...baseText, fontFamily: V2_FONT, backgroundColor: background ?? COLORS.background, opacity: Math.min(fadeIn, fadeOut) }}>
      {children}
    </AbsoluteFill>
  );
};

/** 下の端に出す注と出典 */
const Foot: FC<{ at: number; lines: string[]; color?: string }> = ({ at, lines, color }) => {
  const rise = useRise(at, 12);
  return (
    <div style={{ ...rise, fontFamily: FONT_FAMILY, position: "absolute", left: 100, right: 100, bottom: 30, fontSize: 20, lineHeight: 1.5, color: color ?? COLORS.sub }}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
};

/** 人の絵。hollow は点線（手帳はあるが、持ち歩いていない） */
const Person: FC<{ color: string; width: number; hollow?: boolean }> = ({ color, width, hollow }) => {
  const paint = hollow ? { fill: "none", stroke: color, strokeWidth: 5, strokeDasharray: "9 7" } : { fill: color };
  return (
    <svg width={width} height={width * 2} viewBox="0 0 60 120">
      <circle cx="30" cy="17" r="14" {...paint} />
      <path d="M11 62 Q11 39 30 39 Q49 39 49 62 L49 104 Q49 113 40 113 L20 113 Q11 113 11 104 Z" {...paint} />
    </svg>
  );
};

/** お薬手帳の絵。missing は点線（無い） */
const Notebook: FC<{ color: string; width: number; missing?: boolean }> = ({ color, width, missing }) => (
  <svg width={width} height={width * 1.3} viewBox="0 0 60 78">
    {missing ? (
      <rect x="4" y="4" width="52" height="70" rx="8" fill="none" stroke={color} strokeWidth="3.5" strokeDasharray="7 6" />
    ) : (
      <>
        <rect x="3" y="3" width="54" height="72" rx="8" fill={color} />
        <rect x="11" y="3" width="4" height="72" fill="rgba(255,255,255,0.45)" />
        <path d="M36 26 v24 M24 38 h24" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
      </>
    )}
  </svg>
);

/** 大きな % の数字 */
const BigPercent: FC<{ value: number; at: number; size: number; color: string }> = ({ value, at, size, color }) => {
  const shown = useCountUp(value, at);
  const pop = usePop(at);
  return (
    <div style={{ ...pop, fontFamily: NUM, fontWeight: 700, color, lineHeight: 0.95, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontSize: size }}>{shown}</span>
      <span style={{ fontSize: size * 0.42, marginLeft: 10 }}>%</span>
    </div>
  );
};

// ---------- 100人の絵（3・4番で共通） ----------

type Stage = { at: number; count: number };

/** 絵の並びの左上に付ける、何人の集まりかの札 */
const GroupLabel: FC<{ text: string; color: string; width: number }> = ({ text, color, width }) => (
  <div style={{ width, marginBottom: 12, display: "flex", alignItems: "center", gap: 14, fontSize: 32, fontWeight: 800, color }}>
    <span>{text}</span>
    <span style={{ flex: 1, height: 3, backgroundColor: color, opacity: 0.35 }} />
  </div>
);

/**
 * 全体の100人の並び（25×4）。通院している人に色を付ける。
 * to を過ぎると、通院していない人から消えていき、通院している人の並び（PatientGrid）に替わる
 */
const PeopleGrid: FC<{ top: number; appearAt: number; visit: Stage; to: number }> = ({ top, appearAt, visit, to }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [sec(to), sec(to) + 10], [1, 0], clamp);
  const label = useRise(appearAt, 12);
  const width = 25 * 42 + 24 * 14;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", opacity: out }}>
      <div style={label}>
        <GroupLabel text={`全体 ${FUNNEL.total}人`} color={COLORS.sub} width={width} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(25, 42px)", gap: "12px 14px" }}>
        {Array.from({ length: FUNNEL.total }, (_, i) => {
          const appear = spring({ frame: frame - sec(appearAt) - Math.floor(i / 2), fps, config: { damping: 200 } });
          const inVisit = i < visit.count && frame >= sec(visit.at) + Math.round(i * 0.6);
          return (
            <div key={i} style={{ opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [20, 0])}px)` }}>
              <Person color={inVisit ? COLORS.accent : MUTED} width={42} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 通院している人だけの並び（21×2）。全体の100人とは分母が違うので、人を大きくし、枠と札で別の集まりだと分かるようにする
 * （2026-11-13 オーナー、v07 を見て：「最初の100人と、最後の表示は分母が異なるから、明確に区分できるように」）。
 * そのうち手帳を使っている人、持ち歩いている人だけに色を残す。外れた人は薄い色に、手帳はあるが持ち歩いていない人は点線にする
 */
const PatientGrid: FC<{ top: number; appearAt: number; notebook: Stage; carry?: Stage }> = ({ top, appearAt, notebook, carry }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: frame - sec(appearAt), fps, config: { damping: 200 } });
  const total = FUNNEL.visit;
  const size = 58;
  const width = 21 * size + 20 * 12;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: appear, transform: `scale(${interpolate(appear, [0, 1], [0.8, 1])})` }}>
      <div style={{ padding: "18px 34px 26px", borderRadius: 28, border: `4px solid ${COLORS.accent}`, backgroundColor: "rgba(47,111,143,0.07)" }}>
        <GroupLabel text={`通院している人 ${total}人`} color={COLORS.accent} width={width} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(21, ${size}px)`, gap: "14px 12px" }}>
          {Array.from({ length: total }, (_, i) => {
            // 外れるときは後ろから順に外れる
            const noNotebook = i >= notebook.count && frame >= sec(notebook.at) + Math.round((total - 1 - i) * 1.5);
            const notCarried = carry && i >= carry.count && i < notebook.count && frame >= sec(carry.at) + Math.round((notebook.count - 1 - i) * 1.5);
            const kept = carry && i < carry.count ? spring({ frame: frame - sec(carry.at) - 20, fps, config: { damping: 11, stiffness: 150 } }) : 0;
            return (
              <div key={i} style={{ transform: `scale(${1 + 0.12 * kept})`, transformOrigin: "50% 100%" }}>
                <Person color={noNotebook || notCarried ? PALE : COLORS.accent} width={size} hollow={Boolean(notCarried)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * 絵の並びの上に出す文：何の人か、声が言う数字（大きく）、当てはめた人数（小さく）。
 * 2026-11-13 オーナー（v08 を見て、チャット）：「スライドに表示されているのは何人…実際に読み上げているのはパーセンテージ」
 * 「スライドをパーセンテージに…何人っていう数字は下の方にちょろっと出せばいい」
 */
const FunnelText: FC<{ lead?: string; label: string; labelAt: number; bigAt: number; bigText?: string; percent?: number; base: string; count: number }> = ({
  lead,
  label,
  labelAt,
  bigAt,
  bigText,
  percent,
  base,
  count,
}) => {
  const labelRise = useRise(labelAt);
  const big = usePop(bigAt);
  const small = useRise(bigAt + 0.5);
  return (
    <div style={{ position: "absolute", top: 120, left: 0, right: 0, height: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {lead ? <div style={{ ...labelRise, fontSize: 36, fontWeight: 700, color: COLORS.sub }}>{lead}</div> : null}
      <div style={{ ...labelRise, fontSize: 54, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>{label}</div>
      {percent !== undefined ? (
        <BigPercent value={percent} at={bigAt} size={200} color={COLORS.accent} />
      ) : (
        <div style={{ ...big, fontSize: 170, fontWeight: 800, color: COLORS.accent, lineHeight: 1.15 }}>{bigText}</div>
      )}
      <div style={{ ...small, display: "flex", alignItems: "baseline", gap: 14, fontSize: 36, fontWeight: 700, color: COLORS.sub, marginTop: 10 }}>
        <span>{base}</span>
        <span style={{ fontSize: 48, color: COLORS.accent }}>約{count}人</span>
      </div>
    </div>
  );
};

const GRID_TOP = 530;
/** 通院している人の並びの上の端 */
const PATIENT_TOP = 545;
const BASE_ALL = `${FUNNEL.total}人なら`;
const BASE_PATIENTS = `通院している${FUNNEL.visit}人に当てはめると`;

// ---------- 3番：薬は身近 ----------

const ReachScene: FC = () => {
  const frame = useCurrentFrame();
  const { opening, visit, notebook } = REACH;
  const openingRise = useRise(opening.at);
  const openingOut = interpolate(frame, [sec(visit.from) - 7, sec(visit.from)], [1, 0], clamp);
  return (
    <Shot from={0}>
      {frame < sec(visit.from) ? (
        <div style={{ position: "absolute", top: 120, left: 0, right: 0, height: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...openingRise, opacity: (openingRise.opacity as number) * openingOut, fontSize: 112, fontWeight: 800 }}>{opening.text}</div>
        </div>
      ) : frame < sec(notebook.from) ? (
        <FunnelText base={BASE_ALL} label={visit.label} labelAt={visit.from + 0.25} count={FUNNEL.visit} bigAt={visit.bigAt} bigText={visit.big} />
      ) : (
        <FunnelText base={BASE_PATIENTS} label={notebook.label} labelAt={notebook.from + 0.2} count={FUNNEL.notebook} bigAt={notebook.bigAt} percent={notebook.value} />
      )}
      <PeopleGrid top={GRID_TOP} appearAt={REACH.peopleAt} visit={{ at: visit.bigAt, count: FUNNEL.visit }} to={notebook.from - 0.2} />
      <PatientGrid top={PATIENT_TOP} appearAt={notebook.from} notebook={{ at: notebook.bigAt, count: FUNNEL.notebook }} />
      {frame < sec(notebook.from) ? (
        <Foot at={visit.from + 0.25} lines={[`出典：${FUNNEL.sources.visit}`]} />
      ) : (
        <Foot at={notebook.from + 0.2} lines={[FUNNEL.caveat, `出典：${FUNNEL.sources.visit}／${FUNNEL.sources.notebook}`]} />
      )}
    </Shot>
  );
};

// ---------- 4番：手元にあるとは限らない ----------

const GapOpening: FC = () => {
  const frame = useCurrentFrame();
  const { opening, carry } = GAP;
  const lead = useRise(opening.leadAt);
  const line1 = useRise(opening.mainAt);
  const line2 = useRise(opening.mainAt + 0.7);
  const icon = useRise(opening.leadAt);
  const missing = interpolate(frame, [sec(opening.missingAt), sec(opening.missingAt) + 10], [0, 1], clamp);
  return (
    <Shot from={0} to={carry.from}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 90, paddingTop: 40 }}>
        {/* 手帳の絵が、「限りません」で点線（無い）に変わる */}
        <div style={{ ...icon, position: "relative", width: 250, height: 325 }}>
          <div style={{ position: "absolute", inset: 0, opacity: 1 - missing }}>
            <Notebook color={COLORS.accent} width={250} />
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: missing }}>
            <Notebook color={RED} width={250} missing />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: NUM, fontSize: 170, fontWeight: 700, color: RED }}>?</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...lead, fontSize: 60, fontWeight: 700, color: COLORS.sub, marginBottom: 14 }}>{opening.lead}</div>
          <div style={{ ...line1, fontSize: 118, fontWeight: 800, lineHeight: 1.25 }}>{opening.main[0]}</div>
          <div style={{ ...line2, fontSize: 118, fontWeight: 800, lineHeight: 1.25 }}>{opening.main[1]}</div>
        </div>
      </AbsoluteFill>
    </Shot>
  );
};

/** 3番の終わりと同じ「通院している人」の並びから始めて、持ち歩いている人だけに色を残す */
const GapCarry: FC = () => {
  const { carry, unprepared } = GAP;
  const already = -100;
  return (
    <Shot from={carry.from} to={unprepared.from}>
      <FunnelText lead={GAP.surveyLead} base={BASE_PATIENTS} label={carry.label} labelAt={carry.labelAt} count={FUNNEL.carry} bigAt={carry.bigAt} percent={carry.value} />
      <PatientGrid top={PATIENT_TOP} appearAt={already} notebook={{ at: already, count: FUNNEL.notebook }} carry={{ at: carry.bigAt, count: FUNNEL.carry }} />
      <Foot at={carry.from + 0.2} lines={[`${FUNNEL.caveat}。${carry.note}`, `出典：${FUNNEL.sources.visit}／${FUNNEL.sources.notebook}／${FUNNEL.sources.carry}`]} />
    </Shot>
  );
};

const LIGHT = "rgba(255,255,255,0.72)";
const UNPREPARED_FOOT = [GAP.unprepared.note, `出典：${FUNNEL.sources.carry}`];

const SurveyLead: FC<{ at: number; color?: string }> = ({ at, color }) => {
  const rise = useRise(at, 12);
  return (
    <div style={{ ...rise, position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", fontSize: 44, fontWeight: 700, color: color ?? COLORS.sub }}>
      {GAP.surveyLead}
    </div>
  );
};

/** いちばん言いたい数字。地を濃い色にして、27.4% を画面いっぱいに出す */
const GapUnpreparedNumber: FC = () => {
  const { unprepared } = GAP;
  const of = useRise(unprepared.bigAt - 0.3);
  return (
    <Shot from={unprepared.from} to={unprepared.forget.from} background={COLORS.night}>
      <SurveyLead at={unprepared.from + 0.1} color={LIGHT} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
        <div style={{ ...of, fontSize: 64, fontWeight: 700, color: LIGHT }}>{unprepared.of}</div>
        <BigPercent value={unprepared.value} at={unprepared.bigAt} size={400} color={COLORS.white} />
      </AbsoluteFill>
      <Foot at={unprepared.bigAt} lines={UNPREPARED_FOOT} color="rgba(255,255,255,0.6)" />
    </Shot>
  );
};

/** 27.4% の続きの画面の右上に、何の割合の話かを小さく残す */
const UnpreparedTag: FC = () => (
  <div style={{ position: "absolute", top: 44, right: 110, display: "flex", alignItems: "baseline", gap: 16, color: LIGHT, fontWeight: 700 }}>
    <span style={{ fontSize: 36 }}>{GAP.unprepared.of}</span>
    <span style={{ fontFamily: NUM, fontSize: 84, color: COLORS.white }}>{GAP.unprepared.value}</span>
    <span style={{ fontFamily: NUM, fontSize: 44, color: COLORS.white }}>%</span>
  </div>
);

type IconName = "name" | "timing" | "amount" | "notebook" | "pill" | "leaflet";

/** 白い線の絵（濃い地の上で使う） */
const Icon: FC<{ name: IconName; size: number }> = ({ name, size }) => {
  const line = { fill: "none", stroke: "#ffffff", strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {name === "name" ? (
        <g transform="rotate(-35 50 50)">
          <rect x="14" y="34" width="72" height="32" rx="16" {...line} />
          <path d="M14 50 a16 16 0 0 1 16 -16 h20 v32 h-20 a16 16 0 0 1 -16 -16" fill="#ffffff" />
        </g>
      ) : null}
      {name === "timing" ? (
        <>
          <circle cx="50" cy="50" r="34" {...line} />
          <path d="M50 28 v22 l15 10" {...line} />
        </>
      ) : null}
      {name === "amount" ? (
        <>
          <circle cx="30" cy="50" r="18" {...line} />
          <path d="M18 50 h24" {...line} />
          <circle cx="72" cy="50" r="18" {...line} />
          <path d="M60 50 h24" {...line} />
        </>
      ) : null}
      {name === "notebook" ? (
        <>
          <rect x="22" y="12" width="56" height="76" rx="8" {...line} />
          <path d="M34 12 v76" {...line} />
          <path d="M57 38 v24 M45 50 h24" {...line} />
        </>
      ) : null}
      {name === "pill" ? (
        <>
          <rect x="20" y="14" width="60" height="72" rx="8" {...line} />
          {[0, 1, 2].map((r) => [0, 1].map((c) => <circle key={`${r}${c}`} cx={38 + c * 24} cy={30 + r * 20} r="6.5" fill="#ffffff" />))}
        </>
      ) : null}
      {name === "leaflet" ? (
        <>
          <path d="M24 12 h38 l14 14 v62 h-52 z" {...line} />
          <path d="M34 40 h32 M34 54 h32 M34 68 h22" {...line} />
        </>
      ) : null}
    </svg>
  );
};

/** 非常時の持ち出し袋の絵 */
const BagIcon: FC<{ size: number }> = ({ size }) => {
  const line = { fill: "none", stroke: "#ffffff", strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <path d="M38 22 q0 -12 12 -12 q12 0 12 12" {...line} />
      <rect x="20" y="22" width="60" height="68" rx="16" {...line} />
      <rect x="32" y="54" width="36" height="24" rx="6" {...line} />
      <path d="M20 44 h60" {...line} />
    </svg>
  );
};

/** 絵と名前の札。lostAt を過ぎると点線になって薄くなり、badge（？ か ✕）が弾んで出る */
const Tile: FC<{ at: number; icon: IconName; text: string; size: number; lostAt: number; badge: string }> = ({ at, icon, text, size, lostAt, badge }) => {
  const frame = useCurrentFrame();
  const pop = usePop(at);
  const badgePop = usePop(lostAt);
  const lost = interpolate(frame, [sec(lostAt), sec(lostAt) + 8], [0, 1], clamp);
  return (
    <div style={{ ...pop, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            borderRadius: 36,
            backgroundColor: "rgba(255,255,255,0.07)",
            border: `4px ${lost > 0.5 ? "dashed" : "solid"} rgba(255,255,255,0.3)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 1 - 0.6 * lost,
          }}
        >
          <Icon name={icon} size={size * 0.62} />
        </div>
        <div
          style={{
            ...badgePop,
            position: "absolute",
            right: -22,
            top: -22,
            width: 92,
            height: 92,
            borderRadius: 46,
            backgroundColor: RED,
            color: COLORS.white,
            fontFamily: NUM,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: "92px",
            textAlign: "center",
          }}
        >
          {badge}
        </div>
      </div>
      <div style={{ fontSize: 46, fontWeight: 800, color: COLORS.white }}>{text}</div>
    </div>
  );
};

/** できていないことを大きく言う2語。2語目を赤にする */
const Punch: FC<{ at: number; words: readonly [string, string] }> = ({ at, words }) => {
  const pop = usePop(at);
  return (
    <div style={{ ...pop, display: "flex", alignItems: "baseline", gap: 30, fontWeight: 800, lineHeight: 1.2 }}>
      <span style={{ fontSize: 84, color: COLORS.white }}>{words[0]}</span>
      <span style={{ fontSize: 150, color: RED_ON_DARK }}>{words[1]}</span>
    </div>
  );
};

/** 「薬の名前・飲み方・量の どれかを覚えていない」：3つを1つずつ出し、「？」を付ける */
const GapForget: FC = () => {
  const { forget, bag } = GAP.unprepared;
  return (
    <Shot from={forget.from} to={bag.from} background={COLORS.night}>
      <UnpreparedTag />
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 90 }}>
        {forget.items.map((item, i) => (
          <Tile key={item.text} at={item.at} icon={item.icon} text={item.text} size={300} lostAt={forget.punchAt + i * 0.1} badge="?" />
        ))}
      </div>
      <div style={{ position: "absolute", top: 660, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Punch at={forget.punchAt} words={forget.punch} />
      </div>
      <Foot at={0} lines={UNPREPARED_FOOT} color="rgba(255,255,255,0.6)" />
    </Shot>
  );
};

/** 「手帳も薬も説明書も、非常時の持ち出し袋に入れていない」：3つを1つずつ出し、袋を出して ✕ を付ける */
const GapBag: FC = () => {
  const { bag } = GAP.unprepared;
  const lead = useRise(bag.from + 0.3);
  const bagPop = usePop(bag.bagAt);
  const cross = usePop(bag.punchAt);
  return (
    <Shot from={bag.from} background={COLORS.night}>
      <UnpreparedTag />
      <div style={{ ...lead, position: "absolute", top: 160, left: 0, right: 0, textAlign: "center", fontSize: 56, fontWeight: 700, color: LIGHT }}>{bag.lead}</div>
      <div style={{ position: "absolute", top: 270, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 56 }}>
        {bag.items.map((item, i) => (
          <Tile key={item.text} at={item.at} icon={item.icon} text={item.text} size={240} lostAt={bag.punchAt + i * 0.1} badge="✕" />
        ))}
        <div style={{ ...bagPop, fontSize: 110, fontWeight: 700, color: LIGHT, lineHeight: "240px", margin: "0 6px" }}>→</div>
        <div style={{ ...bagPop, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
          <div style={{ position: "relative", width: 240, height: 240 }}>
            <BagIcon size={240} />
            <div style={{ ...cross, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 230, fontWeight: 800, color: RED_ON_DARK, lineHeight: 1 }}>✕</div>
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, color: COLORS.white }}>{bag.bagLabel}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 680, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Punch at={bag.punchAt} words={bag.punch} />
      </div>
      <Foot at={0} lines={UNPREPARED_FOOT} color="rgba(255,255,255,0.6)" />
    </Shot>
  );
};

// ---------- 5番：仕組みがあっても ----------

/** 引用の中の、声に合わせて色を引く所（文は変えない） */
const Mark: FC<{ at: number; children: ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [sec(at), sec(at + 0.7)], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <span
      style={{
        fontWeight: 700,
        backgroundImage: `linear-gradient(${MARKER}, ${MARKER})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 88%",
        backgroundSize: `${p}% 42%`,
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
};

/** 電波の絵に斜線（通信が止まった） */
const NoSignal: FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="47" fill={RED} />
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={24 + i * 14} y={64 - i * 11} width="9" height={12 + i * 11} rx="2" fill="#ffffff" />
    ))}
    <path d="M20 22 L80 82" stroke={RED} strokeWidth="13" strokeLinecap="round" />
    <path d="M20 22 L80 82" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

const DmodeQuote: FC = () => {
  const frame = useCurrentFrame();
  const { offline, rely } = DMODE;
  const card = useRise(DMODE.quoteAt);
  // 「でも、通信が止まれば」で、札を薄くして少し縮める
  const off = spring({ frame: frame - sec(offline.at), fps: FPS, config: { damping: 200 } });
  const badge = usePop(offline.at + 0.1);
  const line1 = useRise(offline.lines[0].at);
  const line2 = usePop(offline.lines[1].at);
  return (
    <Shot from={0} to={rely.from}>
      <div style={{ position: "absolute", top: 150, left: 180, right: 180 }}>
        <div style={{ position: "relative", transform: `scale(${interpolate(off, [0, 1], [1, 0.94])})`, transformOrigin: "50% 0%" }}>
          <div
            style={{
              ...card,
              opacity: (card.opacity as number) * interpolate(off, [0, 1], [1, 0.38]),
              filter: `grayscale(${off})`,
              boxSizing: "border-box",
              padding: "38px 56px 32px",
              borderRadius: 24,
              backgroundColor: COLORS.white,
              borderLeft: `14px solid ${COLORS.accent}`,
              boxShadow: "0 12px 36px rgba(31,42,51,0.12)",
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.accent, marginBottom: 16 }}>{DMODE.heading}</div>
            <div style={{ fontSize: 40, lineHeight: 1.7 }}>
              「
              {DMODE.quote.map((part) =>
                "markAt" in part ? (
                  <Mark key={part.text} at={part.markAt}>
                    {part.text}
                  </Mark>
                ) : (
                  <span key={part.text}>{part.text}</span>
                ),
              )}
              」
            </div>
            <div style={{ fontSize: 22, color: COLORS.sub, marginTop: 20, lineHeight: 1.5 }}>出典：{DMODE.source}</div>
          </div>
          <div style={{ ...badge, position: "absolute", right: -40, top: -50 }}>
            <NoSignal size={170} />
          </div>
        </div>
      </div>
      {/* 資料には無い、動画の説明。札の外に大きく出す */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ ...line1, fontSize: 76, fontWeight: 800 }}>{offline.lines[0].text}</div>
        <div style={{ ...line2, fontSize: 132, fontWeight: 800, color: RED, lineHeight: 1.25 }}>{offline.lines[1].text}</div>
      </div>
    </Shot>
  );
};

const RelyWord: FC<{ at: number; text: string }> = ({ at, text }) => {
  const pop = usePop(at);
  return <div style={{ ...pop, fontSize: 170, fontWeight: 800, color: COLORS.accent, lineHeight: 1.2 }}>{text}</div>;
};

const DmodeRely: FC = () => {
  const { rely } = DMODE;
  const lead = useRise(rely.from + 0.3);
  const and = useRise(rely.words[1].at - 0.2);
  return (
    <Shot from={rely.from}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30, paddingTop: 40 }}>
        <div style={{ ...lead, fontSize: 72, fontWeight: 700, color: COLORS.sub }}>{rely.lead}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 36 }}>
          <RelyWord at={rely.words[0].at} text={rely.words[0].text} />
          <div style={{ ...and, fontSize: 72, fontWeight: 700, color: COLORS.sub }}>と</div>
          <RelyWord at={rely.words[1].at} text={rely.words[1].text} />
        </div>
      </AbsoluteFill>
    </Shot>
  );
};

// ---------- 1番：問いかけ（黒い地） ----------

/** スマートフォンの絵（白い線） */
const PhoneIcon: FC<{ size: number }> = ({ size }) => {
  const line = { fill: "none", stroke: "#ffffff", strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="28" y="8" width="44" height="84" rx="9" {...line} />
      <path d="M44 17 h12" {...line} />
      <circle cx="50" cy="80" r="2.5" fill="#ffffff" />
    </svg>
  );
};

/** 冒頭で「使えない」と言う物。出てから、lostAt で赤い ✕ が弾んで付き、薄くなる */
const LostThing: FC<{ at: number; lostAt: number; text: string; children: ReactNode }> = ({ at, lostAt, text, children }) => {
  const frame = useCurrentFrame();
  const pop = usePop(at);
  const cross = usePop(lostAt);
  const lost = interpolate(frame, [sec(lostAt), sec(lostAt) + 8], [0, 1], clamp);
  return (
    <div style={{ ...pop, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ position: "relative", width: 300, height: 300 }}>
        <div style={{ opacity: 1 - 0.65 * lost }}>{children}</div>
        <div style={{ ...cross, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 300, fontWeight: 900, color: RED_ON_DARK, lineHeight: 1 }}>✕</div>
      </div>
      <div style={{ fontSize: 64, fontWeight: 800, color: COLORS.white, opacity: 1 - 0.4 * lost }}>{text}</div>
    </div>
  );
};

/**
 * 冒頭の問いかけ（2026-11-13 オーナー：「見た人がそういえばしてないなみたいな風に思えるようなフックに」、文は案B）。
 * 黒い地に、声の句ごとに文字を画面いっぱいに出す
 */
const HookScene: FC = () => {
  const { ask, lost, question } = HOOK;
  const askLead = useRise(ask.leadAt);
  const askMain = useRise(ask.mainAt);
  const askPunch = usePop(ask.punchAt);
  const lostPunch = usePop(lost.lostAt);
  const qLead = useRise(question.leadAt);
  const qMid = useRise(question.midAt);
  const qPunch = usePop(question.punchAt);
  const center: CSSProperties = { alignItems: "center", justifyContent: "center", flexDirection: "column", color: COLORS.white };
  return (
    <>
      <Shot from={0} to={lost.from} background={COLORS.night}>
        <AbsoluteFill style={{ ...center, gap: 6 }}>
          <div style={{ ...askLead, fontSize: 84, fontWeight: 800, color: LIGHT }}>{ask.lead}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 28, fontWeight: 900 }}>
            {ask.words.map((w) => (
              <HookWord key={w.text} at={w.at} text={w.text} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 30, marginTop: 30, fontWeight: 900 }}>
            <span style={{ ...askMain, fontSize: 110 }}>{ask.main}</span>
            <span style={{ ...askPunch, fontSize: 190, color: ACCENT_ON_DARK, lineHeight: 1.15 }}>{ask.punch}</span>
          </div>
        </AbsoluteFill>
      </Shot>
      <Shot from={lost.from} to={question.from} background={COLORS.night}>
        <AbsoluteFill style={{ ...center, gap: 40 }}>
          <div style={{ display: "flex", gap: 170 }}>
            <LostThing at={lost.items[0].at} lostAt={lost.lostAt} text={lost.items[0].text}>
              <Icon name="notebook" size={300} />
            </LostThing>
            <LostThing at={lost.items[1].at} lostAt={lost.lostAt + 0.12} text={lost.items[1].text}>
              <PhoneIcon size={300} />
            </LostThing>
          </div>
          <div style={{ ...lostPunch, fontSize: 170, fontWeight: 900, color: RED_ON_DARK, lineHeight: 1.1 }}>{lost.punch}</div>
        </AbsoluteFill>
      </Shot>
      <Shot from={question.from} background={COLORS.night}>
        <AbsoluteFill style={{ ...center, gap: 10 }}>
          <div style={{ ...qLead, fontSize: 72, fontWeight: 800, color: LIGHT }}>{question.lead}</div>
          <div style={{ ...qMid, fontSize: 96, fontWeight: 800 }}>{question.mid}</div>
          <div style={{ ...qPunch, fontSize: 260, fontWeight: 900, lineHeight: 1.2 }}>{question.punch}</div>
        </AbsoluteFill>
      </Shot>
    </>
  );
};

const HookWord: FC<{ at: number; text: string }> = ({ at, text }) => {
  const pop = usePop(at);
  return <span style={{ ...pop, fontSize: 200, lineHeight: 1.15, color: COLORS.white }}>{text}</span>;
};

// ---------- 2番：地図の「21回」 ----------

/**
 * 地図の録画の「21回」を、声が「21回」と言う瞬間に大きく弾ませる（2026-11-13 オーナー：「日本地図の21回も、もうちょっと…」）。
 * 録画の中の数字と期間の行を白で覆い、同じ場所に大きな数字と、同じ文の期間の行を描く。数字と期間は録画のまま
 */
const QuakeCountPunch: FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(QUAKE.punchAt);
  const period = useRise(QUAKE.punchAt + 0.3, 12);
  if (frame < sec(QUAKE.punchAt)) return null;
  return (
    <AbsoluteFill style={{ fontFamily: V2_FONT }}>
      <div style={{ position: "absolute", left: 40, top: 125, width: 1000, height: 215, backgroundColor: "#ffffff" }} />
      <div style={{ ...pop, position: "absolute", left: 70, top: 120, transformOrigin: "0% 60%", fontSize: 400, fontWeight: 900, color: QUAKE_RED, lineHeight: 1, whiteSpace: "nowrap" }}>
        {QUAKE.count}
        <span style={{ fontSize: 250 }}>回</span>
      </div>
      <div style={{ ...period, position: "absolute", left: 82, top: 545, fontFamily: FONT_FAMILY, fontSize: 40, color: "#333333" }}>{QUAKE.period}</div>
    </AbsoluteFill>
  );
};

/** 録画の上に重ねる v2 の部品（SonaQuestVideo.tsx の Cut.extraOverlay から呼ぶ） */
export const V2Overlay: FC<{ section: Section }> = ({ section }) => (section.screen === "quakeMap" ? <QuakeCountPunch /> : null);

/** cards・sourceQuote の画面（SonaQuestVideo.tsx の Cut.extraScreen から呼ぶ）。cardsKey で場面を選ぶ */
export const V2Screen: FC<{ section: Section }> = ({ section }) => {
  switch (section.cardsKey) {
    case "hook":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.night }}>
          <HookScene />
        </AbsoluteFill>
      );
    case "reach":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
          <ReachScene />
        </AbsoluteFill>
      );
    case "gap":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
          <GapOpening />
          <GapCarry />
          <GapUnpreparedNumber />
          <GapForget />
          <GapBag />
        </AbsoluteFill>
      );
    case "dmode":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
          <DmodeQuote />
          <DmodeRely />
        </AbsoluteFill>
      );
    default:
      return null;
  }
};
