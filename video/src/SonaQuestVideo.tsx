// 提出動画の本体（Issue #28・#262、ADR-0051）。sections.ts の13場面（可変の尺）を <Sequence> で並べる。
// 素材（地図・写真・録画・ナレーション）は video/public/ に置く（Git の対象外）。
// 置かれていない素材は描かず・鳴らさず、仮の画面（番号・時間・見出し語）のまま書き出せるようにする。
import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ENDCARD_FRAMES, PUBLIC_URL_PLACEHOLDER, SECTIONS, SECTION_COUNT, type Section } from "./sections";
import { CLOSING_LINE } from "./slideText";
import {
  ModelMapSlide,
  PatientTableOverlay,
  PhotoSlides,
  PipelineOverlay,
  QuakeCountOverlay,
  QuestionSlide,
} from "./slides";
import { COLORS, baseText, hasStaticFile } from "./theme";

/** スマホ幅の録画（390×844）を入れる枠。横長の画面の高さに収まるよう少し大きくする */
const PHONE_SCALE = 1.06;
const PHONE_WIDTH = Math.round(390 * PHONE_SCALE);
const PHONE_HEIGHT = Math.round(844 * PHONE_SCALE);
const PHONE_BEZEL = 14;

/**
 * 録画の音の大きさ。アプリの声とナレーターの声が重ならないよう、footageMutedRanges の区間だけ消す。
 * 区間が無ければ 1（鳴らすかどうかは muted で決める）。
 */
const footageVolume = (section: Section) => {
  const ranges = section.footageMutedRanges;
  if (ranges.length === 0) return 1;
  return (frame: number) => (ranges.some(([start, end]) => frame >= start && frame < end) ? 0 : 1);
};

/** ナレーション。narrationDelayFrames だけ遅らせて鳴らす（場面の終わりで切れる） */
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

/** 横長の素材（地図・ボードの録画）。無ければ仮の画面 */
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

/** スマホの画面の中身（録画か仮の画面） */
const PhoneScreen: FC<{ section: Section }> = ({ section }) =>
  hasStaticFile(section.footageFile) ? (
    <OffthreadVideo
      src={staticFile(section.footageFile)}
      muted={!section.footageAudio}
      volume={footageVolume(section)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  ) : (
    <Placeholder section={section} label="スマホ幅の録画" style={{ width: "100%", height: "100%" }} />
  );

/**
 * iPhone のベゼルの画像（オーナーが渡した 978×2000 の透過 webp。画面の部分が抜けている）。
 * video/public/（Git の対象外）に置く。無ければ CSS で描いた枠にする。
 */
const BEZEL_FILE = "frames/iphone-bezel.webp";
const BEZEL_SIZE = { width: 978, height: 2000 } as const;
/** ベゼルの画像の中の画面の位置（画像の画素）。録画はベゼルの内側の縁より少し大きく置き、縁はベゼルで隠す */
const BEZEL_SCREEN = { left: 44, top: 42, width: 890, height: 1916, radius: 150 } as const;
/** 横長の画面の中のベゼルの高さ（px） */
const BEZEL_HEIGHT = 1010;

/** スマホの枠に入れた縦の録画 */
const PhoneFrame: FC<{ section: Section }> = ({ section }) => {
  if (hasStaticFile(BEZEL_FILE)) {
    const k = BEZEL_HEIGHT / BEZEL_SIZE.height;
    return (
      <div
        style={{
          position: "absolute",
          left: 240,
          top: (1080 - BEZEL_HEIGHT) / 2,
          width: BEZEL_SIZE.width * k,
          height: BEZEL_HEIGHT,
          filter: "drop-shadow(0 24px 40px rgba(0,0,0,0.25))",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: BEZEL_SCREEN.left * k,
            top: BEZEL_SCREEN.top * k,
            width: BEZEL_SCREEN.width * k,
            height: BEZEL_SCREEN.height * k,
            borderRadius: BEZEL_SCREEN.radius * k,
            overflow: "hidden",
            backgroundColor: COLORS.white,
          }}
        >
          <PhoneScreen section={section} />
        </div>
        <Img src={staticFile(BEZEL_FILE)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
    );
  }
  return (
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
        <PhoneScreen section={section} />
      </div>
    </div>
  );
};

// [TODO-OWNER: 最後のロゴの形（今は「SonaQuest」の文字だけの仮のもの）]
/**
 * 最後の場面（13番）の締めの画面：締めの文、ロゴ、公開 URL の札。
 * ロゴは Issue #263 で web/ に作る（動画とアプリのはじめにで使う）。それまでは仮の文字。
 */
const EndCard: FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const logoOpacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
      <div style={{ fontSize: 60, fontWeight: 700, color: COLORS.ink }}>{CLOSING_LINE}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, opacity: logoOpacity }}>
        <div style={{ fontSize: 140, fontWeight: 800, letterSpacing: 2, color: COLORS.accent }}>SonaQuest</div>
        <div style={{ fontSize: 44, color: COLORS.ink }}>お薬の避難訓練</div>
        <div
          style={{
            fontSize: 36,
            padding: "12px 36px",
            borderRadius: 16,
            border: `3px solid ${COLORS.ink}`,
          }}
        >
          {PUBLIC_URL_PLACEHOLDER}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 場面の番号・時間・見出し語（音を消して見る人向け） */
const Caption: FC<{ section: Section; align: "left" | "right"; onDark: boolean }> = ({ section, align, onDark }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        ...baseText,
        color: onDark ? COLORS.white : COLORS.ink,
        position: "absolute",
        top: 72,
        [align]: 96,
        textAlign: align,
        opacity,
        textShadow: onDark ? "0 2px 12px rgba(0,0,0,0.8)" : "0 2px 12px rgba(246,244,239,0.9)",
      }}
    >
      <div style={{ fontSize: 30, opacity: 0.8 }}>
        {section.number} ／ {SECTION_COUNT}　{section.timeLabel}
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, marginTop: 8 }}>{section.headline}</div>
    </div>
  );
};

/** 画面に重ねる部品 */
const OverlayView: FC<{ section: Section }> = ({ section }) => {
  switch (section.overlay) {
    case "quakeCount":
      return <QuakeCountOverlay />;
    case "pipeline":
      return <PipelineOverlay />;
    case "patientTable":
      return <PatientTableOverlay />;
    case null:
      return null;
  }
};

/** 1場面分の画面 */
const Beat: FC<{ section: Section }> = ({ section }) => {
  let body: ReactNode;
  let captionAlign: "left" | "right" = "left";
  // 見出し語を出さない画面（画面そのものが大きな文字のもの）
  let showCaption = true;
  let onDark = false;
  switch (section.screen) {
    case "question":
      body = <QuestionSlide section={section} />;
      showCaption = false;
      break;
    case "quakeMap":
      body = <WideFootage section={section} label="震源の地図の動画" />;
      break;
    case "photos":
      body = <PhotoSlides section={section} />;
      onDark = true;
      break;
    case "board":
      body = <WideFootage section={section} label="ボードの横長の録画（1920×1080）" />;
      break;
    case "phone":
      body = <PhoneFrame section={section} />;
      captionAlign = "right";
      break;
    case "models":
      body = <ModelMapSlide />;
      showCaption = false;
      break;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {body}
      <OverlayView section={section} />
      {showCaption ? <Caption section={section} align={captionAlign} onDark={onDark} /> : null}
      <Narration section={section} />
      {section.number === SECTION_COUNT ? (
        <Sequence from={section.durationInFrames - ENDCARD_FRAMES} durationInFrames={ENDCARD_FRAMES} layout="none" name="締めの画面">
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
