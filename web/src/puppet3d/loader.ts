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
