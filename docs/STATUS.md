# 進捗（STATUS）

最終更新：2026-11-03（Phase 0：PR #3・PR #4 をmainへマージ済み。Issue #6 の体験コンセプトの補完をブランチ `docs/6-experience-concept` で作業中）

## 実装済み（コードがありコミット済み）
- Claude Code用hook：`[TODO-OWNER]` の削除防止（`protect_todo_owner.py`）、秘密情報とブロックリストの語の検出（`block_secrets.py`）、main・GitHubの保護（`guard_github.py`）。いずれも `.claude/hooks/`
- gitのフック（`.githooks/`）：秘密ファイル・APIキー・ブロックリストの語・マーカー削除・main へのコミットとマージコミットの検出
- hookの試験スクリプト（`.claude/hooks/test_hooks.py`）
- アプリ本体：なし

## 動作確認済み
- hookとgitのフックの試験：`test_hooks.py` で147/147 PASS（2026-11-03、Windows 11・Git Bash・Python 3.14）
- 実際のClaude Codeの操作でのhook（2026-11-02）：マーカーを消すEditは止まり、通常のEditは通った。`.env.local` のRead、`cat .dev.vars`、`git commit --no-verify`、`gh pr merge` は止まった。`.dev.vars` のReadは settings.json の deny で止まった
- `.dev.vars`、`.env.local`、`.claude/local/blocklist.txt` がgitの対象外であること（`git check-ignore`）

## 開発環境（2026-11-02時点。オーナーが導入）
- Git 2.56、Python 3.14、Node.js 26.13（LTS、nvm）、npm 11.20、GitHub CLI
- 未導入：iPhone実機試験用のHTTPS手段（cloudflared等。未決定）
- GitHubリポジトリ：Guttyo/SonaQuest（プライベート、2026-11-02作成）。Rulesetは未設定（オーナーの承認後）

## 未着手
- アプリ本体のすべて（画面、対話、Claude連携、音声、結果画面、緊急時の中断、API失敗時の進行）
- macOSでのhook試験（Windowsでのみ確認）
- 音声まわりの実機検証（ADR-0004、0005）
- Claudeのモデル選定と比較実験（ADR-0006、docs/evidence.md）
- GitHubのRulesets設定、CI
- 公開前の利用制限：/api/turn の回数制限、入力の大きさの上限、Claude APIの支出の上限（ADR-0003、safety-test-plan P7〜P9）
- 公開前のGit履歴全体の秘密情報検査（safety-test-plan P5）
- デモ動画、提出タグ

## 文書のみ（設計・枠）
- CLAUDE.md、`.claude/rules/`（scope、safety、privacy、github）、`.claude/skills/`
- docs/：PRD、architecture、decisions（ADR-0001〜0020）、safety-test-plan、evidence、demo-script（枠）、references、KEEP-THINKING
- テーマごとの開発記録 `docs/dev-logs/` と、それを書く `dev-log` Skill（`.claude/skills/dev-log/`）。Issue #9
- PRDのコンセプト「お薬の避難訓練」、体験の核（伝える → 使えなくなる → 立て直す → 気づきと準備）、体験の6段階（はじめに／問い／確認／出来事／立て直し／結果）と実装の3画面、評価の方針（点数・合否なし、手薄なところを示す）、光のキャラクターの方向性（ADR-0019・0020、採用案。Issue #6）
- README.md（枠）

## オーナーの判断待ち（`git grep -n "TODO-OWNER"`）
- **決定済み・マーカー解除待ち**（決定の文はマーカーの横）：緊急の範囲と文面（ADR-0011）、薬の名前（ADR-0009）、5観点の基準・出来事・準備行動（PRD）、プロフィール・ライセンス（README）、出典の方針（references）
- **新しく追加した確認事項**：自傷に関する案内の文面（ADR-0011）、実際の服薬情報の入力を許すか（ADR-0009）
- **Issue #6 で追加した確認事項**：コンセプトと訴求文の文言、回答の配分、6画面の分け方、立て直しの回答と観点②の関係（PRD）、ADR-0019・0020の採用、キャラクターの名前・色や形の方向性。いずれもオーナーの指示（2026-11-03、チャット）を横に記録済みで、ADR-0019・0020の採用の判断とマーカーの解除が残る
- **第2回監査で決定・解除待ち**：薬の名前を送らない方式は採用しない（ADR-0009。自動の置き換えはしない）
- **保留**：Yorukusuとの関係の段落（README・ADR-0002。文面を見てから）、比較実験の回答セットと正解ラベル（evidence。実験の前まで）
- **外部監査の提案（判断待ち）**：初期版で外部音声サービスを採用しない（ADR-0004・0005）
- **決定済み（2026-11-03）**：ADR-0003（技術構成）を採用。MVPの実装は別のIssueで進める。公開前に、/api/turn の回数制限・入力の大きさの上限・Claude APIの支出の上限を確かめる（safety-test-plan P7〜P9）
