"""PreToolUse hook：秘密情報とブロックリストの語が会話・ファイル・コミットに入るのを止める。

- .dev.vars / .env* / .claude/local/ などを読む・書く・コミットする操作
- APIキーの形をした値を書く・コマンドに含める操作
- .claude/local/blocklist.txt の語を書く操作（語そのものは表示しない）
- コミット前フックを迂回する操作（--no-verify、core.hooksPath の変更、.git/config・.git/hooks/ の書き換え）
- .git/ の下への書き込み（refs/・packed-refs・HEAD など。ローカルの main を直接書き換えさせない。Issue #30）
"""
import json
import re
import sys

from sonaguard import (SUBST, WRAPPERS, blocklist_hits, dynamic_name, git_invocation, load_blocklist, secret_hits,
                       sensitive_path, shell_reads_stdin, split_commands, use_utf8_stdio)

FILE_TOOLS = {"Read", "Edit", "MultiEdit", "Write", "NotebookEdit"}
HOOKS_KEY = "core.hookspath"  # gitの設定キーは大文字小文字を区別しない
# core.hooksPath に触れる git config のうち、許すのは読むことと .githooks への設定だけ
HOOKS_PATH_OK = [["--get", HOOKS_KEY], [HOOKS_KEY], ["get", HOOKS_KEY],
                 [HOOKS_KEY, ".githooks"], ["set", HOOKS_KEY, ".githooks"]]
GIT_CONFIG_ENV = re.compile(r"^(?:\$env:)?GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS|GLOBAL|SYSTEM)\b", re.I)
# .git/ の下（config・hooks/・refs/・packed-refs・HEAD・worktrees/ など）。読むのはよい（Issue #30）
GIT_INTERNAL = re.compile(r"(?:^|[/\\])\.git[/\\]")
GIT_INTERNAL_MSG = (".git/ の下（config・hooks/・refs/・packed-refs・HEAD など）は書き換えられません"
                    "（コミット前フックの設定とローカルの main を守るため。ADR-0024）。")
READ_ONLY = {"cat", "head", "tail", "less", "more", "grep", "rg", "type", "Get-Content", "ls", "stat", "git"}
# 秘密ファイルの名前が出てもよいコマンド（存在の確認と、雛形からのコピー）。コマンドを分けた各部分に当てる（Issue #290）
SAFE_SENSITIVE_NAMES = {"ls", "stat", "test", "["}
SAFE_SENSITIVE_GIT = {"status", "check-ignore"}
# 名前を見つけるための語の切り方（記号と空白で切る）
WORD_SPLIT = re.compile(r"[\s;|&()<>\"'`=]+")


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
            block(GIT_INTERNAL_MSG)
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


def names_sensitive(cmd, commands):
    """コマンドに秘密ファイルの名前が出るか（Issue #290）。
    - 元の文字列を記号で切った語（引用符の中の文字列や、Windows の \\ の区切りのパスも拾う）
    - 解析した語（引用符とバックスラッシュが外れている。名前の途中に引用符を置いた書き方を拾う）
    - 引用符とバックスラッシュを取り除いてから切った語（入力のリダイレクトの宛先は解析の結果に残らないため）"""
    words = WORD_SPLIT.split(cmd)
    words += WORD_SPLIT.split(re.sub(r"[\"'\\]", "", cmd))
    for assigns, toks, redirects in commands or []:
        words += toks + redirects + [a.split("=", 1)[1] for a in assigns]
    return any(sensitive_path(w) for w in words if w)


def safe_command(assigns, toks, redirects):
    """分けた1つのコマンドが、秘密ファイルを扱ってよい形か。"""
    if assigns or any(SUBST in w for w in toks + redirects):
        return False
    if any(sensitive_path(r) for r in redirects):  # ls の出力で秘密ファイルを上書きする形も止める
        return False
    if not toks:
        return False
    if toks[0] in SAFE_SENSITIVE_NAMES:
        return True
    # git の後にすぐ status・check-ignore が来るものだけ（-c・-C などで設定や場所を差し替えさせない）
    if toks[0] == "git" and len(toks) > 1 and toks[1] in SAFE_SENSITIVE_GIT:
        return True
    # cp は引数2つだけ。オプション（-t.example など）を雛形の名前と取り違えない
    return (toks[0] == "cp" and len(toks) == 3 and not any(t.startswith("-") for t in toks[1:])
            and toks[1].endswith(".example"))


def safe_sensitive_cmd(cmd, commands):
    """秘密ファイルの名前が出るコマンドを通してよいか。分けたコマンドがすべて安全な形のときだけ通す（Issue #290）。
    解析できないときと、前置きのコマンド（env・xargs・time など）があるときは通さない。前置きの値を取るオプションは、
    解析の結果に残らないため。入力のリダイレクト（<・<<・<<<・<(...)）があるときも通さない。宛先が解析の結果に残らず、
    git check-ignore --stdin のように標準入力の行をそのまま表示するものがあるため。"""
    if commands is None or "<" in cmd:
        return False
    if any(w.lower() in WRAPPERS for w in WORD_SPLIT.split(cmd) if w):
        return False
    return bool(commands) and all(safe_command(*c) for c in commands)


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
            block(GIT_INTERNAL_MSG)
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
        commands = split_commands(cmd)
        if names_sensitive(cmd, commands) and not safe_sensitive_cmd(cmd, commands):
            block("秘密情報・非公開ファイルを扱うコマンドです。中身の表示、コピー、git add はできません"
                  "（ls・stat・git check-ignore と、*.example からの cp は可）。")


if __name__ == "__main__":
    main()
