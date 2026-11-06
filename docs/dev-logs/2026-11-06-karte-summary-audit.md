# カルテの抽出型要約と2段構えの監査（Issue #142）

- 日付：2026-11-06
- 対象：Issue #142、ブランチ `claude/142-karte-summary-audit-6780d4`（コミット edfaba4、855477c、b7f0563、552e61d と、safety-review の後の修正）
- 関係する ADR：ADR-0052・ADR-0053（どちらも状態「提案」）、ADR-0047（掲示板チャットの Managed Agents）、ADR-0030（監査役）、ADR-0042（問診の要約の却下）

## 背景
機能凍結の前の例外として、オーナーが Issue #141・#142・#143 を承認した。#142 は、デモ動画で「AI の要約を別のモデルとコードが確かめ、最後は人が確定する」流れを動かして見せるためのもの。既存の決定は利用者の発言を要約・言い換えしないとしているので、入力を架空の会話の見本だけに限り、要約は本人の言葉の抜き出し（抽出型）にして、決定との関係はオーナーに諮る形にした。外部送信（Managed Agents に架空の見本と要約を送る）とログの扱いが増えるので、この記録を書く（README の「いつ書くか」の2）。

## やったこと
- 架空の会話の見本10本と正解の要約、どの見本にも会話にない項目を1つ（`web/src/board/karte/samples.ts`）。
- 出力の形とスキーマ（`contract.ts`）、1段目のコードでの確認（`codeCheck.ts`）。
- 要約を作るモデル（`web/worker/karteSummary.ts`、Messages API）、監査役の Agent の定義（`karteAuditAgent.ts`）、セッションの作成・読み切り・中断・削除（`karteAudit.ts`）、入口（`karte.ts`）、setup スクリプト（`web/scripts/setup-karte-audit.ts`）。
- `Board.tsx`・`demo.ts` は並行する Issue #141 が変えるので触らず、組み込みは別の PR にした。

## つまずいたことと教訓
- **会話に無い quote に禁止表現を当てていなかった**（safety-review で気づいた。552e61d で直した）。会話にある quote は架空の本人の言葉なので禁止表現を当てないと決めたが、会話に無い quote はモデルが作った文で、画面に出る。次に「原文だから検査しない」と決めるときは、その文が本当に原文から来たと確かめた後だけにする。
- **固定文が自分の禁止表現に当たっていた**。監査役の理由の文が検査を通らないときの固定文を「〜可能性があります」「診断」を含む形で書き、`KARTE_FORBIDDEN_PATTERNS` に当たっていた。固定文そのものに検査をかける試験を足し、言い回しを変えた。次に代わりの固定文を書くときは、同じ検査を通ることを試験で確かめる。
- **`no_message` を「動いているかもしれない」側に入れていた**。`collectTurn` が `no_message` を返すのは `end_turn` を見た後なので、その場で削除できる。セッションの状態は、失敗の種類ごとに「止まった後か」を確かめて振り分ける。
- **マーカーを含むファイルは、シェルで書き換えられない**（hook が止める）。`docs/decisions.md` への追記や、マーカーのある下書きの文の修正は Edit で行った。

## 確かめたこと
- 2026-11-06、Windows 11、Node.js 26.13、Vitest 5.1：`npm --prefix web test` 834/834（`codeCheck.test.ts` 20件、`karte.test.ts` 30件を含む）、`npm --prefix web run typecheck`、`npm --prefix web run bundle:worker`（dry-run、`KARTE_AUDIT_AGENT_ID` が空の vars で束ねられた）、`npm --prefix web run setup:karte-audit`（表示だけ。何も作らない）。
- 公式ドキュメント（Managed Agents の overview・quickstart・sessions など）と SDK 1.3.0 の型：セッションの削除は動いている間はできず、`user.interrupt` で止めてから削除する。Agent の作成の `tools` は型で省略できるが、省略したときにツールなしになるとは書かれていない。

## 推測
- `tools` を渡さずに作った Agent はツールを持たないと考えているが、確かめていない。setup スクリプトが作った直後にツールの数を見て、0 でなければ止める。

## 残ること
- 監査役の Agent の作成と、本物での確認（safety-test-plan H15）：オーナー。
- ボードのカルテの確認状態への組み込み：Issue #141 のマージ後の別の PR（Issue はまだ無い。立てるかはオーナーに聞く）。
- ADR-0052・ADR-0053 のマーカー（抽出型にすること、Managed Agents を使うこと、privacy.md の例外）。
