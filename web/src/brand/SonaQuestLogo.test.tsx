import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LOGO_ACCENT_PATH,
  LOGO_COLOR_ACCENT,
  LOGO_COLOR_WORD,
  LOGO_HEIGHT,
  LOGO_LABEL,
  LOGO_SUBTITLE,
  LOGO_SUBTITLE_HEIGHT,
  LOGO_WIDTH,
  LOGO_WORD_PATH,
} from "./logoData";
import plainSvg from "./sonaquest-logo.svg?raw";
import subtitleSvg from "./sonaquest-logo-subtitle.svg?raw";
import { SonaQuestLogo } from "./SonaQuestLogo";

describe("SonaQuest のロゴ（Issue #263、ADR-0066）", () => {
  it("SVG の2つのファイルは logoData.ts と同じ図形・大きさ・色を持つ（手で直して食い違わない）", () => {
    for (const svg of [plainSvg, subtitleSvg]) {
      expect(svg).toContain(`<path fill="${LOGO_COLOR_WORD}" d="${LOGO_WORD_PATH}"/>`);
      expect(svg).toContain(`<path fill="${LOGO_COLOR_ACCENT}" d="${LOGO_ACCENT_PATH}"/>`);
    }
    expect(plainSvg).toContain(`viewBox="0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}"`);
    expect(plainSvg).toContain(`aria-label="${LOGO_LABEL}"`);
    expect(plainSvg).not.toContain("<text");
    expect(subtitleSvg).toContain(`viewBox="0 0 ${LOGO_WIDTH} ${LOGO_SUBTITLE_HEIGHT}"`);
    expect(subtitleSvg).toContain(`>${LOGO_SUBTITLE}</text>`);
  });

  it("フォントを読み込まない（フォントファイル・外部のフォント配信・@font-face を使わない。ADR-0037）", () => {
    for (const svg of [plainSvg, subtitleSvg]) {
      expect(svg).not.toMatch(/@font-face|url\(|<image|<style|href=/);
    }
  });

  it("OFL の表記を SVG に残す", () => {
    for (const svg of [plainSvg, subtitleSvg]) {
      expect(svg).toContain("SIL Open Font License 1.1");
      expect(svg).toContain("The Manrope Project Authors");
    }
  });

  it("部品：既定は「SonaQuest」と読み上げる画像。副題つきは副題の文字も描く", () => {
    const plain = renderToStaticMarkup(<SonaQuestLogo />);
    expect(plain).toContain('role="img"');
    expect(plain).toContain(`aria-label="${LOGO_LABEL}"`);
    expect(plain).not.toContain("<text");

    const withSubtitle = renderToStaticMarkup(<SonaQuestLogo withSubtitle />);
    expect(withSubtitle).toContain(`aria-label="${LOGO_LABEL} ${LOGO_SUBTITLE}"`);
    expect(withSubtitle).toContain(`>${LOGO_SUBTITLE}</text>`);
  });

  it("部品：label を空にすると飾りとして読み上げない", () => {
    const hidden = renderToStaticMarkup(<SonaQuestLogo label="" />);
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).not.toContain('role="img"');
  });
});
