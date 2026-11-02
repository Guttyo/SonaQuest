"""PreToolUse hook：秘密情報とブロックリストの語が会話・ファイル・コミットに入るのを止める。

- .dev.vars / .env* / .claude/local/ などを読む・書く・コミットする操作
- APIキーの形をした値を書く・コマンドに含める操作
- .claude/local/blocklist.txt の語を書く操作（語そのものは表示しない）
- コミット前フックを迂回する操作（--no-verify、core.hooksPath の変更、.git/config・.git/hooks/ の書き換え）
"""
import json
import re
import sys

from sonaguard import (blocklist_hits, dynamic_name, git_invocation, load_blocklist, secret_hits,
                       sensitive_path, shell_reads_stdin, split_commands, use_utf8_stdio)

FILE_TOOLS = {"Read", "Edit", "MultiEdit", "Write", "NotebookEdit"}
HOOKS_KEY = "core.hookspath"  # gitの設定キーは大文字小文字を区別しない
# core.hooksPath に触れる git config のうち、許すのは読むことと .githooks への設定だけ
HOOKS_PATH_OK = [["--get", HOOKS_KEY], [HOOKS_KEY], ["get", HOOKS_KEY],
                 [HOOKS_KEY, ".githooks"], ["set", HOOKS_KEY, ".githooks"]]
GIT_CONFIG_ENV = re.compile(r"^(?:\$env:)?GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)\b", re.I)
GIT_INTERNAL = re.compile(r"(?:^|[/\\])\.git[/\\](?:config$|hooks[/\\])")
READ_ONLY = {"cat", "head", "tail", "less", "more", "grep", "rg", "type", "Get-Content", "ls", "stat", "git"}
SAFE_SENSITIVE_CMD = [
    re.compile(r"^\s*(?:ls|stat|test|\[|git\s+(?:status|check-ignore))\b[^;|&]*$"),
    re.compile(r"^\s*cp\s+\S*\.example\s+\S+\s*$"),
]


def block(why):
    print(f"BLOCKED（秘密情報・公開情報の保護）: {why}", file=sys.stderr)
    sys.exit(2)


def check_text(text, where):
    if not text:
        return
    s = secret_hits(text)
    if s:
        block(f"{where}に秘密情報らしき値があります（{'、'.join(s)}）。"
              "値はWorkersのsecretsか .dev.vars に置き、オーナーが入力してください。")
    h = blocklist_hits(text, load_blocklist())
    if h:
        block(f"{where}にブロックリストの語（{'、'.join(f'{i}番目' for i in h)}）が含まれます。公開リポジトリに書けない語です。")


def hooks_path_ok(args):
    a = [x.lower() if x.lower() == HOOKS_KEY else x for x in args]
    if a[:1] == ["--local"]:
        a = a[1:]
    return a in HOOKS_PATH_OK


def check_hooks_bypass(cmd):
    """コミット前フックを無効にする操作を、引用符を考慮して1コマンドずつ調べる。"""
    commands = split_commands(cmd)
    if commands is None:
        if "hookspath" in cmd.lower() or ".git/config" in cmd:
            block("コマンドを解析できず、コミット前フックの設定に触れている可能性があります。分けて実行してください。")
        return
    for assigns, toks, redirects in commands:
        if any(GIT_CONFIG_ENV.match(t) for t in assigns + toks):
            block("GIT_CONFIG_* の環境変数で git の設定を差し替える操作はできません。")
        writes = toks and toks[0] not in READ_ONLY
        if (writes and any(GIT_INTERNAL.search(t) for t in toks)) or any(GIT_INTERNAL.search(r) for r in redirects):
            block(".git/config と .git/hooks/ は書き換えられません。")
        if dynamic_name(toks) and any(HOOKS_KEY in t.lower() for t in toks):
            block("コマンド名が変数・置換で決まるため、core.hooksPath に触れる操作か判定できません。")
        if shell_reads_stdin(toks) and HOOKS_KEY in cmd.lower():
            block("シェルに標準入力でスクリプトを渡すと、core.hooksPath に触れる操作か判定できません。")
        g = git_invocation(toks)
        if not g:
            continue
        if any(c.lower().startswith(HOOKS_KEY) for c in g["configs"]):
            block("git -c core.hooksPath=… でコミット前フックを外す操作はできません。")
        if g["sub"] == "config":
            args = g["args"]
            if any(x in ("-e", "--edit") for x in args):
                block("git config --edit はできません（core.hooksPath を変えられるため）。")
            if any(HOOKS_KEY in x.lower() for x in args) and not hooks_path_ok(args):
                block("core.hooksPath は読むことと .githooks への設定だけができます（--unset などは不可）。")


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}

    if tool in FILE_TOOLS:
        p = ti.get("file_path") or ti.get("notebook_path")
        if sensitive_path(p):
            block(f"{p} は秘密情報・非公開ファイルです。中身を読んだり書いたりしないでください（存在確認は ls で）。")
        if tool != "Read" and p and GIT_INTERNAL.search(p):
            block(".git/config と .git/hooks/ は書き換えられません。")
        check_text(ti.get("content"), "書き込む内容")
        check_text(ti.get("new_string"), "編集後の内容")
        check_text(ti.get("new_source"), "編集後の内容")
        for e in ti.get("edits") or []:
            check_text(e.get("new_string"), "編集後の内容")

    elif tool == "Grep":
        if sensitive_path(ti.get("path")):
            block(f"{ti.get('path')} は秘密情報・非公開ファイルです。")

    elif tool in ("Bash", "PowerShell"):
        cmd = ti.get("command") or ""
        check_text(cmd, "コマンド")
        if re.search(r"\bgit\b.*--no-verify", cmd, re.S):
            block("--no-verify はコミット前の検査を迂回するので使えません。")
        check_hooks_bypass(cmd)
        # 秘密ファイルの名前がコマンドに出る場合、存在確認と雛形からのコピーだけ通す。
        tokens = [t for t in re.split(r"[\s;|&()<>\"'`=]+", cmd) if t]
        if any(sensitive_path(t) for t in tokens) and not any(p.search(cmd) for p in SAFE_SENSITIVE_CMD):
            block("秘密情報・非公開ファイルを扱うコマンドです。中身の表示、コピー、git add はできません"
                  "（ls・stat・git check-ignore と、*.example からの cp は可）。")


if __name__ == "__main__":
    main()
