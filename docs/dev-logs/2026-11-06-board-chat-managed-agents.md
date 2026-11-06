# ボードの掲示板チャットを Managed Agents で作り、本物で動かす（Issue #121・#139）

- 日付：2026-11-06
- 対象：Issue #121（PR #129、主なコミット 56f4f73、42d0a12、ed59c9d、1ccaae6、2b5a7f8）、Issue #139（PR #140、コミット afc04ff、20ace9f）
- 関係する ADR：ADR-0047（掲示板チャット）、ADR-0030（訓練の監査役。掲示板の文は通さない）、ADR-0035（回数制限 P7）

## 背景
オーナーが、地域本部のボードに本部と救護所の DM と共通の欄の掲示板を足し、本部と救護所A〜Dの役を Managed Agents のエージェントに演じさせたいと言った（Issue #121）。Claude の呼び方は、会話の履歴が Anthropic 側のセッションに残ること、費用、ブラウザへの配信（SSE）の配管が新しいことを伝えたうえで、オーナーが Managed Agents を選んだ。Claude に作らせる文は薬剤以外の連絡文だけ。新しい送り先（Managed Agents）と、架空の書き込みが外部に残る例外が増えるので、この記録を書く（README の「いつ書くか」の1・2・3）。

## やったこと
- Workers（`web/worker/boardChat.ts`）：役ごとのセッションを budget 付きで作り、`events/stream` を先に開いてから `user.message` を送り、止まるまで Worker の中で読み切る。検査を通った文を1件だけ返し、ブラウザに SSE を流さない。
- 検査（`web/worker/boardChatChecks.ts`）：長さ（140字）、薬・量・病名・診断・人の名前・電話番号・URL などの禁止表現、許可の一覧に無いカタカナと英字。通らない文はその1件を固定の掲示に替える。訓練の `checks.ts` と監査役は使わない。
- Agent 5つと Environment 1つの定義（`web/worker/boardChatAgents.ts`、ツールなし）と、オーナーが1回だけ作る setup スクリプト（`web/scripts/setup-board-chat.ts`）。
- 画面（`web/src/board/chat/`）と、`Board.tsx` の上部タブ「連絡」。
- ルールの例外：`.claude/rules/privacy.md`・`scope.md`・`safety.md` に1行ずつ。PRD の B-07、safety-test-plan の H8〜H12、`docs/board-chat-setup.md`。
- Issue #139：オーナーが setup スクリプトで作った ID を `web/wrangler.jsonc` の `vars` に入れ、手元の `wrangler dev` で本物を動かした（H12）。

## レビューの経過
| 回 | PR・コミット | レビューした者 | 主な指摘 | 対応 |
|---|---|---|---|---|
| 1 | PR #129・1ccaae6 | 自動レビュー2種（行ごとの指摘2件と、まとめのコメントの指摘2件） | 薬の名前を「ア ム ロ ジ ン」のように空白で分けると、カタカナの許可の一覧の検査をすり抜ける。1文字のカタカナと英字が通る。SSE が `end_turn` の前に切れても途中の文を返す | 2b5a7f8：空白・改行を除いてから調べ、1文字も調べる（ヶ・ヵと長音は通す）。英字は「HQ」と大文字の A〜D の1文字だけ。`end_turn` を見ないまま終わったら `incomplete` の失敗にする |
| 2 | PR #129・1a2aef7 | 自動レビュー（依頼して再実行） | 大きな指摘なし | — |
| 1 | PR #140・afc04ff | 自動レビュー（行ごとの指摘3件） | ID を既定値に入れると、`PUBLIC_TURN=1` でデプロイしたときに公開の利用者が本物を呼べるが、P7 は公開環境で効いていない。作り直す条件が定義の一部しか挙げていない。H12 に SSE の出来事の順番が無い | 20ace9f：ID は残し（オーナーが決めた）、公開時の上限は P9 だけと注釈・STATUS・手順書に書いた。作り直す条件を Agent と Environment の定義全体にした。H12 に順番を足した |

## つまずいたことと教訓
- **許可の一覧の検査が、連続した文字の並びだけを見ていた**（PR #129 の1回目）。禁止表現の照合では空白を除いていたのに、許可の一覧の照合は元の文のままだった。次に「並びで探す」検査を足すときは、ほかの検査と同じそろえ方（空白・改行を除く）を通してから見ることと、1文字の並びも対象にすることを、試験で確かめる。
- **ストリームの終わりを「止まった」と取り違えていた**（同上）。止まったこと（`session.status_idle` の `end_turn`）を見ないまま SSE が終わる経路を、成功として扱っていた。次に SSE を読み切る処理を書くときは、終わりの出来事を見たかどうかを状態に持ち、見ていなければ失敗にする。
- **既定値の ID が、公開の課金の経路になる**（PR #140）。秘密ではない ID でも、`vars` に入れるとデプロイの正になり、公開の切り替えと組み合わさると課金が起きる。次に外部サービスの ID を既定値に入れるときは、公開したときに誰が呼べるか、上限はどこで効くかを、注釈と STATUS に書く。

## 確かめたこと
- PR #129（2026-11-06、Windows 11）：`npm --prefix web test` 736 件 PASS、build（typecheck を含む）成功、`wrangler deploy --dry-run`、hook の試験 393/393 PASS。ブラウザ（Claude desktop、Chromium、Workers なし）で幅1280px と 375px、セッションの作成が 502 で固定の掲示に切り替わること。
- PR #140（2026-11-06、Windows 11、Node.js 26.13、wrangler 4.156、Chromium・幅1024px）：本物の Managed Agents で、セッションの作成 0.5〜1.4秒、応答 2.9〜6.0秒、エージェントの文14件すべてが検査を通った（`text_rejected` 0件）。人の書き込みに約10秒以内に返事。SSE の順番は、stream を先に開く → `user.message` → `session.status_running` → `agent.message` → `session.status_idle`（`end_turn`）。Workers のログは HTTP の状態と所要時間だけ（docs/safety-test-plan.md H12、docs/evidence.md）。課金を抑えるため14件で止めた。

## 残ること
- budget の上限（$0.20）に達したときの固定の掲示への切り替えの本物での確認（H12 の残り）。
- 公開する版へのデプロイ（オーナーの承認。2026-11-06 のオーナー決定で、提出動画の撮影の後）。公開時の課金の上限は P9 だけ（P7 は公開環境で効かない。Issue #65）。
- ADR-0047 のマーカー（セッションを残すこと、監査役を通さないこと、モデル・budget・system prompt・一覧）。
- 到着の知らせをチャットに流すこと（Issue #121 と #122 の後の別の Issue。まだ無い）。
