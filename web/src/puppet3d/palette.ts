/**
 * パペットの色（ADR-0032）。クリームホワイト・淡いミント・温かいオレンジを基調にする（ADR-0020、styles.css の :root）。
 * 医療者を表す色の組み合わせ（白衣の白と十字の赤など）や記号は使わない。
 * 係の交代（出来事「どれにも当てはまらない」）では、別の色のパペットにする。
 */
export interface PuppetPalette {
  body: string;
  accent: string;
  cheek: string;
  mouth: string;
  eye: string;
  highlight: string;
}

/** 本来の係：クリームホワイトの体に淡いミントの襟、温かいオレンジの頬 */
export const MAIN_PALETTE: PuppetPalette = {
  body: "#fdf1dc",
  accent: "#8fd3b4",
  cheek: "#f4a259",
  mouth: "#9a4a3a",
  eye: "#2b2a28",
  highlight: "#ffffff",
};

/** 交代した係：淡いミントの体に温かいオレンジの襟 */
export const RELIEF_PALETTE: PuppetPalette = {
  body: "#c9ecdb",
  accent: "#f4a259",
  cheek: "#f7bf8c",
  mouth: "#9a4a3a",
  eye: "#2b2a28",
  highlight: "#ffffff",
};

export function paletteFor(relief: boolean): PuppetPalette {
  return relief ? RELIEF_PALETTE : MAIN_PALETTE;
}
