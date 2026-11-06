# SonaQuest — Claude Code 作業ルール（毎回読む）

SonaQuest（ソナクエスト）は、常用薬のある成人が「災害時に自分の服薬情報をどう伝えるか」を約5〜10分の音声対話で疑似体験する防災訓練Webアプリ。Built with Claude: Japan 2026（個人参加）の提出作品。

## 絶対ルール
1. **期間中の新規作成のみ**。2026-11-02 12:00 JST 以降に書いたものだけを置く。Yorukusuを含む他リポジトリのコード・Skill本文・hook・データを複製しない。
2. **医療判断をしない**。薬剤名・用法・用量・病名の推定、正誤判定、服薬の助言、診断をしない → `.claude/rules/safety.md`
3. **会話本文・録音・文字起こしを保存しない**（データベース・ストレージ・ファイル・ブラウザの保存領域）。**公開する版（デプロイした Workers。本番・プレビューとも）では、会話本文・音声・プロンプト・Claudeの応答をログに出さない**。手元の開発中に限り、既定でオフの切り替えをオンにしたときだけ本文を出してよい（ADR-0007） → `.claude/rules/privacy.md`
4. **MVPの範囲外を作らない** → `.claude/rules/scope.md`
5. **`[TODO-OWNER]` マーカーを消さない・埋めない・書き換えない**。オーナーが判断する箇所。hookとコミット前フックで機械的に止めている。迷ったら止まって聞く。例外：`main` にあるそのファイルで、マーカーの直後の行に `→ オーナー決定（YYYY-MM-DD、チャット）：…` があるマーカーは、Claude Code がPRの中で解除してよい（決定の行は残す）。決定の行にはオーナーがチャットで言ったことだけを書き、Claude Code が決定を作らない。「オーナー指示」「〜の方向」「方針」は決定として扱わない（ADR-0024）。
6. **秘密情報に触れない**。`.dev.vars`、`.env*`（`.example`以外）、`.claude/local/` を読まない・書かない・コミットしない。APIキーはWorkersのsecretsだけで扱い、ブラウザに出さない。
7. **承認が要る操作はオーナーの承認まで行わない**：GitHubへの書き込み（リポジトリ作成、Issue・PR作成、push、マージ、設定変更、公開）、デプロイ、外部サービスの課金・契約・アカウント作成、MVP実装の着手、大きな依存の追加。ただし、オーナーがチャットで「Issue #N に着手して」と言ったときは、その Issue の作業ブランチの作成・そのブランチへの push・PR の作成までを承認したものとする。マージ、デプロイ、課金・契約・アカウント作成、依存の追加、`main` の変更、GitHub の設定変更は、そのつど承認を得る（ADR-0026）。Claude Code が PR をマージしてよいのは、オーナーがチャットでそのPRのマージを明示的に頼んだときだけで、毎回、確認の画面でオーナーが許可してから実行される。`gh pr merge` の `--admin`・`--auto` は使わない（ADR-0041）。
8. **公開リポジトリに書かない**：制作者の勤務先とそれを推測できる情報、職業・経歴、実在人物の情報、オーナーの作業予定や生活の様子。
9. 提出資料・README・docs・UI・コミットメッセージは**日本語**。
10. **作っていないものを「実装済み」と書かない**。`docs/STATUS.md` の「実装済み／動作確認済み／未着手」を守る。
11. **`main` を直接変更しない**。すべての変更は Issue → 専用ブランチ → PR → オーナー承認後のマージ で行う → `.claude/rules/github.md`

## 作業ディレクトリ
- Windows：`%USERPROFILE%\Dropbox (個人用)\iOS_Application\developing\Hackathon\Built_with_Claude_Japan_2026`
- macOS：`~/Dropbox_Personal/iOS_Application/developing/Hackathon/Built_with_Claude_Japan_2026`
- 作業開始時に、現在の作業ディレクトリ、Gitリポジトリ、ブランチを確かめる。上記と異なるディレクトリで作業を進めない。`main` にいたら作業ブランチを作るか切り替える。
- Dropboxで同期しているため、WindowsとmacOSで同時にGit操作をしない。端末を切り替える前に同期完了を確かめる（ADR-0018）。

## 作業の流れ
- 開始時：上の確認をしてから `docs/STATUS.md` を読む
- 設計判断をしたら：`docs/decisions.md` にADR（決定・理由・却下案・影響）を追記
- 安全・外部送信・ログに関わる変更の後：`safety-review` Skill
- 節目と提出前：`judge-audit` Skill
- PRを作る前：`docs/STATUS.md` を**マージ後の main の状態**として更新する（マージ済みの作業は Issue・PR 番号で書き、ブランチ名を残さない）。セッション開始時と `gh pr create` の前に hook が確かめる（ADR-0023）。同じく `docs/KEEP-THINKING.md` にその作業の節を追記する（`gh pr create` の前に hook が確かめる。ADR-0058）
- PR・調査・Phaseの区切りで条件に当てはまったら：`dev-log` Skill（`docs/dev-logs/`。条件は `docs/dev-logs/README.md`）。ユーザー設定の `create-dev-log` エージェントは使わない
- 終了時：`session-handoff` Skill（STATUS.md更新、KEEP-THINKING.mdに追記）

## 正本の優先順位
1. この CLAUDE.md と `.claude/rules/`
2. `docs/decisions.md`
3. `docs/PRD.md`・`docs/architecture.md`
4. Claude Codeの自動メモリ（補助。正本にしない。Git管理の文書と食い違ったら文書が正しい）

## 別のセッションに任せるとき
- Claude Code が Issue の実装・調査・文書を新しいセッションに任せるときは、**そのセッションのモデルを Opus（`claude-opus-5-5`）にする**（2026-11-06 オーナー、チャット：「指示先の新しいセッションはOpusがよかったな」）。エフォートは任せるセッションに委ねる。始めるときに `model` を省いて自分と同じモデルにしない。
- 始めた後にモデルが違っていたら、そのセッションのモデルを Opus に切り替える。
- 任せるセッションにも、この CLAUDE.md と `.claude/rules/` の決まり（Issue のコメントを先に読む、`[TODO-OWNER]` を触らない、マージ・デプロイ・依存の追加はオーナーの承認）を伝える。

## 開発環境
- 必要なもの：Git、Python 3.9以上（hookとコミット前フック）、Node.js LTS（v22以上）
- **環境（インストール、グローバル設定、PATH）はオーナーが整える。Claude Codeは勝手に変えない**
- **必要な環境が無いとき、別の道具で代用するなどの回避策を自分で選ばない**。何が無いか、選択肢と推奨を示してオーナーに提案し、決まった手順をREADMEに書く
- クローン後の初回設定：`git config core.hooksPath .githooks`
- hookの試験：`sh .claude/hooks/run-python.sh .claude/hooks/test_hooks.py`
