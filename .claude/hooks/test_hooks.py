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


def hook(script, tool, tool_input, env=None):
    payload = json.dumps({"tool_name": tool, "tool_input": tool_input}, ensure_ascii=False).encode("utf-8")
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

    git("init", "-q")
    git("config", "core.hooksPath", ".githooks")
    write("a.md", "本文\n[TODO-OWNER: 判断待ち]\n")
    git("add", "-A")
    check("通常のコミット", 0, commit("最初のコミット")[0])

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
    check("マーカーを消すコミット", 1, commit("マーカー削除")[0])
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


def main():
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8")
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        claude_hook_tests(tmp)
        git_hook_tests(tmp)
    print(f"\n{sum(results)}/{len(results)} PASS")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
