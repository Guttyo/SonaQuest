// v2 の紹介動画（Issue #315）で、Claude で作ったことを冒頭から伝えるテロップと札。
// 2026-11-25 オーナー（v20 を見て、チャット）：「冒頭のお薬手帳の説明がめっちゃ長くてClaudeの話になるのが非常に後になってる」
// → 案を出し、オーナーが「案A＋Bで作って」と選んだ（A：1番の問いかけの後に1行のテロップ。B：2〜5番の間、画面の隅に小さな札）。
// 声は足さない。場面の長さも変えない。文言は Claude Code の下書き（オーナーが見て直す）。
import type { CSSProperties, FC } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { FPS, type Section } from "../sections";
import { COLORS, FONT_FAMILY } from "../theme";
import { GAP, HOOK } from "./cardsText";

/** A：1番の終わりのテロップ。2番の頭では、同じ文を右上の札に出してから短い札に替える（1番だけでは読む時間が足りないので） */
export const CLAUDE_NOTE = {
  line: "Claude と作った、お薬の避難訓練「SonaQuest」の紹介です",
  /** 1番で出す時刻（声の「どう伝えますか」が出た少し後。場面の終わりまで） */
  hookFrom: HOOK.question.punchAt + 0.6,
  /** 2番の頭で、同じ文を札に出しておく秒数 */
  carrySeconds: 3.6,
  /** B：2〜5番の隅の札 */
  chip: "SonaQuest ｜ Built with Claude",
} as const;

const fade = (t: number, from: number, to: number, edge = 0.3) =>
  Math.min(
    interpolate(t, [from, from + edge], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(t, [to - edge, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

/** 右上の札。明るい画面にも暗い画面にも載るよう、濃い地に白い字と薄い縁 */
const chipStyle: CSSProperties = {
  position: "absolute",
  top: 26,
  right: 40,
  padding: "8px 20px",
  borderRadius: 999,
  backgroundColor: "rgba(15, 23, 32, 0.82)",
  border: "1.5px solid rgba(255, 255, 255, 0.28)",
  color: COLORS.white,
  fontFamily: FONT_FAMILY,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
};

export const ClaudeNote: FC<{ section: Section }> = ({ section }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const seconds = section.durationInFrames / FPS;
  const key = section.cardsKey;

  if (key === "hook") {
    const opacity = interpolate(t, [CLAUDE_NOTE.hookFrom, CLAUDE_NOTE.hookFrom + 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (opacity <= 0) return null;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 92,
            textAlign: "center",
            color: COLORS.white,
            fontFamily: FONT_FAMILY,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "0.03em",
            opacity: opacity * 0.92,
          }}
        >
          {CLAUDE_NOTE.line}
        </div>
      </AbsoluteFill>
    );
  }

  if (key !== "quake" && key !== "reach" && key !== "gap" && key !== "dmode") return null;
  const carry = key === "quake" ? CLAUDE_NOTE.carrySeconds : 0;
  // 場面の変わり目で消えたり出たりしないよう、2〜5番の間は出したままにする（5番の終わりだけ消す）
  // 4番の後半は、右上に「常用薬のある人の 27.4%」が小さく残るので、その少し前に札を引く（5番の頭でまた出る）
  const end =
    key === "dmode" ? fade(t, -1, seconds, 0.4)
    : key === "gap" ? fade(t, -1, GAP.unprepared.forget.from - 0.2, 0.4)
    : 1;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {carry > 0 && t < carry ? <div style={{ ...chipStyle, opacity: fade(t, 0, carry) }}>{CLAUDE_NOTE.line}</div> : null}
      {t >= carry - 0.3 ? <div style={{ ...chipStyle, opacity: Math.min(end, carry > 0 ? fade(t, carry - 0.3, 9999) : 1) }}>{CLAUDE_NOTE.chip}</div> : null}
    </AbsoluteFill>
  );
};
