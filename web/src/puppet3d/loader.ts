import {
  currentMatchMedia,
  markPuppetFailed,
  prefersReducedMotion,
  puppetFailed,
  webglAvailable,
} from "./support";

/**
 * three を含む描画の部分（stage.ts）は、3D を表示するときだけ読み込む（ADR-0032）。
 * 最初の表示の読み込みに three を含めないため、ここから静的に import しない。
 */
type StageModule = typeof import("./stage");

let loaded: StageModule | null = null;
let pending: Promise<StageModule> | null = null;

/** 読み込み済みなら返す（質問が変わって作り直すときに、待たずに描くため） */
export function peekStage(): StageModule | null {
  return loaded;
}

export function loadStage(): Promise<StageModule> {
  if (loaded !== null) return Promise.resolve(loaded);
  pending ??= import("./stage").then(
    (module) => {
      loaded = module;
      return module;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/**
 * 3D を出す前に読み込んでおく（モード選択の画面などから呼ぶ）。
 * 3D を出せない環境（WebGL 2 が無い、動きを減らす設定、この画面で失敗済み）では何もしない。
 * 読み込めなかったら、この画面では 2D で続ける
 */
export function preloadPuppet3D(): void {
  if (!webglAvailable() || prefersReducedMotion(currentMatchMedia()) || puppetFailed()) return;
  loadStage().catch(() => markPuppetFailed());
}
