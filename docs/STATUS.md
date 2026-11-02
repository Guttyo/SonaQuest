# 進捗（STATUS）

最終更新：2026-11-02（Phase 0：GitHub運用とTODO-OWNER 1〜6の反映。ブランチ `docs/phase0-github-rules`、未マージ）

## 実装済み（コードがありコミット済み）
- Claude Code用hook：`[TODO-OWNER]` の削除防止（`protect_todo_owner.py`）、秘密情報とブロックリストの語の検出（`block_secrets.py`）、main・GitHubの保護（`guard_github.py`）。いずれも `.claude/hooks/`
- gitのフック（`.githooks/`）：秘密ファイル・APIキー・ブロックリストの語・マーカー削除・main へのコミットとマージコミットの検出
- hookの試験スクリプト（`.claude/hooks/test_hooks.py`）
- アプリ本体：なし

## 動作確認済み
- hookとgitのフックの試験：`test_hooks.py` で80/80 PASS（2026-11-02、Windows 11・Git Bash・Python 3.14）
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
- 公開前のGit履歴全体の秘密情報検査（safety-test-plan P5）
- デモ動画、提出タグ

## 文書のみ（設計・枠）
- CLAUDE.md、`.claude/rules/`（scope、safety、privacy、github）、`.claude/skills/`
- docs/：PRD、architecture、decisions（ADR-0001〜0018）、safety-test-plan、evidence、demo-script（枠）、references、KEEP-THINKING
- README.md（枠）

## オーナーの判断待ち（`git grep -n "TODO-OWNER"`）
- **決定済み・マーカー解除待ち**（決定の文はマーカーの横）：緊急の範囲と文面（ADR-0011）、薬の名前（ADR-0009）、5観点の基準・出来事・準備行動（PRD）、プロフィール・ライセンス（README）、出典の方針（references）
- **新しく追加した確認事項**：自傷に関する案内の文面（ADR-0011）、実際の服薬情報の入力を許すか（ADR-0009）
- **第2回監査で決定・解除待ち**：薬の名前を送らない方式は採用しない（ADR-0009。自動の置き換えはしない）
- **保留**：Yorukusuとの関係の段落（README・ADR-0002。文面を見てから）、比較実験の回答セットと正解ラベル（evidence。実験の前まで）
- **外部監査の提案（判断待ち）**：初期版で外部音声サービスを採用しない（ADR-0004・0005）、ADR-0003の採用（MVP着手の承認と同時）
