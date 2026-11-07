import { paletteFor } from "../puppet3d/palette";
import type { ListenerGesture } from "../puppet3d/gesture";
import type { ListenerActivity } from "../puppet3d/types";

/**
 * 2D のソナ（Issue #47、A-03、ADR-0038）。3D パペット（ADR-0032、web/src/puppet3d/）の 2D 版の姿。
 * ずんぐりした胴・おなか・襟・短い腕・丸い頭と丸い耳・上下に開く口・口まわり・鼻・目・頬を、SVG の基本の形でコードで描く
 * （Issue #164 の案C どうぶつ風。2026-11-06 オーナー決定）。
 * 色は 3D と同じ palette.ts から取る。外部の画像・素材は使わない。医療者の記号は使わない（ADR-0020）。
 *
 * 状態の姿勢は data-activity に合わせた止まった CSS で決め、動きはその上に重ねる（styles.css の .p2d-*）。
 * 動きを減らす設定では動きだけが止まり、状態ごとの最後の姿が残る。
 * 絵には文字を入れず、画面の読み上げでは読まない。状態は横の文字で示す（ACTIVITY_LABELS）
 */
export function Puppet2D({
  activity,
  relief,
  nodKey = 0,
  gesture = null,
}: {
  activity: ListenerActivity;
  relief: boolean;
  /** 増えるたびに、頭を1回うなずかせる（回答を受け取ったとき。0 ではうなずかない） */
  nodKey?: number;
  /** 返事を長く待つ間の身ぶり（Issue #221）。null で身ぶりをしない */
  gesture?: ListenerGesture | null;
}) {
  return (
    <div
      className={
        relief
          ? "puppet3d-stage puppet3d-stage-relief puppet2d-stage puppet2d-stage-relief"
          : "puppet3d-stage puppet2d-stage"
      }
      data-activity={activity}
      data-relief={relief ? "true" : "false"}
    >
      <PuppetSvg
        activity={activity}
        relief={relief}
        nodKey={nodKey}
        gesture={gesture}
        viewBox="0 0 120 100"
        className="puppet2d"
      />
    </div>
  );
}

/**
 * 吹き出しの横に添える、小さな顔だけの姿（光の丸の代わり）。
 * 同じ絵を、頭のまわりだけ切り取って出す。動きは付けない（考え中だけ、止まった姿勢で示す）。
 * puppet2d-static で状態の動きを止め、枠の外（胴・腕）は .puppet2d-face の overflow: hidden で切る（ADR-0038、PR #78 のレビュー）
 */
export function Puppet2DFace({ activity = "idle" }: { activity?: ListenerActivity }) {
  return (
    <span className="puppet2d-face" data-activity={activity}>
      <PuppetSvg
        activity={activity}
        relief={false}
        nodKey={0}
        gesture={null}
        viewBox="30 10 60 58"
        className="puppet2d puppet2d-static"
      />
    </span>
  );
}

const OUTLINE = "#2b2a28";

function PuppetSvg({
  activity,
  relief,
  nodKey,
  gesture,
  viewBox,
  className,
}: {
  activity: ListenerActivity;
  relief: boolean;
  nodKey: number;
  gesture: ListenerGesture | null;
  viewBox: string;
  className: string;
}) {
  const p = paletteFor(relief);
  const line = { stroke: OUTLINE, strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg
      className={className}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      data-activity={activity}
      data-gesture={gesture ?? undefined}
    >
      <g className="p2d-spin">
      <g className="p2d-sway">
        {/* 短い腕（手袋人形の親指と小指） */}
        <rect className="p2d-arm p2d-arm-left" x="18" y="66" width="14" height="22" rx="7" fill={p.body} {...line} />
        <rect className="p2d-arm p2d-arm-right" x="88" y="66" width="14" height="22" rx="7" fill={p.body} {...line} />
        {/* ずんぐりした胴。下は舞台の縁で切れてよい */}
        <path d="M33 62 L87 62 L93 104 L27 104 Z" fill={p.body} {...line} />
        {/* おなか */}
        <ellipse cx="60" cy="86" rx="15" ry="14" fill={p.extra} />
        {/* 襟 */}
        <ellipse cx="60" cy="62" rx="28" ry="6" fill={p.accent} {...line} />
        <g className="p2d-head">
          <g key={nodKey} className={nodKey > 0 ? "p2d-nod p2d-nod-on" : "p2d-nod"}>
            <g className="p2d-bob">
              {/* 丸い耳（内側は頬の色）。帽子や記号にはしない */}
              <circle cx="40" cy="25" r="8" fill={p.body} {...line} />
              <circle cx="80" cy="25" r="8" fill={p.body} {...line} />
              <circle cx="40" cy="25" r="4" fill={p.cheek} />
              <circle cx="80" cy="25" r="4" fill={p.cheek} />
              {/* 口の中。話している間は下あごが下がって見える */}
              <ellipse className="p2d-mouth" cx="60" cy="46" rx="17" ry="5" fill={p.mouth} {...line} />
              {/* 下あご */}
              <path className="p2d-jaw" d="M37 46 Q60 66 83 46 Q60 52 37 46 Z" fill={p.body} {...line} />
              {/* 上あご（丸い頭） */}
              <path d="M35 46 A25 25 0 0 1 85 46 Q60 52 35 46 Z" fill={p.body} {...line} />
              {/* 口まわりと鼻 */}
              <ellipse cx="60" cy="42" rx="10" ry="5.5" fill={p.extra} />
              <ellipse cx="60" cy="38.5" rx="2.6" ry="2" fill={p.eye} />
              {/* 頬 */}
              <ellipse cx="43" cy="40" rx="5" ry="3" fill={p.cheek} />
              <ellipse cx="77" cy="40" rx="5" ry="3" fill={p.cheek} />
              {/* 目。考え中は上を見る */}
              <g className="p2d-eyes">
                <ellipse cx="51" cy="32" rx="3.2" ry="4.2" fill={p.eye} />
                <ellipse cx="69" cy="32" rx="3.2" ry="4.2" fill={p.eye} />
                <circle cx="52.2" cy="30.4" r="1.1" fill={p.highlight} />
                <circle cx="70.2" cy="30.4" r="1.1" fill={p.highlight} />
              </g>
            </g>
          </g>
        </g>
        {/* 手に持つもの（Issue #221）。身ぶりのときだけ見せる。文字・記号・薬の絵は入れない */}
        <g className="p2d-prop p2d-prop-handbook">
          <rect x="47" y="64" width="26" height="30" rx="2" fill={p.accent} {...line} />
          <rect x="52" y="69" width="16" height="5" rx="1" fill={p.highlight} />
        </g>
        <g className="p2d-prop p2d-prop-phone">
          <rect x="78" y="62" width="13" height="22" rx="2.5" fill={p.eye} {...line} />
          <rect x="80.5" y="65" width="8" height="15" rx="1" fill={p.highlight} />
        </g>
      </g>
      </g>
    </svg>
  );
}
