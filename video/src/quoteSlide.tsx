// 12番：協力者の写真と、試用した人のコメントの一枚（2026-11-08 オーナー：1分の動画のスライドの形を参考に。
// 「〔協力者〕の紹介とかは特に参考になると思う」）。
// 人の名前・コメント・出典・写真はリポジトリに置かない（CLAUDE.md 絶対ルール8）。中身はすべて
// video/public/private/12-quote.json（Git の対象外）から読み、無ければ写真の場面（PhotoSlides）のまま。
import type { FC } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, type Section } from "./sections";
import { COLORS, baseText, hasStaticFile, resolveImage } from "./theme";
import { PhotoSlides, useStaticText } from "./slides";

/** private/12-quote.json の形 */
type QuoteData = {
  /** 集合写真の下の一行（例：ほかの方のお顔はぼかしています） */
  photoNote?: string;
  /** コメントの上の見出し */
  heading: string;
  /** 写真の下の名前 */
  name: string;
  /** 顔写真：video/public/ からの相対パス（拡張子なし可） */
  portrait?: string;
  /** 下の出典の一行 */
  source?: string;
  /** ページごとの文。**…** で囲んだ所を太字にする */
  pages: string[];
};

const CREAM = "#fbf7ea";
const GREEN = "#2f7d63";
const BROWN = "#a8541f";
/** 集合写真を見せる長さ */
const GROUP_FRAMES = Math.round(2.5 * FPS);

const useRiseIn = (start: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - start, fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [20, 0])}px)` };
};

/** **…** を太字にして並べる */
const RichText: FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} style={{ fontWeight: 800, color: COLORS.ink }}>
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </>
);

const GroupPhoto: FC<{ file: string | null; note?: string }> = ({ file, note }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, GROUP_FRAMES], [1, 1.03]);
  return (
    <AbsoluteFill style={{ ...baseText, backgroundColor: CREAM, alignItems: "center", justifyContent: "center", gap: 28 }}>
      {file ? (
        <div style={{ width: 1200, height: 900, borderRadius: 24, overflow: "hidden", boxShadow: "0 12px 36px rgba(0,0,0,0.18)", ...useRiseIn(0) }}>
          <Img src={staticFile(file)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
        </div>
      ) : null}
      {note ? <div style={{ fontSize: 34, color: COLORS.sub, ...useRiseIn(8) }}>{note}</div> : null}
    </AbsoluteFill>
  );
};

const QuotePage: FC<{ data: QuoteData; page: number }> = ({ data, page }) => {
  const portrait = data.portrait ? resolveImage(data.portrait) ?? (hasStaticFile(data.portrait) ? data.portrait : null) : null;
  const text = useRiseIn(6);
  return (
    <AbsoluteFill style={{ ...baseText, backgroundColor: CREAM, padding: "100px 140px 90px", boxSizing: "border-box" }}>
      {/* 顔写真とコメントは上下の中央にそろえる（2026-11-08 オーナー：「上下中央ぞろえにして。下のスペース空きすぎ」） */}
      <div style={{ flex: 1, display: "flex", gap: 110, alignItems: "center" }}>
        <div style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 36, ...useRiseIn(0) }}>
          {portrait ? (
            <div style={{ width: 330, height: 330, borderRadius: "50%", overflow: "hidden", border: `6px solid ${GREEN}`, boxSizing: "border-box" }}>
              <Img src={staticFile(portrait)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : null}
          <div style={{ fontSize: 52, fontWeight: 700, whiteSpace: "nowrap" }}>{data.name}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 50, fontWeight: 700, color: GREEN, marginBottom: 40 }}>{data.heading}</div>
          <div style={{ borderLeft: `10px solid ${BROWN}`, paddingLeft: 46, fontSize: 44, lineHeight: 1.75, color: "#3a3a36", whiteSpace: "pre-wrap", ...text }}>
            <RichText text={data.pages[page]} />
          </div>
          {data.pages.length > 1 ? (
            <div style={{ fontSize: 30, color: COLORS.sub, marginTop: 16 }}>
              （{page + 1} / {data.pages.length}）
            </div>
          ) : null}
        </div>
      </div>
      {data.source ? <div style={{ fontSize: 30, color: COLORS.sub }}>{data.source}</div> : null}
    </AbsoluteFill>
  );
};

/** 集合写真（photoShots の1つ目）→ コメントのページ。JSON が無ければ写真の場面のまま */
export const QuoteScene: FC<{ section: Section }> = ({ section }) => {
  const raw = useStaticText(section.quoteFile);
  if (!section.quoteFile || !hasStaticFile(section.quoteFile)) return <PhotoSlides section={section} />;
  if (raw === null) return <AbsoluteFill style={{ backgroundColor: CREAM }} />;
  const data = JSON.parse(raw) as QuoteData;
  const group = section.photoShots[0]?.[0] ?? null;
  const groupFile = group ? resolveImage(group) : null;
  const start = groupFile ? GROUP_FRAMES : 0;
  const pageFrames = Math.floor((section.durationInFrames - start) / Math.max(data.pages.length, 1));
  return (
    <AbsoluteFill style={{ backgroundColor: CREAM }}>
      {groupFile ? (
        <Sequence durationInFrames={GROUP_FRAMES} layout="none" name="協力者の写真">
          <GroupPhoto file={groupFile} note={data.photoNote} />
        </Sequence>
      ) : null}
      {data.pages.map((_, i) => (
        <Sequence
          key={i}
          from={start + i * pageFrames}
          durationInFrames={i === data.pages.length - 1 ? section.durationInFrames - start - i * pageFrames : pageFrames}
          layout="none"
          name={`コメント ${i + 1}`}
        >
          <QuotePage data={data} page={i} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
