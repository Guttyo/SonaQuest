import type { ListenerMode } from "./types";

/**
 * 3D を出してよいかの判定（ADR-0032）。three を読み込まずに決める（このファイルは three を import しない）。
 * 3D を出さないとき：WebGL 2 が使えない、動きを減らす設定、この画面で一度 3D が失敗した。
 * どれでも 2D の聞き取り係で続ける。
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function decideRenderMode(input: {
  requested: ListenerMode;
  webgl: boolean;
  reducedMotion: boolean;
  failed: boolean;
}): ListenerMode {
  if (input.requested !== "3d") return "2d";
  if (!input.webgl || input.reducedMotion || input.failed) return "2d";
  return "3d";
}

interface ContextSource {
  getContext(kind: "webgl2"): unknown;
}

/**
 * WebGL 2 の文脈を作れるかを見る（three は WebGL 1 に対応しない）。
 * 確かめるために作った文脈は、すぐに手放す。例外が出たら使えないものとして扱う
 */
export function detectWebGL(createCanvas: () => ContextSource | null): boolean {
  try {
    const canvas = createCanvas();
    if (canvas === null) return false;
    const gl = canvas.getContext("webgl2") as {
      getExtension?: (name: string) => { loseContext?: () => void } | null;
    } | null;
    if (gl === null || gl === undefined) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}

type MatchMedia = (query: string) => { matches: boolean };

/** 動きを減らす設定か。matchMedia が無い環境では「設定なし」とする */
export function prefersReducedMotion(matchMedia: MatchMedia | undefined): boolean {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

// --- ブラウザでの状態（画面ごとに1回だけ確かめる） ---

/** ブラウザの matchMedia。無い環境（試験、古いブラウザ）では undefined */
export function currentMatchMedia(): MatchMedia | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return (query) => window.matchMedia(query);
}

/** 動きを減らす設定が訓練の途中で変わったら知らせる（3D を止めて 2D にする） */
export function subscribeReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.("change", listener);
  return () => query.removeEventListener?.("change", listener);
}

let webglCache: boolean | null = null;

/** WebGL 2 が使えるか。確かめるたびに文脈を作らないよう、1回だけ確かめて覚えておく */
export function webglAvailable(): boolean {
  if (webglCache === null) {
    webglCache =
      typeof document === "undefined"
        ? false
        : detectWebGL(() => document.createElement("canvas"));
  }
  return webglCache;
}

let failed = false;
const failedListeners = new Set<() => void>();

/**
 * この画面の残りでは 3D を使わない（読み込みの失敗、描画の途中で文脈が失われたとき）。
 * 次の質問で作り直して失敗を繰り返さないよう、画面を開き直すまで 2D のままにする
 */
export function markPuppetFailed(): void {
  if (failed) return;
  failed = true;
  for (const listener of failedListeners) listener();
}

export function puppetFailed(): boolean {
  return failed;
}

export function subscribePuppetFailed(listener: () => void): () => void {
  failedListeners.add(listener);
  return () => failedListeners.delete(listener);
}

/** 試験用：覚えた状態を消す */
export function resetSupportForTests(): void {
  webglCache = null;
  failed = false;
  failedListeners.clear();
}
