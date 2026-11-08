// 提出動画の本体（Issue #28・#262、ADR-0051）。sections.ts の13場面（可変の尺）を <Sequence> で並べる。
// 素材（地図・写真・録画・ナレーション）は video/public/ に置く（Git の対象外）。
// 置かれていない素材は描かず・鳴らさず、仮の画面（番号・時間・見出し語）のまま書き出せるようにする。
import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ENDCARD_FRAMES, FPS, HEIGHT, SECTIONS, SECTION_COUNT, WIDTH, type Section, type Tap, type Zoom } from "./sections";
import { CLOSING_LINE, EVENT_CREDIT, EVENT_PERIOD } from "./slideText";
import {
  ModelsDemo,
  PatientTableOverlay,
  PipelineOverlay,
  QuakeCountOverlay,
  QuestionSlide,
} from "./slides";
import { COLORS, MONO, baseText, hasStaticFile } from "./theme";
import { QuoteScene } from "./quoteSlide";
import { Soundtrack } from "./soundtrack";
import { OptionPanelView } from "./optionPanel";
import {
  LOGO_ACCENT_PATH,
  LOGO_COLOR_ACCENT,
  LOGO_COLOR_WORD,
  LOGO_HEIGHT,
  LOGO_WIDTH,
  LOGO_WORD_PATH,
} from "../../web/src/brand/logoData";

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

/** アプリの声（ソナの声）。録画に音が無いので、合成した声を場面の決まった時刻に重ねる。素材が無ければ鳴らさない */
const AppVoice: FC<{ section: Section }> = ({ section }) => (
  <>
    {section.appVoice
      .filter((v) => hasStaticFile(v.file))
      .map((v) => (
        <Sequence key={v.file} from={v.fromFrames} layout="none" name="アプリの声">
          <Audio src={staticFile(v.file)} />
        </Sequence>
      ))}
  </>
);

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
          trimBefore={section.footageStartFrame}
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
      trimBefore={section.footageStartFrame}
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
/**
 * 画面の部分を横長の画面の高さいっぱい（1080）にする。ベゼルの上下の縁は画面の外に切れる
 * （2026-11-08 オーナー：「ベゼルが上下切るところは切ってもいい」）。
 * スマホは中央の左寄りに置き、左の列に題とテロップ、右の列に図を置く。
 */
const BEZEL_K = HEIGHT / BEZEL_SCREEN.height;
const BEZEL_LEFT = 660;
const BEZEL_TOP = -BEZEL_SCREEN.top * BEZEL_K;
/** 左の列（題とテロップ）の幅 */
const LEFT_COLUMN = { left: 64, width: 560 } as const;
/**
 * ダイナミックアイランド（ベゼルの画像の y 77〜160 あたり）が録画の見出しに重ならないよう、
 * 画面の上に偽のステータスバー（アプリの地の色）を置き、録画はその下に入れる。下にもホームバーの帯を置く。
 */
const STATUS_BAR = 150 * BEZEL_K;
const HOME_BAR = 60 * BEZEL_K;
const APP_CREAM = "#fffaf0";
/** 録画（390×844 の CSS の画面）を、帯の間の高さに合わせて縮める倍率と、横の余白 */
const PHONE_FOOTAGE_SCALE = (HEIGHT - STATUS_BAR - HOME_BAR) / 844;
const PHONE_FOOTAGE_WIDTH = 390 * PHONE_FOOTAGE_SCALE;
const PHONE_SIDE = (BEZEL_SCREEN.width * BEZEL_K - PHONE_FOOTAGE_WIDTH) / 2;

/** ベゼルの画面の中心（横）。ベゼルなしの画面も同じ中心に置く */
const PHONE_CENTER_X = BEZEL_LEFT + (BEZEL_SCREEN.left + BEZEL_SCREEN.width / 2) * BEZEL_K;
/** ベゼルなしの画面（5・6・13番）：上下に少し余白を残して高さいっぱい */
const PLAIN_MARGIN = 20;
const PLAIN_SCALE = (HEIGHT - PLAIN_MARGIN * 2) / 844;
const PLAIN_WIDTH = 390 * PLAIN_SCALE;
const PLAIN_LEFT = PHONE_CENTER_X - PLAIN_WIDTH / 2;

/** スマホの録画の CSS の座標 → 横長の画面の座標（寄りの中心と波紋で同じものを使う） */
const phoneToFrame = (section: Section, x: number, y: number) =>
  section.bezel && hasStaticFile(BEZEL_FILE)
    ? {
        x: BEZEL_LEFT + BEZEL_SCREEN.left * BEZEL_K + PHONE_SIDE + x * PHONE_FOOTAGE_SCALE,
        y: BEZEL_TOP + BEZEL_SCREEN.top * BEZEL_K + STATUS_BAR + y * PHONE_FOOTAGE_SCALE,
      }
    : { x: PLAIN_LEFT + x * PLAIN_SCALE, y: PLAIN_MARGIN + y * PLAIN_SCALE };

/** スマホの画面の左の端（寄ったときに左の列にかからないよう、ずらす量を決めるのに使う） */
const phoneLeftEdge = (section: Section) => (section.bezel && hasStaticFile(BEZEL_FILE) ? BEZEL_LEFT : PLAIN_LEFT);

/** スマホの画面の右の端（右の余白の選択肢の札を、ここより右に置く） */
const phoneRightEdge = (section: Section) =>
  section.bezel && hasStaticFile(BEZEL_FILE) ? BEZEL_LEFT + BEZEL_SCREEN.width * BEZEL_K : PLAIN_LEFT + PLAIN_WIDTH;

/** 録画の座標 → 横長の画面の座標。ボードの録画は 1920×1080 の CSS の画面をそのまま全面に置いている */
const tapToFrame = (section: Section, tap: Tap) => (section.screen === "phone" ? phoneToFrame(section, tap.x, tap.y) : { x: tap.x, y: tap.y });

/** 偽のステータスバー（時刻と電池の形だけ。録画の中の情報ではない） */
const StatusBar: FC = () => (
  <div
    style={{
      ...baseText,
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: STATUS_BAR,
      backgroundColor: APP_CREAM,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 50px",
      boxSizing: "border-box",
      fontSize: 22,
      fontWeight: 700,
    }}
  >
    <span>9:41</span>
    <span style={{ width: 32, height: 15, border: `2px solid ${COLORS.ink}`, borderRadius: 5, padding: 2, boxSizing: "border-box", display: "inline-block" }}>
      <span style={{ display: "block", width: "70%", height: "100%", backgroundColor: COLORS.ink, borderRadius: 2 }} />
    </span>
  </div>
);

/** スマホの枠に入れた縦の録画 */
const PhoneFrame: FC<{ section: Section }> = ({ section }) => {
  if (!section.bezel) {
    return (
      <div
        style={{
          position: "absolute",
          left: PLAIN_LEFT,
          top: PLAIN_MARGIN,
          width: PLAIN_WIDTH,
          height: 844 * PLAIN_SCALE,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: APP_CREAM,
          border: "2px solid rgba(31,42,51,0.12)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.18)",
        }}
      >
        <PhoneScreen section={section} />
      </div>
    );
  }
  if (hasStaticFile(BEZEL_FILE)) {
    const k = BEZEL_K;
    return (
      <div
        style={{
          position: "absolute",
          left: BEZEL_LEFT,
          top: BEZEL_TOP,
          width: BEZEL_SIZE.width * k,
          height: BEZEL_SIZE.height * k,
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
            backgroundColor: APP_CREAM,
          }}
        >
          <StatusBar />
          <div style={{ position: "absolute", left: PHONE_SIDE, top: STATUS_BAR, width: PHONE_FOOTAGE_WIDTH, height: 844 * PHONE_FOOTAGE_SCALE }}>
            <PhoneScreen section={section} />
          </div>
        </div>
        <Img src={staticFile(BEZEL_FILE)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        left: BEZEL_LEFT + 20,
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
// → オーナー決定（2026-11-08、チャット）：「SonaQuestのロゴがどこかのセッションで作ったはず」
/** 締めの画面のロゴの幅 */
const ENDCARD_LOGO_WIDTH = 980;

/**
 * 最後の場面（13番）の締めの画面：締めの文と、Issue #263 のロゴ（web/src/brand/logoData.ts の図形）。
 * 公開 URL は出さない（2026-11-08 オーナー：「最後の公開URLは不要」）。
 */
const EndCard: FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  // ロゴは、ナレーションが「ソナクエスト。」と言う所（締めの画面の頭から約 2.34 秒）で出す。ロゴは 4 秒残る
  const logoOpacity = interpolate(frame, [70, 88], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36, opacity: logoOpacity }}>
        <svg
          width={ENDCARD_LOGO_WIDTH}
          height={(ENDCARD_LOGO_WIDTH * LOGO_HEIGHT) / LOGO_WIDTH}
          viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
          role="img"
          aria-label="SonaQuest"
        >
          <path fill={LOGO_COLOR_WORD} d={LOGO_WORD_PATH} />
          <path fill={LOGO_COLOR_ACCENT} d={LOGO_ACCENT_PATH} />
        </svg>
        <div style={{ fontSize: 48, fontWeight: 700, color: LOGO_COLOR_WORD }}>お薬の避難訓練</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          color: COLORS.sub,
          opacity: logoOpacity,
        }}
      >
        <div style={{ fontSize: 32, letterSpacing: 1 }}>{EVENT_CREDIT}</div>
        <div style={{ fontSize: 26 }}>{EVENT_PERIOD}</div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * 場面の番号・時間・見出し語（音を消して見る人向け）。左上に置く
 * （2026-11-08 オーナー：「デモ動画の時には左上に何をしてるかっていうタイトルは表示しておいた方がいい」）。
 * スマホの場面は左の列に大きく、ボード・写真の場面は録画を隠しすぎないよう濃い地の札にする。
 */
const Caption: FC<{ section: Section; inColumn: boolean }> = ({ section, inColumn }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const meta = `${section.number} / ${SECTION_COUNT}  ${section.timeLabel}`;
  if (inColumn) {
    return (
      <div style={{ ...baseText, position: "absolute", top: 72, left: LEFT_COLUMN.left, width: LEFT_COLUMN.width, opacity }}>
        <div style={{ fontSize: 26, color: COLORS.sub, fontFamily: MONO }}>{meta}</div>
        <div style={{ fontSize: Math.min(60, Math.floor(LEFT_COLUMN.width / section.headline.length)), fontWeight: 700, marginTop: 10, lineHeight: 1.25 }}>{section.headline}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        ...baseText,
        position: "absolute",
        top: 28,
        left: 28,
        padding: "12px 24px 14px",
        borderRadius: 16,
        backgroundColor: "rgba(31,42,51,0.88)",
        color: COLORS.white,
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
        opacity,
      }}
    >
      <div style={{ fontSize: 18, opacity: 0.8, fontFamily: MONO }}>{meta}</div>
      <div style={{ fontSize: 44, fontWeight: 700, marginTop: 2 }}>{section.headline}</div>
    </div>
  );
};

/**
 * 下のテロップ（大事なところを小さく）。スマホの場面は左の列の下、ほかは画面の下の中央。
 */
const TelopView: FC<{ section: Section; inColumn: boolean }> = ({ section, inColumn }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {section.telops.map((telop) => {
        const from = telop.from * FPS;
        const to = telop.to * FPS;
        const opacity = Math.min(
          interpolate(frame, [from, from + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          interpolate(frame, [to - 8, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        );
        if (opacity <= 0) return null;
        const rise = interpolate(frame, [from, from + 10], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const place: CSSProperties = inColumn
          ? { left: LEFT_COLUMN.left, width: LEFT_COLUMN.width, bottom: 88 }
          : { left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center" };
        return (
          <div key={telop.text} style={{ position: "absolute", ...place, opacity, transform: `translateY(${rise}px)` }}>
            <div
              style={{
                ...baseText,
                display: "inline-block",
                padding: "12px 26px",
                borderRadius: 14,
                backgroundColor: "rgba(31,42,51,0.9)",
                color: COLORS.white,
                fontSize: inColumn ? 32 : 34,
                fontWeight: 700,
                lineHeight: 1.45,
                borderLeft: `8px solid ${COLORS.accent}`,
                boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              }}
            >
              {telop.text}
            </div>
          </div>
        );
      })}
    </>
  );
};

/**
 * 章の題（大きな場面の切り替わり）：約1.1秒、録画の上に大きく重ねる。1枚のスライドを足すと 180 秒が延びるので、
 * 録画の上に重ねる形にした（2026-11-08 オーナー：「1枚スライド足した方がいいのか悪いのか…検討してみて」）。
 */
const ChapterFlash: FC<{ section: Section }> = ({ section }) => {
  const frame = useCurrentFrame();
  if (!section.chapter) return null;
  const from = Math.round(section.chapter.at * FPS);
  const dur = Math.round(1.1 * FPS);
  const t = frame - from;
  if (t < 0 || t > dur) return null;
  const opacity = Math.min(
    interpolate(t, [0, 5], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(t, [dur - 8, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  const scale = interpolate(t, [0, dur], [1.04, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", backgroundColor: "rgba(251,247,234,0.93)", opacity }}>
      <div style={{ ...baseText, fontSize: 100, fontWeight: 800, color: COLORS.ink, transform: `scale(${scale})` }}>{section.chapter.text}</div>
      <div style={{ width: 160, height: 8, borderRadius: 4, backgroundColor: COLORS.accent, marginTop: 28 }} />
    </AbsoluteFill>
  );
};

/** 寄りの強さ（0〜1）：寄り始めの 0.6 秒で寄り、戻りの 0.6 秒で戻る。寄った後は止まる（一呼吸おく） */
const zoomAmount = (frame: number, zoom: Zoom) => {
  const from = zoom.from * FPS;
  const to = zoom.to * FPS;
  const ramp = Math.min(0.6 * FPS, (to - from) / 2);
  const ease = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;
  return Math.min(interpolate(frame, [from, from + ramp], [0, 1], ease), interpolate(frame, [to - ramp, to], [1, 0], ease));
};

/** タップの寄りの強さ・保ち方（秒）。スマホとボードで寄りの倍率を変える */
const TAP_LEAD = 0.7;
const TAP_RAMP_IN = 0.5;
const TAP_RAMP_OUT = 0.6;
const TAP_MERGE = 3.0;
const tapHold = (section: Section) => (section.screen === "phone" ? 1.2 : 1.8);
const tapScale = (section: Section) => (section.screen === "phone" ? 1.45 : 1.7);

type Camera = { scale: number; x: number; y: number };

/** 3秒より近いタップを1回の寄りにまとめる */
const tapClusters = (taps: Tap[]) => {
  const clusters: Tap[][] = [];
  for (const tap of taps.filter((t) => t.zoom !== false).sort((a, b) => a.at - b.at)) {
    const last = clusters[clusters.length - 1];
    if (last && tap.at - last[last.length - 1].at < TAP_MERGE) last.push(tap);
    else clusters.push([tap]);
  }
  return clusters;
};

const easeClamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) } as const;

/**
 * タップの寄り：押す 0.7 秒前に寄り、押した後しばらく保ち、引いて変化を見せる。
 * まとめたタップの間は、寄ったまま次の押す所へ動く。寄っていないときは null。
 */
const tapCamera = (frame: number, section: Section): Camera | null => {
  const t = frame / FPS;
  for (const cluster of tapClusters(section.taps)) {
    const first = cluster[0];
    const last = cluster[cluster.length - 1];
    const start = Math.max(0, first.at - TAP_LEAD);
    const end = last.at + tapHold(section);
    if (t < start || t > end) continue;
    const rampIn = Math.max(0.15, Math.min(TAP_RAMP_IN, first.at - 0.1 - start));
    const amount = Math.min(
      interpolate(t, [start, start + rampIn], [0, 1], easeClamp),
      interpolate(t, [end - TAP_RAMP_OUT, end], [1, 0], easeClamp),
    );
    let p = tapToFrame(section, first);
    for (let i = 0; i + 1 < cluster.length; i++) {
      const a = cluster[i];
      const b = cluster[i + 1];
      const from = a.at + 0.3;
      const to = Math.max(from + 0.2, b.at - 0.35);
      const k = interpolate(t, [from, to], [0, 1], easeClamp);
      if (k <= 0) break;
      const pa = tapToFrame(section, a);
      const pb = tapToFrame(section, b);
      p = { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
    }
    return { scale: 1 + (tapScale(section) - 1) * amount, x: p.x, y: p.y };
  }
  return null;
};

/** 01 クローズアップ：場面の画面（録画と枠）を、決め所とタップで拡大する */
const ZoomLayer: FC<{ section: Section; children: ReactNode }> = ({ section, children }) => {
  const frame = useCurrentFrame();
  let camera: Camera = { scale: 1, x: WIDTH / 2, y: HEIGHT / 2 };
  for (const zoom of section.zooms) {
    const t = zoomAmount(frame, zoom);
    if (t > 0) camera = { scale: 1 + (zoom.scale - 1) * t, x: zoom.x * WIDTH, y: zoom.y * HEIGHT };
  }
  camera = tapCamera(frame, section) ?? camera;
  // スマホの場面：寄ったスマホが左の列（題とテロップ）にかからないよう、右へずらす
  let shift = 0;
  if (section.screen === "phone") {
    const phoneLeft = camera.x + (phoneLeftEdge(section) - camera.x) * camera.scale;
    shift = Math.max(0, LEFT_COLUMN.left + LEFT_COLUMN.width + 24 - phoneLeft);
  }
  return (
    <AbsoluteFill
      style={{ transform: `translateX(${shift}px) scale(${camera.scale})`, transformOrigin: `${camera.x}px ${camera.y}px` }}
    >
      {children}
      <TapRipples section={section} />
    </AbsoluteFill>
  );
};

/** タップの印：押す少し前に指の丸が出て、押した瞬間に輪が広がる */
const TapRipples: FC<{ section: Section }> = ({ section }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const size = section.screen === "phone" ? 54 : 60;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  return (
    <>
      {section.taps.map((tap) => {
        const dt = t - tap.at;
        if (dt < -0.35 || dt > 0.7) return null;
        const p = tapToFrame(section, tap);
        const dot = Math.min(interpolate(dt, [-0.35, -0.15], [0, 1], clamp), interpolate(dt, [0.2, 0.45], [1, 0], clamp));
        const press = interpolate(dt, [-0.08, 0, 0.12], [1, 0.82, 1], clamp);
        const ring = interpolate(dt, [0, 0.6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <div key={`${tap.at}`} style={{ position: "absolute", left: p.x, top: p.y, width: 0, height: 0 }}>
            {dt >= 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: -size * 1.6 * ring,
                  top: -size * 1.6 * ring,
                  width: size * 3.2 * ring,
                  height: size * 3.2 * ring,
                  borderRadius: "50%",
                  border: `4px solid ${COLORS.accent}`,
                  opacity: 1 - ring,
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                left: -size / 2,
                top: -size / 2,
                width: size,
                height: size,
                borderRadius: "50%",
                backgroundColor: "rgba(31,42,51,0.35)",
                border: "3px solid rgba(255,255,255,0.95)",
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
                opacity: dot,
                transform: `scale(${press})`,
              }}
            />
          </div>
        );
      })}
    </>
  );
};

/** 05 ログの早回し：「早送り」などの札 */
const BadgeView: FC<{ section: Section }> = ({ section }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {section.badges.map((badge) => {
        const from = badge.from * FPS;
        const to = badge.to * FPS;
        const opacity = Math.min(
          interpolate(frame, [from, from + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          interpolate(frame, [to - 8, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        );
        if (opacity <= 0) return null;
        return (
          <div
            key={badge.text}
            style={{
              position: "absolute",
              right: 96,
              bottom: 96,
              padding: "14px 28px",
              borderRadius: 999,
              backgroundColor: COLORS.ink,
              color: COLORS.white,
              fontFamily: MONO,
              fontSize: 34,
              fontWeight: 700,
              opacity,
            }}
          >
            {badge.text}
          </div>
        );
      })}
    </>
  );
};

/** 画面に重ねる部品 */
const OverlayView: FC<{ section: Section }> = ({ section }) => {
  switch (section.overlay) {
    case "quakeCount":
      // 1分動画の地図の動画には題・「21回」・出典が入っているので、動画があるときは重ねない
      return hasStaticFile(section.footageFile) ? null : <QuakeCountOverlay />;
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
  let inColumn = false;
  // 見出し語を出さない画面（画面そのものが大きな文字のもの）
  let showCaption = true;
  switch (section.screen) {
    case "question":
      body = <QuestionSlide section={section} />;
      showCaption = false;
      break;
    case "quakeMap":
      body = <WideFootage section={section} label="震源の地図の動画" />;
      // 地図の動画に題があるので、見出し語は動画が無いときだけ出す
      showCaption = !hasStaticFile(section.footageFile);
      break;
    case "photos":
      body = <QuoteScene section={section} />;
      // コメントの一枚は自分の見出しを持つので、左上の題は出さない
      if (section.quoteFile && hasStaticFile(section.quoteFile)) showCaption = false;
      break;
    case "board":
      body = <WideFootage section={section} label="ボードの横長の録画（1920×1080）" />;
      break;
    case "phone":
      body = <PhoneFrame section={section} />;
      inColumn = true;
      break;
    case "models":
      body = <ModelsDemo />;
      showCaption = false;
      break;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <ZoomLayer section={section}>{body}</ZoomLayer>
      {/* 題は重ねる部品（患者の表など、全面のもの）の下に置き、全面の部品が出ている間は隠れるようにする */}
      {showCaption ? <Caption section={section} inColumn={inColumn} /> : null}
      <OverlayView section={section} />
      <BadgeView section={section} />
      <TelopView section={section} inColumn={inColumn} />
      {section.optionPanel ? <OptionPanelView panel={section.optionPanel} left={phoneRightEdge(section) + 44} /> : null}
      <ChapterFlash section={section} />
      <Narration section={section} />
      <AppVoice section={section} />
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
    <Soundtrack />
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
