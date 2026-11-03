"""PreToolUse hook：[TODO-OWNER] マーカーの削除・書き換えを止める。

マーカーはオーナーが判断する箇所。Claude Codeは消さず、埋めず、内容も変えない。
例外（ADR-0024）：ローカルの main にあるそのファイルで、マーカーの直後の行に
「→ オーナー決定（YYYY-MM-DD、…）：」があるときは、Edit・Write での解除を通す。
決定の行を足すのと同時の解除や、作業ブランチで足しただけの決定の行では通さない。
コマンド（sed -i 等）での書き換えは、決定があっても止める。
exit 2 でツール呼び出しを止め、stderr の文面がClaudeに返る。
"""
import json
import re
import sys

from sonaguard import (decided_markers, decision_lines, lost_markers, main_text, read_text, undecided,
                       use_utf8_stdio)

BASH_WRITE = re.compile(r"\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-\w*i|>|\btee\b|Set-Content|Out-File|-replace")
HARMLESS_REDIRECT = re.compile(r"\d?>\s*/dev/null|\d?>&\d|2>\$null")
GIT_COMMIT = re.compile(r"^\s*git\s+commit\b(?:(?!&&|\|\||;).)*$", re.S)


def block(why):
    print(f"BLOCKED（TODO-OWNER保護）: {why}", file=sys.stderr)
    print("このマーカーはオーナーが判断する箇所です。消したり埋めたりせず、作業を止めてオーナーに確認してください。"
          "\n解除できるのは、main にあるそのファイルで、マーカーの直後の行に「→ オーナー決定（YYYY-MM-DD、…）：」が"
          "あるマーカーだけです（ADR-0024）。", file=sys.stderr)
    sys.exit(2)


def check_lost(path, old, new, what):
    lost = lost_markers(old, new)
    if not lost:
        return
    bad = undecided(lost, decided_markers(main_text(path)))
    if bad:
        block(f"{what}で消える・変わるマーカー: {' '.join(bad)}")
    # 解除しても、決定の行は記録として残す
    kept = set(decision_lines(new))
    if any(d not in kept for d in decision_lines(old)):
        block(f"{what}で、マーカーと一緒にオーナーの決定の行が消えます。決定の行は残してください")


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
        check_lost(ti.get("file_path"), e.get("old_string"), e.get("new_string"), "この編集")

    if tool == "Write":
        old = read_text(ti.get("file_path"))
        if old is not None:
            check_lost(ti.get("file_path"), old, ti.get("content"), "上書き")

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
