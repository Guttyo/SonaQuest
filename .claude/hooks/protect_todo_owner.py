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

from sonaguard import (main_text, marker_counts, marker_shortfall, missing_decisions, read_text,
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


def check_lost(main, current, result, what):
    """current → result でマーカーが減るなら、main で決定の行が付いたものだけかを確かめる。"""
    res_n = marker_counts(result)
    if all(res_n.get(m, 0) >= n for m, n in marker_counts(current).items()):
        return
    short = marker_shortfall(main, current, result)
    if short:
        block(f"{what}で消える・変わるマーカー: {' '.join(sorted(short))}")
    # 解除しても、決定の行は記録として残す
    if missing_decisions(main, result):
        block(f"{what}で、マーカーと一緒にオーナーの決定の行が消えます。決定の行は残してください")


def apply_edits(text, edits):
    """Edit・MultiEdit を適用した後のファイル全体。old_string が見つからなければ None。"""
    for e in edits:
        old, new = e.get("old_string") or "", e.get("new_string") or ""
        if not old or old not in text:
            return None
        text = text.replace(old, new) if e.get("replace_all") else text.replace(old, new, 1)
    return text


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
    path = ti.get("file_path")
    if edits:
        # ファイル全体で比べる（replace_all や、同じ文のマーカーが複数あるときの取り違えを防ぐ）
        main = main_text(path) or ""
        current = read_text(path)
        result = apply_edits(current, edits) if current is not None else None
        if result is not None:
            check_lost(main, current, result, "この編集")
        else:
            # ファイルが読めない・置き換え元が見つからないときは、編集の断片ごとに厳しめに確かめる
            for e in edits:
                check_lost(main, e.get("old_string"), e.get("new_string"), "この編集")

    if tool == "Write":
        old = read_text(path)
        if old is not None:
            check_lost(main_text(path) or "", old, ti.get("content"), "上書き")

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
