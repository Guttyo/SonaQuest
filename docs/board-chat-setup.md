# ボードの掲示板チャットの準備（オーナーが1回だけ行う）

ボードの「連絡」タブ（掲示板チャット、B-07、ADR-0047）で、本部と救護所A〜Dの役を Anthropic の Managed Agents のエージェントが演じるための準備。準備をしないままでも、チャットはルールで組んだ固定の掲示だけで動き、ボードのほかの機能は変わらない。

Claude Code はこの手順を実行しない。API キーと手元の秘密のファイルには触れない（CLAUDE.md 絶対ルール6）。

**2026-11-06 に実施済み**（Issue #139）。オーナーが `--apply` で Environment 1つと Agent 5つを作り、ID は `web/wrangler.jsonc` の `vars` に入っている。同じ ID で手元の `wrangler dev` から本物の Managed Agents で動くことを確かめた（docs/safety-test-plan.md H12）。**作り直すのは、モデル・system prompt・カタカナの一覧（`web/worker/boardChatAgents.ts`）を変えたときだけ**。Agent の定義は作成時のもので固定されるので、定義を変えても `vars` の ID の Agent には反映されない。作り直したら新しい ID で `vars` を書き換え、古い Agent は Claude Console で片付ける。

## PowerShell でキーを環境変数に入れるとき
`.dev.vars` に書いたキーをその場の環境変数に入れる例（値は画面に出ない。1件目の行だけを使う）：

```powershell
$env:ANTHROPIC_API_KEY = ((Get-Content web\.dev.vars | Select-String '^ANTHROPIC_API_KEY=' | Select-Object -First 1).Line -replace '^ANTHROPIC_API_KEY=','').Trim()
```

`$env:ANTHROPIC_API_KEY.Length` が 0 でなければ入っている。

## 作るもの
`web/worker/boardChatAgents.ts` の定義から、次のものを作る。

| 種類 | 数 | 中身 |
|---|---|---|
| Environment | 1つ | `sonaquest-board-chat`。`cloud`、ネットワークは `limited` で許す宛先なし。パッケージと MCP も許さない |
| Agent | 5つ | `sonaquest-board-chat-HQ`、`-A`〜`-D`。ツールなし（web 検索・web の取得・サンドボックスの道具を持たない）。モデルと system prompt は下書き（`[TODO-OWNER]`） |

Session（会話）は、ここでは作らない。デモを開いたブラウザごとに Workers が作り、作るたびに支出の上限（budget）を付ける。

## 手順
1. 作る中身を表示だけして確かめる（何も作らない。API キーも要らない）。

```bash
npm --prefix web run setup:board-chat
```

2. 手元のターミナルで、API キーを環境変数 `ANTHROPIC_API_KEY` に入れる。値をファイル・Issue・PR・チャットに書かない。

3. 実際に作る。作ったものの ID が `NAME=ID` の形で6行出る。

```bash
npm --prefix web run setup:board-chat -- --apply
```

4. 出た6行の ID を `web/wrangler.jsonc` の `vars`（`BOARD_CHAT_ENVIRONMENT_ID`、`BOARD_CHAT_AGENT_HQ`〜`BOARD_CHAT_AGENT_D`）に入れる。ID は秘密ではないので、Issue と PR で入れてよい。
5. 手元で確かめるときは `npm --prefix web run dev:worker` と `npm --prefix web run dev` を動かし、ボードの「連絡」タブで「エージェントの連絡を始める」を押す。`vars` を変えずに別の ID を試すときは、`wrangler dev` に `--var BOARD_CHAT_ENVIRONMENT_ID:env_…` の形で6つを渡せる（コマンドラインの値が `wrangler.jsonc` の `vars` より優先される）。
6. 公開する版で使うときは、`vars` を入れた変更をマージしてからデプロイする（デプロイはオーナーの承認の後。CLAUDE.md 絶対ルール7）。公開する版で動くのは、`/api/turn` と同じ公開の切り替え（`PUBLIC_TURN=1`）があるときだけ。

## 気をつけること
- **何度も `--apply` すると、そのたびに新しい Environment と Agent ができる**。古いものは消えない。要らないものは Claude Console で片付ける。
- **`web/wrangler.jsonc` の `vars` がデプロイの正になる**。Cloudflare のダッシュボードで足した変数（vars）は、次のデプロイで上書き・削除される。ID はダッシュボードではなく `wrangler.jsonc` に入れる。secrets（`ANTHROPIC_API_KEY`、`PUBLIC_TURN` など）はこの影響を受けない。
- **使ったセッションは消さずに残す**（ADR-0047 の決定。`[TODO-OWNER]`）。架空のチャットの書き込みとエージェントの文は、Anthropic 側のセッションの履歴に残る。消すときは Claude Console か API で、オーナーが行う。
- **本当の上限は、回数制限（P7）と Claude API の月の支出の上限（P9）**。ページを読み込み直すたびに新しいセッションができるので、セッションの budget とページあたりの回数の上限だけでは、合計の支出を抑えきれない。
- 費用の目安：セッションが動いている間の時間と、トークンの代金がかかる。セッション1つの上限は `web/worker/boardChatAgents.ts` の `BOARD_CHAT_SESSION_BUDGET_CENTS`（単位はセント。下書きは "20" ＝ $0.20）。

## うまくいかないとき
- 画面に「エージェントの設定がまだありません」と出る：`vars` の6つのどれかが空か、形が違う（`env_…`、`agent_…`）。または Workers に `ANTHROPIC_API_KEY` が無い。
- スクリプトが「作れなかった」と出す：表示されるのは失敗の種類と HTTP の状態だけ。キーの権限と、組織で Managed Agents が使えるかを確かめる。
