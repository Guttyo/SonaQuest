"""hookの動作試験。実行: sh .claude/hooks/run-python.sh .claude/hooks/test_hooks.py

Claude Codeのhookには実際と同じ形のJSONを渡し、終了コードを確かめる。
gitのフックは一時ディレクトリに作った使い捨てリポジトリで確かめる。
秘密情報の形をした値は、このファイルを検査に引っかけないよう実行時に組み立てる。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HOOKS = Path(__file__).resolve().parent
ROOT = HOOKS.parents[1]
PY = sys.executable
FAKE_ANTHROPIC = "sk-" + "ant-api03-" + "A" * 32
FAKE_ELEVEN = "sk_" + "0123456789abcdef" * 3
TERM = "架空商事" + "テスト"  # ブロックリストの試験用の架空の語

results = []


def check(name, expected, actual, detail=""):
    ok = expected == actual
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}  (期待 {expected} / 実際 {actual}){'  ' + detail if not ok else ''}")


def hook(script, tool, tool_input, env=None, extra=None):
    payload = json.dumps({"tool_name": tool, "tool_input": tool_input, **(extra or {})},
                         ensure_ascii=False).encode("utf-8")
    p = subprocess.run([PY, str(HOOKS / script)], input=payload, capture_output=True,
                       env={**os.environ, **(env or {})})
    return p.returncode, p.stderr.decode("utf-8", "replace")


def claude_hook_tests(tmp):
    P, S = "protect_todo_owner.py", "block_secrets.py"
    m1, m2 = "[TODO-OWNER: 緊急時の文面]", "[TODO-OWNER]"
    doc = tmp / "doc.md"
    doc.write_text(f"本文\n{m1}\n{m2}\n", encoding="utf-8")

    print("--- TODO-OWNER保護（Claude Code hook）")
    check("Edit: マーカーを消す", 2, hook(P, "Edit", {"file_path": str(doc), "old_string": f"本文\n{m1}", "new_string": "本文\n緊急時は119へ"})[0])
    check("Edit: マーカーの内容を書き換える", 2, hook(P, "Edit", {"file_path": str(doc), "old_string": m1, "new_string": "[TODO-OWNER: 決定済み]"})[0])
    check("Edit: マーカーを残して周りを直す", 0, hook(P, "Edit", {"file_path": str(doc), "old_string": f"本文\n{m1}", "new_string": f"本文を直した\n{m1}"})[0])
    check("Edit: マーカーと無関係な編集", 0, hook(P, "Edit", {"file_path": str(doc), "old_string": "本文", "new_string": "本文2"})[0])
    check("MultiEdit: 2つ目の編集で消す", 2, hook(P, "MultiEdit", {"file_path": str(doc), "edits": [
        {"old_string": "本文", "new_string": "本文2"}, {"old_string": m2, "new_string": ""}]})[0])
    check("Write: 上書きでマーカーが減る", 2, hook(P, "Write", {"file_path": str(doc), "content": f"本文\n{m1}\n"})[0])
    check("Write: マーカーを保った上書き", 0, hook(P, "Write", {"file_path": str(doc), "content": f"新しい本文\n{m2}\n{m1}\n"})[0])
    check("Write: 新規ファイル", 0, hook(P, "Write", {"file_path": str(tmp / "new.md"), "content": "新規\n"})[0])
    check("Bash: sed -i でマーカーを消す", 2, hook(P, "Bash", {"command": "sed -i 's/\\[TODO-OWNER[^]]*\\]//g' docs/PRD.md"})[0])
    check("Bash: マーカーを検索するだけ", 0, hook(P, "Bash", {"command": "grep -rn 'TODO-OWNER' docs 2>/dev/null | head"})[0])
    check("Bash: メッセージにマーカー名と > を含む git commit", 0, hook(P, "Bash", {"command": "git commit -q -F - <<'EOF'\nTODO-OWNERマーカーの保護\n\nCo-Authored-By: X <x@example.invalid>\nEOF"})[0])
    check("Bash: git commit の後に書き換えをつなぐ", 2, hook(P, "Bash", {"command": "git commit -m x && sed -i 's/TODO-OWNER//' a.md"})[0])
    check("Bash: オーナー承認の環境変数を使う", 2, hook(P, "Bash", {"command": "SONAQUEST_OWNER_APPROVED=1 git commit -m x"})[0])

    print("--- 秘密情報の保護（Claude Code hook）")
    check("Read: .dev.vars", 2, hook(S, "Read", {"file_path": str(ROOT / ".dev.vars")})[0])
    check("Read: .dev.vars.example", 0, hook(S, "Read", {"file_path": str(ROOT / ".dev.vars.example")})[0])
    check("Read: .env.local", 2, hook(S, "Read", {"file_path": "C:\\x\\.env.local"})[0])
    check("Read: .claude/local/blocklist.txt", 2, hook(S, "Read", {"file_path": str(ROOT / ".claude" / "local" / "blocklist.txt")})[0])
    check("Read: 通常のファイル", 0, hook(S, "Read", {"file_path": str(ROOT / "README.md")})[0])
    check("Write: .dev.vars に書く", 2, hook(S, "Write", {"file_path": str(ROOT / ".dev.vars"), "content": "A=1"})[0])
    check("Write: APIキーの値を書く", 2, hook(S, "Write", {"file_path": str(tmp / "a.ts"), "content": f"const k = '{FAKE_ANTHROPIC}'"})[0])
    check("Edit: ElevenLabsキーの値を書く", 2, hook(S, "Edit", {"file_path": str(tmp / "a.ts"), "old_string": "x", "new_string": FAKE_ELEVEN})[0])
    check("Write: 代入形式の秘密情報", 2, hook(S, "Write", {"file_path": str(tmp / "b.toml"), "content": "ANTHROPIC_API_KEY = \"abcdefghijklmnopqrstu\""})[0])
    check("Write: 空の雛形（.dev.vars.example 相当）", 0, hook(S, "Write", {"file_path": str(tmp / "c.example"), "content": "ANTHROPIC_API_KEY=\nELEVENLABS_API_KEY=\n"})[0])
    check("Write: 通常の内容", 0, hook(S, "Write", {"file_path": str(tmp / "d.md"), "content": "普通の文書"})[0])
    check("Bash: cat .dev.vars", 2, hook(S, "Bash", {"command": "cat .dev.vars"})[0])
    check("Bash: git add -f .env", 2, hook(S, "Bash", {"command": "git add -f .env"})[0])
    check("PowerShell: Get-Content .dev.vars", 2, hook(S, "PowerShell", {"command": "Get-Content .dev.vars"})[0])
    check("Bash: ls -la .dev.vars", 0, hook(S, "Bash", {"command": "ls -la .dev.vars"})[0])
    check("Bash: cp .dev.vars.example .dev.vars", 0, hook(S, "Bash", {"command": "cp .dev.vars.example .dev.vars"})[0])
    check("Bash: キーをコマンドに含める", 2, hook(S, "Bash", {"command": f"curl -H 'x-api-key: {FAKE_ANTHROPIC}' https://example.invalid"})[0])
    check("Bash: git commit --no-verify", 2, hook(S, "Bash", {"command": "git commit --no-verify -m x"})[0])
    check("Bash: core.hooksPath を外す", 2, hook(S, "Bash", {"command": "git config core.hooksPath /dev/null"})[0])
    check("Bash: core.hooksPath を .githooks に設定", 0, hook(S, "Bash", {"command": "git config core.hooksPath .githooks"})[0])
    check("Bash: core.hooksPath を読む && 別のコマンド", 0, hook(S, "Bash", {"command": "git config --get core.hooksPath; git status"})[0])
    check("Bash: core.hooksPath を .githooks に設定 && 別のコマンド", 0, hook(S, "Bash", {"command": "git config core.hooksPath .githooks && git status"})[0])
    check("Bash: 別のコマンド && core.hooksPath を外す", 2, hook(S, "Bash", {"command": "git status && git config core.hooksPath /dev/null"})[0])
    check("Bash: core.hooksPath を .githooks2 に設定", 2, hook(S, "Bash", {"command": "git config core.hooksPath .githooks2"})[0])
    check("Bash: core.hooksPath を消す", 2, hook(S, "Bash", {"command": "git config --unset core.hooksPath"})[0])
    # PR #4 のレビューで指摘された抜け道と誤検出
    for name, cmd in [
        ("git --no-pager config で hooksPath を外す", "git --no-pager config core.hooksPath /dev/null"),
        ("$(...) の中で hooksPath を外す", "x=$(git config core.hooksPath /dev/null)"),
        ("env を前置きして hooksPath を外す", "env git config core.hooksPath /dev/null"),
        ("git -C \"空白入りのパス\" で hooksPath を外す", 'git -C "path with spaces" config core.hooksPath /dev/null'),
        ("--unset core.hooksPath .githooks", "git config --unset core.hooksPath .githooks"),
        ("単独の & の後で hooksPath を外す", "git status & git config core.hooksPath /dev/null"),
        ("git -c core.hooksPath=… でコミット", "git -c core.hooksPath=/dev/null commit -m x"),
        ("git --config-env=core.hooksPath=…", "git --config-env=core.hooksPath=X commit -m x"),
        ("GIT_CONFIG_* の環境変数", "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x"),
        ("キーの大文字小文字を変える", "git config core.HooksPath /dev/null"),
        ("git config --edit", "git config --edit"),
        (".git/config へ追記", "echo '[core] hooksPath=/dev/null' >> .git/config"),
        ("cat のリダイレクトで .git/config を上書き", "cat x > .git/config"),
        (".git/hooks/ へコピー", "cp x .git/hooks/pre-commit"),
        # 2回目のレビュー
        ("二重引用符の中の $(...) で hooksPath を外す", 'echo "$(git config core.hooksPath /dev/null)"'),
        ("二重引用符の中の `...` で hooksPath を外す", 'echo "`git config core.hooksPath /dev/null`"'),
        ("先頭のリダイレクトの後で hooksPath を外す", "> /dev/null git config core.hooksPath /dev/null"),
        ("2>&1 の後で hooksPath を外す", "git status 2>&1 ; git config core.hooksPath /dev/null"),
        ("引用符なしの heredoc 本文の $(...)", "cat <<EOF\n$(git config core.hooksPath /dev/null)\nEOF"),
        ("bash -c で hooksPath を外す", 'bash -c "git config core.hooksPath /dev/null"'),
        ("eval で hooksPath を外す", "eval git config core.hooksPath /dev/null"),
        ("{ } の中で hooksPath を外す", "{ git config core.hooksPath /dev/null; }"),
        ("コマンド名を置換で作る", "$(echo git) config core.hooksPath /dev/null"),
        ("引用符付きのリダイレクト先 .git/config", 'echo x > ".git/config"'),
        # 3回目のレビュー
        ("bash に heredoc で渡す", "bash <<'EOF'\ngit config core.hooksPath /dev/null\nEOF"),
        ("sh に heredoc（引用符なし）で渡す", "sh <<EOF\ngit config core.hooksPath /dev/null\nEOF"),
        ("cat の heredoc をパイプで bash へ", "cat <<'EOF' | bash\ngit config core.hooksPath /dev/null\nEOF"),
        ("bash にヒア文字列で渡す", "bash <<< 'git config core.hooksPath /dev/null'"),
        ("echo をパイプで bash へ", "echo 'git config core.hooksPath /dev/null' | bash"),
        # 4回目のレビュー
        ("引用符の中の <<EOF の後で hooksPath を外す", 'echo "<<EOF"\ngit config core.hooksPath /dev/null\nEOF\ntrue'),
        ("env -u 名前 の後で hooksPath を外す", "env -u UNUSED git config core.hooksPath /dev/null"),
        ("env -S で hooksPath を外す", 'env -S "git config core.hooksPath /dev/null"'),
        ("sudo -u ユーザー の後で hooksPath を外す", "sudo -u root git config core.hooksPath /dev/null"),
        ("heredoc 2つの後で hooksPath を外す", "cat <<A <<B\na\nA\nb\nB\ngit config core.hooksPath /dev/null"),
    ]:
        check(f"Bash: {name}", 2, hook(S, "Bash", {"command": cmd})[0])
    for name, cmd in [
        ("引用符の中の ; と git config", 'git commit -m "fix; git config core.hooksPath の判定を修正"'),
        ("hooksPath を読む（リダイレクト付き）", "git config --get core.hooksPath 2>/dev/null"),
        ("git config set core.hooksPath .githooks", "git config set core.hooksPath .githooks"),
        (".git/config を読む", "cat .git/config"),
        ("メッセージ中の > .git/config", 'git commit -m "Document > .git/config redirection"'),
        ("単一引用符の中の $(...)", "echo '$(git config core.hooksPath /dev/null)'"),
        ("heredoc のコミットメッセージ（$(cat <<'EOF'...)）", "git commit -m \"$(cat <<'EOF'\n修正; git config core.hooksPath /dev/null\nEOF\n)\""),
    ]:
        check(f"Bash: {name}", 0, hook(S, "Bash", {"command": cmd})[0])
    check("Edit: .git/config を編集", 2, hook(S, "Edit", {"file_path": str(ROOT / ".git" / "config"), "old_string": "a", "new_string": "b"})[0])
    check("Bash: コミットメッセージの文中に core.hooksPath", 0, hook(S, "Bash", {"command": "git commit -q -F - <<'EOF'\n修正\n\n- core.hooksPath の判定を直した\nEOF"})[0])
    check("Bash: 通常のコマンド", 0, hook(S, "Bash", {"command": "git status && ls docs"})[0])

    print("--- ブロックリスト（Claude Code hook）")
    bl = tmp / "blocklist.txt"
    bl.write_text(f"# コメント\n\n{TERM}\n", encoding="utf-8")
    env = {"SONAQUEST_BLOCKLIST": str(bl)}
    code, err = hook(S, "Write", {"file_path": str(tmp / "e.md"), "content": f"所属は{TERM}です"}, env)
    check("Write: ブロックリストの語を書く", 2, code)
    check("  止めたときに語そのものを表示しない", True, TERM not in err)
    check("Write: 語を含まない内容", 0, hook(S, "Write", {"file_path": str(tmp / "e.md"), "content": "普通の文書"}, env)[0])
    check("Write: ブロックリストが無くても動く", 0, hook(S, "Write", {"file_path": str(tmp / "e.md"), "content": f"所属は{TERM}"},
                                                {"SONAQUEST_BLOCKLIST": str(tmp / "none.txt")})[0])


def github_hook_tests():
    G = "guard_github.py"
    on_main, on_work = {"_test_branch": "main"}, {"_test_branch": "docs/1-x"}
    print("--- main・GitHubの保護（Claude Code hook）")
    check("Bash: git push --force", 2, hook(G, "Bash", {"command": "git push --force origin docs/1-x"}, extra=on_work)[0])
    check("Bash: git push -f", 2, hook(G, "Bash", {"command": "git push -f"}, extra=on_work)[0])
    check("Bash: main へpush", 2, hook(G, "Bash", {"command": "git push origin main"}, extra=on_work)[0])
    check("Bash: 作業ブランチをpush", 0, hook(G, "Bash", {"command": "git push -u origin docs/1-x"}, extra=on_work)[0])
    check("Bash: main を削除", 2, hook(G, "Bash", {"command": "git branch -D main"}, extra=on_work)[0])
    check("Bash: gh pr merge", 2, hook(G, "Bash", {"command": "gh pr merge 3 --squash"}, extra=on_work)[0])
    check("Bash: 保護設定を変更", 2, hook(G, "Bash", {"command": "gh api -X PUT repos/o/r/branches/main/protection"}, extra=on_work)[0])
    check("Bash: 保護設定を読むだけ", 0, hook(G, "Bash", {"command": "gh api repos/o/r/rulesets"}, extra=on_work)[0])
    check("Bash: main にいてコミット", 2, hook(G, "Bash", {"command": "git commit -m x"}, extra=on_main)[0])
    check("Bash: main にいてマージ", 2, hook(G, "Bash", {"command": "git merge docs/1-x"}, extra=on_main)[0])
    check("Bash: main から作業ブランチを作る", 0, hook(G, "Bash", {"command": "git switch -c docs/2-y"}, extra=on_main)[0])
    check("Bash: main で pull --ff-only", 0, hook(G, "Bash", {"command": "git pull --ff-only"}, extra=on_main)[0])
    check("Bash: 作業ブランチでコミット", 0, hook(G, "Bash", {"command": "git commit -m x"}, extra=on_work)[0])
    # PR #3 のレビューで指摘された抜け道
    check("Bash: git push -uf（短縮オプションの結合）", 2, hook(G, "Bash", {"command": "git push -uf origin docs/1-x"}, extra=on_work)[0])
    check("Bash: +refspec での force push", 2, hook(G, "Bash", {"command": "git push origin +docs/1-x"}, extra=on_work)[0])
    check("Bash: HEAD:refs/heads/main へpush", 2, hook(G, "Bash", {"command": "git push origin HEAD:refs/heads/main"}, extra=on_work)[0])
    check("Bash: refs/heads/work:refs/heads/main へpush", 2, hook(G, "Bash", {"command": "git push origin refs/heads/work:refs/heads/main"}, extra=on_work)[0])
    check("Bash: :main でリモートの main を削除", 2, hook(G, "Bash", {"command": "git push origin :main"}, extra=on_work)[0])
    check("Bash: main 上で宛先を省いた git push", 2, hook(G, "Bash", {"command": "git push"}, extra=on_main)[0])
    check("Bash: main 上で git push origin HEAD", 2, hook(G, "Bash", {"command": "git push origin HEAD"}, extra=on_main)[0])
    check("Bash: git push --all", 2, hook(G, "Bash", {"command": "git push --all origin"}, extra=on_work)[0])
    check("Bash: 作業ブランチ上で宛先を省いた git push", 0, hook(G, "Bash", {"command": "git push"}, extra=on_work)[0])
    check("Bash: 作業ブランチ上で git push origin HEAD", 0, hook(G, "Bash", {"command": "git push origin HEAD"}, extra=on_work)[0])
    check("Bash: gh api --method=PUT で保護設定", 2, hook(G, "Bash", {"command": "gh api --method=PUT repos/o/r/branches/main/protection"}, extra=on_work)[0])
    check("Bash: gh api -f でRulesetを作る（暗黙のPOST）", 2, hook(G, "Bash", {"command": "gh api repos/o/r/rulesets -f name=x"}, extra=on_work)[0])
    check("Bash: main 上で commit && switch -c", 2, hook(G, "Bash", {"command": "git commit -m x && git switch -c docs/2-y"}, extra=on_main)[0])
    check("Bash: main 上で switch -c && commit", 0, hook(G, "Bash", {"command": "git switch -c docs/2-y && git commit -m x"}, extra=on_main)[0])
    check("Bash: 作業ブランチから checkout main && merge", 2, hook(G, "Bash", {"command": "git checkout main && git merge docs/1-x"}, extra=on_work)[0])
    check("Bash: git branch --delete main", 2, hook(G, "Bash", {"command": "git branch --delete main"}, extra=on_work)[0])
    # 共通のコマンド分解に変えたことで塞いだもの・誤検出しないもの
    check("Bash: env を前置きして main へpush", 2, hook(G, "Bash", {"command": "env git push origin main"}, extra=on_work)[0])
    check("Bash: $(...) の中で main へpush", 2, hook(G, "Bash", {"command": "x=$(git push origin main)"}, extra=on_work)[0])
    check("Bash: 単独の & の後で force push", 2, hook(G, "Bash", {"command": "git status & git push --force"}, extra=on_work)[0])
    check("Bash: git --no-pager push origin main", 2, hook(G, "Bash", {"command": "git --no-pager push origin main"}, extra=on_work)[0])
    check("Bash: メッセージ中の ; と push の文字", 0, hook(G, "Bash", {"command": 'git commit -m "a; git push origin main"'}, extra=on_work)[0])
    check("Bash: main 上で fast-forward になる git merge", 2, hook(G, "Bash", {"command": "git merge --ff-only docs/1-x"}, extra=on_main)[0])
    check("Bash: 二重引用符の中の $(...) で main へpush", 2, hook(G, "Bash", {"command": 'echo "$(git push origin main)"'}, extra=on_work)[0])
    check("Bash: 先頭のリダイレクトの後で main へpush", 2, hook(G, "Bash", {"command": "> /dev/null git push origin main"}, extra=on_work)[0])
    check("Bash: コマンド名を変数にして main へpush", 2, hook(G, "Bash", {"command": "$G push origin main"}, extra=on_work)[0])
    check("Bash: bash に heredoc で main へpush", 2, hook(G, "Bash", {"command": "bash <<'EOF'\ngit push origin main\nEOF"}, extra=on_work)[0])
    check("Bash: コミットメッセージの heredoc に push の文字", 0, hook(G, "Bash", {"command": "git commit -F - <<'EOF'\ngit push origin main を止める\nEOF"}, extra=on_work)[0])
    check("Bash: env -u 名前 の後で main へpush", 2, hook(G, "Bash", {"command": "env -u X git push origin main"}, extra=on_work)[0])
    check("Bash: 本文に ) と \" を含むコミットメッセージ", 0, hook(G, "Bash", {"command": "git commit -m \"$(cat <<'EOF'\n修正) \"; git push origin main\nEOF\n)\""}, extra=on_work)[0])
    check("Bash: 2>&1 付きの作業ブランチのpush", 0, hook(G, "Bash", {"command": "git push -u origin docs/1-x 2>&1"}, extra=on_work)[0])


def git_hook_tests(tmp):
    print("--- gitのコミット前フック（使い捨てリポジトリ）")
    repo = tmp / "repo"
    repo.mkdir()
    shutil.copytree(ROOT / ".githooks", repo / ".githooks")
    (repo / ".claude" / "hooks").mkdir(parents=True)
    for f in ("sonaguard.py", "run-python.sh"):
        shutil.copy(HOOKS / f, repo / ".claude" / "hooks" / f)
    base_env = {**os.environ, "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "test@example.invalid",
                "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "test@example.invalid"}
    base_env.pop("SONAQUEST_OWNER_APPROVED", None)

    def git(*args, env=None):
        p = subprocess.run(["git", *args], cwd=repo, capture_output=True, env={**base_env, **(env or {})})
        return p.returncode, p.stderr.decode("utf-8", "replace")

    def commit(msg, env=None):
        return git("commit", "-q", "-m", msg, env=env)

    def write(name, text):
        (repo / name).write_text(text, encoding="utf-8")

    git("init", "-q", "-b", "main")
    git("config", "core.hooksPath", ".githooks")
    write("a.md", "本文\n[TODO-OWNER: 判断待ち]\n")
    git("add", "-A")
    check("main へのコミット", 1, commit("main に直接")[0])
    git("switch", "-q", "-c", "work")
    check("作業ブランチでの通常のコミット", 0, commit("最初のコミット")[0])
    git("branch", "-f", "main", "work")

    write(".dev.vars", "X=1\n")
    git("add", "-f", ".dev.vars")
    check(".dev.vars のコミット", 1, commit("秘密")[0])
    git("rm", "-q", "--cached", ".dev.vars")
    (repo / ".dev.vars").unlink()

    write("k.ts", f"const k = '{FAKE_ANTHROPIC}'\n")
    git("add", "k.ts")
    check("APIキーを含む行のコミット", 1, commit("キー")[0])
    git("rm", "-q", "--cached", "k.ts")
    (repo / "k.ts").unlink()

    write("a.md", "本文\n")
    git("add", "a.md")
    code, err = commit("マーカー削除")
    check("マーカーを消すコミット", 1, code)
    check("  案内にPowerShellの書き方がある", True, "$env:SONAQUEST_OWNER_APPROVED" in err)
    check("マーカーを消すコミット（オーナー承認あり）", 0, commit("マーカー削除", env={"SONAQUEST_OWNER_APPROVED": "1"})[0])

    bl = tmp / "blocklist-git.txt"
    bl.write_text(TERM + "\n", encoding="utf-8")
    env = {"SONAQUEST_BLOCKLIST": str(bl)}
    write("b.md", f"所属：{TERM}\n")
    git("add", "b.md")
    code, err = commit("所属", env=env)
    check("ブロックリストの語を含む行のコミット", 1, code)
    check("  止めたときに語そのものを表示しない", True, TERM not in err)
    check("ブロックリストが無いときは通る", 0, commit("所属", env={"SONAQUEST_BLOCKLIST": str(tmp / "none.txt")})[0])

    write("c.md", "普通の文書\n")
    git("add", "c.md")
    check("メッセージにブロックリストの語", 1, commit(f"{TERM}の件", env=env)[0])
    check("メッセージが普通なら通る", 0, commit("文書を追加", env=env)[0])

    git("switch", "-q", "main")
    check("main へのマージコミット", True, git("merge", "-q", "--no-ff", "-m", "マージ", "work")[0] != 0)
    git("merge", "--abort")


def main():
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        claude_hook_tests(tmp)
        github_hook_tests()
        git_hook_tests(tmp)
    print(f"\n{sum(results)}/{len(results)} PASS")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
