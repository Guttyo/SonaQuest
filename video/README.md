# 提出動画（Remotion）

SonaQuest の提出動画（3分。Issue #28、SUB-01）を組み立てる、アプリ（`web/`）とは別の npm パッケージです。決定の記録は `docs/decisions.md` の ADR-0051（と追記）、台本は `docs/demo-script.md` の「場面ごとの台本（物語の構成。可変の尺。2026-11-06 改訂）」です。

- 1920×1080・30fps・180秒（5400フレーム）。13場面で、長さは場面ごとに違います（`src/sections.ts` の `seconds`。Issue #262 で8場面の版から組み直しました）。
- 素材（本人の実写・震源の地図・画面の録画・合成したナレーション）は `video/public/` に置きます。書き出した動画は `video/out/` に出ます。**どちらも Git の対象外**で、素材の正本は BWJ2026_Docs です。
- 素材が無い場面は、仮の画面（番号・時間・見出し語・場面の説明）のまま書き出せます。台本の進め方（録画を仮配置してから説明を削る）はこの仕組みで行います。
- 書体は端末のゴシック（Windows は Yu Gothic UI、macOS はヒラギノ）。外部のフォント配信もフォントファイルも使いません。

## 今の状態
| 部分 | 状態 |
|---|---|
| 13場面の骨組み（可変の尺、仮の画面、素材の枠、締めの画面） | 作った（Issue #262）。`npx remotion compositions` で 5400 フレーム（3:00）になることと、主な場面の静止画を確かめた。10秒の試し書き出し（1920×1080・30fps）は 20秒×9の版で行った |
| Remotion で描く仮の部品（冒頭の問い、「21回」と出典、5番の経路の図、11番のモデルの使い分けの一枚、締めの画面） | 作った（Issue #262。`src/slides.tsx`・`src/slideText.ts`・`src/modelMap.ts`）。見た目はオーナーが見て直す |
| ナレーション合成のスクリプト | 作った。2026-11-08 にオーナーのキーで13本を合成した（Issue #272。mp3 は Git の対象外）。環境変数のファイルが無いときの案内と単体試験もある |
| ナレーションの合成・撮影・組み立て・全体の書き出し | 撮影・合成・組み立てまでした（Issue #272）。ナレーションの長さに合わせて時刻を直し、180秒の書き出しで場面ごとの声と BGM の大きさを測った。提出用の書き出し（`npm run render`）はオーナーが聞いてから |
| 8番の架空の患者 100 人の表 | 差し込む枠だけ（部品は Issue #261） |
| ロゴ、公開 URL | 未着手（仮の文字。ロゴは Issue #263） |

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

- 原稿は `video/narration/NN.txt`（1・2・4〜11・13番。読み上げの原稿なので「ソナクエスト」とカタカナ）。
- 5番には、架空の患者の台詞を本人のクローン音声で3本足しています（`05a.txt`〜`05c.txt`。2026-11-08 オーナー決定。置く時刻は `src/sections.ts` の `extraNarration`）。6番・8番の間にも一言（`06a.txt`・`08a.txt`）、7番から8番にまたがって `07a.txt`（`CROSS_NARRATION`）を足しています。`--only` には `05b` のように書けます。
- 3番（本人の経験）と 12番（協力者と試用した人の感想）の原稿はリポジトリに置きません（CLAUDE.md 絶対ルール8）。合成するときは、BWJ2026_Docs の原稿を `video/public/private/narration/03.txt`・`12.txt`（Git の対象外）に写します。置かれていなければ、その場面は飛ばします（失敗にしません）。
- 書き出し先は `video/public/narration/NN.mp3`。既にある mp3 は飛ばします。作り直すときは次のようにします。

```bash
npm --prefix video run narration -- --force --only 2,5
```

- 台詞ごとに声の設定を変えるときは `narration-lib.mjs` の `CLIP_VOICE_SETTINGS` に書きます（今は2番だけ `speed` 0.85。`eleven_v4` では効きが小さく、6.32 秒が 6.56 秒になっただけでした）。

- ログに出るのは番号・件数・所要時間・HTTP の状態だけです。キー・声の ID・本文は出しません。
- 形式は `mp3_44100_64`（どのプランでも使える形。アプリと同じ）、声の設定は stability 0.65・similarity_boost 0.75（アプリと同じ値を写した下書き。v4 の推奨値は文書に見当たらなかった）。変えるときは `video/scripts/narration-lib.mjs` の定数を直します。

#### モデルと原稿の書き方（eleven_v4）
- 呼ぶのはアプリと同じ `POST /v1/text-to-speech/{voice_id}` です（`model_id`・`language_code: "ja"`・`voice_settings`）。Text to Dialogue の口は使いません。
- ElevenLabs の文書（elevenlabs.io/docs/models）は、ナレーション・動画の収録には `eleven_v4`、低遅延が要るときだけ `eleven_v4_turbo` を勧めています。
- v4 では SSML の `<break>` が効きません。間を置きたいところには、原稿の本文に `[pause]`・`[long pause]` のようなオーディオタグを書きます。タグはそのまま API に渡します。
- 1回に送れるのは 10,000 文字までです。各場面は 200 字以下なので分けません。上限を超える原稿は送らずにエラーで止めます。
- 読みが気になるときの選択肢として、ElevenLabs の発音辞書（pronunciation dictionary）があります。今回は使いません。
- **クローン音声の注意**：文書には、既存のクローン音声（IVC・PVC）は v4 で作り直さないと十分に使えないことがある、とあります。ナレーターの声が v4 で期待どおりに鳴らなければ、オーナーが ElevenLabs 側で v4 用に作り直します（Claude Code の作業ではありません）。急ぐときは `ELEVENLABS_MODEL_ID=eleven_v4_turbo` で合成できます。

[TODO-OWNER: 原稿のどこに間（[pause]・[long pause]）を置くか。今の video/narration/NN.txt はタグ無しで、台本の文をそのまま写したもの]

### 4. 素材を置く
`video/public/` に次の名前で置きます（名前は `video/src/sections.ts` の表）。無いものは仮の画面のままです。

| 場面 | ファイル | 中身 |
|---|---|---|
| 2 | `footage/02-quake-map.mp4` | 震源の地図のアニメーション（10秒）。「21回」と出典は Remotion で重ねる |
| 3 | `photos/03-a`・`03-b`・`03-c` | 本人の経験の写真（`03-a` と `03-b` を横に並べ、次に `03-c`）。拡張子は jpg・png・webp のどれでもよい |
| 4〜6・13 | `frames/iphone-bezel.webp` | スマホの枠の画像（オーナーが渡した iPhone のベゼル。978×2000 の透過 webp）。無ければ CSS で描いた枠になる |
| 4〜6・13 | `footage/04-phone.mp4` など | スマホ幅（390×844）の録画。スマホの枠に入る。録画に音は無い。5番のソナの声は `voice/05-sona-1.mp3`・`05-sona-reply.mp3`・`05-sona-2.mp3`（公開 URL の `/api/tts` で合成。アプリと同じ声）を `sections.ts` の `appVoice` の時刻に重ねる（`05-sona-reply.mp3` は問いの部分だけを切り出して鳴らす） |
| 7 | `photos/07-a`・`07-b`・`07-c`、`footage/07-board.mp4` | 当時の本部と救護所の写真（3秒ずつ）の後に、ボードの全体の録画 |
| 8〜10 | `footage/08-board.mp4` など | ボードの横長の録画（1920×1080）。8番は 4〜9 秒に架空の患者の表（`src/patientTable/PatientTableVideo.tsx`）が重なる |
| 11 | `footage/11-phone.mp4`・`11-chat.mp4`・`11-karte.mp4` | モデルの使い分けで並べる、訓練・掲示板・カルテの録画（各9秒）。札は `src/modelMap.ts` から重ねる |
| 3 | `private/03-nameplate.json` | 1カット目（顔の写った写真）の左下に重ねる名前の札。JSON に `role`・`name`・`nameEn` を書く。名前と肩書きはリポジトリに書かない。無ければ札を出さない |
| 12 | `photos/12-a`・`12-b`、`private/12-quote.json`（無ければ `private/12-caption.txt`） | 協力者の集合写真の後に、試用した人のコメントの一枚。JSON に `photoNote`・`heading`・`name`・`portrait`・`source`・`pages`（`**…**` は太字）を書く。名前とコメントはリポジトリに書かない |
| 1〜13 | `narration/NN.mp3`（5番は `05a`〜`05c.mp3` も） | 手順3で合成したナレーションと、5番の架空の患者の台詞 |
| 4〜6 | `bgm/app-training.wav` | アプリの BGM（`web/src/bgm/bgm.ts`）をそのまま書き出したもの。`node video/scripts/capture-app-bgm/capture.mjs` で作る（ヘッドレスの Chrome を使う） |
| 1〜3・7〜13 | `bgm/opening.wav`・`board.wav`・`models.wav`・`ending.wav` | コードで合成した BGM（`video/scripts/compose-bgm.mjs`）。置き方と大きさは `src/soundtrack.tsx` |
| 全体 | `sfx/tap.wav`・`whoosh.wav`・`battery-off.wav`・`confirm.wav`・`pop.wav` | 効果音（コードで合成）。タップ・章の題・電池切れ・承認と確認・テロップの時刻に鳴る |

- 写真と感想の文は、元の名前を使わず、上の中立の名前で置きます（元のファイル名をリポジトリに書かないため）。
- タップの寄りと波紋は `src/sections.ts` の `taps`（場面の頭からの秒と、録画の CSS の座標）、下のテロップは `telops`、章の題は `chapter` に書きます。撮影の記録（録画と一緒に書き出す JSON の `clicks`）の時刻を場面の時間に写して使います。
- 長い1本の録画（撮影の R1〜R4）から場面ごとに切り出すときは、録画のファイルを変えずに、`src/sections.ts` の場面の行に `footageFile`（同じファイルでよい）と `footageStartSeconds`（録画のどこから使うか）を書きます。再エンコードは要りません。

### 10のコツから取り入れた表現（Issue #262）
| コツ | 場所 | 直すところ |
|---|---|---|
| 01 クローズアップ | 5番（情報源を押す所、暗転〜立て直しの問い）、6番（まだ弱いところ） | `sections.ts` の `zooms`（秒・倍率・中心）。録画に合わせて直す |
| 05 ログの早回し | 8番の「▶▶ デモの時間を早送り」の札 | `sections.ts` の `badges` |
| 07 構成図のアニメーション | 5番の経路の図、11番のモデルの一枚（札が順に現れる） | `src/slides.tsx` |
| 08 数値のカウントアップ | 2番の「21回」（地図の動画が無いとき）、8番の「架空の患者 100 人」 | `src/slides.tsx` の `useCountUp` |
| 09 フォントの使い分け | 場面の番号と時刻・数字・札は等幅、見出しと文はゴシック | `src/theme.ts` の `MONO` |

- 02 カーソル追従ズームはカーソルを映さない決定（提案 A）なので使わない。03 コードハイライト・06 テストの赤から緑・10 コミット履歴は、13場面の構成にコードの画面が無いので入れていない。04 ビフォーアフター分割は、5番の電池切れの前後で使える（未実装）。

録画の長さは、各場面の秒（`src/sections.ts` の `seconds`。台本の表の時間の欄と同じ）に合わせて切っておきます（長い分は切れ、短い分は最後に何も映りません）。場面の長さを変えるときは `seconds` を直して書き出し直します（合計が 180 秒を超えないように）。

### 5. Remotion Studio で見る
```bash
npm --prefix video run studio
```

ブラウザで `http://localhost:3000` が開き、タイムラインに13場面が並びます。

### 6. 書き出す
```bash
npm --prefix video run render
```

- `video/out/versions/sonaquest-vNN-<コミット>.mp4`（1920×1080・30fps・H.264）に書き出します。前の書き出しは上書きしません（2026-11-08 オーナーの依頼）。NN は既にある番号の次で、`video/` に未コミットの変更があるときはコミットの後に `-dirty` が付きます。中身は `scripts/render-versioned.mjs`。
- 聞いて直すときは「v03 の 0:45」のように番号で指せます。`v01` は Issue #272 のコミット a716eeb の版です（それより前の書き出しは上書きしていて残っていません）。
- `npm --prefix video run render -- --frames=0-299` のように、後ろに Remotion の引数を渡せます。
- 初回の書き出しで、Remotion が描画用の Chrome（Headless Shell）を取得します（ネットワークが要ります）。
- 試しに最初の10秒だけ書き出すときは `npm --prefix video run render:test`（`video/out/sonaquest-test.mp4`）。

## 「なぜ必要か」に絞った紹介動画 v2（SonaQuestVideoV2、Issue #315）
提出版と同じ部品で、場面の表と音を替えた11場面の版です。Studio の左の一覧で `SonaQuestVideoV2` を選びます。中身は `src/v2/`（場面の表 `sectionsV2.ts`、数字のカードと資料の札 `CardSlides.tsx`・`cardsText.ts`、音 `SonaQuestVideoV2.tsx`）。台本の正本はリポジトリの外です。

| # | 中身 | 素材 |
|---|---|---|
| 1 | 問い | 提出版の1番のまま（声 `01.mp3`） |
| 2 | 震度5弱以上の地震は21回（2026-11-05 時点） | 提出版の2番のまま（声 `02.mp3`） |
| 3 | 薬は身近（通院、お薬手帳の利用） | 数字のカード（声 `v2-03.mp3`） |
| 4 | 手元にあるとは限らない（ある調査では） | 数字のカード（声 `v2-04.mp3`） |
| 5 | 仕組みがあっても（災害時モード） | 資料の一節の札（声 `v2-05.mp3`） |
| 6 | お薬の避難訓練（はじめに） | 提出版の4番の録画（声 `v2-06.mp3`） |
| 7 | 訓練の実演 | 提出版の5番のまま（声 `05.mp3`、アプリの声、足す台詞） |
| 8 | 振り返り | 提出版の6番のまま（声 `06.mp3`・`06a.mp3`） |
| 9 | 受け取る側の備え（ボード） | 提出版の8番の録画・患者の表（声 `v2-09.mp3`） |
| 10 | 使った人の声 | 提出版の12番のまま（声 `12.mp3`、写真と感想の一枚。中身は Git の外） |
| 11 | 締め | 提出版の13番のまま（声 `13.mp3`） |

- 撮り直しはしません。録画・アプリの声・BGM・効果音は提出版の素材（`video/public/`）をそのまま使います。
- 新しく合成するナレーションは5本です（原稿は `video/narration/v2-03.txt` など）。合成し直したら、声の長さと文の間を測って、カードの出る時刻（`cardsText.ts` の `at`）と場面の長さ（`sectionsV2.ts` の `seconds`）を直します（2026-11-12 に4・9番を合成し直した長さに合わせ済み。合計 2:53.5）。

```bash
npm --prefix video run narration -- --only v2-03,v2-04,v2-05,v2-06,v2-09
```

```bash
npm --prefix video run render -- --cut v2
```

- 書き出し先は `video/out/versions/sonaquest-v2-vNN-<コミット>.mp4` で、提出版の列（`sonaquest-vNN`）とは別に番号を数えます。

## ボードの地図の紹介動画（BoardMapVideo、約30秒）
Studio の左の一覧で `BoardMapVideo` を選びます。題材は Issue #167（地図の車と搬送便が道に沿って動く、救護所Dの迂回、錠の10錠単位）。中身は `src/boardMap/` です。

- 1920×1080・30fps・900フレーム。7場面で、切り替えは0.4秒（12フレーム）の重ね。字幕は日本語と英語。音は入れていません。
- 町・拠点・経路・車の位置・数量の文は `web/src/board/`（`map.ts`・`live.ts`・`vehicles.ts`・`text.ts`）から読みます。外部の地図・画像は使いません。白地に黒の線で描き直し、色は赤（通れない・以前）・黄（迂回）・緑（今）だけです。
- 「以前の動き」は再現で、録画ではありません。Issue #167 の前のアプリと同じく、時計の1時間ごとに、前の位置からその時刻の位置へ 1.8秒（2秒で1時間の 9 割）で直線に移します。データは今のもの（救護所Dの迂回を含む）です。試験の場面の数（道の上にいた時刻の数）は、動画の中で `web/src/board/live.test.ts` と同じ検査をして数えています。
- 各場面の左上に、使った表現（10のコツの番号）を小さく出しています。消すときは `src/boardMap/BoardMapVideo.tsx` の `SHOW_TIP_LABELS` を `false` にします。
- 書き出し（render）はまだしていません。

## 試験
```bash
npm --prefix video test
```

```bash
npm --prefix video run typecheck
```

合成スクリプトの部品（ファイル名の組み立て、引数、設定の確かめ、ログに本文やキーが入らないこと）、原稿と台本の一致、場面の秒と台本の時間の欄の一致、11番の一枚のモデルと `web/worker/` の定数の一致を `node:test` で確かめます。本物の ElevenLabs は呼びません。

## 決めること・確かめること（オーナー）
- Remotion のライセンス（個人の利用の範囲か）を確かめる。
- 見出し語を置くか、置くならその文（`video/src/sections.ts` のマーカー）。
- 最後のロゴの形と公開 URL・QR（`video/src/SonaQuestVideo.tsx`・`sections.ts` のマーカー）。
- 2番の地震の回数は `docs/demo-script.md` のマーカーで決め、決まったら `video/narration/02.txt` と `src/slideText.ts` の `QUAKE_COUNT` を直してから合成する。
- 場面ごとの長さ（`src/sections.ts` の `seconds`）と、1番の問いを出す時刻（`QUESTION_BLACKOUT_FRAMES`）、2番の「21回」を出す時刻（`QUAKE_COUNT_FROM_FRAMES`）、5番のナレーションの始まり（`SECTION5_NARRATION_FROM`）とソナの声の時刻（`appVoice`）は、合成したナレーションと録画の長さに合わせて直す。
