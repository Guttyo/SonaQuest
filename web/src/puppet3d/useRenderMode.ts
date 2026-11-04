import { useSyncExternalStore } from "react";
import {
  currentMatchMedia,
  decideRenderMode,
  prefersReducedMotion,
  puppetFailed,
  subscribePuppetFailed,
  subscribeReducedMotion,
  webglAvailable,
} from "./support";
import type { ListenerMode } from "./types";

const noSubscribe = () => () => {};
const reducedMotionNow = () => prefersReducedMotion(currentMatchMedia());
const serverFalse = () => false;

/**
 * 実際に出す見せ方を決める（ADR-0032）。"3d" を頼まれても、3D を出せないときは "2d" を返す。
 * 動きを減らす設定の変更と、3D の失敗（読み込み・文脈が失われた）は、その場で反映する。
 * "2d" を頼まれたときは、WebGL も設定も確かめない
 */
export function useRenderMode(requested: ListenerMode): ListenerMode {
  const wants3d = requested === "3d";
  const reducedMotion = useSyncExternalStore(
    wants3d ? subscribeReducedMotion : noSubscribe,
    wants3d ? reducedMotionNow : serverFalse,
    serverFalse,
  );
  const failed = useSyncExternalStore(
    wants3d ? subscribePuppetFailed : noSubscribe,
    wants3d ? puppetFailed : serverFalse,
    serverFalse,
  );
  const webgl = wants3d && webglAvailable();
  return decideRenderMode({ requested, webgl, reducedMotion, failed });
}
