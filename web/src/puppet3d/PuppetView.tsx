import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadStage, peekStage } from "./loader";
import type { PuppetHandle } from "./stage";
import type { ListenerGesture } from "./gesture";
import { markPuppetFailed } from "./support";
import type { ListenerActivity } from "./types";

/**
 * 3D パペットを出す場所（ADR-0032）。3D を出してよいと決まったときだけ使う（useRenderMode）。
 * three を読み込むまでは 2D の光を置いておき、読み込めたら描画の領域に替える。
 * 読み込めない・描画の文脈が失われたら、この画面では 3D を使わない（Listener が 2D に戻す）。
 * 外れたとき（中断の画面に移ったときなど）は、描画を止めて片づける（stage.ts の attachPuppet）。
 */
export function PuppetView({
  activity,
  relief,
  nodKey = 0,
  gesture = null,
}: {
  activity: ListenerActivity;
  relief: boolean;
  /** 増えるたびに1回うなずく（回答を受け取ったとき。0 ではうなずかない） */
  nodKey?: number;
  /** 返事を長く待つ間の身ぶり（Issue #221）。null で身ぶりをしない */
  gesture?: ListenerGesture | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PuppetHandle | null>(null);
  const latest = useRef({ activity, relief });
  latest.current = { activity, relief };
  const [ready, setReady] = useState(() => peekStage() !== null);

  // 読み込み済みなら、画面に出す前に描く（質問が変わるたびに 2D の光が一瞬見えないように）
  useLayoutEffect(() => {
    let cancelled = false;
    const attach = (stage: NonNullable<ReturnType<typeof peekStage>>) => {
      const host = hostRef.current;
      if (cancelled || host === null) return;
      try {
        handleRef.current = stage.attachPuppet(host, {
          ...latest.current,
          onLost: markPuppetFailed,
        });
        setReady(true);
      } catch {
        markPuppetFailed();
      }
    };
    const loaded = peekStage();
    if (loaded !== null) {
      attach(loaded);
    } else {
      loadStage().then(attach, () => {
        if (!cancelled) markPuppetFailed();
      });
    }
    return () => {
      cancelled = true;
      handleRef.current?.detach();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    handleRef.current?.update(activity, relief);
  }, [activity, relief]);

  useEffect(() => {
    handleRef.current?.gesture(gesture);
  }, [gesture, ready]);

  // 読み込みの途中で回答を受け取ったときは、描けるようになってからうなずく。
  // 出たときにすでに受け取っていた分（appliedNod の初期値）はうなずき直さない
  const appliedNod = useRef(nodKey);
  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null || nodKey <= appliedNod.current) return;
    appliedNod.current = nodKey;
    handle.nod();
  }, [nodKey, ready]);

  return (
    <div className={relief ? "puppet3d-stage puppet3d-stage-relief" : "puppet3d-stage"}>
      <div className="puppet3d-canvas-host" ref={hostRef} />
      {!ready && (
        <span
          className={
            relief
              ? "listener-light listener-light-relief puppet3d-placeholder"
              : "listener-light puppet3d-placeholder"
          }
          aria-hidden="true"
        />
      )}
    </div>
  );
}
