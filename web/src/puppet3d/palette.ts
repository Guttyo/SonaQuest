/**
 * パペットの色（ADR-0032）。クリームホワイト・淡いミント・温かいオレンジを基調にする（ADR-0020、styles.css の :root）。
 * 医療者を表す色の組み合わせ（白衣の白と十字の赤など）や記号は使わない。
 * 係の交代（出来事「どれにも当てはまらない」）では、別の色のパペットにする。
 * 2026-11-06 オーナー決定（チャット、Issue #164）：見た目は「案C どうぶつ風」。キャラメル色の体に丸い耳、
 * 口まわりとおなかがクリーム、緑の襟。交代した係（クエ）は淡いミントの体に温かいオレンジの襟
 */
export interface PuppetPalette {
  body: string;
  accent: string;
  cheek: string;
  mouth: string;
  eye: string;
  highlight: string;
  /** 口まわりとおなか */
  extra: string;
}

/** 本来の係（ソナ）：キャラメル色の体に緑の襟、珊瑚色の頬、クリームの口まわりとおなか */
export const MAIN_PALETTE: PuppetPalette = {
  body: "#e8b888",
  accent: "#5a9e6f",
  cheek: "#f08a6c",
  mouth: "#7a3b33",
  eye: "#2b2a28",
  highlight: "#ffffff",
  extra: "#fff1dc",
};

/** 交代した係（クエ）：淡いミントの体に温かいオレンジの襟 */
export const RELIEF_PALETTE: PuppetPalette = {
  body: "#bcd9c6",
  accent: "#e07a3f",
  cheek: "#f2a07b",
  mouth: "#7a3b33",
  eye: "#2b2a28",
  highlight: "#ffffff",
  extra: "#fff6ea",
};

export function paletteFor(relief: boolean): PuppetPalette {
  return relief ? RELIEF_PALETTE : MAIN_PALETTE;
}
