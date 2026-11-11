"""SonaQuest の文字のロゴを、Manrope Bold の字形から図形（SVG の path）にする（Issue #263、ADR-0066）。

制作時だけ、手元で1回実行する。フォントファイルはリポジトリに入れない（ADR-0051・ADR-0066）。
Python の標準ライブラリだけで TrueType（glyf）を読む。依存は足さない。

    python web/scripts/outline-logo.py <Manrope の Bold の .ttf>

フォントは Google Fonts（公式の配布元）から、作業用の一時フォルダに取得したものを渡す。
書き出すもの（どれも手で直さない。直すときはこのスクリプトを直して実行し直す）：
    web/src/brand/logoData.ts                  … 図形・大きさ・色（アプリと動画が読む）
    web/src/brand/sonaquest-logo.svg           … 文字だけの版
    web/src/brand/sonaquest-logo-subtitle.svg  … 下に名前の由来（副題）を添えた版
書き出す文字は、SVG では属性の値を quoteattr、要素の中身を escape で、TS では json.dumps でエスケープする（Issue #298）。
試験（フォントは要らない）：web/scripts/test_outline_logo.py

Manrope は SIL Open Font License 1.1（Copyright 2018 The Manrope Project Authors）。
"""

import json
import struct
import sys
from pathlib import Path
from typing import NamedTuple
from xml.sax.saxutils import escape, quoteattr

WORD = "SonaQuest"
ACCENT_CHAR_INDEX = 4  # Q だけ色を変える

# 字間：字の送り幅に、em の -1.5% を足す（少し詰める程度。Issue #263）
TRACKING_EM = -0.015
# 出力の座標は、1em を 100 にそろえる（数を短くするため）
OUTPUT_EM = 100.0
# 図形の周りの余白（1em に対して）
PAD_EM = 0.04

# 色（ADR-0066）。アプリの基調色（web/src/styles.css の :root）に合わせる。
#   語：--go-press #154d3b（押して進むボタンの押したときの深い緑）
#   Q ：--mint-strong #2f7d63（アプリの緑）
# オーナーの案（語 #173F46・Q #238C83）は青緑で、アプリの黄みの緑と並べると別のサービスに見えたため。
COLOR_WORD = "#154d3b"
COLOR_ACCENT = "#2f7d63"

# 副題（文字のまま置く。書体は端末のゴシック。ADR-0037・ADR-0051 の決定4）。
# 名前の由来（2026-11-08 オーナー、チャット。ADR-0066 の追記）
SUBTITLE = "ソナクエスト：備える（準備）＋クエスト"
SUBTITLE_FONT_FAMILY = (
    "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'BIZ UDPGothic', 'Yu Gothic UI', "
    "Meiryo, 'Noto Sans JP', sans-serif"
)
SUBTITLE_SIZE_EM = 0.22  # 副題の文字の大きさ（ロゴの 1em に対して）
SUBTITLE_SPACING_EM = 0.04  # 副題の字間（副題の文字の大きさに対して）
SUBTITLE_GAP_EM = 0.16  # ロゴの下端から副題の上端まで
SUBTITLE_WEIGHT = 700


class Font:
    def __init__(self, data: bytes):
        self.data = data
        num_tables = struct.unpack(">H", data[4:6])[0]
        self.tables = {}
        for i in range(num_tables):
            tag, _checksum, offset, length = struct.unpack(">4sIII", data[12 + 16 * i : 28 + 16 * i])
            self.tables[tag.decode("latin-1")] = (offset, length)
        if "glyf" not in self.tables:
            raise SystemExit("glyf の表が無い（TrueType の字形ではない）。止める")
        head = self.table("head")
        self.units_per_em = struct.unpack(">H", head[18:20])[0]
        self.index_to_loc_format = struct.unpack(">h", head[50:52])[0]
        hhea = self.table("hhea")
        self.ascender, self.descender = struct.unpack(">hh", hhea[4:8])
        self.num_h_metrics = struct.unpack(">H", hhea[34:36])[0]
        maxp = self.table("maxp")
        self.num_glyphs = struct.unpack(">H", maxp[4:6])[0]
        self.cmap = self._read_cmap()

    def table(self, tag: str) -> bytes:
        offset, length = self.tables[tag]
        return self.data[offset : offset + length]

    def _read_cmap(self) -> dict:
        cmap = self.table("cmap")
        num = struct.unpack(">H", cmap[2:4])[0]
        candidates = []
        for i in range(num):
            platform, encoding, offset = struct.unpack(">HHI", cmap[4 + 8 * i : 12 + 8 * i])
            fmt = struct.unpack(">H", cmap[offset : offset + 2])[0]
            if (platform, encoding) in ((3, 1), (0, 3), (0, 4), (3, 10)) and fmt in (4, 12):
                candidates.append((fmt, offset))
        for fmt, offset in sorted(candidates, reverse=True):
            if fmt == 12:
                return self._cmap12(cmap, offset)
        for fmt, offset in candidates:
            if fmt == 4:
                return self._cmap4(cmap, offset)
        raise SystemExit("Unicode の cmap（形式4・12）が無い。止める")

    @staticmethod
    def _cmap4(cmap: bytes, offset: int) -> dict:
        seg_count = struct.unpack(">H", cmap[offset + 6 : offset + 8])[0] // 2
        ends_at = offset + 14
        starts_at = ends_at + 2 * seg_count + 2
        deltas_at = starts_at + 2 * seg_count
        range_offsets_at = deltas_at + 2 * seg_count
        result = {}
        for s in range(seg_count):
            end = struct.unpack(">H", cmap[ends_at + 2 * s : ends_at + 2 * s + 2])[0]
            start = struct.unpack(">H", cmap[starts_at + 2 * s : starts_at + 2 * s + 2])[0]
            delta = struct.unpack(">h", cmap[deltas_at + 2 * s : deltas_at + 2 * s + 2])[0]
            ro_pos = range_offsets_at + 2 * s
            range_offset = struct.unpack(">H", cmap[ro_pos : ro_pos + 2])[0]
            for code in range(start, end + 1):
                if code == 0xFFFF:
                    continue
                if range_offset == 0:
                    glyph = (code + delta) & 0xFFFF
                else:
                    pos = ro_pos + range_offset + 2 * (code - start)
                    glyph = struct.unpack(">H", cmap[pos : pos + 2])[0]
                    if glyph:
                        glyph = (glyph + delta) & 0xFFFF
                if glyph:
                    result[code] = glyph
        return result

    @staticmethod
    def _cmap12(cmap: bytes, offset: int) -> dict:
        num_groups = struct.unpack(">I", cmap[offset + 12 : offset + 16])[0]
        result = {}
        for g in range(num_groups):
            pos = offset + 16 + 12 * g
            start, end, glyph = struct.unpack(">III", cmap[pos : pos + 12])
            for code in range(start, end + 1):
                result[code] = glyph + (code - start)
        return result

    def advance(self, glyph: int) -> int:
        hmtx = self.table("hmtx")
        index = min(glyph, self.num_h_metrics - 1)
        return struct.unpack(">H", hmtx[4 * index : 4 * index + 2])[0]

    def glyph_contours(self, glyph: int) -> list:
        loca = self.table("loca")
        if self.index_to_loc_format == 0:
            start = struct.unpack(">H", loca[2 * glyph : 2 * glyph + 2])[0] * 2
            end = struct.unpack(">H", loca[2 * glyph + 2 : 2 * glyph + 4])[0] * 2
        else:
            start = struct.unpack(">I", loca[4 * glyph : 4 * glyph + 4])[0]
            end = struct.unpack(">I", loca[4 * glyph + 4 : 4 * glyph + 8])[0]
        if start == end:
            return []
        g = self.table("glyf")[start:end]
        num_contours = struct.unpack(">h", g[0:2])[0]
        if num_contours < 0:
            raise SystemExit(f"字形 {glyph} は複合の字形。このスクリプトは単純な字形だけを扱う。止める")
        end_points = list(struct.unpack(f">{num_contours}H", g[10 : 10 + 2 * num_contours]))
        pos = 10 + 2 * num_contours
        instruction_length = struct.unpack(">H", g[pos : pos + 2])[0]
        pos += 2 + instruction_length
        num_points = end_points[-1] + 1 if end_points else 0
        flags = []
        while len(flags) < num_points:
            flag = g[pos]
            pos += 1
            flags.append(flag)
            if flag & 0x08:
                repeat = g[pos]
                pos += 1
                flags.extend([flag] * repeat)
        flags = flags[:num_points]

        def read_coords(short_bit: int, same_bit: int) -> list:
            nonlocal pos
            values = []
            value = 0
            for flag in flags:
                if flag & short_bit:
                    delta = g[pos]
                    pos += 1
                    value += delta if flag & same_bit else -delta
                elif not flag & same_bit:
                    value += struct.unpack(">h", g[pos : pos + 2])[0]
                    pos += 2
                values.append(value)
            return values

        xs = read_coords(0x02, 0x10)
        ys = read_coords(0x04, 0x20)
        contours = []
        first = 0
        for last in end_points:
            contours.append(
                [(xs[i], ys[i], bool(flags[i] & 0x01)) for i in range(first, last + 1)]
            )
            first = last + 1
        return contours


def contour_commands(points: list) -> list:
    """1つの輪郭を、M・L・Q・Z の命令の列にする（TrueType の2次ベジェ。続く制御点の間は中点が線上の点）。"""
    if not points:
        return []
    start = next((i for i, p in enumerate(points) if p[2]), None)
    if start is None:
        # すべて制御点：最初の2点の中点から始める
        a, b = points[0], points[1]
        points = [((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, True)] + points[1:] + [points[0]]
        start = 0
    pts = points[start:] + points[:start]
    commands = [("M", (pts[0][0], pts[0][1]))]
    pending = None
    for x, y, on in pts[1:] + [pts[0]]:
        if on:
            if pending is not None:
                commands.append(("Q", pending, (x, y)))
                pending = None
            else:
                commands.append(("L", (x, y)))
        else:
            if pending is not None:
                mid = ((pending[0] + x) / 2, (pending[1] + y) / 2)
                commands.append(("Q", pending, mid))
            pending = (x, y)
    commands.append(("Z",))
    return commands


def fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


class LogoShape(NamedTuple):
    """フォントから作った図形（path の文字列）と大きさ。"""

    word_path: str
    accent_path: str
    width: float
    height: float
    baseline: float
    sub_height: float
    sub_baseline: float
    sub_size: float
    sub_spacing: float


class LogoText(NamedTuple):
    """書き出す文字（語・副題・書体の指定・色）。既定は上の定数。"""

    word: str = WORD
    subtitle: str = SUBTITLE
    subtitle_font_family: str = SUBTITLE_FONT_FAMILY
    subtitle_weight: int = SUBTITLE_WEIGHT
    color_word: str = COLOR_WORD
    color_accent: str = COLOR_ACCENT


# 生成物の冒頭の注記（固定の文。`--` を含めない。SVG の注釈に入れるため）
HEADER = (
    "自動生成（web/scripts/outline-logo.py）。手で直さない。"
    "文字の図形は Manrope Bold（SIL Open Font License 1.1、"
    "Copyright 2018 The Manrope Project Authors）から作った。フォントファイルは含まない。"
)


def ts_string(value: str) -> str:
    """TS の二重引用符の文字列（引用符を含む）にする。二重引用符・バックスラッシュ・改行などをエスケープする（Issue #298）。"""
    return json.dumps(value, ensure_ascii=False)


def build_ts(shape: LogoShape, text: LogoText = LogoText()) -> str:
    """web/src/brand/logoData.ts の中身。文字列はすべて ts_string で書く。"""
    return f"""// {HEADER}
// Issue #263、ADR-0066。アプリ（SonaQuestLogo.tsx）と動画（video/）がここを読む。

/** ロゴの語（Q を除く8字）の図形 */
export const LOGO_WORD_PATH =
  {ts_string(shape.word_path)};

/** Q の図形（色を変える） */
export const LOGO_ACCENT_PATH =
  {ts_string(shape.accent_path)};

/** 文字だけの版の大きさ（viewBox の幅・高さ）と、上端から基線までの距離 */
export const LOGO_WIDTH = {fmt(shape.width)};
export const LOGO_HEIGHT = {fmt(shape.height)};
export const LOGO_BASELINE = {fmt(shape.baseline)};

/** 色（アプリの基調色に合わせた。語は --go-press、Q は --mint-strong） */
export const LOGO_COLOR_WORD = {ts_string(text.color_word)};
export const LOGO_COLOR_ACCENT = {ts_string(text.color_accent)};

/** 副題を添えた版。副題は文字のまま置き、書体は端末のゴシック（ADR-0037） */
export const LOGO_SUBTITLE = {ts_string(text.subtitle)};
export const LOGO_SUBTITLE_HEIGHT = {fmt(shape.sub_height)};
export const LOGO_SUBTITLE_BASELINE = {fmt(shape.sub_baseline)};
export const LOGO_SUBTITLE_SIZE = {fmt(shape.sub_size)};
export const LOGO_SUBTITLE_SPACING = {fmt(shape.sub_spacing)};
export const LOGO_SUBTITLE_WEIGHT = {int(text.subtitle_weight)};
export const LOGO_SUBTITLE_FONT_FAMILY =
  {ts_string(text.subtitle_font_family)};

/** 読み上げ・代わりの文字 */
export const LOGO_LABEL = {ts_string(text.word)};
"""


def _svg_paths(shape: LogoShape, text: LogoText) -> str:
    return (
        f"  <path fill={quoteattr(text.color_word)} d={quoteattr(shape.word_path)}/>\n"
        f"  <path fill={quoteattr(text.color_accent)} d={quoteattr(shape.accent_path)}/>\n"
    )


def build_plain_svg(shape: LogoShape, text: LogoText = LogoText()) -> str:
    """web/src/brand/sonaquest-logo.svg の中身。属性の値は quoteattr、要素の中身は escape で書く。"""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(shape.width)} {fmt(shape.height)}" '
        f'role="img" aria-label={quoteattr(text.word)}>\n'
        f"  <!-- {HEADER} -->\n"
        f"  <title>{escape(text.word)}</title>\n"
        f"{_svg_paths(shape, text)}"
        f"</svg>\n"
    )


def build_subtitle_svg(shape: LogoShape, text: LogoText = LogoText()) -> str:
    """web/src/brand/sonaquest-logo-subtitle.svg の中身。属性の値は quoteattr、要素の中身は escape で書く。"""
    label = f"{text.word} {text.subtitle}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(shape.width)} {fmt(shape.sub_height)}" '
        f'role="img" aria-label={quoteattr(label)}>\n'
        f"  <!-- {HEADER} -->\n"
        f"  <title>{escape(label)}</title>\n"
        f"{_svg_paths(shape, text)}"
        f'  <text x="{fmt(shape.width / 2)}" y="{fmt(shape.sub_baseline)}" text-anchor="middle" '
        f'font-family={quoteattr(text.subtitle_font_family)} font-size="{fmt(shape.sub_size)}" '
        f'font-weight="{int(text.subtitle_weight)}" letter-spacing="{fmt(shape.sub_spacing)}" '
        f"fill={quoteattr(text.color_word)}>{escape(text.subtitle)}</text>\n"
        f"</svg>\n"
    )


def build_shape(font: Font) -> LogoShape:
    """語の字形を送り幅で並べ、図形の path と大きさを作る。"""
    scale = OUTPUT_EM / font.units_per_em
    tracking = TRACKING_EM * font.units_per_em

    # 字ごとに、送り幅で横に並べた点（フォントの単位、y は上向き）を作る
    pen = 0.0
    glyph_commands = []
    for char in WORD:
        glyph = font.cmap.get(ord(char))
        if glyph is None:
            raise SystemExit(f"「{char}」の字形が無い。止める")
        commands = []
        for contour in font.glyph_contours(glyph):
            shifted = [(x + pen, y, on) for x, y, on in contour]
            commands.extend(contour_commands(shifted))
        glyph_commands.append(commands)
        pen += font.advance(glyph) + tracking

    # 外接の箱は、線上の点だけでなく2次ベジェの制御点も含めて取るので、実際の輪郭より少し大きくなりうる
    # （余白が少し広がるだけ。直すとロゴの大きさが変わるため、Issue #298 では直していない）
    all_points = [p for cmds in glyph_commands for c in cmds for p in c[1:]]
    min_x = min(p[0] for p in all_points)
    max_x = max(p[0] for p in all_points)
    min_y = min(p[1] for p in all_points)
    max_y = max(p[1] for p in all_points)
    pad = PAD_EM * font.units_per_em

    def to_svg(point: tuple) -> str:
        x = (point[0] - min_x + pad) * scale
        y = (max_y - point[1] + pad) * scale
        return f"{fmt(x)} {fmt(y)}"

    def path_of(commands: list) -> str:
        parts = []
        for c in commands:
            if c[0] == "Z":
                parts.append("Z")
            else:
                parts.append(c[0] + " ".join(to_svg(p) for p in c[1:]))
        return "".join(parts)

    word_path = path_of([c for i, cmds in enumerate(glyph_commands) if i != ACCENT_CHAR_INDEX for c in cmds])
    accent_path = path_of(glyph_commands[ACCENT_CHAR_INDEX])
    width = (max_x - min_x + 2 * pad) * scale
    height = (max_y - min_y + 2 * pad) * scale
    baseline = (max_y + pad) * scale  # 上端から基線まで

    sub_size = SUBTITLE_SIZE_EM * OUTPUT_EM
    sub_spacing = SUBTITLE_SPACING_EM * sub_size
    # 副題の基線：ロゴの下端（descender の無い語なので図形の下端）から間をあけ、文字の大きさの約0.88 下
    sub_baseline = height - PAD_EM * OUTPUT_EM + SUBTITLE_GAP_EM * OUTPUT_EM + sub_size * 0.88
    sub_height = sub_baseline + sub_size * 0.12 + PAD_EM * OUTPUT_EM
    return LogoShape(
        word_path=word_path,
        accent_path=accent_path,
        width=width,
        height=height,
        baseline=baseline,
        sub_height=sub_height,
        sub_baseline=sub_baseline,
        sub_size=sub_size,
        sub_spacing=sub_spacing,
    )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    font = Font(Path(sys.argv[1]).read_bytes())
    shape = build_shape(font)

    out_dir = Path(__file__).resolve().parent.parent / "src" / "brand"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "logoData.ts").write_text(build_ts(shape), encoding="utf-8", newline="\n")
    (out_dir / "sonaquest-logo.svg").write_text(build_plain_svg(shape), encoding="utf-8", newline="\n")
    (out_dir / "sonaquest-logo-subtitle.svg").write_text(
        build_subtitle_svg(shape), encoding="utf-8", newline="\n"
    )
    print(
        f"unitsPerEm={font.units_per_em} width={fmt(shape.width)} "
        f"height={fmt(shape.height)} baseline={fmt(shape.baseline)}"
    )


if __name__ == "__main__":
    main()
