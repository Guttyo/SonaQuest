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

/**
 * 見た目の案（Issue #164）。オーナーが3つの案から選ぶまでの見本で、見本のページ（`?look=a` など）でだけ切り替える。
 * アプリの画面は "current"（今の姿）のまま。選ばれた案を current に入れ替え、ほかの案はその PR で消す。
 * どの案も、医療者を表す色の組み合わせ（白衣の白と十字の赤、手術着の青緑など）や記号を使わない（ADR-0020）
 */
export type PuppetLook = "current" | "a" | "b" | "c";

export const LOOKS: readonly PuppetLook[] = ["current", "a", "b", "c"];

export const LOOK_LABELS: Record<PuppetLook, string> = {
  current: "今の姿",
  a: "案A まるい芽",
  b: "案B すらりとした案内役",
  c: "案C どうぶつ風",
};

/** 案ごとの色。extra は案ごとの飾り（案A の葉の芯、案B のアンテナの玉、案C の口まわりとおなか） */
export const LOOK_PALETTES: Record<Exclude<PuppetLook, "current">, { main: PuppetPalette; relief: PuppetPalette; extra: [string, string] }> = {
  // 案A：卵形の体に大きな頭、頭の上に双葉。クリームと若葉の緑、桃色の頬。やわらかく幼い雰囲気
  a: {
    main: { body: "#fff4e3", accent: "#74c08f", cheek: "#ff9f86", mouth: "#9a4a3a", eye: "#2b2a28", highlight: "#ffffff" },
    relief: { body: "#e2f3e8", accent: "#f2a65a", cheek: "#f7bf8c", mouth: "#9a4a3a", eye: "#2b2a28", highlight: "#ffffff" },
    extra: ["#ffd27a", "#ffd27a"],
  },
  // 案B：細長い体に藍色のマフラー、頭の上に短いアンテナ。薄いラベンダーと黄色の頬。落ち着いた案内役の雰囲気
  b: {
    main: { body: "#ebe5f6", accent: "#4b5aa8", cheek: "#f6c35b", mouth: "#7a3b33", eye: "#1f2433", highlight: "#ffffff" },
    relief: { body: "#f4e4c9", accent: "#c4572f", cheek: "#f2a07b", mouth: "#7a3b33", eye: "#1f2433", highlight: "#ffffff" },
    extra: ["#f6c35b", "#f2a07b"],
  },
  // 案C：ずんぐりした体に丸い耳、口まわりとおなかがクリーム。キャラメル色と緑の襟。親しみやすい動物の雰囲気
  c: {
    main: { body: "#e8b888", accent: "#5a9e6f", cheek: "#f08a6c", mouth: "#7a3b33", eye: "#2b2a28", highlight: "#ffffff" },
    relief: { body: "#bcd9c6", accent: "#e07a3f", cheek: "#f2a07b", mouth: "#7a3b33", eye: "#2b2a28", highlight: "#ffffff" },
    extra: ["#fff1dc", "#fff6ea"],
  },
};

/** 案ごとの色を選ぶ。current は今の色 */
export function lookPalette(look: PuppetLook, relief: boolean): PuppetPalette {
  return look === "current" ? paletteFor(relief) : LOOK_PALETTES[look][relief ? "relief" : "main"];
}

export function lookExtra(look: PuppetLook, relief: boolean): string {
  return look === "current" ? "#ffffff" : LOOK_PALETTES[look].extra[relief ? 1 : 0];
}
