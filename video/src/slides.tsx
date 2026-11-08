// Remotion で描く仮の部品（Issue #262）：冒頭の問い、「21回」、訓練の文の経路の図、写真の場面、
// 架空の患者の表の枠、モデルの使い分けの一枚。どれも依存を足さず、remotion の部品だけで描く。
import { Fragment, useEffect, useState, type CSSProperties, type FC, type ReactNode } from "react";
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
import { PatientTableVideo } from "./patientTable/PatientTableVideo";

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
  // 2行目は、ナレーション（01.mp3）が「そのとき、」と言い始める所（問いの文字から 2.98 秒）
  const line2 = useRise(QUESTION_BLACKOUT_FRAMES + Math.round(2.95 * FPS));
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
        // スマホ（中央の左寄り）の右の空き。縦に並べて大きく見せる
        left: 1270,
        right: 72,
        top: 170,
        opacity: fadeOut,
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 24, ...title }}>{PIPELINE.title}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        {PIPELINE.steps.map((step, i) => (
          <Fragment key={step.title}>
            {i > 0 ? <Arrow start={i * STEP_GAP_FRAMES} /> : null}
            <PipelineStep start={i * STEP_GAP_FRAMES} title={step.title} sub={step.sub} last={i === PIPELINE.steps.length - 1} />
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: 26, color: COLORS.sub, marginTop: 20, ...useRise(PIPELINE.steps.length * STEP_GAP_FRAMES) }}>
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
        padding: "18px 24px",
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
      <div style={{ fontSize: 34, fontWeight: 700, whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontSize: 24, lineHeight: 1.4, opacity: 0.92 }}>{sub}</div>
    </div>
  );
};

const Arrow: FC<{ start: number }> = ({ start }) => {
  const rise = useRise(start);
  return <div style={{ alignSelf: "center", fontSize: 32, lineHeight: 1, color: COLORS.sub, ...rise }}>↓</div>;
};

/* ---------- 3・7・12番：写真の場面 ---------- */

/** video/public/ のテキストファイルを読む（12番の感想の一節。文はリポジトリに置かない） */
export const useStaticText = (file: string | null): string | null => {
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
  const nameplateRaw = useStaticText(section.nameplateFile);
  const nameplate = nameplateRaw ? (JSON.parse(nameplateRaw) as Nameplate) : null;
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
          {i === 0 && nameplate ? <NameplateView data={nameplate} /> : null}
        </Sequence>
      ))}
      {nameplate?.photoNote ? (
        <Sequence durationInFrames={photosEnd > 0 ? (section.footageFile === null ? section.durationInFrames : photosEnd) : 1} layout="none" name="写真の注">
          <PhotoNoteView text={nameplate.photoNote} />
        </Sequence>
      ) : null}
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

/**
 * 名前の札の中身（video/public/private/ の JSON。Git の対象外）。
 * photoNote は写真の右下に小さく出す注（写真の年と出来事。2026-11-08 オーナー：直前の地図が 2026 年なので、写真の時期を分かるように）
 */
type Nameplate = { role?: string; name: string; nameEn?: string; photoNote?: string };

/** 写真の右下に小さく重ねる注（写真の時期など） */
const PhotoNoteView: FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [6, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        right: 56,
        bottom: 48,
        padding: "8px 18px 10px",
        borderRadius: 10,
        backgroundColor: "rgba(17,24,28,0.72)",
        color: COLORS.white,
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: 1,
        opacity,
      }}
    >
      {text}
    </div>
  );
};

/** 写真の左下に重ねる名前の札。少し遅れて下から出す */
const NameplateView: FC<{ data: Nameplate }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - Math.round(0.6 * fps), fps, config: { damping: 200 } });
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        left: 72,
        bottom: 110,
        padding: "20px 34px 22px",
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.95)",
        borderLeft: `10px solid ${COLORS.accent}`,
        boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        opacity: p,
        transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px)`,
      }}
    >
      {data.role ? <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.sub }}>{data.role}</div> : null}
      <div style={{ fontSize: 64, fontWeight: 800, color: COLORS.ink, letterSpacing: 4 }}>{data.name}</div>
      {data.nameEn ? <div style={{ fontSize: 30, color: COLORS.sub, letterSpacing: 1 }}>{data.nameEn}</div> : null}
    </div>
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
  <Sequence from={PATIENT_TABLE_FROM_FRAMES} durationInFrames={PATIENT_TABLE_FRAMES} layout="none" name="架空の患者の表（Issue #261）">
    <AbsoluteFill>
      <PatientTableVideo />
    </AbsoluteFill>
  </Sequence>
);

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

/**
 * 11番：モデルの使い分け。説明の一枚ではなく、訓練・掲示板・カルテの実際の画面（録画）を並べ、
 * それぞれにモデルの流れの札を重ねる（2026-11-08 オーナー：「デモ＞プレゼン」「そのフローみたいなところは…入れてもいい」）。
 * 札の中身は modelMap.ts（MODEL_COLUMNS）から作る。録画は video/public/footage/11-*.mp4（Git の対象外）。
 */
const MODEL_FOOTAGE = {
  phone: "footage/11-phone.mp4",
  chat: "footage/11-chat.mp4",
  karte: "footage/11-karte.mp4",
} as const;

/** 横長の録画（1920×1080）の一部を切り取って見せる。crop は録画の CSS の座標 */
const CroppedFootage: FC<{ file: string; crop: { x: number; y: number; w: number; h: number }; width: number }> = ({ file, crop, width }) => {
  const scale = width / crop.w;
  const height = Math.round(crop.h * scale);
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", borderRadius: 16, border: `2px solid ${COLORS.frame}22`, backgroundColor: COLORS.white }}>
      {hasStaticFile(file) ? (
        <OffthreadVideo
          src={staticFile(file)}
          muted
          style={{ position: "absolute", left: -crop.x * scale, top: -crop.y * scale, width: 1920 * scale, height: 1080 * scale }}
        />
      ) : null}
    </div>
  );
};

/** 札を左から右（vertical なら上から下）へ、順に出す */
const ChipChain: FC<{ chain: Chip[]; start: number; vertical?: boolean; note?: string }> = ({ chain, start, vertical, note }) => (
  <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: vertical ? "stretch" : "center", gap: 8, flexWrap: "wrap" }}>
    {chain.map((chip, i) => (
      <Fragment key={`${chipTitle(chip)}-${i}`}>
        {i > 0 ? (
          <div style={{ alignSelf: "center", fontSize: 26, color: COLORS.sub, ...useRise(start + i * STEP_GAP_FRAMES - 4) }}>{vertical ? "↓" : "→"}</div>
        ) : null}
        <div style={useRise(start + i * STEP_GAP_FRAMES)}>
          <ModelChip chip={chip} />
        </div>
      </Fragment>
    ))}
    {note ? (
      <div style={{ alignSelf: vertical ? "flex-start" : "center", fontSize: 20, fontWeight: 700, color: COLORS.ink, ...useRise(start + chain.length * STEP_GAP_FRAMES) }}>
        ※ {note}
      </div>
    ) : null}
  </div>
);

const Panel: FC<{ start: number; title: string; role: string; width: number; children: ReactNode }> = ({ start, title, role, width, children }) => (
  <div
    style={{
      width,
      boxSizing: "border-box",
      backgroundColor: COLORS.white,
      borderRadius: 24,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
      ...useRise(start),
    }}
  >
    <div>
      <div style={{ fontSize: 30, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 21, color: COLORS.sub, marginTop: 4 }}>{role}</div>
    </div>
    {children}
  </div>
);

export const ModelsDemo: FC = () => {
  const [training, board] = MODEL_COLUMNS;
  const trainingChain = training.rows.flatMap((row) => row.chain);
  const trainingNote = training.rows.map((row) => row.note).filter(Boolean)[0];
  const chatRow = board.rows[1];
  const karteRow = board.rows[2];
  const s = (sec: number) => Math.round(sec * FPS);
  return (
    <AbsoluteFill style={{ ...baseText, backgroundColor: COLORS.background, padding: "36px 52px 32px", gap: 22 }}>
      <div style={{ fontSize: 52, fontWeight: 700, ...useRise(0) }}>{MODEL_MAP_TITLE}</div>
      <div style={{ flex: 1, display: "flex", gap: 22, alignItems: "flex-start" }}>
        <Panel start={s(0.2)} title={training.title} role={training.rows[0].role} width={560}>
          <div style={{ display: "flex", gap: 18 }}>
            <div style={{ width: 300, height: Math.round((300 * 844) / 390), borderRadius: 28, overflow: "hidden", border: `6px solid ${COLORS.frame}`, flexShrink: 0, backgroundColor: COLORS.white }}>
              {hasStaticFile(MODEL_FOOTAGE.phone) ? (
                <OffthreadVideo src={staticFile(MODEL_FOOTAGE.phone)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>
            <ChipChain chain={trainingChain} start={s(0.8)} vertical note={trainingNote} />
          </div>
        </Panel>
        <Panel start={s(0.6)} title={board.title} role={chatRow.role} width={605}>
          <CroppedFootage file={MODEL_FOOTAGE.chat} crop={{ x: 1180, y: 380, w: 710, h: 640 }} width={561} />
          <ChipChain chain={chatRow.chain} start={s(1.6)} note={chatRow.note} />
        </Panel>
        <Panel start={s(1.0)} title={board.title} role={karteRow.role} width={605}>
          <CroppedFootage file={MODEL_FOOTAGE.karte} crop={{ x: 360, y: 230, w: 640, h: 600 }} width={561} />
          <ChipChain chain={karteRow.chain} start={s(2.4)} note={karteRow.note} />
        </Panel>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "16px 28px",
          borderRadius: 18,
          backgroundColor: COLORS.ink,
          color: COLORS.white,
          ...useRise(s(3.4)),
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700 }}>{DEVELOPMENT_ROW.title}</div>
        <div style={{ fontSize: 26 }}>{DEVELOPMENT_ROW.body}</div>
      </div>
    </AbsoluteFill>
  );
};
