# 進捗（STATUS）

最終更新：2026-11-02（Phase 0）

## 実装済み（コードがありコミット済み）
- Claude Code用hook：`[TODO-OWNER]` の削除防止（`.claude/hooks/protect_todo_owner.py`）、秘密情報とブロックリストの語の検出（`.claude/hooks/block_secrets.py`）
- gitのコミット前フック：秘密ファイル・APIキー・ブロックリストの語・マーカー削除の検出（`.githooks/`）
- hookの試験スクリプト（`.claude/hooks/test_hooks.py`）
- アプリ本体：なし

## 動作確認済み
- hookとコミット前フックの試験：`test_hooks.py` で48/48 PASS（2026-11-02、Windows 11・Git Bash・Python 3.14）
- 実際のClaude Codeの操作でのhook（2026-11-02）：マーカーを消すEditは止まり、通常のEditは通った。`.env.local` のRead、`cat .dev.vars`、`git commit --no-verify` は止まった。`.dev.vars` のReadは settings.json の deny で止まった
- `.dev.vars`、`.env.local`、`.claude/local/blocklist.txt` がgitの対象外であること（`git check-ignore`）

## 開発環境（2026-11-02時点。オーナーが導入）
- Git 2.56、Python 3.14、Node.js 26.13（LTS、nvm）、npm 11.20、GitHub CLI
- 未導入：iPhone実機試験用のHTTPS手段（cloudflared等。未決定）

## 未着手
- アプリ本体のすべて（画面、対話、Claude連携、音声、結果画面、緊急時の中断、API失敗時の進行）
- macOSでのhook試験（Windowsでのみ確認）
- 音声まわりの実機検証（ADR-0004、0005）
- Claudeのモデル選定と比較実験（ADR-0006、docs/evidence.md）
- デモ動画、提出タグ

## 文書のみ（設計・枠）
- CLAUDE.md、`.claude/rules/`、`.claude/skills/`
- docs/：PRD、architecture、decisions、safety-test-plan、evidence、demo-script（枠）、references、KEEP-THINKING
- README.md（枠）

## オーナーの判断待ち
`git grep -n "TODO-OWNER"` で一覧できる。主なもの：Yorukusuとの関係の表現、緊急時の案内文面、薬の名前を話してもらうか、5観点の判定基準、出来事と準備行動の候補、プロフィール欄、ライセンス。
