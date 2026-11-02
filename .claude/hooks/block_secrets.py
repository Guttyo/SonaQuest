"""PreToolUse hook：秘密情報とブロックリストの語が会話・ファイル・コミットに入るのを止める。

- .dev.vars / .env* / .claude/local/ などを読む・書く・コミットする操作
- APIキーの形をした値を書く・コマンドに含める操作
- .claude/local/blocklist.txt の語を書く操作（語そのものは表示しない）
- コミット前フックを迂回する操作（--no-verify、core.hooksPath の変更）
"""
import json
import re
import sys

from sonaguard import blocklist_hits, load_blocklist, secret_hits, sensitive_path, use_utf8_stdio

FILE_TOOLS = {"Read", "Edit", "MultiEdit", "Write", "NotebookEdit"}
GIT_CONFIG = re.compile(r"^\s*git\s+(?:-C\s+\S+\s+)?config\b")
HOOKS_PATH_OK = re.compile(
    r"config\s+(?:--(?:local|global)\s+)?(?:--get\s+core\.hooksPath|core\.hooksPath)\s*$"
    r"|core\.hooksPath[\"'\s]+\.githooks[\"']?\s*$")
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
        # 区切り（&& ; | など）ごとに見る。git config の読むだけ（--get、値なし）と .githooks への設定だけ通す。
        # コミットメッセージなどの文中に出てくる語には反応しない。
        for seg in re.split(r"&&|\|\||;|\||\n", cmd):
            if GIT_CONFIG.search(seg) and "core.hooksPath" in seg and not HOOKS_PATH_OK.search(seg):
                block("core.hooksPath は .githooks 以外に変えられません。")
        # 秘密ファイルの名前がコマンドに出る場合、存在確認と雛形からのコピーだけ通す。
        tokens = [t for t in re.split(r"[\s;|&()<>\"'`=]+", cmd) if t]
        if any(sensitive_path(t) for t in tokens) and not any(p.search(cmd) for p in SAFE_SENSITIVE_CMD):
            block("秘密情報・非公開ファイルを扱うコマンドです。中身の表示、コピー、git add はできません"
                  "（ls・stat・git check-ignore と、*.example からの cp は可）。")


if __name__ == "__main__":
    main()
