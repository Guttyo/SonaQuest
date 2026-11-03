# hookのコマンド解析を、文字列の照合から字句解析へ作り直した経過（PR #3・#4）

- 日付：2026-11-03（この記録を書き終えた日）
- 対象：
  - Issue #1 → PR #3（ブランチ `docs/phase0-github-rules`、マージ e7537b1）。このテーマに当たるのは、レビュー対応の e5c8aad
  - Issue #2 → PR #4（ブランチ `fix/2-hook-false-positives`、マージ b6b776e）。c724086、4593c68、e19ffa7、df38498、92c2933、f257d23、84ee7f1
- 関係するADR：ADR-0014（GitHub運用とhookの位置づけ）

## 背景
- Claude Codeのhookは、Bash・PowerShellのコマンドを受け取って判定する。`main` の保護は `.claude/hooks/guard_github.py`、コミット前フックの迂回（`core.hooksPath` の変更など）の防止は `.claude/hooks/block_secrets.py` が受け持つ。
- ADR-0014 で、`main` の保護の正は GitHub の Ruleset とし、hookは誤操作を防ぐ補助と決めた。ただし PR #3 の時点では Ruleset が未設定で、PR #3 本文の「残るリスク」にあるとおり「今は運用で守っている状態」で、Claude Codeを通した操作はhookが補っていた。
- PR #3 のレビュー前（12bd3d8）の `guard_github.py` は、コマンドの文字列全体に正規表現を当てていた。区切りをまたがないように `[^;&|]*` を挟む書き方で、たとえば main へのpushは次の行で判定していた。

  ```python
  (re.compile(r"\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s|:)(?:main|master)\b"),
  ```

- PR #4 のもとの目的は、Issue #2 の誤検出を直すことだった。`git config --get core.hooksPath; …` のように、読むだけのコマンドをほかのコマンドとつなぐと、`block_secrets.py` が止めていた。

## やったこと
変更したファイルは `git show --stat <コミット>` で確かめた。

| コミット | 変えたこと | 変更したファイル |
|---|---|---|
| e5c8aad | `guard_github.py` を、コマンドを区切りごとに分け、`shlex.split` で語に分けて、gitのサブコマンドと引数で判定する方式に変えた。途中の `git switch -c` も追ってブランチを判断する | `.claude/hooks/guard_github.py`、`.claude/hooks/test_hooks.py`、`.claude/rules/github.md`、`docs/PRD.md`、`docs/STATUS.md`、`docs/decisions.md`、`docs/evidence.md` |
| c724086 | `block_secrets.py` で、`&&` `\|\|` `;` `\|` と改行で区切り、区切りごとに行頭の `git config` を正規表現で照合するようにした（Issue #2 の誤検出の修正）。コミット前フックの案内に PowerShell の書き方を足した | `.claude/hooks/block_secrets.py`、`.claude/hooks/test_hooks.py`、`.githooks/scan_staged.py`、`docs/KEEP-THINKING.md`、`docs/STATUS.md`、`docs/evidence.md` |
| 4593c68 | `.claude/hooks/sonaguard.py` に `shlex.shlex` を使う共通のコマンド分解を足し、2つのhookから使うようにした。gitのグローバルオプションを読んでからサブコマンドを判定する | `.claude/hooks/block_secrets.py`、`.claude/hooks/guard_github.py`、`.claude/hooks/sonaguard.py`、`.claude/hooks/test_hooks.py`、`docs/STATUS.md`、`docs/evidence.md` |
| e19ffa7 | shlex をやめて、引用符・置換・リダイレクトを区別する字句解析を自前で書いた | `.claude/hooks/block_secrets.py`、`.claude/hooks/guard_github.py`、`.claude/hooks/sonaguard.py`、`.claude/hooks/test_hooks.py`、`docs/KEEP-THINKING.md`、`docs/STATUS.md`、`docs/evidence.md` |
| df38498 | シェルが受け取る heredoc・ヒア文字列（`<<<`）の本文も、コマンドとして調べるようにした | `.claude/hooks/block_secrets.py`、`.claude/hooks/sonaguard.py`、`.claude/hooks/test_hooks.py`、`docs/STATUS.md`、`docs/evidence.md` |
| 92c2933 | heredoc を、正規表現の前処理ではなく、引用符を考慮した解析の中で、引用符の外の `<<` だけ認めるようにした。前置きのコマンド（`env` など）について、値を取るオプションの値を読み飛ばすようにした | `.claude/hooks/sonaguard.py`、`.claude/hooks/test_hooks.py`、`docs/STATUS.md`、`docs/evidence.md` |
| f257d23 | 語頭の `#` から行末までを、コメントとして読み飛ばすようにした | `.claude/hooks/sonaguard.py`、`.claude/hooks/test_hooks.py`、`docs/STATUS.md`、`docs/evidence.md` |
| 84ee7f1 | hookが防げない経路を明記した（スクリプトファイルの実行、実行時に組み立てるコマンド、シェル以外の言語、PowerShell固有の書き方）。新しい抜け道が見つかっても、hookの修正は別のIssueで扱い、マージを止める理由にしないと書いた | `.claude/rules/github.md` |

今の解析は `sonaguard.py` の `split_commands()` にある。gitのグローバルオプションを読み飛ばしてサブコマンドを取り出す処理は `git_invocation()` にある。

## レビューの経過
数は、行ごとの指摘（インラインコメント）の件数。

| 回 | レビューしたコミット | 件数 | 主な指摘 | 対応 |
|---|---|---|---|---|
| PR #3 第1回 | 12bd3d8 | Codex 1、Copilot 8 | 宛先を省いた push と `--all`（Codex）。`-uf` のような短縮オプションの結合、`HEAD:refs/heads/main`、`:main` での削除、`gh api --method=PUT …`、`git commit -m x && git switch -c …` を例外として通す、`git branch --delete main`、fast-forward マージでは pre-merge-commit が呼ばれない、PRD の ADR 参照先（Copilot） | e5c8aad |
| PR #3 第2回 | e5c8aad | Codex 0 | 指摘なし | e7537b1 でマージ |
| PR #4 第1回 | c724086 | Codex 1、Copilot 5 | `git --no-pager config core.hooksPath …`（Codex）。`env` の前置き・`x=$(…)`・空白を含むパスを渡した `git -C`、`git config --unset core.hooksPath .githooks`、単独の `&`、`git -c core.hooksPath=…`、引用符の中の `;` を区切りと見なす誤検出（Copilot） | 4593c68 |
| PR #4 第2回 | 4593c68 | Codex 3 | 二重引用符の中の `$(...)`、先頭のリダイレクト（`> /dev/null git config …`）、引用符の中の `>` を書き込み先と見なす誤検出 | e19ffa7 |
| PR #4 第3回 | e19ffa7 | Codex 1 | `bash <<'EOF'` の本文を調べていない | df38498 |
| PR #4 第4回 | df38498 | Codex 2 | 引用符の中の `<<EOF` を heredoc と見なして、後ろのコマンドを隠す。`env -u 名前 git …` で、オプションの値をコマンド名と取り違える | 92c2933 |
| PR #4 第5回 | 92c2933 | Codex 1 | 2つのコメントの中の引用符を、複数行にまたがる引用と読み違えて、間のコマンドを隠す | f257d23 |
| — | f257d23、84ee7f1 | レビューなし | — | b6b776e でマージ |

- Copilot がレビューしたのは、各PRの第1回（PRを開いたとき）だけ。Codex は第2回以降、オーナーのアカウントから「@codex review」とコメントして依頼した回に動いた。
- 指摘への返信は、オーナーのアカウントから Claude Code が書いた（返信の末尾に「Addressed by Claude Code」とある）。

## つまずいたことと教訓

### 作り直すたびに、前の版では止まっていた入力が通るようになった
- PR #4 第2回〜第5回の Codex の指摘は7件（抜け道6件、誤検出1件）。どれも、その回の作り直しで新しく起きたと指摘文に書いてある。
  - 抜け道6件のうち5件は「前の版（previous hook／parent revision）では止まっていた」、1件（第3回）は「新しい heredoc の前処理で抜け道が入った」。誤検出1件（第2回）は「前の版では通っていた」。
  - 指摘によれば、4593c68 で shlex にしたとき、`echo "$(git config core.hooksPath /dev/null)"` と `> /dev/null git config core.hooksPath /dev/null` が通るようになった。
  - 指摘によれば、e19ffa7 で入れた heredoc の前処理は、`bash <<'EOF'` の本文を調べずに捨てていた。
- 各コミットの試験は、どれもすべて通っていた（「確かめたこと」の表）。それでも次の回に、前の版との違いが指摘された。つまり、その入力は試験に入っていなかった。
- 次に解析の方式を替えるときは、替える前に、今の版で止まる入力と通る入力を `test_hooks.py` にそろえる。新しい版でも同じ結果になるのを確かめてから、レビューに出す。

### 引用符を考慮した解析の外で文字列を照合すると、そこが抜け道になった
- PR #4 第2回の3件目：`block_secrets.py` のリダイレクトの判定が元の文字列を照合していたため、`git commit -m "Document > .git/config redirection"` を止めた。
- PR #4 第4回の1件目：heredoc の正規表現の前処理が元の文字列にかかっていたため、引用符の中の `<<EOF` を heredoc と見なした。
- 次にシェルの構文（引用符、置換、リダイレクト、heredoc、コメント）を扱うときは、すべてを `split_commands()` の1回の読みの中で扱う。元の文字列への正規表現の照合を別に足さない。

### 抜け道を探し続けても終わらないので、防がないものを書いてマージした
- PR #4 では、字句解析にした後も、毎回1〜2件の指摘が出た。84ee7f1 で、hookが防げない経路を `.claude/rules/github.md` に書いた。新しい抜け道は別のIssueで扱うと決めて、ADR-0014 の「hookはセキュリティの境界ではない」に立ち返った。
- 次に補助の仕組み（hookなど）を作るときは、最初のPRの本文とルールに「何を防ぎ、何を防がないか」を書いてからレビューに出す。抜け道の指摘を受けたら、その一覧に照らして、直すか別のIssueにするかを分ける。

### 指摘の件数を、種類を分けずに数えていた
- KEEP-THINKING（2026-11-03 の節）には「main 保護hookの抜け道を9件見つけた」とある。PR #3 第1回の行ごとの指摘9件のうち1件は PRD の ADR 参照先の指摘で、hookの抜け道ではない。
- 次に指摘の件数を書くときは、抜け道・誤検出・文書の誤りに分けて数える。

## 確かめたこと
- `sh .claude/hooks/run-python.sh .claude/hooks/test_hooks.py`：147/147 PASS。確かめたのは 2026-11-03、ブランチ `docs/9-dev-logs`（hookは `main` と同じ）。環境は Windows 11（MINGW64_NT-10.0-26300）、Git Bash、Git 2.56.0.windows.4、Python 3.14.10。
- 各コミットの時点の試験の結果。各コミットの `docs/evidence.md` に記録された値で、今回は動かし直していない。

  | コミット | 結果 |
  |---|---|
  | 12bd3d8 | 63/63 PASS |
  | e5c8aad | 80/80 PASS |
  | c724086 | 87/87 PASS |
  | 4593c68 | 111/111 PASS |
  | e19ffa7 | 128/128 PASS |
  | df38498 | 135/135 PASS |
  | 92c2933 | 142/142 PASS |
  | f257d23 | 147/147 PASS |

- レビュー・指摘・返信は、`gh pr view <番号> --json reviews,comments` と `gh api "repos/{owner}/{repo}/pulls/<番号>/comments?per_page=100"` で確かめた。行ごとの指摘（返信を含む）は PR #3 が18件、PR #4 が26件で、どちらも1ページに収まっている。

## 推測
KEEP-THINKING（2026-11-03 の節）には「文字列の照合で抜け道を1つずつ塞ぐより、シェルの読み方に合わせるほうが指摘が減る」とある。これは指摘の件数では裏付けられなかった。

- PR #4 の行ごとの指摘は、6 → 3 → 1 → 2 → 1 件。第1回の6件のうち5件は Copilot で、Copilot は第2回以降レビューしていない。Codex だけで数えると 1 → 3 → 1 → 2 → 1 件で、減り続けてはいない。
- 字句解析にした e19ffa7 以降も毎回指摘があり、0件になる前にマージした（f257d23 はレビューを受けていない）。
- PR #3 では、コマンド単位の解析にした e5c8aad への Codex の指摘は0件だった。主張には合うが、1回だけで、Copilot は e5c8aad をレビューしていない。
- 言えそうなのは、指摘の中身が移ったこと（推測）。e19ffa7 より前は区切り・引用符・前置きの読み違えが中心だった。e19ffa7 以降は、作り直しで新しく書いた部分（heredoc、前置きのオプションの値、コメント）の読み違えになった。

## 残ること
- f257d23 と 84ee7f1 は、Codex のレビューを受けずにマージした。最後の Codex のレビューは 92c2933 に対するもの。Issueなし
- macOS での hook の試験（`docs/STATUS.md`「未着手」）。Issueなし
- GitHub の Ruleset の設定（`docs/STATUS.md`「未着手」）。Issueなし
- 上の3つは、Issueを立てるかをオーナーに聞く
