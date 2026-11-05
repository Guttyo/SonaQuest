# 提出動画（Remotion）

SonaQuest の提出動画（3分。Issue #28、SUB-01）を組み立てる、アプリ（`web/`）とは別の npm パッケージです。決定の記録は `docs/decisions.md` の ADR-0050、台本は `docs/demo-script.md` の「場面ごとの台本（2026-11-06 改訂）」です。

- 1920×1080・30fps・180秒（5400フレーム）。9ビート×20秒。
- 素材（本人の実写・震源の地図・画面の録画・合成したナレーション）は `video/public/` に置きます。書き出した動画は `video/out/` に出ます。**どちらも Git の対象外**で、素材の正本は BWJ2026_Docs です。
- 素材が無いビートは、仮の画面（番号・時間・見出し語・場面の説明）のまま書き出せます。
- 書体は端末のゴシック（Windows は Yu Gothic UI、macOS はヒラギノ）。外部のフォント配信もフォントファイルも使いません。

## 今の状態
| 部分 | 状態 |
|---|---|
| 9ビートの骨組み（仮の画面、素材の枠、最後のロゴと公開 URL の札） | 作った。Studio で表示し、10秒の試し書き出し（1920×1080・30fps）をした |
| ナレーション合成のスクリプト | 作った。`video/.env` が無いときの案内と単体試験まで。本物の合成はしていない |
| ナレーションの合成・撮影・組み立て・全体の書き出し | 未着手（オーナーが行う） |
| 8番の図、ロゴ、公開 URL | 未着手（仮の文字） |

## 手順（オーナー）
コマンドはリポジトリの直下で実行します。Node.js 22 以上（`process.loadEnvFile()` を使うため 20.12 以上が必須）。

### 1. 依存を入れる
```bash
npm --prefix video install
```

### 2. `video/.env` を用意する
雛形 `video/.env.example` を同じ `video/` に `.env` という名前で写し、値を書きます。

| 名前 | 中身 |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs のキー |
| `ELEVENLABS_VOICE_ID` | ナレーターの声の ID（本人のクローン音声）。アプリの聞き取り係の声とは別 |
| `ELEVENLABS_MODEL_ID` | 省略可。無ければ `eleven_v4`（ナレーション向けの品質重視のモデル）。アプリの `/api/tts` は低遅延の `eleven_v4_turbo`（ADR-0045）で、ここだけ違う |

- `video/.env` は Git の対象外です。Claude Code は読みも書きもしません。
- `process.loadEnvFile()` は、同じ名前の環境変数がシェルに既にあると上書きしません。アプリ用の声の ID をシェルに入れている場合は外してから実行します。

### 3. ナレーションを合成する（ElevenLabs の課金の対象）
```bash
npm --prefix video run narration
```

- 原稿は `video/narration/02.txt`〜`09.txt`（読み上げの原稿なので「ソナクエスト」とカタカナ）。1番は本人の生声なので原稿はありません。
- 書き出し先は `video/public/narration/NN.mp3`。既にある mp3 は飛ばします。作り直すときは次のようにします。

```bash
npm --prefix video run narration -- --force --only 2,5
```

- ログに出るのは番号・件数・所要時間・HTTP の状態だけです。キー・声の ID・本文は出しません。
- 形式は `mp3_44100_64`（どのプランでも使える形。アプリと同じ）、声の設定は stability 0.65・similarity_boost 0.75（アプリと同じ値を写した下書き。v4 の推奨値は文書に見当たらなかった）。変えるときは `video/scripts/narration-lib.mjs` の定数を直します。

#### モデルと原稿の書き方（eleven_v4）
- 呼ぶのはアプリと同じ `POST /v1/text-to-speech/{voice_id}` です（`model_id`・`language_code: "ja"`・`voice_settings`）。Text to Dialogue の口は使いません。
- ElevenLabs の文書（elevenlabs.io/docs/models）は、ナレーション・動画の収録には `eleven_v4`、低遅延が要るときだけ `eleven_v4_turbo` を勧めています。
- v4 では SSML の `<break>` が効きません。間を置きたいところには、原稿の本文に `[pause]`・`[long pause]` のようなオーディオタグを書きます。タグはそのまま API に渡します。
- 1回に送れるのは 10,000 文字までです。各ビートは約100字なので分けません。上限を超える原稿は送らずにエラーで止めます。
- 読みが気になるときの選択肢として、ElevenLabs の発音辞書（pronunciation dictionary）があります。今回は使いません。
- **クローン音声の注意**：文書には、既存のクローン音声（IVC・PVC）は v4 で作り直さないと十分に使えないことがある、とあります。ナレーターの声が v4 で期待どおりに鳴らなければ、オーナーが ElevenLabs 側で v4 用に作り直します（Claude Code の作業ではありません）。急ぐときは `ELEVENLABS_MODEL_ID=eleven_v4_turbo` で合成できます。

[TODO-OWNER: 原稿のどこに間（[pause]・[long pause]）を置くか。今の video/narration/NN.txt はタグ無しで、台本の文をそのまま写したもの]

### 4. 素材を置く
`video/public/` に次の名前で置きます（名前は `video/src/sections.ts` の表）。無いものは仮の画面のままです。

| ビート | ファイル | 中身 |
|---|---|---|
| 1 | `footage/01-live-action.mp4` | 本人の実写（音声も使う） |
| 2 | `footage/02-quake-map.mp4` | 震源の地図のアニメーション |
| 3〜6・9 | `footage/03-phone.mp4` など | スマホ幅（390×844）の録画。スマホの枠に入る。4番だけ録画の音（アプリの聞き取り係の声）を鳴らす |
| 7 | `footage/07-board.mp4` | ボードの横長の録画（1920×1080） |
| 2〜9 | `narration/NN.mp3` | 手順3で合成したナレーション |

録画の長さは各ビート20秒に合わせて切っておきます（長い分は切れ、短い分は最後に何も映りません）。

### 5. Remotion Studio で見る
```bash
npm --prefix video run studio
```

ブラウザで `http://localhost:3000` が開き、タイムラインに9ビートが並びます。

### 6. 書き出す
```bash
npm --prefix video run render
```

- `video/out/sonaquest.mp4`（1920×1080・30fps・H.264）に書き出します。
- 初回の書き出しで、Remotion が描画用の Chrome（Headless Shell）を取得します（ネットワークが要ります）。
- 試しに最初の10秒だけ書き出すときは `npm --prefix video run render:test`（`video/out/sonaquest-test.mp4`）。

## 試験
```bash
npm --prefix video test
```

```bash
npm --prefix video run typecheck
```

合成スクリプトの部品（ファイル名の組み立て、引数、設定の確かめ、ログに本文やキーが入らないこと）を `node:test` で確かめます。本物の ElevenLabs は呼びません。

## 決めること・確かめること（オーナー）
- Remotion のライセンス（個人の利用の範囲か）を確かめる。
- 見出し語を置くか、置くならその文（`video/src/sections.ts` のマーカー）。
- 最後のロゴの形と公開 URL・QR（`video/src/SonaQuestVideo.tsx`・`sections.ts` のマーカー）。
- 2番の地震の回数、7番の掲示板の一文、9番の言い方は `docs/demo-script.md` のマーカーで決め、決まったら `video/narration/NN.txt` を直してから合成する。
