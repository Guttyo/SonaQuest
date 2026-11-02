# SonaQuest — Claude Code 作業ルール（毎回読む）

SonaQuest（ソナクエスト）は、常用薬のある成人が「災害時に自分の服薬情報をどう伝えるか」を約3分の音声対話で疑似体験する防災訓練Webアプリ。Built with Claude: Japan 2026（個人参加）の提出作品。

## 絶対ルール
1. **期間中の新規作成のみ**。2026-11-02 12:00 JST 以降に書いたものだけを置く。Yorukusuを含む他リポジトリのコード・Skill本文・hook・データを複製しない。
2. **医療判断をしない**。薬剤名・用法・用量・病名の推定、正誤判定、服薬の助言、診断をしない → `.claude/rules/safety.md`
3. **会話本文・録音・文字起こしを保存もログ出力もしない** → `.claude/rules/privacy.md`
4. **MVPの範囲外を作らない** → `.claude/rules/scope.md`
5. **`[TODO-OWNER]` マーカーを消さない・埋めない・書き換えない**。オーナーが判断する箇所。hookとコミット前フックで機械的に止めている。迷ったら止まって聞く。
6. **秘密情報に触れない**。`.dev.vars`、`.env*`（`.example`以外）、`.claude/local/` を読まない・書かない・コミットしない。APIキーはWorkersのsecretsだけで扱い、ブラウザに出さない。
7. **承認が要る操作はオーナーの承認まで行わない**：GitHubへのpush・公開、デプロイ、外部サービスの課金・契約・アカウント作成、MVP実装の着手、大きな依存の追加。
8. **公開リポジトリに書かない**：制作者の勤務先とそれを推測できる情報、職業・経歴、実在人物の情報、オーナーの作業予定や生活の様子。
9. 提出資料・README・docs・UI・コミットメッセージは**日本語**。
10. **作っていないものを「実装済み」と書かない**。`docs/STATUS.md` の「実装済み／動作確認済み／未着手」を守る。

## 作業の流れ
- 開始時：`docs/STATUS.md` を読む
- 設計判断をしたら：`docs/decisions.md` にADR（決定・理由・却下案・影響）を追記
- 安全・外部送信・ログに関わる変更の後：`safety-review` Skill
- 節目と提出前：`judge-audit` Skill
- 終了時：`session-handoff` Skill（STATUS.md更新、KEEP-THINKING.mdに追記）

## 正本の優先順位
1. この CLAUDE.md と `.claude/rules/`
2. `docs/decisions.md`
3. `docs/PRD.md`・`docs/architecture.md`
4. Claude Codeの自動メモリ（補助。正本にしない。Git管理の文書と食い違ったら文書が正しい）

## 開発環境
- 必要なもの：Git、Python 3.9以上（hookとコミット前フック）、Node.js LTS（v22以上）
- **環境（インストール、グローバル設定、PATH）はオーナーが整える。Claude Codeは勝手に変えない**
- **必要な環境が無いとき、別の道具で代用するなどの回避策を自分で選ばない**。何が無いか、選択肢と推奨を示してオーナーに提案し、決まった手順をREADMEに書く
- クローン後の初回設定：`git config core.hooksPath .githooks`
- hookの試験：`sh .claude/hooks/run-python.sh .claude/hooks/test_hooks.py`
