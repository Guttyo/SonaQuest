// BGM を実際のブラウザの Web Audio につなぎ、画面から使えるようにする（B-03、ADR-0039）。
// 試験では使わない（bgm.ts に偽物の AudioContext を差し込む）。

import { useSyncExternalStore } from "react";
import { Bgm, type AudioContextLike, type BgmSnapshot } from "./bgm";

function contextFactory(): (() => AudioContextLike | null) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (Ctor === undefined) return null;
  return () => new Ctor();
}

let shared: Bgm | null = null;

/** ページに1つだけの BGM。作るだけでは AudioContext を作らない（押すまで鳴らさない） */
export function getBgm(): Bgm {
  if (shared === null) shared = new Bgm({ createContext: contextFactory() });
  return shared;
}

/** 中断の画面・終わりの画面で止める。BGM を一度も使っていなければ何もしない */
export function stopBgm(): void {
  shared?.stop();
}

/** 読み上げの間は小さくする（voice/hooks.ts の useSpeaker から） */
export function duckBgm(reason: string, ducked: boolean): void {
  shared?.setDucked(reason, ducked);
}

const subscribe = (listener: () => void) => getBgm().subscribe(listener);
const getSnapshot = () => getBgm().snapshot;
const SERVER_SNAPSHOT: BgmSnapshot = { available: false, on: false, volume: 0, ducked: false };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useBgmSnapshot(): BgmSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
