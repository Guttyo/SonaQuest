# Managed Agents の時間切れと後片付け（Issue #294）

- 日付：2026-11-11
- 対象：Issue #294。コミット 6b8c29e・b51e662
- 関係する ADR：ADR-0007（ログ）、ADR-0047（掲示板チャット）、ADR-0053（監査役）

## 背景
コードの静的な評価で、ボードの掲示板チャット（B-07）とカルテの監査役（B-10）の Managed Agents のセッションについて、次の抜けが見つかった。

- 掲示板チャットは、時間切れのときに SSE の接続を閉じるだけで、セッションに中断を送らなかった。
- 監査役の締め切りは、セッションの作成が終わった後から数えていた。作成と後片付けの呼び出しには signal が無く、Anthropic のクライアントの上限（45秒）まで待ちえた。
- 監査役の後片付けのログは、状態が `deleted` でないときだけ、終わったときに出していた。waitUntil の猶予で打ち切られると、何も出なかった。
- チャットの画面の呼び出しには、待ち時間の上限が無かった。
- `classify`・ID の形・SSE を読む処理が、`boardChat.ts` と `karteAudit.ts`・`karte.ts` に重なって書かれていた。

## やったこと
- 共通の部品 `web/worker/managedSession.ts` を作った。`classify`、`AGENT_ID_PATTERN`・`ENV_ID_PATTERN`、`collectTurn`、`runSessionTurn`、`SessionOps`・`makeSessionOps`、`interruptSession`、`cleanupSession` を置いた。`collectTurn` は `{ type: string }` の出来事を受け取り、中身を型ガードで確かめる。これで、`karteAudit.ts` の `stream as AsyncIterable<...>` の型の強制が要らなくなった。
- 監査役（`karteAudit.ts`）：締め切りを作成の前から数え、作成・SSE・送信に同じ signal を渡した。後片付けの呼び出しには、1回ごとに 5 秒の上限を付けた。後片付けの全体にも 20 秒の上限を付けた。止まった後の削除に失敗したときは、応答の前に待たずに `pending` を返し、後片付けを waitUntil に回す。後片付けに入るときに `karte_audit: cleanup_started`、終わったときに `karte_audit: cleanup_<状態>` を出す。
- 掲示板チャット（`boardChat.ts`）：turn が `timeout` か `incomplete` で終わったとき、`/turn` の入口で waitUntil を通して中断（`user.interrupt`）だけを送る。削除はしない。送れなかったときは `board_chat: interrupt_failed` を出す。
- チャットの画面（`controller.ts`）：Workers の呼び出しに 30 秒の上限（`CHAT_CLIENT_TIMEOUT_MS`）を付け、過ぎたら `timeout` で固定の掲示に切り替える。
- `setup-board-chat.ts`：1つ作るたびに ID を表示し、作った Agent のツールが 0 個かを確かめる。

## つまずいたことと教訓
- 中断を送るかを、本物の backend（`makeChatBackend`）の中で決めると、試験の偽物の backend からは見えない。決めるのを `/turn` の入口に置き、`ChatBackend` に `interrupt` を足した。次に、試験で確かめたい判断を書くときは、偽物に替わらない側（入口）に置く。
- 返らない呼び出しの試験では、signal を聞かない偽物だと、abort しても終わらない。チャットの画面の上限は、fetch の abort に頼らず、タイマーとの `Promise.race` にした。`cleanupSession` の全体の上限も同じ形にし、上限を過ぎた後は次の呼び出しをしない。
- Bash の heredoc で Python に `\\n` を渡すと、改行に変わってスクリプトの文字列が壊れた（`setup-board-chat.ts`）。逆スラッシュを含む書き換えは、ファイルの編集で行う。

## 確かめたこと
- 2026-11-11、Windows 11、Node v26.13.0：`npx tsc --noEmit` が通った。`npx vitest run --maxWorkers=2` で 61 ファイル・1144 件がすべて通った。
- `node scripts/setup-board-chat.ts`（`--apply` なし）の表示が、変更の前と同じだった（出力を比べた）。
- waitUntil の猶予が応答の後 30 秒までであることを、Cloudflare の公式の文書（Workers の Context の API）で確かめた。

## 推測
- 中断を送れば、前の回が動いたままのセッションに次の書き込みを送って 409 になることは、起きにくくなると考えた。本物の Managed Agents では確かめていない。

## 残ること
- 掲示板チャットのセッションを消すかどうかと、その手段（Issue #294 のオーナーの判断が要る点の1・2。ADR-0047 のマーカー）。
- turn での sessionId と役の確かめ方（Issue #294 の案 E）。
