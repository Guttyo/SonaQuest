"""outline-logo.py の書き出しの試験（Issue #298）。フォントは要らない。

    sh .claude/hooks/run-python.sh -m unittest discover -s web/scripts -p "test_outline_logo.py"

確かめること：
- 副題・書体の指定・語・色に `&`・`<`・`"`・`\\` などを入れても、2つの SVG が XML として読め、
  TS の文字列が元の文字に戻ること（エスケープ）
- 今の定数と、リポジトリにある logoData.ts の図形・大きさから組み立てると、
  リポジトリにある3つの生成物と1文字も違わないこと（エスケープを入れても生成物が変わらない）
"""

import importlib.util
import json
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
BRAND = SCRIPTS.parent / "src" / "brand"
SVG_NS = "{http://www.w3.org/2000/svg}"

_spec = importlib.util.spec_from_file_location("outline_logo", SCRIPTS / "outline-logo.py")
assert _spec is not None and _spec.loader is not None
logo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(logo)


def ts_value(ts: str, name: str) -> str:
    """logoData.ts の `export const NAME =` の右辺（改行をはさむ書き方も含む）を返す。"""
    match = re.search(rf"export const {name} =\s*(.+?);\n", ts)
    if match is None:
        raise AssertionError(f"{name} が見つからない")
    return match.group(1)


def shape_from_committed() -> "logo.LogoShape":
    ts = (BRAND / "logoData.ts").read_text(encoding="utf-8")
    return logo.LogoShape(
        word_path=json.loads(ts_value(ts, "LOGO_WORD_PATH")),
        accent_path=json.loads(ts_value(ts, "LOGO_ACCENT_PATH")),
        width=float(ts_value(ts, "LOGO_WIDTH")),
        height=float(ts_value(ts, "LOGO_HEIGHT")),
        baseline=float(ts_value(ts, "LOGO_BASELINE")),
        sub_height=float(ts_value(ts, "LOGO_SUBTITLE_HEIGHT")),
        sub_baseline=float(ts_value(ts, "LOGO_SUBTITLE_BASELINE")),
        sub_size=float(ts_value(ts, "LOGO_SUBTITLE_SIZE")),
        sub_spacing=float(ts_value(ts, "LOGO_SUBTITLE_SPACING")),
    )


FAKE_SHAPE = logo.LogoShape(
    word_path="M0 0L10 0L10 10Z",
    accent_path="M20 0Q25 5 30 0Z",
    width=40.5,
    height=12,
    baseline=10,
    sub_height=30,
    sub_baseline=25.25,
    sub_size=22,
    sub_spacing=0.88,
)

TRICKY = logo.LogoText(
    word='A&B<C>"D\'E\\F',
    subtitle='副題 & <b>強調</b> "引用" \\ 終わり',
    subtitle_font_family='"Quoted Family", \'Single\', A&B <x>',
    subtitle_weight=700,
    color_word='#000"&',
    color_accent="#fff<'",
)


class EscapeTest(unittest.TestCase):
    def test_svgs_parse_and_round_trip_with_special_characters(self) -> None:
        plain = ET.fromstring(logo.build_plain_svg(FAKE_SHAPE, TRICKY))
        self.assertEqual(plain.get("aria-label"), TRICKY.word)
        self.assertEqual(plain.find(f"{SVG_NS}title").text, TRICKY.word)
        fills = [p.get("fill") for p in plain.findall(f"{SVG_NS}path")]
        self.assertEqual(fills, [TRICKY.color_word, TRICKY.color_accent])

        sub = ET.fromstring(logo.build_subtitle_svg(FAKE_SHAPE, TRICKY))
        label = f"{TRICKY.word} {TRICKY.subtitle}"
        self.assertEqual(sub.get("aria-label"), label)
        self.assertEqual(sub.find(f"{SVG_NS}title").text, label)
        text = sub.find(f"{SVG_NS}text")
        self.assertEqual(text.text, TRICKY.subtitle)
        self.assertEqual(text.get("font-family"), TRICKY.subtitle_font_family)
        self.assertEqual(text.get("fill"), TRICKY.color_word)
        paths = [p.get("d") for p in sub.findall(f"{SVG_NS}path")]
        self.assertEqual(paths, [FAKE_SHAPE.word_path, FAKE_SHAPE.accent_path])

    def test_ts_strings_round_trip_with_special_characters(self) -> None:
        ts = logo.build_ts(FAKE_SHAPE, TRICKY)
        expected = {
            "LOGO_SUBTITLE": TRICKY.subtitle,
            "LOGO_SUBTITLE_FONT_FAMILY": TRICKY.subtitle_font_family,
            "LOGO_LABEL": TRICKY.word,
            "LOGO_COLOR_WORD": TRICKY.color_word,
            "LOGO_COLOR_ACCENT": TRICKY.color_accent,
            "LOGO_WORD_PATH": FAKE_SHAPE.word_path,
            "LOGO_ACCENT_PATH": FAKE_SHAPE.accent_path,
        }
        for name, value in expected.items():
            with self.subTest(name=name):
                self.assertEqual(json.loads(ts_value(ts, name)), value)
        # 文字列の外に、元の二重引用符やバックスラッシュがはみ出していない（1つの定数が1行に収まる）
        self.assertEqual(ts_value(ts, "LOGO_LABEL"), json.dumps(TRICKY.word, ensure_ascii=False))

    def test_ts_string_keeps_japanese_and_single_quotes_as_is(self) -> None:
        self.assertEqual(logo.ts_string(logo.SUBTITLE), f'"{logo.SUBTITLE}"')
        self.assertEqual(logo.ts_string(logo.SUBTITLE_FONT_FAMILY), f'"{logo.SUBTITLE_FONT_FAMILY}"')


class CommittedOutputTest(unittest.TestCase):
    """今の定数では、エスケープを入れる前と同じものを書き出す（生成物を作り直さなくても一致する）。"""

    def setUp(self) -> None:
        self.shape = shape_from_committed()

    def assert_same_as_committed(self, built: str, file_name: str) -> None:
        committed = (BRAND / file_name).read_bytes().decode("utf-8")
        self.assertEqual(built, committed)

    def test_logo_data_ts(self) -> None:
        self.assert_same_as_committed(logo.build_ts(self.shape), "logoData.ts")

    def test_plain_svg(self) -> None:
        self.assert_same_as_committed(logo.build_plain_svg(self.shape), "sonaquest-logo.svg")

    def test_subtitle_svg(self) -> None:
        self.assert_same_as_committed(logo.build_subtitle_svg(self.shape), "sonaquest-logo-subtitle.svg")


if __name__ == "__main__":
    unittest.main()
