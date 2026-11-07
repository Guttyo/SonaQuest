import {
  LOGO_ACCENT_PATH,
  LOGO_COLOR_ACCENT,
  LOGO_COLOR_WORD,
  LOGO_HEIGHT,
  LOGO_LABEL,
  LOGO_SUBTITLE,
  LOGO_SUBTITLE_BASELINE,
  LOGO_SUBTITLE_FONT_FAMILY,
  LOGO_SUBTITLE_HEIGHT,
  LOGO_SUBTITLE_SIZE,
  LOGO_SUBTITLE_SPACING,
  LOGO_SUBTITLE_WEIGHT,
  LOGO_WIDTH,
  LOGO_WORD_PATH,
} from "./logoData";

interface Props {
  className?: string;
  /** 下に名前の由来（副題）を添える（動画のタイトルと締めの版）。省くと文字だけ */
  withSubtitle?: boolean;
  /**
   * 読み上げの名前。省くと「SonaQuest」（副題つきなら「SonaQuest」と副題）。
   * 空の文字にすると飾りとして扱い、読み上げない（近くに同じ文字があるとき）
   */
  label?: string;
}

/**
 * SonaQuest の文字のロゴ（Issue #263、ADR-0066）。文字は Manrope Bold から作った図形で、フォントは読み込まない。
 * 副題は文字のまま置き、書体は端末のゴシック（ADR-0037）。図形と色は logoData.ts（自動生成）だけが持つ
 */
export function SonaQuestLogo({ className, withSubtitle = false, label }: Props) {
  const height = withSubtitle ? LOGO_SUBTITLE_HEIGHT : LOGO_HEIGHT;
  const name = label ?? (withSubtitle ? `${LOGO_LABEL} ${LOGO_SUBTITLE}` : LOGO_LABEL);
  const a11y = name === "" ? { "aria-hidden": true } : { role: "img", "aria-label": name };
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOGO_WIDTH} ${height}`}
      focusable="false"
      {...a11y}
    >
      <path fill={LOGO_COLOR_WORD} d={LOGO_WORD_PATH} />
      <path fill={LOGO_COLOR_ACCENT} d={LOGO_ACCENT_PATH} />
      {withSubtitle && (
        <text
          x={LOGO_WIDTH / 2}
          y={LOGO_SUBTITLE_BASELINE}
          textAnchor="middle"
          fontFamily={LOGO_SUBTITLE_FONT_FAMILY}
          fontSize={LOGO_SUBTITLE_SIZE}
          fontWeight={LOGO_SUBTITLE_WEIGHT}
          letterSpacing={LOGO_SUBTITLE_SPACING}
          fill={LOGO_COLOR_WORD}
        >
          {LOGO_SUBTITLE}
        </text>
      )}
    </svg>
  );
}
