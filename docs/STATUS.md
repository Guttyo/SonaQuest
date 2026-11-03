# 進捗（STATUS）

最終更新：2026-11-04（Issue #15 の後半：Claude 連携（Workers の `/api/turn` と、画面からの呼び出し）を足した。本物の Claude API を呼んだ確認はまだ。Phase 2 の前に決めることの決定の記録（Issue #15 の前半、PR #33）、決定の行が main に入っていた8つのマーカーの解除（Issue #34、PR #35）、動作の要件をウェブブラウザにしたこと（Issue #17 の文書の部分、PR #32、ADR-0027）、提出後の課題の `docs/roadmap.md`（Issue #16、PR #31）、体調の訴えらしい入力での自動の中断（Issue #14、PR #27）と、絶対ルールと関連ルールの見直しとマーカー解除の hook（Issue #19、PR #29）はmainに入っている。その前の Issue #25：PR #18・#21・#22・#23 の後の main に合わせた。Phase 1（Issue #8、PR #10）、開発記録（Issue #9、PR #11）、STATUS.md の hook（Issue #13、PR #18）、答える範囲の案B（Issue #12、PR #22）、Phase 2 の前に決めることの表（Issue #15 の前半、PR #23）、外部の助言の記録（Issue #20、PR #21）はmainに入っている）

## 実装済み（コードがありコミット済み）
- Claude Code用hook：`[TODO-OWNER]` の削除防止（`protect_todo_owner.py`）、秘密情報とブロックリストの語の検出（`block_secrets.py`）、main・GitHubの保護（`guard_github.py`）。いずれも `.claude/hooks/`
- マーカー解除の例外（Issue #19、ADR-0024）：ローカルの main にあるそのファイルで、マーカーの直後の行に `→ オーナー決定（YYYY-MM-DD、…）：` があるマーカーだけ、Claude Code の Edit・Write とコミット前フックが解除を通す。決定の行を足すのと同時の解除、作業ブランチで足しただけの決定の行、「オーナー指示」「〜の方向」、決定の行ごとの削除では通さない。判定はファイル全体で行い、基準はブランチの `refs/heads/main`。あわせて `guard_github.py` が、ローカルの main を動かす操作（`git branch -f main`、`git update-ref`、`git tag main` など）を止める。塞いでいない経路（`git am`・`revert`・`cherry-pick`、`-c` の設定での push・fetch、worktree など）は ADR-0024 に書いた
- STATUS.md の更新漏れを知らせる hook（`.claude/hooks/status_check.py`。Issue #13、ADR-0023）：セッション開始時に、STATUS.md に残ったマージ済みのブランチ名を知らせる。`gh pr create` の前に、ブランチで STATUS.md が変わっていなければ止める
- gitのフック（`.githooks/`）：秘密ファイル・APIキー・ブロックリストの語・マーカー削除・main へのコミットとマージコミットの検出
- hookの試験スクリプト（`.claude/hooks/test_hooks.py`）
- アプリ本体（Phase 1 の試作版、`web/`。Issue #8、PR #10）
  - React / TypeScript / Vite の雛形（ADR-0003）
  - 実装の3画面（はじめに／対話／振り返り）と、中断の画面・終わりの画面
  - 対話：前半3問 → ③確認（タップ、回数に数えない。選ばなければ係の交代）→ ④出来事 → 後半3問（最初は立て直しの問い。係の交代のときは交代用の問い）
  - 振り返り：観点ごとの判定（Claude の判定。途中で失敗した回はすべて「判定できませんでした」。ADR-0012、ADR-0028）、回答の原文（出来事の前後に分ける。関係のない話として質問し直した入力も出す）、準備行動と実行の予定の選択
  - 常に表示する「訓練をやめる」ボタンと、ADR-0011 の固定の案内
  - 体調の訴えらしい入力での自動の中断（Issue #14、ADR-0011）：語の照合（`web/src/flow/emergency.ts`）で、自傷のほのめかしと本人の今の体調の訴えを見分け、訓練を中断する。自傷のほのめかしでは自傷用の案内（「まもろうよ こころ」の出典つき）を出す。訴えらしい回答は回答として受け取らず、中断後の回答も受け付けない。Claude は使わない。語の一覧と自傷の案内の文面は下書きで `[TODO-OWNER]` 付き。初回画面と README に「すべての訴えを見分けられるわけではない」と書いた
  - 進行のルール（`web/src/flow/rules.ts`、`training.ts`）と固定文（`content.ts`）。固定の質問文は下書きで `[TODO-OWNER]` 付き
  - 固定の質問文は、公的な手引きの聞き取りの順番を参考に書き直した（README「参考にした公式資料」）。薬の名前・量・何の薬かも聞く（ADR-0021）。「家族と連絡がつかない」の後は家族のほかの人を聞く
  - 答える範囲（案B、ADR-0022。Issue #12、PR #22）：質問ごとに「誰のこととして答えるか」（本人／架空／両方）を持たせ、回答欄の案内を質問ごとに変えて常に見える位置に出す。薬の中身は架空、情報の在りか・ほかの伝え方・薬を知っている人（続柄など）・記録の新しさは本人のこととして答える。初回画面の文面も「実際の服薬情報は入力せず、薬の中身は架空」に合わせた
  - 振り返りの「今ここで確かめましょう」：思い出せないときに、実際のお薬手帳や薬の袋の確認と、定期的なお薬の避難訓練での復習を促す固定文（ADR-0022。文面は下書きで `[TODO-OWNER]` 付き）。候補は出さず、確認した内容の入力も求めない
  - 薬を知っている人の質問では、人の名前や電話番号など連絡先そのものを尋ねない（ADR-0022）。質問ごとの回答欄の案内の文面は、ADR-0022 の `[TODO-OWNER]` でオーナーの確認を待っている
  - 状態はメモリにだけ持ち、ブラウザに保存しない
- Claude 連携（Issue #15 の後半、ADR-0028。本物の Claude API を呼んだ確認はまだ）
  - Cloudflare Workers（Hono）の `/api/turn`（`web/worker/`）。入力を検査し、大きすぎる・形の違う入力は Claude を呼ばずに拒否する。Claude（`claude-opus-5-5`、effort low、構造化出力、8秒・SDK の再試行なし、断られたときはサーバー側で別のモデルが答え直す `fallbacks: "default"`）を呼び、出力の形と値を検査する。質問IDは Claude に選ばせず、固定の順番から決める（ADR-0025 の A）
  - Claude が作った文（質問の言い回し、受け止めの一言、聞き返し、質問し直し）は、長さ・禁止表現・利用者の言葉の繰り返しを検査し、通らなければ固定文に戻す（`web/worker/checks.ts`）。禁止表現の一覧は下書きで `[TODO-OWNER]` 付き
  - 画面：回答のたびに `/api/turn` を呼び、待っている間は次の回答を受け付けない。失敗・時間切れ・形の違う返事では、その回の残りを固定の進行にする。関係のない話は回数に数えず質問ごとに1回だけ質問し直す。思い出せない回答の直後に固定文を出す。③確認の初期選択に Claude の候補を使う（本人がタップで確かめる）。Claude が緊急（体調の訴え・自傷のほのめかし）を返したら、それぞれの案内で中断する（語の照合は送る前にブラウザで行う）。送るのは回答の原文と、その直前に画面に出した文で、質問し直した入力はその後は送らない
  - システムプロンプト、聞き返し・質問し直しの固定文は下書きで `[TODO-OWNER]` 付き。思い出せないときのその場の固定文は、オーナーの決定の文（Issue #15 のコメント）にし、マーカーの直後に決定の行を書いた
  - Workers の入口（`web/worker/index.ts`）は `default` だけを出す。受け口の中身は `web/worker/app.ts`
  - 本文のログは `DEV_CONTENT_LOG=1` かつ宛先が localhost のときだけ（ADR-0007 の追記）。Workers Logs は使わない（`web/wrangler.jsonc`）
  - 初回画面と README の送信の説明を、Anthropic へ送る版に合わせた（ゼロ保持の契約なし）
  - 足した依存（オーナーの承認 2026-11-04）：`@anthropic-ai/sdk` 1.3.0、`hono` 4.13.14、`wrangler` 4.156.0（開発用）

## 動作確認済み
- hookとgitのフックの試験：`test_hooks.py` で247/247 PASS（2026-11-03、Windows 11・Git Bash・Python 3.14。STATUS.md の hook の21件と、Issue #19 で足した79件（決定の行によるマーカー解除、ローカルの main を動かす操作の停止と、main を起点に使うだけの操作を止めないこと）を含む）
- STATUS.md の hook を、このリポジトリで手で動かした（2026-11-03）：修正前の STATUS.md で、PR #10 でマージ済みのブランチ名が残る2か所を挙げ、修正後は何も出さなかった。STATUS.md を変えていないブランチでの `gh pr create` を止めた。Claude Code のセッション開始時に実際に呼ばれるかは未確認
- アプリの単体試験：`npm --prefix web test` で 215/215 PASS（8ファイル。Claude 連携の試験 `web/worker/turn.test.ts`・`checks.test.ts`、`web/src/flow/turnContract.test.ts`・`training.ai.test.ts` を含む。Claude は呼ばず、偽の返事を渡す）。型の検査（TypeScript 7.0）、ビルド（`npm --prefix web run build`）、Workers のまとめ（`npm --prefix web run bundle:worker`、デプロイはしない）も成功（2026-11-04、Issue #15 の後半の作業、Windows 11・Node.js 26.13）
- Claude 連携の安全の試験 S9、S16〜S19、F1〜F3、P8 を偽の返事の単体試験で、P3 をビルド成果物の検索で実施した（2026-11-04。docs/safety-test-plan.md「実施の記録」）。本物の Claude の出力での確認は未実施
- Claude 連携の画面（2026-11-04、Claude desktop のブラウザ画面、Chromium 152、幅375px）：Workers を動かさない開発用サーバーで、最初の回答で `/api/turn` が失敗した後、問い合わせを送らずに固定の質問で振り返りまで進み、観点がすべて「判定できませんでした」になった（F1）。ページの中で偽の返事を返すようにして、待っている間の表示、質問し直しの固定文、思い出せないときのその場の文、Claude の言い回し、聞き返し、③確認の初期選択が出ることも確かめた
- 安全の試験 E1〜E9（Issue #14、2026-11-03）：単体試験で実施。E7 は言い換え26件中4件を見逃した（docs/safety-test-plan.md「実施の記録」）。ブラウザ画面でも、体調の訴えで中断の案内、自傷のほのめかしで自傷用の案内が出ることを確かめた
- 安全の試験のうち S14（薬の名前を含む架空の回答が入力どおり表示）、S15（思い出せないときの案内が固定文で出て、候補を含まない）、P10（AIと未接続の試作版の通しで、取得先が localhost だけ。ストレージも空）を試作版で実施した（2026-11-03、PR #22 の作業。Claude desktop のブラウザ画面・Chromium 152。docs/safety-test-plan.md「実施の記録」）。S11〜S13 は未実施（S11・S12 は Claude連携後）
- ウェブブラウザでの通しの操作（Issue #17 の完了条件の1つ、ADR-0027）：2026-11-04、Issue #14 の後の main（5116501）を、Claude desktop のブラウザ画面（Chromium 152、Windows 11）で幅375pxのスマホ表示にして確かめた。はじめに → 前半3問 → 確認（お薬手帳を選ぶ）→ 出来事 → 後半3問 → 振り返り → 準備行動の決定 まで通った。横にはみ出す表示は無く、localStorage・sessionStorage・IndexedDB・Cookie は空で、コンソールにエラーは出なかった
- Phase 1 の通しの操作（2026-11-03、Claude desktop のブラウザ画面で幅375pxのスマホ表示を模擬）
  - スマートフォンを選ぶ経路と、選ばずに進む（係の交代）経路で、はじめに → 前半3問 → 確認 → 出来事 → 後半3問 → 振り返り → 準備行動の決定 まで通った
  - 「訓練をやめる」で中断の画面に移った
  - localStorage・sessionStorage・IndexedDB・Cookie に何も残っていなかった（safety-test-plan P2 の一部）
  - コンソールにエラーは出なかった
- Phase 1 のレビュー（2026-11-03）：4つの観点（仕様との一致、安全とプライバシー、コードの正しさ、アクセシビリティ）で別々に点検し、指摘を反証役が確かめた。確かめられた5件（焦点の枠と入力欄の枠の濃さ、確認の選択肢を標準のラジオボタンへ、回答後の焦点の移し先、横向きの安全領域）を直した
- 実際のClaude Codeの操作でのhook（2026-11-02）：マーカーを消すEditは止まり、通常のEditは通った。`.env.local` のRead、`cat .dev.vars`、`git commit --no-verify`、`gh pr merge` は止まった。`.dev.vars` のReadは settings.json の deny で止まった
- `.dev.vars`、`.env.local`、`.claude/local/blocklist.txt` がgitの対象外であること（`git check-ignore`）

## 開発環境（2026-11-02時点。オーナーが導入）
- Git 2.56、Python 3.14、Node.js 26.13（LTS、nvm）、npm 11.20、GitHub CLI
- GitHubリポジトリ：Guttyo/SonaQuest（プライベート、2026-11-02作成）。Rulesetは未設定（オーナーの承認後）

## 未着手
- 本物の Claude API での確認（API キーの用意と、課金の承認の後。オーナーは 2026-11-04 に「まだ呼ばない」と決めた）。あわせて、モデルの比較実験（ADR-0006、docs/evidence.md）と、安全の試験 S1〜S8・S10〜S13 を本物の出力で行う
- `wrangler dev` を手元で動かすこと：npm 11 が workerd のインストール時のスクリプトを止めた（`npm install-scripts ls` で見られる）。許可するかはオーナーが決める
- Phase 1 の残り（Issue #17）：#7119 の出典URL（オーナーが確かめる）、準備行動や公的な仕組みに触れる固定文への出典と確認日の表示（docs/references.md の候補が未確認のため）
- 音声入力、光のキャラクターの動きの演出（ADR-0020）
- macOSでのhook試験（Windowsでのみ確認）
- 音声まわりのブラウザでの検証（ADR-0004、0005）
- Claudeのモデル選定と比較実験（ADR-0006、docs/evidence.md）
- GitHubのRulesets設定、CI
- 公開前の利用制限：/api/turn の回数制限、入力の大きさの上限、Claude APIの支出の上限（ADR-0003、safety-test-plan P7〜P9）
- 公開前のGit履歴全体の秘密情報検査（safety-test-plan P5）
- デモ動画、提出タグ
- 状況データの書き出しスクリプト（Issue #5。ブランチ・PRはまだ無い）

## 文書のみ（設計・枠）
- CLAUDE.md、`.claude/rules/`（scope、safety、privacy、github）、`.claude/skills/`
- docs/：PRD、architecture、decisions（ADR-0001〜0028）、safety-test-plan、evidence、demo-script（枠）、references、KEEP-THINKING
- 絶対ルールと関連ルールの見直し（Issue #19）：絶対ルール3（公開する版では本文をログに出さない。開発中だけ既定でオフの切り替えで出してよい）、5（main で決定の行が付いたマーカーの解除）、7（Issue ごとの着手の承認）を書き直し、11 を番号を変えずに10の後へ移した。scope（架空で答える範囲、音声、Claude が質問する）、safety（Claude が作る文とその検査）、privacy（保持・送信・保存・ログ出力の違い）、github（着手の承認）を合わせた。safety-test-plan に S16〜S19 を足した（未実施）
- 提出後の課題 `docs/roadmap.md`（Issue #16）：ADR-0009 の「今後の課題」の候補（ADR-0009 からは roadmap を参照する形にした）、ADR-0025 の B、外部の助言の「持ち帰り」の案を、出所を付けて集めた。どれも作ると決めたものではない
- テーマごとの開発記録 `docs/dev-logs/` と、それを書く `dev-log` Skill（`.claude/skills/dev-log/`）。Issue #9、PR #11
- Phase 2（Claude連携）の前に決めることの表 `docs/phase2-decisions.md`（Issue #15 の前半、PR #23）。モデル、出力の形、送る内容、禁じること、失敗時の扱いなど14項目に、選択肢と推奨を付けた
- 外部AI（Fable）の文書の助言の記録 `docs/reviews/` と、公式の審査基準の写し `docs/judging-criteria.md`（Issue #20、PR #21）
- 役割と答える範囲 案B（ADR-0022、Issue #12）を PRD・README・safety.md・demo-script・evidence・safety-test-plan（S11〜S15、E8、E9、P10）に反映
- PRDのコンセプト「お薬の避難訓練」、体験の核（伝える → 使えなくなる → 立て直す → 気づきと準備）、体験の6段階（はじめに／問い／確認／出来事／立て直し／結果）と実装の3画面、評価の方針（点数・合否なし、手薄なところを示す）、光のキャラクターの方向性（ADR-0019・0020、採用案。Issue #6）
- README.md（枠）

## オーナーの判断待ち（`git grep -n "TODO-OWNER"`）
- **解除済み**（Issue #34、2026-11-04。決定の行は残した）：実際の服薬情報の入力（ADR-0009）、ADR-0021 と ADR-0009 の関係、クローン音声のファイル（ADR-0005）、開発中だけのログ出力（ADR-0007 の追記）、マーカー解除のルール（ADR-0024）、Claude に任せる範囲と回数（ADR-0025、`.claude/rules/scope.md`、phase2-decisions 項目13）
- **決定済み・マーカー解除待ち**（決定の文はマーカーの横。ADR-0024 の決定の行の形ではないので、Claude Code は解除できない）：緊急の範囲と文面（ADR-0011）、5観点の基準・出来事・準備行動（PRD）、プロフィール・ライセンス（README）、出典の方針（references）
- **新しく追加した確認事項**：自傷に関する案内の文面（ADR-0011）
- **Issue #6 で追加した確認事項**：コンセプトと訴求文の文言、回答の配分、6画面の分け方、立て直しの回答と観点②の関係（PRD）、ADR-0019・0020の採用、キャラクターの名前・色や形の方向性。いずれもオーナーの指示（2026-11-03、チャット）を横に記録済みで、ADR-0019・0020の採用の判断とマーカーの解除が残る
- **Issue #14 で追加した確認事項**（公開の前に確かめる）：体調の訴え・自傷のほのめかしとして照合する語の一覧（`web/src/flow/emergency.ts`）と、自傷に関する案内の文面（`web/src/flow/content.ts`、ADR-0011 の下書きをそのまま使用）。「つらい」「痛い」が訓練の中の言い方でも中断する点と、E7 の見逃し4件の扱いも見てほしい
- **Issue #12 で追加した確認事項**：思い出せないときの案内の文面と、質問ごとの回答欄の案内の文面（ADR-0022、`web/src/flow/content.ts`）
- **Phase 2 の前に決めること**（`docs/phase2-decisions.md`）：使うモデルと effort、出力の形、送る内容、③確認の初期選択、判定のタイミング、失敗時の扱い、依存の追加など。項目3（聞き返しの文面）と11（ログ）は、Issue #19 で ADR-0025・ADR-0007 の追記にし、オーナーが決定した（2026-11-03）。2026-11-04 に、項目1〜11 のオーナーの決定を各マーカーの直後に記録した（モデルは Opus 5.5 を effort low で始めて比較実験で確定、構造化出力、質問文も送る、③確認の初期選択は Claude の候補、思い出せない回答にはその場でも固定文、毎ターン判定、8秒・再試行なし、緊急の照合はブラウザ＋Claude の補助、ゼロ保持の契約は提出版では不要）。マーカーの解除は、この記録が main に入った後の別の PR で行う。項目12（依存の追加と API キー）は、依存の追加を 2026-11-04 にオーナーが承認した。API キーの用意が残るのでマーカーは残す
- **Issue #15 の後半で追加した確認事項**（公開の前に確かめる）：Claude へのシステムプロンプト（`web/worker/prompt.ts`）、Claude が作った文で禁止する表現の一覧（`web/worker/checks.ts`）、聞き返しと質問し直しの固定文（`web/src/flow/content.ts`）。いずれも Claude Code の下書き。思い出せない回答の直後に出す固定文はオーナーが決めた文にし、マーカーの直後に決定の行を書いた（解除は main に入った後の PR で）
- **Issue #19 で決定**（2026-11-03、チャット）：マーカー解除のルールの変更を採用（ADR-0024）、開発中だけのログ出力を採用（ADR-0007 の追記）、Claude に任せる範囲は A で、関係のない話への質問し直しは回数に数えず1回まで（ADR-0025、`.claude/rules/scope.md`、phase2-decisions 項目13）、リポジトリに固定の音声ファイルは入れない（ADR-0005）。マーカーは Issue #34 で解除した。Issue ごとの着手の承認（ADR-0026）も採用（マーカーなし）
- **Issue #19 で決定を記録**：音声認識は Web Speech API（ADR-0004）、音声合成は ElevenLabs で、失敗したらブラウザの読み上げ（ADR-0005）。どちらもまだ実装していない
- **Issue #8 で追加した確認事項**（`web/src/flow/content.ts`）：利用開始の文面の最終確認、外部事業者の保持方針の書き方、固定の質問文、準備行動と観点の対応。あわせて、中断の画面で使う #7119 の出典ページ（docs/references.md に「ページ移転の告知あり。使う前に再確認」とある）を再確認してほしい
- **保留**：Yorukusuとの関係の段落（README・ADR-0002。文面を見てから）、比較実験の回答セットと正解ラベル（evidence。実験の前まで）
- **外部監査の提案（判断待ち）**：初期版で外部音声サービスを採用しない（ADR-0004・0005）
- **決定済み（2026-11-03）**：ADR-0003（技術構成）を採用。MVPの実装は別のIssueで進める。公開前に、/api/turn の回数制限・入力の大きさの上限・Claude APIの支出の上限を確かめる（safety-test-plan P7〜P9）

## 今後の課題（提出の後）
- `docs/roadmap.md` にまとめた（実際の服薬状況を扱う版、Claude に任せる範囲を広げること、訓練の後に利用者が自分で持ち帰ること）。どれも提出版の実装には含まない
