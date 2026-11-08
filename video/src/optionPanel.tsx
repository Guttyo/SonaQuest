// スマホの場面で、画面に出ている選択肢を右の余白に書き出す札（2026-11-08 オーナー：
// 「お薬の情報源を選択するところとか、振り返りのつぎの準備行動は、画面の流れが速いので、選択肢の詳細をスライドの左右の余白に書いておくとよい」）。
// 文はアプリの固定文（web/src/flow/content.ts）をそのまま読む。動画のために書き直さない。
import type { FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  CONFIRM_PROMPT,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  SOURCE_OPTIONS,
  TIMINGS,
} from "../../web/src/flow/content";
import type { PrepActionId } from "../../web/src/flow/types";
import { FPS, type OptionPanel } from "./sections";
import { COLORS, baseText } from "./theme";

const GREEN = "#2f7d63";
const GREEN_DARK = "#154d3b";
const GREEN_SOFT = "#e6f4ee";
const LINE = "#ddd6c4";

/**
 * 撮った録画（06-phone.mp4）の振り返りで、準備行動が並んでいた順。
 * アプリは観点の判定で並べ替える（web/src/flow/rules.ts の orderPrepActions）ので、録画を撮り直したら合わせる。
 */
const PREP_ORDER_IN_FOOTAGE: PrepActionId[] = [
  "photo_and_paper",
  "wallet_memo",
  "notebook_bag",
  "tell_family",
  "pharmacy_contact",
  "check_portal",
];

type Item = { id: string; label: string; detail: string };

const Check: FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      backgroundColor: GREEN,
      color: COLORS.white,
      fontSize: size * 0.62,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    ✓
  </div>
);

const ItemRow: FC<{ item: Item; picked: boolean; appear: number; labelSize: number; detailSize: number }> = ({
  item,
  picked,
  appear,
  labelSize,
  detailSize,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "10px 18px",
      borderRadius: 14,
      border: `${picked ? 3 : 2}px solid ${picked ? GREEN : LINE}`,
      backgroundColor: picked ? GREEN_SOFT : COLORS.white,
      opacity: appear,
      transform: `translateX(${interpolate(appear, [0, 1], [24, 0])}px)`,
    }}
  >
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: labelSize, fontWeight: 700, lineHeight: 1.35, color: COLORS.ink }}>{item.label}</div>
      {item.detail ? (
        <div style={{ fontSize: detailSize, lineHeight: 1.4, color: COLORS.sub }}>{item.detail}</div>
      ) : null}
    </div>
    {picked ? <Check size={labelSize * 1.3} /> : null}
  </div>
);

/** 右の余白の札。left はスマホの画面の右の端より少し右 */
export const OptionPanelView: FC<{ panel: OptionPanel; left: number }> = ({ panel, left }) => {
  const frame = useCurrentFrame();
  const from = Math.round(panel.from * FPS);
  const to = Math.round(panel.to * FPS);
  if (frame < from - 1 || frame > to + 10) return null;
  const opacity = interpolate(frame, [from, from + 9, to, to + 9], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const picked = new Set(panel.picks.filter((p) => frame >= Math.round(p.at * FPS)).map((p) => p.id));
  const appearAt = (i: number) =>
    interpolate(frame, [from + 4 + i * 3, from + 13 + i * 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const isSources = panel.kind === "sources";
  // 準備行動の見出しはアプリの振り返りの見出し（web/src/screens/Review.tsx）と同じ文
  const title = isSources ? CONFIRM_PROMPT : "次の準備を1つ決める";
  const items: Item[] = isSources
    ? SOURCE_OPTIONS.map((o) => ({ id: o.id, label: o.label, detail: o.description }))
    : PREP_ORDER_IN_FOOTAGE.map((id) => ({
        id,
        label: PREP_ACTIONS.find((a) => a.id === id)!.label,
        detail: PREP_ACTION_EFFECTS[id],
      }));
  const labelSize = isSources ? 30 : 22;
  const detailSize = isSources ? 22 : 17;

  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left,
        right: 44,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.94)",
          borderRadius: 24,
          boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
          padding: "24px 26px",
          display: "flex",
          flexDirection: "column",
          gap: isSources ? 12 : 9,
        }}
      >
        <div style={{ fontSize: isSources ? 30 : 27, fontWeight: 800, color: GREEN_DARK, lineHeight: 1.35, marginBottom: 4 }}>
          {title}
        </div>
        {items.map((item, i) => (
          <ItemRow
            key={item.id}
            item={item}
            picked={picked.has(item.id)}
            appear={appearAt(i)}
            labelSize={labelSize}
            detailSize={detailSize}
          />
        ))}
        {isSources ? null : (
          <>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN_DARK, marginTop: 8, opacity: appearAt(items.length) }}>いつやるか</div>
            <div style={{ display: "flex", gap: 12, opacity: appearAt(items.length + 1) }}>
              {TIMINGS.map((t) => {
                const on = picked.has(t.id);
                return (
                  <div
                    key={t.id}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      padding: "10px 0",
                      borderRadius: 14,
                      fontSize: 24,
                      fontWeight: 700,
                      color: COLORS.ink,
                      border: `${on ? 3 : 2}px solid ${on ? GREEN : LINE}`,
                      backgroundColor: on ? GREEN_SOFT : COLORS.white,
                    }}
                  >
                    {t.label}
                    {on ? <Check size={28} /> : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
