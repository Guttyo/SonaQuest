// 提出動画の本体（Issue #28、ADR-0050）。sections.ts の9ビートを <Sequence> で並べる。
// 素材（実写・地図・録画・ナレーション）は video/public/ に置く（Git の対象外）。
// 置かれていない素材は描かず・鳴らさず、仮の画面（番号・時間・見出し語）のまま書き出せるようにする。
import type { CSSProperties, FC, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  getStaticFiles,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  BEAT_FRAMES,
  ENDCARD_FRAMES,
  PUBLIC_URL_PLACEHOLDER,
  SECTIONS,
  type Section,
} from "./sections";

/** 端末のゴシックの並び（web/src/styles.css と同じ考え。外部のフォント配信もフォントファイルも使わない） */
const FONT_FAMILY =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans JP", system-ui, sans-serif';

const COLORS = {
  background: "#f6f4ef",
  ink: "#1f2a33",
  sub: "#5b6770",
  frame: "#1f2a33",
  placeholder: "#e3dfd6",
  accent: "#2f6f8f",
} as const;

/** スマホ幅の録画（390×844）を入れる枠。横長の画面の高さに収まるよう少し大きくする */
const PHONE_SCALE = 1.06;
const PHONE_WIDTH = Math.round(390 * PHONE_SCALE);
const PHONE_HEIGHT = Math.round(844 * PHONE_SCALE);
const PHONE_BEZEL = 14;

/** video/public/ にその名前のファイルがあるか。無い素材は描かない（描くと書き出しが落ちる） */
const hasStaticFile = (name: string | null): name is string => {
  if (name === null) return false;
  return getStaticFiles().some((f) => f.name === name);
};

const baseText: CSSProperties = { fontFamily: FONT_FAMILY, color: COLORS.ink };

/**
 * 録画の音の大きさ。ナレーションを遅らせるビート（4番）では、ナレーションが始まるところで録画の音を消し、
 * アプリの声とナレーターの声が重ならないようにする。それ以外は 1（鳴らすかどうかは muted で決める）。
 */
const footageVolume = (section: Section) => {
  if (section.narrationDelayFrames <= 0) return 1;
  return (frame: number) => (frame < section.narrationDelayFrames ? 1 : 0);
};

/** ナレーション。narrationDelayFrames だけ遅らせて鳴らす（ビートの終わりで切れる） */
const Narration: FC<{ section: Section }> = ({ section }) => {
  if (!hasStaticFile(section.narrationFile)) return null;
  return (
    <Sequence from={section.narrationDelayFrames} layout="none" name="ナレーション">
      <Audio src={staticFile(section.narrationFile)} />
    </Sequence>
  );
};

/** 素材が無いときの仮の画面の中身 */
const Placeholder: FC<{ section: Section; label: string; style?: CSSProperties }> = ({ section, label, style }) => (
  <div
    style={{
      ...baseText,
      backgroundColor: COLORS.placeholder,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      textAlign: "center",
      padding: 32,
      boxSizing: "border-box",
      ...style,
    }}
  >
    <div style={{ fontSize: 28, color: COLORS.sub }}>{label}</div>
    <div style={{ fontSize: 22, color: COLORS.sub, lineHeight: 1.6 }}>{section.screenNote}</div>
    {section.footageFile ? (
      <div style={{ fontSize: 18, color: COLORS.sub }}>素材：public/{section.footageFile}（未配置）</div>
    ) : null}
  </div>
);

/** 横長の素材（実写・地図・ボードの録画）。無ければ仮の画面 */
const WideFootage: FC<{ section: Section; label: string }> = ({ section, label }) => {
  if (hasStaticFile(section.footageFile)) {
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(section.footageFile)}
          muted={!section.footageAudio}
          volume={footageVolume(section)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }
  return <Placeholder section={section} label={label} style={{ position: "absolute", inset: 0 }} />;
};

/** スマホの枠に入れた縦の録画 */
const PhoneFrame: FC<{ section: Section }> = ({ section }) => (
  <div
    style={{
      position: "absolute",
      left: 260,
      top: (1080 - PHONE_HEIGHT - PHONE_BEZEL * 2) / 2,
      width: PHONE_WIDTH,
      height: PHONE_HEIGHT,
      padding: PHONE_BEZEL,
      borderRadius: 56,
      backgroundColor: COLORS.frame,
      boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
    }}
  >
    <div style={{ width: "100%", height: "100%", borderRadius: 42, overflow: "hidden", position: "relative" }}>
      {hasStaticFile(section.footageFile) ? (
        <OffthreadVideo
          src={staticFile(section.footageFile)}
          muted={!section.footageAudio}
          volume={footageVolume(section)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Placeholder section={section} label="スマホ幅の録画" style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  </div>
);

/** 8番：技術と安全の一枚（図は後で作る。今は仮の文字） */
const TechSafety: FC = () => (
  <AbsoluteFill style={{ ...baseText, flexDirection: "row", padding: "180px 120px 120px", gap: 60 }}>
    {[
      { title: "アプリの中の Claude", note: "（図は後で作る。仮の文字）" },
      { title: "開発の Claude Code", note: "（図は後で作る。仮の文字）" },
    ].map((col) => (
      <div
        key={col.title}
        style={{
          flex: 1,
          backgroundColor: COLORS.placeholder,
          borderRadius: 24,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <div style={{ fontSize: 52, fontWeight: 700 }}>{col.title}</div>
        <div style={{ fontSize: 26, color: COLORS.sub }}>{col.note}</div>
      </div>
    ))}
  </AbsoluteFill>
);

// [TODO-OWNER: 最後のロゴの形（今は「SonaQuest」の文字だけの仮のもの）]
/** 9番の最後：ロゴと公開 URL の札 */
const EndCard: FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        ...baseText,
        backgroundColor: COLORS.background,
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        opacity,
      }}
    >
      <div style={{ fontSize: 140, fontWeight: 800, letterSpacing: 2, color: COLORS.accent }}>SonaQuest</div>
      <div style={{ fontSize: 48, color: COLORS.ink }}>お薬の避難訓練</div>
      <div
        style={{
          fontSize: 44,
          padding: "16px 40px",
          borderRadius: 16,
          border: `3px solid ${COLORS.ink}`,
        }}
      >
        {PUBLIC_URL_PLACEHOLDER}
      </div>
    </AbsoluteFill>
  );
};

/** ビートの番号・時間・見出し語（音を消して見る人向け） */
const Caption: FC<{ section: Section; align: "left" | "right" }> = ({ section, align }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        top: 72,
        [align]: 96,
        textAlign: align,
        opacity,
        textShadow: "0 2px 12px rgba(246,244,239,0.9)",
      }}
    >
      <div style={{ fontSize: 30, color: COLORS.sub }}>
        {section.number} ／ 9　{section.timeLabel}
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, marginTop: 8 }}>{section.headline}</div>
    </div>
  );
};

/** 1ビート分の画面 */
const Beat: FC<{ section: Section }> = ({ section }) => {
  let body: ReactNode;
  let captionAlign: "left" | "right" = "left";
  switch (section.screen) {
    case "liveAction":
      body = <WideFootage section={section} label="本人の実写（差し込み枠）" />;
      break;
    case "quakeMap":
      body = <WideFootage section={section} label="震源の地図の動画" />;
      break;
    case "board":
      body = <WideFootage section={section} label="ボードの横長の録画（1920×1080）" />;
      break;
    case "phone":
      body = <PhoneFrame section={section} />;
      captionAlign = "right";
      break;
    case "techSafety":
      body = <TechSafety />;
      break;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {body}
      <Caption section={section} align={captionAlign} />
      <Narration section={section} />
      {section.number === 9 ? (
        <Sequence from={BEAT_FRAMES - ENDCARD_FRAMES} durationInFrames={ENDCARD_FRAMES} layout="none">
          <EndCard />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

export const SonaQuestVideo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
    {SECTIONS.map((section) => (
      <Sequence
        key={section.number}
        from={section.from}
        durationInFrames={section.durationInFrames}
        name={`${section.number} ${section.headline}`}
      >
        <Beat section={section} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
