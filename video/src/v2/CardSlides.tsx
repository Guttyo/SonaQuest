// v2 の紹介動画（Issue #315）の画面：数字のカード（3・4番）と、資料の一節の札（5番）。
// 依存を足さず、remotion の部品だけで描く。文は cardsText.ts。左上の見出し語は SonaQuestVideo.tsx の Caption が出す。
import type { CSSProperties, FC } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type Section } from "../sections";
import { COLORS, baseText } from "../theme";
import { CARD_SETS, type SourceQuoteSet, type StatCard, type StatsSet } from "./cardsText";

const sec = (s: number) => Math.round(s * FPS);

/** 現れる動き（ばねで下から上がる）。slides.tsx の useRise と同じ動き */
const useRise = (startFrame: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - startFrame, fps, config: { damping: 200 } });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(progress, [0, 1], [24, 0])}px)`,
  } satisfies CSSProperties;
};

/** 小数つきのカウントアップ（start から 1.2 秒で 0 → value。終わりはゆっくり） */
const useCountUp = (value: number, decimals: number, start: number) => {
  const frame = useCurrentFrame();
  const v = interpolate(frame, [start, start + sec(1.2)], [0, value], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return v.toFixed(decimals);
};

/** 棒グラフ（0 から値まで、カウントアップと同じ速さで伸びる）。右端に目盛りの最大、棒の横に値 */
const Bar: FC<{ card: StatCard; start: number; valueText: string | null }> = ({ card, start, valueText }) => {
  const frame = useCurrentFrame();
  const ratio = interpolate(frame, [start, start + sec(1.2)], [0, card.value / card.barMax], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", height: 44, borderRadius: 22, backgroundColor: "rgba(31,42,51,0.10)", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${ratio * 100}%`, borderRadius: 22, backgroundColor: COLORS.accent }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: COLORS.sub }}>
        <span>{valueText ?? "0"}</span>
        <span>{card.barMaxLabel}</span>
      </div>
    </div>
  );
};

/** ✗ の色（2番の地図の点と同じ赤） */
const CROSS = "#d23c2c";

/** 当てはまる条件の1行。✗ がばねで大きく出て、文が続いて上がる */
const Check: FC<{ at: number; text: string }> = ({ at, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = sec(at);
  const pop = spring({ frame: frame - start, fps, config: { damping: 10, stiffness: 160 } });
  const rise = useRise(start + 3);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
      <div
        style={{
          flex: "0 0 auto",
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: CROSS,
          color: COLORS.white,
          fontSize: 36,
          fontWeight: 700,
          lineHeight: "52px",
          textAlign: "center",
          opacity: frame >= start ? 1 : 0,
          transform: `scale(${pop})`,
        }}
      >
        ✕
      </div>
      <div style={{ ...rise, fontSize: 32, fontWeight: 700, lineHeight: 1.45, paddingTop: 4 }}>{text}</div>
    </div>
  );
};

/** 後のカードが出たら、前のカードを薄くして目を移す */
const useDimAfter = (nextAt: number | undefined) => {
  const frame = useCurrentFrame();
  if (nextAt === undefined) return 1;
  return interpolate(frame, [sec(nextAt), sec(nextAt + 0.6)], [1, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

const Card: FC<{ card: StatCard; nextAt?: number }> = ({ card, nextAt }) => {
  const start = sec(card.at);
  const rise = useRise(start);
  const dim = useDimAfter(nextAt);
  const shown = useCountUp(card.value, card.decimals, start);
  return (
    <div
      style={{
        ...baseText,
        ...rise,
        opacity: (rise.opacity as number) * dim,
        width: 800,
        minHeight: 600,
        boxSizing: "border-box",
        padding: "44px 52px 40px",
        borderRadius: 28,
        backgroundColor: COLORS.white,
        boxShadow: "0 12px 36px rgba(31,42,51,0.12)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ color: COLORS.accent, fontWeight: 700, lineHeight: 1 }}>
        {card.big ? (
          <span style={{ fontSize: 120 }}>{card.big}</span>
        ) : (
          <>
            {/* 等幅の書体は小数点が広く空くので、ゴシックの等幅数字（tabular-nums）にする */}
            <span style={{ fontSize: 130, fontVariantNumeric: "tabular-nums" }}>{shown}</span>
            <span style={{ fontSize: 60, marginLeft: 8 }}>{card.unit}</span>
          </>
        )}
      </div>
      {/* 大きく言い換えたときは、棒の左に元の値を出す */}
      <Bar card={card} start={start} valueText={card.big ? `${shown}${card.unit}` : null} />
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.4 }}>{card.label}</div>
      {card.checks ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {card.checks.map((c) => (
            <Check key={c.text} at={c.at} text={c.text} />
          ))}
        </div>
      ) : null}
      <div style={{ fontSize: 24, color: COLORS.sub, lineHeight: 1.5 }}>{card.note}</div>
      {card.source ? (
        <div style={{ marginTop: "auto", fontSize: 22, color: COLORS.sub, lineHeight: 1.5 }}>出典：{card.source}</div>
      ) : null}
    </div>
  );
};

const StatsSlide: FC<{ set: StatsSet }> = ({ set }) => {
  const lead = useRise(0);
  const foot = useRise(sec(set.cards[0]?.at ?? 0));
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, marginTop: 70 }}>
        {set.lead ? <div style={{ ...baseText, ...lead, fontSize: 40, fontWeight: 700, color: COLORS.sub }}>{set.lead}</div> : null}
        <div style={{ display: "flex", gap: 56, alignItems: "stretch" }}>
          {set.cards.map((card, i) => (
            <Card key={card.label} card={card} nextAt={set.cards[i + 1]?.at} />
          ))}
        </div>
        {set.footnote ? (
          <div style={{ ...baseText, ...foot, width: 1656, fontSize: 24, color: COLORS.sub, lineHeight: 1.5 }}>出典：{set.footnote}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const Statement: FC<{ at: number; text: string }> = ({ at, text }) => {
  const rise = useRise(sec(at));
  return <div style={{ ...baseText, ...rise, fontSize: 52, fontWeight: 700 }}>{text}</div>;
};

/** 資料の一節（引用）を札にし、その下に資料に無い説明の文を、引用と見た目を分けて出す */
const SourceQuoteSlide: FC<{ set: SourceQuoteSet }> = ({ set }) => {
  const quote = useRise(sec(set.quoteAt));
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44, marginTop: 70, width: 1560 }}>
        <div
          style={{
            ...baseText,
            ...quote,
            boxSizing: "border-box",
            width: "100%",
            padding: "40px 56px 36px",
            borderRadius: 24,
            backgroundColor: COLORS.white,
            borderLeft: `14px solid ${COLORS.accent}`,
            boxShadow: "0 12px 36px rgba(31,42,51,0.12)",
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.accent, marginBottom: 18 }}>{set.heading}</div>
          <div style={{ fontSize: 40, lineHeight: 1.7 }}>「{set.quote}」</div>
          <div style={{ fontSize: 22, color: COLORS.sub, marginTop: 22, lineHeight: 1.5 }}>出典：{set.source}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          {set.statements.map((s) => (
            <Statement key={s.text} at={s.at} text={s.text} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** cards・sourceQuote の画面（SonaQuestVideo.tsx の Cut.extraScreen から呼ぶ） */
export const V2Screen: FC<{ section: Section }> = ({ section }) => {
  const set = section.cardsKey ? CARD_SETS[section.cardsKey] : undefined;
  if (!set) return null;
  return set.kind === "stats" ? <StatsSlide set={set} /> : <SourceQuoteSlide set={set} />;
};
