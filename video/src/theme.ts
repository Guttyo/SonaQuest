// 提出動画の書体・色と、素材の有無の確かめ（Issue #28・#262）。SonaQuestVideo.tsx と slides.tsx から使う。
import type { CSSProperties } from "react";
import { getStaticFiles } from "remotion";

/** 端末のゴシックの並び（web/src/styles.css と同じ考え。外部のフォント配信もフォントファイルも使わない） */
export const FONT_FAMILY =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", system-ui, sans-serif';

/** 等幅（10のコツの 09 フォントの使い分け）：数字・時刻・件数に使う。見出しと文はゴシック */
export const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", "MS Gothic", monospace';

export const COLORS = {
  background: "#fbf7ea",
  ink: "#1f2a33",
  sub: "#5b6770",
  frame: "#1f2a33",
  placeholder: "#e3dfd6",
  accent: "#2f6f8f",
  /** Managed Agents の札の色（Claude の札と見分ける） */
  agent: "#6a5a9c",
  /** コード（Claude ではない）の札の色 */
  code: "#5b6770",
  white: "#ffffff",
  night: "#0d1114",
} as const;

export const baseText: CSSProperties = { fontFamily: FONT_FAMILY, color: COLORS.ink };

/** video/public/ にその名前のファイルがあるか。無い素材は描かない（描くと書き出しが落ちる） */
export const hasStaticFile = (name: string | null | undefined): name is string => {
  if (!name) return false;
  return getStaticFiles().some((f) => f.name === name);
};

/**
 * 拡張子を除いた名前（photos/03-a など）から、video/public/ にある写真のファイルを探す。
 * jpg・jpeg・png・webp のどれでもよい。無ければ null。
 */
export const resolveImage = (base: string): string | null => {
  const found = getStaticFiles().find((f) => f.name.startsWith(`${base}.`) && /\.(jpe?g|png|webp)$/i.test(f.name));
  return found ? found.name : null;
};
