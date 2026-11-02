"""PreToolUse hook：[TODO-OWNER] マーカーの削除・書き換えを止める。

マーカーはオーナーが判断する箇所。Claude Codeは消さず、埋めず、内容も変えない。
exit 2 でツール呼び出しを止め、stderr の文面がClaudeに返る。
"""
import json
import re
import sys

from sonaguard import missing_markers, read_text, use_utf8_stdio

BASH_WRITE = re.compile(r"\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-\w*i|>|\btee\b|Set-Content|Out-File|-replace")
HARMLESS_REDIRECT = re.compile(r"\d?>\s*/dev/null|\d?>&\d|2>\$null")
GIT_COMMIT = re.compile(r"^\s*git\s+commit\b(?:(?!&&|\|\||;).)*$", re.S)


def block(why):
    print(f"BLOCKED（TODO-OWNER保護）: {why}", file=sys.stderr)
    print("このマーカーはオーナーが判断する箇所です。消したり埋めたりせず、作業を止めてオーナーに確認してください。",
          file=sys.stderr)
    sys.exit(2)


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}

    if tool == "Edit":
        edits = [ti]
    elif tool == "MultiEdit":
        edits = ti.get("edits") or []
    else:
        edits = []
    for e in edits:
        m = missing_markers(e.get("old_string"), e.get("new_string"))
        if m:
            block(f"この編集で消える・変わるマーカー: {' '.join(m)}")

    if tool == "Write":
        old = read_text(ti.get("file_path"))
        if old is not None:
            m = missing_markers(old, ti.get("content"))
            if m:
                block(f"上書きで消える・変わるマーカー: {' '.join(m)}")

    if tool in ("Bash", "PowerShell"):
        cmd = ti.get("command") or ""
        if "SONAQUEST_OWNER_APPROVED" in cmd:
            block("オーナー承認用の環境変数 SONAQUEST_OWNER_APPROVED はClaude Codeが使えません")
        # git commit はファイルを書き換えない（メッセージ中の語や > に反応しないようにする）。
        # マーカーが減るコミットはコミット前フックが止める。
        if "TODO-OWNER" in cmd and not GIT_COMMIT.match(cmd) and BASH_WRITE.search(HARMLESS_REDIRECT.sub("", cmd)):
            block("コマンドでマーカーを含むファイルを書き換えようとしています（sed -i、リダイレクト等）")


if __name__ == "__main__":
    main()
