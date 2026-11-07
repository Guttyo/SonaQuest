# SonaQuest のロゴ（Issue #263、ADR-0066）

| ファイル | 中身 |
|---|---|
| `sonaquest-logo.svg` | 文字だけの版 |
| `sonaquest-logo-subtitle.svg` | 下に名前の由来「ソナクエスト：備える（準備）＋クエスト」を添えた版 |
| `logoData.ts` | 図形・大きさ・色（アプリと動画が読む） |
| `SonaQuestLogo.tsx` | React の部品（`withSubtitle` で副題つき） |

- 上の SVG 2つと `logoData.ts` は `web/scripts/outline-logo.py` が書き出す。手で直さない（`SonaQuestLogo.test.tsx` が食い違いを確かめる）。
- 文字は Manrope Bold（700）の字形を図形（path）にしたもの。字間は em の -1.5%。フォントファイルはリポジトリに入れず、画面でも読み込まない。
- 色はアプリの基調色（`web/src/styles.css`）：語は `--go-press`（`#154d3b`）、Q は `--mint-strong`（`#2f7d63`）。
- 副題は文字のまま置き、書体は端末のゴシック（ADR-0037）。書き出す端末によって字形が変わる。
- 動画（`video/`）からは、`video/src/boardMap/` と同じく相対の import で読む（例：`../../../web/src/brand/SonaQuestLogo`）。

## 作り直すとき
1. Google Fonts（公式の配布元）から Manrope の Bold（700）の TrueType を、リポジトリの外の一時フォルダに取得する。
2. `python web/scripts/outline-logo.py <取得した .ttf>` を実行する（Python 3.9 以上、標準ライブラリだけ）。
3. 取得したフォントはリポジトリに入れない。

## フォントのライセンス
文字の図形は Manrope から作った。

> Copyright 2018 The Manrope Project Authors (https://github.com/googlefonts/manrope)
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1.
> https://openfontlicense.org

SIL Open Font License 1.1 は、フォントから作った画像・図形（このロゴ）の利用を妨げない。フォントそのものは配布していない。
