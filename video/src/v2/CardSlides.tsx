// v2 の紹介動画（Issue #315）の 3〜5番の画面。文と時刻は cardsText.ts。左上の見出し語は SonaQuestVideo.tsx の Caption が出す。
// 2026-11-13 オーナー（v05 を見て、チャット）：「ただスライドでのプレゼンになっている」「大事な情報は前面に押し出す」。
// カードを並べる形をやめて、次の作り方にした：
// - 1画面に1つのことだけ。数字は画面いっぱいに出す
// - 割合は棒ではなく、人や手帳の絵の並びで見せる。無いものは点線で描く
// - 文字と絵は、声がその句を言う瞬間に出す
// - いちばん言いたい 27.4% の所だけ、地を濃い色に反転する
// 依存もフォントファイルも足さず、remotion の部品と SVG だけで描く。
import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type Section } from "../sections";
import { COLORS, FONT_FAMILY, baseText } from "../theme";
import { DMODE, GAP, REACH } from "./cardsText";

const sec = (s: number) => Math.round(s * FPS);

/** 大きな数字の書体（端末にある幅の狭い欧文。無ければゴシック） */
const NUM = `"Bahnschrift", "DIN Alternate", "Helvetica Neue", ${FONT_FAMILY}`;
/** ✗ と「使えない」の色（2番の地図の点と同じ赤） */
const RED = "#d23c2c";
/** 色を付けていない絵の色 */
const MUTED = "#c9c6bd";
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

/** 少し小さい所から弾んで収まる（大きな数字・✗） */
const usePop = (at: number): CSSProperties => {
  const frame = useCurrentFrame();
  const p = useSpringAt(at, true);
  return { opacity: frame >= sec(at) ? 1 : 0, transform: `scale(${interpolate(p, [0, 1], [0.6, 1])})` };
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
    <AbsoluteFill style={{ ...baseText, backgroundColor: background ?? COLORS.background, opacity: Math.min(fadeIn, fadeOut) }}>
      {children}
    </AbsoluteFill>
  );
};

/** 下の端に出す注と出典 */
const Foot: FC<{ at: number; lines: string[]; color?: string }> = ({ at, lines, color }) => {
  const rise = useRise(at, 12);
  return (
    <div style={{ ...rise, position: "absolute", left: 132, right: 132, bottom: 48, fontSize: 24, lineHeight: 1.5, color: color ?? COLORS.sub }}>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
};

/** 人の絵 */
const Person: FC<{ color: string; width: number }> = ({ color, width }) => (
  <svg width={width} height={width * 2} viewBox="0 0 60 120">
    <circle cx="30" cy="17" r="15" fill={color} />
    <path d="M10 62 Q10 38 30 38 Q50 38 50 62 L50 104 Q50 114 40 114 L20 114 Q10 114 10 104 Z" fill={color} />
  </svg>
);

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

/** 手帳 100 冊の並び。fillAt から 1.2 秒かけて filled 冊に色を付け、残りは restMissing なら点線に変える */
const NotebookGrid: FC<{ appearAt: number; fillAt: number; filled: number; restMissing?: boolean }> = ({ appearAt, fillAt, filled, restMissing }) => {
  const frame = useCurrentFrame();
  const appear = useRise(appearAt);
  const n = interpolate(frame, [sec(fillAt), sec(fillAt + 1.2)], [0, filled], { ...clamp, easing: Easing.out(Easing.cubic) });
  const done = frame >= sec(fillAt + 1.2);
  return (
    <div style={{ ...appear, display: "grid", gridTemplateColumns: "repeat(10, 46px)", gap: "9px 12px" }}>
      {Array.from({ length: 100 }, (_, i) =>
        i < n ? (
          <Notebook key={i} color={COLORS.accent} width={46} />
        ) : (
          <Notebook key={i} color={MUTED} width={46} missing={Boolean(restMissing) && done} />
        ),
      )}
    </div>
  );
};

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

// ---------- 3番：薬は身近 ----------

const ReachPeople: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { opening, visit } = REACH;
  const openingOut = interpolate(frame, [sec(visit.from) - 7, sec(visit.from)], [1, 0], clamp);
  const openingRise = useRise(opening.at);
  const label = useRise(visit.from + 0.25);
  const big = usePop(visit.bigAt);
  return (
    <Shot from={0} to={REACH.notebook.from}>
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, height: 330, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {frame < sec(visit.from) ? (
          <div style={{ ...openingRise, opacity: (openingRise.opacity as number) * openingOut, fontSize: 112, fontWeight: 800 }}>{opening.text}</div>
        ) : (
          <>
            <div style={{ ...label, fontSize: 56, fontWeight: 700, color: COLORS.sub }}>{visit.label}</div>
            <div style={{ ...big, display: "flex", alignItems: "baseline", gap: 24, color: COLORS.accent, fontWeight: 800 }}>
              <span style={{ fontSize: 64 }}>{visit.bigLead}</span>
              <span style={{ fontSize: 190, lineHeight: 1.1 }}>{visit.big}</span>
            </div>
          </>
        )}
      </div>
      {/* 10人の並び。頭から灰色で1人ずつ現れ、「10人に4人」で4人に色が付く */}
      <div style={{ position: "absolute", top: 560, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 34 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const appear = spring({ frame: frame - sec(1.2) - i * 2, fps, config: { damping: 200 } });
          const onAt = sec(visit.bigAt) + i * 4;
          const on = i < 4 ? spring({ frame: frame - onAt, fps, config: { damping: 11, stiffness: 150 } }) : 0;
          return (
            <div key={i} style={{ opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [30, 0])}px) scale(${1 + 0.14 * on})`, transformOrigin: "50% 100%" }}>
              <Person color={i < 4 && frame >= onAt ? COLORS.accent : MUTED} width={112} />
            </div>
          );
        })}
      </div>
      <Foot at={visit.from + 0.25} lines={[visit.note, `出典：${visit.source}`]} />
    </Shot>
  );
};

const ReachNotebook: FC = () => {
  const { notebook } = REACH;
  const label = useRise(notebook.from + 0.2);
  return (
    <Shot from={notebook.from}>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, bottom: 150, display: "flex", alignItems: "center", justifyContent: "center", gap: 110 }}>
        <NotebookGrid appearAt={notebook.from + 0.2} fillAt={notebook.bigAt} filled={Math.round(notebook.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 26, width: 900 }}>
          <div style={{ ...label, fontSize: 56, fontWeight: 700, lineHeight: 1.35 }}>{notebook.label}</div>
          <BigPercent value={notebook.value} at={notebook.bigAt} size={330} color={COLORS.accent} />
        </div>
      </div>
      <Foot at={notebook.from + 0.2} lines={[notebook.note, `出典：${notebook.source}`]} />
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

const SurveyLead: FC<{ at: number; color?: string }> = ({ at, color }) => {
  const rise = useRise(at, 12);
  return (
    <div style={{ ...rise, position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", fontSize: 44, fontWeight: 700, color: color ?? COLORS.sub }}>
      {GAP.surveyLead}
    </div>
  );
};

const GapCarry: FC = () => {
  const { carry, unprepared } = GAP;
  const label = useRise(carry.labelAt);
  const of = useRise(carry.bigAt);
  return (
    <Shot from={carry.from} to={unprepared.from}>
      <SurveyLead at={carry.from + 0.1} />
      <div style={{ position: "absolute", top: 220, left: 0, right: 0, bottom: 130, display: "flex", alignItems: "center", justifyContent: "center", gap: 110 }}>
        {/* 手帳を持っている人を 100 冊で表し、持ち歩いている分だけ色を付ける。残りは点線（手元に無い）にする */}
        <NotebookGrid appearAt={carry.labelAt} fillAt={carry.bigAt} filled={Math.round(carry.value)} restMissing />
        <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 900 }}>
          <div style={{ ...label, fontSize: 56, fontWeight: 700, lineHeight: 1.35 }}>{carry.label}</div>
          <BigPercent value={carry.value} at={carry.bigAt} size={330} color={COLORS.accent} />
          <div style={{ ...of, fontSize: 38, fontWeight: 700, color: COLORS.sub }}>（{carry.of}）</div>
        </div>
      </div>
      <Foot at={carry.labelAt} lines={[carry.note, `出典：${GAP.footnote}`]} />
    </Shot>
  );
};

/** できていないことの1行。✗ が弾んで出て、文が続いて上がる */
const Check: FC<{ at: number; text: string }> = ({ at, text }) => {
  const pop = usePop(at);
  const rise = useRise(at + 0.1);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 30 }}>
      <div style={{ ...pop, flex: "0 0 auto", width: 96, height: 96, borderRadius: 48, backgroundColor: RED, color: COLORS.white, fontSize: 64, fontWeight: 700, lineHeight: "96px", textAlign: "center" }}>
        ✕
      </div>
      <div style={{ ...rise, fontSize: 50, fontWeight: 800, lineHeight: 1.4, color: COLORS.white, paddingTop: 10, whiteSpace: "pre-line" }}>{text}</div>
    </div>
  );
};

/** いちばん言いたい数字。地を濃い色にして、27.4% を画面いっぱいに出し、できていないことを ✗ で1つずつ出す */
const GapUnprepared: FC = () => {
  const frame = useCurrentFrame();
  const { unprepared } = GAP;
  const of = useRise(unprepared.bigAt - 0.3);
  // 1つ目の ✗ の手前で、数字を左に寄せて小さくし、右を空ける
  const move = spring({ frame: frame - sec(unprepared.checks[0].at - 0.5), fps: FPS, config: { damping: 200 } });
  const x = interpolate(move, [0, 1], [0, -520]);
  const scale = interpolate(move, [0, 1], [1, 0.62]);
  const light = "rgba(255,255,255,0.72)";
  return (
    <Shot from={unprepared.from} background={COLORS.night}>
      <SurveyLead at={unprepared.from + 0.1} color={light} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translateX(${x}px) scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ ...of, fontSize: 64, fontWeight: 700, color: light }}>{unprepared.of}</div>
          <BigPercent value={unprepared.value} at={unprepared.bigAt} size={400} color={COLORS.white} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 890, right: 110, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 56 }}>
        {unprepared.checks.map((c) => (
          <Check key={c.text} at={c.at} text={c.text} />
        ))}
      </div>
      <Foot at={unprepared.bigAt} lines={[unprepared.note, `出典：${GAP.footnote}`]} color="rgba(255,255,255,0.6)" />
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

/** cards・sourceQuote の画面（SonaQuestVideo.tsx の Cut.extraScreen から呼ぶ）。cardsKey で場面を選ぶ */
export const V2Screen: FC<{ section: Section }> = ({ section }) => {
  switch (section.cardsKey) {
    case "reach":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
          <ReachPeople />
          <ReachNotebook />
        </AbsoluteFill>
      );
    case "gap":
      return (
        <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
          <GapOpening />
          <GapCarry />
          <GapUnprepared />
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
