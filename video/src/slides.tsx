// Remotion で描く仮の部品（Issue #262）：冒頭の問い、「21回」、訓練の文の経路の図、写真の場面、
// 架空の患者の表の枠、モデルの使い分けの一枚。どれも依存を足さず、remotion の部品だけで描く。
import { Fragment, useEffect, useState, type CSSProperties, type FC } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MODEL_COLUMNS, MODEL_MAP_TITLE, DEVELOPMENT_ROW, chipTitle, type Chip, type ChipKind } from "./modelMap";
import {
  FPS,
  PATIENT_TABLE_FRAMES,
  PATIENT_TABLE_FROM_FRAMES,
  PHOTO_SHOT_FRAMES,
  PIPELINE_FROM_FRAMES,
  PIPELINE_TO_FRAMES,
  QUAKE_COUNT_FROM_FRAMES,
  QUESTION_BLACKOUT_FRAMES,
  type Section,
} from "./sections";
import { PIPELINE, QUAKE_COUNT, QUESTION_LINES } from "./slideText";
import { COLORS, MONO, baseText, hasStaticFile, resolveImage } from "./theme";

/** 08 数値のカウントアップ：start から duration フレームで 0 → value に数える（はじめ速く、終わりはゆっくり） */
const useCountUp = (value: number, start: number, duration: number) => {
  const frame = useCurrentFrame();
  return Math.round(
    interpolate(frame, [start, start + duration], [0, value], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );
};

/** 現れる動き（ばねで下から上がる）。動きを大きくしない */
const useRise = (startFrame: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - startFrame, fps, config: { damping: 200 } });
  return {
    opacity: interpolate(progress, [0, 1], [0, 1]),
    transform: `translateY(${interpolate(progress, [0, 1], [24, 0])}px)`,
  } satisfies CSSProperties;
};

/* ---------- 1番：冒頭の問い ---------- */

/** 電池切れの暗転（あれば録画の切り出し）の後に、問いを2行で大きく出す。地は暗転に続けて黒 */
export const QuestionSlide: FC<{ section: Section }> = ({ section }) => {
  const line1 = useRise(QUESTION_BLACKOUT_FRAMES);
  const line2 = useRise(QUESTION_BLACKOUT_FRAMES + Math.round(1.6 * FPS));
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.night }}>
      {hasStaticFile(section.footageFile) ? (
        <Sequence durationInFrames={QUESTION_BLACKOUT_FRAMES} layout="none" name="暗転の切り出し">
          <AbsoluteFill>
            <OffthreadVideo
              src={staticFile(section.footageFile)}
              muted
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </AbsoluteFill>
        </Sequence>
      ) : null}
      <AbsoluteFill
        style={{
          ...baseText,
          color: COLORS.white,
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          textAlign: "center",
          padding: "0 120px",
        }}
      >
        <div style={{ fontSize: 76, fontWeight: 700, ...line1 }}>{QUESTION_LINES[0]}</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.4, ...line2 }}>{QUESTION_LINES[1]}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- 2番：「21回」と出典 ---------- */

export const QuakeCountOverlay: FC = () => (
  <Sequence from={QUAKE_COUNT_FROM_FRAMES} layout="none" name="21回">
    <QuakeCountPanel />
  </Sequence>
);

const QuakeCountPanel: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const rest = useRise(Math.round(0.4 * fps));
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        right: 96,
        bottom: 96,
        padding: "36px 48px",
        borderRadius: 24,
        backgroundColor: "rgba(255,255,255,0.94)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        textAlign: "right",
      }}
    >
      <div style={{ fontSize: 30, color: COLORS.sub, ...rest }}>{QUAKE_COUNT.label}</div>
      <div
        style={{
          fontSize: 200,
          fontWeight: 800,
          lineHeight: 1.05,
          color: COLORS.accent,
          transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`,
          transformOrigin: "right center",
          opacity: interpolate(pop, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <span style={{ fontFamily: MONO }}>{useCountUp(QUAKE_COUNT.count, 0, Math.round(1.2 * fps))}</span>
        {QUAKE_COUNT.unit}
      </div>
      <div style={{ fontSize: 22, color: COLORS.sub, marginTop: 8, ...rest }}>{QUAKE_COUNT.range}</div>
      <div style={{ fontSize: 22, color: COLORS.sub, ...rest }}>{QUAKE_COUNT.source}</div>
    </div>
  );
};

/* ---------- 5番：訓練の文の経路の図（スマホの横） ---------- */

export const PipelineOverlay: FC = () => (
  <Sequence from={PIPELINE_FROM_FRAMES} durationInFrames={PIPELINE_TO_FRAMES - PIPELINE_FROM_FRAMES} layout="none" name="経路の図">
    <PipelineDiagram />
  </Sequence>
);

const STEP_GAP_FRAMES = Math.round(0.6 * FPS);

const PipelineDiagram: FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const title = useRise(0);
  // 終わりの 0.4 秒で消す（暗転の前に図を下げる）
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left: 830,
        right: 64,
        top: 360,
        opacity: fadeOut,
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 28, ...title }}>{PIPELINE.title}</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
        {PIPELINE.steps.map((step, i) => (
          <Fragment key={step.title}>
            {i > 0 ? <Arrow start={i * STEP_GAP_FRAMES} /> : null}
            <PipelineStep start={i * STEP_GAP_FRAMES} title={step.title} sub={step.sub} last={i === PIPELINE.steps.length - 1} />
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: 24, color: COLORS.sub, marginTop: 24, ...useRise(PIPELINE.steps.length * STEP_GAP_FRAMES) }}>
        {PIPELINE.note}
      </div>
    </div>
  );
};

const PipelineStep: FC<{ start: number; title: string; sub: string; last: boolean }> = ({ start, title, sub, last }) => {
  const rise = useRise(start);
  return (
    <div
      style={{
        flex: 1,
        padding: "20px 14px",
        borderRadius: 18,
        backgroundColor: last ? COLORS.white : COLORS.accent,
        color: last ? COLORS.ink : COLORS.white,
        border: `3px solid ${COLORS.accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...rise,
      }}
    >
      <div style={{ fontSize: 25, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontSize: 19, lineHeight: 1.4, opacity: 0.92 }}>{sub}</div>
    </div>
  );
};

const Arrow: FC<{ start: number }> = ({ start }) => {
  const rise = useRise(start);
  return <div style={{ alignSelf: "center", fontSize: 36, color: COLORS.sub, ...rise }}>→</div>;
};

/* ---------- 3・7・12番：写真の場面 ---------- */

/** video/public/ のテキストファイルを読む（12番の感想の一節。文はリポジトリに置かない） */
const useStaticText = (file: string | null): string | null => {
  const exists = hasStaticFile(file);
  const [text, setText] = useState<string | null>(null);
  const [handle] = useState(() => (exists ? delayRender("写真の場面の文を読む") : null));
  useEffect(() => {
    if (!exists || handle === null || file === null) return;
    fetch(staticFile(file))
      .then((res) => res.text())
      .then((body) => {
        setText(body.trim());
        continueRender(handle);
      })
      .catch((err: unknown) => cancelRender(err));
  }, [exists, file, handle]);
  return text;
};

/**
 * 写真を1カットずつ見せる。録画が続く場面（7番）では、写真1カットを PHOTO_SHOT_FRAMES ずつ見せ、残りを録画にする。
 * 録画が続かない場面（3・12番）では、場面の長さを写真のカットで等分する。
 */
export const PhotoSlides: FC<{ section: Section }> = ({ section }) => {
  const caption = useStaticText(section.captionFile);
  const shots = section.photoShots;
  const hasFootage = hasStaticFile(section.footageFile);
  const shotFrames =
    section.footageFile !== null
      ? PHOTO_SHOT_FRAMES
      : Math.floor(section.durationInFrames / Math.max(shots.length, 1));
  const photosEnd = shotFrames * shots.length;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.night }}>
      {shots.map((shot, i) => (
        <Sequence
          key={shot.join("+")}
          from={i * shotFrames}
          durationInFrames={i === shots.length - 1 && section.footageFile === null ? section.durationInFrames - i * shotFrames : shotFrames}
          layout="none"
          name={`写真 ${i + 1}`}
        >
          <PhotoShot files={shot} caption={i === shots.length - 1 ? caption : null} />
        </Sequence>
      ))}
      {section.footageFile !== null ? (
        <Sequence from={photosEnd} layout="none" name="写真の後の録画">
          {hasFootage ? (
            <AbsoluteFill>
              <OffthreadVideo
                src={staticFile(section.footageFile)}
                muted
                trimBefore={section.footageStartFrame}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </AbsoluteFill>
          ) : (
            <MissingPanel lines={[section.screenNote, `素材：public/${section.footageFile}（未配置）`]} />
          )}
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const PhotoShot: FC<{ files: string[]; caption: string | null }> = ({ files, caption }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // ゆっくり寄る（5%）。動きを大きくしない
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.05]);
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const present = files.map(resolveImage).filter((f): f is string => f !== null);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {present.length === 0 ? (
        <MissingPanel lines={["写真（リポジトリの外の素材）", ...files.map((f) => `素材：public/${f}.jpg など（未配置）`)]} />
      ) : (
        <AbsoluteFill style={{ flexDirection: "row", gap: 24, padding: present.length > 1 ? 48 : 0 }}>
          {present.map((f) => (
            <div key={f} style={{ flex: 1, overflow: "hidden", borderRadius: present.length > 1 ? 16 : 0 }}>
              <Img
                src={staticFile(f)}
                style={{ width: "100%", height: "100%", objectFit: "contain", transform: `scale(${scale})` }}
              />
            </div>
          ))}
        </AbsoluteFill>
      )}
      {caption ? <CaptionBox text={caption} /> : null}
    </AbsoluteFill>
  );
};

const CaptionBox: FC<{ text: string }> = ({ text }) => {
  const rise = useRise(Math.round(0.6 * FPS));
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 80,
        padding: "28px 40px",
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.94)",
        fontSize: 36,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        ...rise,
      }}
    >
      {text}
    </div>
  );
};

/** 素材が無いときの仮の画面（写真・録画の枠） */
const MissingPanel: FC<{ lines: string[] }> = ({ lines }) => (
  <AbsoluteFill
    style={{
      ...baseText,
      backgroundColor: COLORS.placeholder,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      textAlign: "center",
      padding: 48,
    }}
  >
    {lines.map((line) => (
      <div key={line} style={{ fontSize: 24, color: COLORS.sub, lineHeight: 1.6 }}>
        {line}
      </div>
    ))}
  </AbsoluteFill>
);

/* ---------- 8番：架空の患者 100 人の表の枠 ---------- */

/**
 * 架空の患者 100 人の表を差し込む枠（Issue #261 で作る部品。web/src/board/patients.ts から読む）。
 * 今は仮の画面。部品が main に入ったら、PatientTablePlaceholder をその部品に置き換える。
 */
export const PatientTableOverlay: FC = () => (
  <Sequence from={PATIENT_TABLE_FROM_FRAMES} durationInFrames={PATIENT_TABLE_FRAMES} layout="none" name="架空の患者の表（差し込み枠）">
    <PatientTablePlaceholder />
  </Sequence>
);

const PatientTablePlaceholder: FC = () => {
  const rise = useRise(0);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,42,51,0.35)" }}>
      <div
        style={{
          ...baseText,
          width: 1280,
          height: 720,
          borderRadius: 24,
          backgroundColor: COLORS.white,
          border: `3px dashed ${COLORS.sub}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          ...rise,
        }}
      >
        <div style={{ fontSize: 26, color: COLORS.white, backgroundColor: COLORS.ink, padding: "6px 18px", borderRadius: 8 }}>架空データ</div>
        <div style={{ fontSize: 56, fontWeight: 700 }}>
          架空の患者 <span style={{ fontFamily: MONO, color: COLORS.accent }}>{useCountUp(100, 6, 45)}</span> 人の表
        </div>
        <div style={{ fontSize: 26, color: COLORS.sub }}>名前・年齢・性別・使っているお薬（すべて架空）</div>
        <div style={{ fontSize: 22, color: COLORS.sub }}>差し込み枠：Issue #261 の部品を入れる（今は仮の画面）</div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- 11番：モデルの使い分けの一枚 ---------- */

const CHIP_STYLE: Record<ChipKind, CSSProperties> = {
  claude: { backgroundColor: COLORS.accent, color: COLORS.white, border: `3px solid ${COLORS.accent}` },
  agent: { backgroundColor: COLORS.agent, color: COLORS.white, border: `3px solid ${COLORS.agent}` },
  code: { backgroundColor: COLORS.white, color: COLORS.ink, border: `3px solid ${COLORS.code}` },
  browser: { backgroundColor: COLORS.white, color: COLORS.ink, border: `3px dashed ${COLORS.code}` },
  human: { backgroundColor: COLORS.white, color: COLORS.ink, border: `3px solid ${COLORS.ink}` },
};

const ModelChip: FC<{ chip: Chip }> = ({ chip }) => (
  <div
    style={{
      ...CHIP_STYLE[chip.kind],
      borderRadius: 14,
      padding: "10px 14px",
      minWidth: 150,
      display: "flex",
      flexDirection: "column",
      gap: 2,
      justifyContent: "center",
    }}
  >
    {chip.over ? <div style={{ fontSize: 17, opacity: 0.9 }}>{chip.over}</div> : null}
    <div style={{ fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>{chipTitle(chip)}</div>
    {chip.sub ? <div style={{ fontSize: 17, opacity: 0.85 }}>{chip.sub}</div> : null}
  </div>
);

export const ModelMapSlide: FC = () => {
  const title = useRise(0);
  return (
    <AbsoluteFill style={{ ...baseText, backgroundColor: COLORS.background, padding: "64px 72px 48px", gap: 28 }}>
      <div style={{ fontSize: 56, fontWeight: 700, ...title }}>{MODEL_MAP_TITLE}</div>
      <div style={{ flex: 1, display: "flex", gap: 32 }}>
        {MODEL_COLUMNS.map((column, ci) => (
          <ModelColumnView key={column.title} title={column.title} rows={column.rows} start={Math.round((0.3 + ci * 0.5) * FPS)} wide={ci === 1} />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "18px 28px",
          borderRadius: 18,
          backgroundColor: COLORS.ink,
          color: COLORS.white,
          ...useRise(Math.round(1.5 * FPS)),
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700 }}>{DEVELOPMENT_ROW.title}</div>
        <div style={{ fontSize: 26 }}>{DEVELOPMENT_ROW.body}</div>
      </div>
    </AbsoluteFill>
  );
};

const ModelColumnView: FC<{ title: string; rows: (typeof MODEL_COLUMNS)[number]["rows"]; start: number; wide: boolean }> = ({
  title,
  rows,
  start,
  wide,
}) => {
  const rise = useRise(start);
  return (
    <div
      style={{
        flex: wide ? 1.45 : 1,
        backgroundColor: COLORS.white,
        borderRadius: 24,
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        ...rise,
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 700 }}>{title}</div>
      {rows.map((row) => (
        <div key={row.role} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 22, color: COLORS.sub }}>{row.role}</div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap" }}>
            {row.chain.map((chip, i) => (
              <Fragment key={`${chipTitle(chip)}-${i}`}>
                {i > 0 ? <div style={{ alignSelf: "center", fontSize: 26, color: COLORS.sub }}>→</div> : null}
                <ModelChip chip={chip} />
              </Fragment>
            ))}
            {row.note ? (
              <div style={{ alignSelf: "center", fontSize: 20, fontWeight: 700, color: COLORS.ink, marginLeft: 8 }}>※ {row.note}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};
