# 進捗（STATUS）

最終更新：2026-11-03（Issue #13：STATUS.md の更新漏れを知らせる hook。Phase 1（Issue #8、PR #10）と開発記録（Issue #9、PR #11）はmainに入っている）

## 実装済み（コードがありコミット済み）
- Claude Code用hook：`[TODO-OWNER]` の削除防止（`protect_todo_owner.py`）、秘密情報とブロックリストの語の検出（`block_secrets.py`）、main・GitHubの保護（`guard_github.py`）。いずれも `.claude/hooks/`
- STATUS.md の更新漏れを知らせる hook（`.claude/hooks/status_check.py`。Issue #13、ADR-0023）：セッション開始時に、STATUS.md に残ったマージ済みのブランチ名を知らせる。`gh pr create` の前に、ブランチで STATUS.md が変わっていなければ止める
- gitのフック（`.githooks/`）：秘密ファイル・APIキー・ブロックリストの語・マーカー削除・main へのコミットとマージコミットの検出
- hookの試験スクリプト（`.claude/hooks/test_hooks.py`）
- アプリ本体（Phase 1 の試作版、`web/`。Issue #8、PR #10）
  - React / TypeScript / Vite の雛形（ADR-0003）
  - 実装の3画面（はじめに／対話／振り返り）と、中断の画面・終わりの画面
  - 対話：前半3問 → ③確認（タップ、回数に数えない。選ばなければ係の交代）→ ④出来事 → 後半3問（最初は立て直しの問い。係の交代のときは交代用の問い）
  - 振り返り：観点ごとの判定は「判定できませんでした」（Claude未接続。ADR-0012）、回答の原文（出来事の前後に分ける）、準備行動と実行の予定の選択
  - 常に表示する「訓練をやめる」ボタンと、ADR-0011 の固定の案内
  - 進行のルール（`web/src/flow/rules.ts`、`training.ts`）と固定文（`content.ts`）。固定の質問文は下書きで `[TODO-OWNER]` 付き
  - 固定の質問文は、公的な手引きの聞き取りの順番を参考に書き直した（README「参考にした公式資料」）。薬の名前・量・何の薬かも聞く（ADR-0021）。「家族と連絡がつかない」の後は家族のほかの人を聞く
  - 状態はメモリにだけ持ち、ブラウザに保存しない

## 動作確認済み
- hookとgitのフックの試験：`test_hooks.py` で164/164 PASS（2026-11-03、Windows 11・Git Bash・Python 3.14。STATUS.md の hook の17件を含む）
- STATUS.md の hook を、このリポジトリで手で動かした（2026-11-03）：修正前の STATUS.md で、PR #10 でマージ済みのブランチ名が残る2か所を挙げ、修正後は何も出さなかった。STATUS.md を変えていないブランチでの `gh pr create` を止めた。Claude Code のセッション開始時に実際に呼ばれるかは未確認
- Phase 1 の単体試験：`npm --prefix web test` で 53/53 PASS（質問の書き直しの後）。型の検査（TypeScript 7.0）とビルドも成功（2026-11-03、Windows 11・Node.js 26.13）
- Phase 1 の通しの操作（2026-11-03、Claude desktop のブラウザ画面で幅375pxのスマホ表示を模擬。iPhone実機では未確認）
  - スマートフォンを選ぶ経路と、選ばずに進む（係の交代）経路で、はじめに → 前半3問 → 確認 → 出来事 → 後半3問 → 振り返り → 準備行動の決定 まで通った
  - 「訓練をやめる」で中断の画面に移った
  - localStorage・sessionStorage・IndexedDB・Cookie に何も残っていなかった（safety-test-plan P2 の一部）
  - コンソールにエラーは出なかった
- Phase 1 のレビュー（2026-11-03）：4つの観点（仕様との一致、安全とプライバシー、コードの正しさ、アクセシビリティ）で別々に点検し、指摘を反証役が確かめた。確かめられた5件（焦点の枠と入力欄の枠の濃さ、確認の選択肢を標準のラジオボタンへ、回答後の焦点の移し先、横向きの安全領域）を直した
- 実際のClaude Codeの操作でのhook（2026-11-02）：マーカーを消すEditは止まり、通常のEditは通った。`.env.local` のRead、`cat .dev.vars`、`git commit --no-verify`、`gh pr merge` は止まった。`.dev.vars` のReadは settings.json の deny で止まった
- `.dev.vars`、`.env.local`、`.claude/local/blocklist.txt` がgitの対象外であること（`git check-ignore`）

## 開発環境（2026-11-02時点。オーナーが導入）
- Git 2.56、Python 3.14、Node.js 26.13（LTS、nvm）、npm 11.20、GitHub CLI
- 未導入：iPhone実機試験用のHTTPS手段（cloudflared等。未決定）
- GitHubリポジトリ：Guttyo/SonaQuest（プライベート、2026-11-02作成）。Rulesetは未設定（オーナーの承認後）

## 未着手
- Claude連携（Workers / Hono、/api/turn、聞き返し、観点の判定、API失敗時に固定の進行へ切り替えること）
- 体調の訴えらしい入力の語の照合による自動の中断（ADR-0011。語の一覧はオーナーの確認が要る）。**これが入るまで公開しない**
- 準備行動や公的な仕組みに触れる固定文への出典と確認日の表示（docs/references.md の候補が未確認のため）
- 音声入力、光のキャラクターの動きの演出（ADR-0020）
- iPhone Safari 実機での確認
- macOSでのhook試験（Windowsでのみ確認）
- 音声まわりの実機検証（ADR-0004、0005）
- Claudeのモデル選定と比較実験（ADR-0006、docs/evidence.md）
- GitHubのRulesets設定、CI
- 公開前の利用制限：/api/turn の回数制限、入力の大きさの上限、Claude APIの支出の上限（ADR-0003、safety-test-plan P7〜P9）
- 公開前のGit履歴全体の秘密情報検査（safety-test-plan P5）
- デモ動画、提出タグ
- 状況データの書き出しスクリプト（Issue #5。ブランチ・PRはまだ無い）

## 文書のみ（設計・枠）
- CLAUDE.md、`.claude/rules/`（scope、safety、privacy、github）、`.claude/skills/`
- docs/：PRD、architecture、decisions（ADR-0001〜0023）、safety-test-plan、evidence、demo-script（枠）、references、KEEP-THINKING
- テーマごとの開発記録 `docs/dev-logs/` と、それを書く `dev-log` Skill（`.claude/skills/dev-log/`）。Issue #9、PR #11
- PRDのコンセプト「お薬の避難訓練」、体験の核（伝える → 使えなくなる → 立て直す → 気づきと準備）、体験の6段階（はじめに／問い／確認／出来事／立て直し／結果）と実装の3画面、評価の方針（点数・合否なし、手薄なところを示す）、光のキャラクターの方向性（ADR-0019・0020、採用案。Issue #6）
- README.md（枠）

## オーナーの判断待ち（`git grep -n "TODO-OWNER"`）
- **決定済み・マーカー解除待ち**（決定の文はマーカーの横）：緊急の範囲と文面（ADR-0011）、薬の名前（ADR-0009）、5観点の基準・出来事・準備行動（PRD）、プロフィール・ライセンス（README）、出典の方針（references）
- **新しく追加した確認事項**：自傷に関する案内の文面（ADR-0011）、実際の服薬情報の入力を許すか（ADR-0009）
- **Issue #6 で追加した確認事項**：コンセプトと訴求文の文言、回答の配分、6画面の分け方、立て直しの回答と観点②の関係（PRD）、ADR-0019・0020の採用、キャラクターの名前・色や形の方向性。いずれもオーナーの指示（2026-11-03、チャット）を横に記録済みで、ADR-0019・0020の採用の判断とマーカーの解除が残る
- **決定済み（2026-11-03）**：薬の名前・量・病名・種類を聞いてよい（ADR-0021。ADR-0009 の「質問しない」を変更）。利用者には架空の内容で答えてもらい、実際の服薬情報は入力しない（ADR-0009）。どちらもマーカーの横に決定を記録済みで、解除が残る

## 今後の課題（提出の後）
- ローンチ時には、利用者が自分の実際の服薬状況を示せるようにする必要がある（2026-11-03、オーナー）。提出版は架空のみ。実際の情報を扱う版は、同意の取り方、外部事業者の保持、保存の方針、医療判断をしないことの再点検などを別のADRで決めてから作る（候補の項目は docs/decisions.md ADR-0009 の「今後の課題」）
- **Issue #8 で追加した確認事項**（`web/src/flow/content.ts`）：利用開始の文面の最終確認、外部事業者の保持方針の書き方、固定の質問文、準備行動と観点の対応。あわせて、中断の画面で使う #7119 の出典ページ（docs/references.md に「ページ移転の告知あり。使う前に再確認」とある）を再確認してほしい
- **第2回監査で決定・解除待ち**：薬の名前を送らない方式は採用しない（ADR-0009。自動の置き換えはしない）
- **保留**：Yorukusuとの関係の段落（README・ADR-0002。文面を見てから）、比較実験の回答セットと正解ラベル（evidence。実験の前まで）
- **外部監査の提案（判断待ち）**：初期版で外部音声サービスを採用しない（ADR-0004・0005）
- **決定済み（2026-11-03）**：ADR-0003（技術構成）を採用。MVPの実装は別のIssueで進める。公開前に、/api/turn の回数制限・入力の大きさの上限・Claude APIの支出の上限を確かめる（safety-test-plan P7〜P9）
