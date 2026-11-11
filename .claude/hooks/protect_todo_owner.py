"""PreToolUse hook：[TODO-OWNER] マーカーの削除・書き換えを止める。

マーカーはオーナーが判断する箇所。Claude Codeは消さず、埋めず、内容も変えない。
例外（ADR-0024）：ローカルの main にあるそのファイルで、マーカーの直後の行に
「→ オーナー決定（YYYY-MM-DD、…）：」があるときは、Edit・Write での解除を通す。
決定の行を足すのと同時の解除や、作業ブランチで足しただけの決定の行では通さない。
コマンド（sed -i 等）での書き換えは、決定があっても止める。コマンドの文字列にマーカーが無くても、
書き換え先のファイル（リダイレクト、sed -i、tee、Set-Content、rm・mv・cp、git restore・checkout）の中身に
マーカーがあれば止める（Issue #291）。
exit 2 でツール呼び出しを止め、stderr の文面がClaudeに返る。
"""
import json
import os
import re
import sys

from sonaguard import (STDIN_ARGS, commands_with_cwd,git_invocation, main_text, marker_counts, marker_shortfall, markers,
                       missing_decisions, native_path, read_text, removed_decisions, resolve_dir, split_commands,
                       split_commands_detail, use_utf8_stdio, write_targets)

BASH_WRITE = re.compile(r"\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-\w*i|>|\btee\b|Set-Content|Out-File|-replace")
HARMLESS_REDIRECT = re.compile(r"\d?>\s*/dev/null|\d?>&\d|2>\$null")


def only_git_commit(cmd):
    """コマンド列が git commit だけか（メッセージの $(cat <<'EOF' … EOF) の cat は除く）。
    分けたコマンドごとに見るので、改行や | の後に書き換えを続けたものは当たらない（Issue #291）。"""
    commands = split_commands(cmd)
    if not commands:
        return False
    for assigns, toks, redirects in commands:
        g = git_invocation(toks)
        if g and g["sub"] == "commit" and not redirects:
            continue
        if toks == ["cat"] and not redirects and not assigns:
            continue
        return False
    return any((git_invocation(t) or {}).get("sub") == "commit" for _, t, _ in commands)


def check_write_targets(cmd, cwd):
    """コマンドが書き換えるファイル（リダイレクト、sed -i、tee、Set-Content、rm・mv・cp、git restore・checkout）を
    読み、マーカーがあれば止める。マーカーの文字列をコマンドに書かない書き換え（行番号での削除など）も止めるため。
    決定の行があっても、コマンドでの書き換えは止める（Issue #291）。"""
    commands = split_commands_detail(cmd)
    if commands is None:  # 読めないときは、マーカーの文字列か書き換えの語があれば止める
        if "TODO-OWNER" in cmd or BASH_WRITE.search(HARMLESS_REDIRECT.sub("", cmd)):
            block("コマンドを解析できないので、マーカーを含むファイルを書き換えないかを確かめられません。コマンドを分けてください")
        return
    for c, here in commands_with_cwd(commands, cwd):
        # git -C の後のパス（restore・checkout）は、-C のフォルダから解く。リダイレクトは今いるフォルダから
        g = git_invocation([t for t in c.toks if t != STDIN_ARGS]) or {}
        git_dir = here
        for d in g.get("chdirs", []):
            git_dir = resolve_dir(git_dir, d)
        for target in write_targets(c):
            path = resolve_dir(here if target in c.redirects else git_dir, target)
            if path is None or any(ch in target for ch in "*?["):  # 変数・置換・ワイルドカードは読めない
                continue
            try:
                text = read_text(path)
            except OSError:
                continue
            if markers(text):
                block("コマンドで、マーカーを含むファイルを書き換え・削除・置き換えようとしています"
                      "（行番号での削除や git restore など、マーカーの文字列を書かない操作も含む）。Edit で編集してください")


def block(why):
    print(f"BLOCKED（TODO-OWNER保護）: {why}", file=sys.stderr)
    print("このマーカーはオーナーが判断する箇所です。消したり埋めたりせず、作業を止めてオーナーに確認してください。"
          "\n解除できるのは、main にあるそのファイルで、マーカーの直後の行に「→ オーナー決定（YYYY-MM-DD、…）：」が"
          "あるマーカーだけです（ADR-0024）。", file=sys.stderr)
    sys.exit(2)


def check_lost(main, current, result, what):
    """current → result でマーカーが減るなら、main で決定の行が付いたものだけかを確かめる。
    マーカーが減らなくても、main にあるオーナーの決定の行を消す編集は止める（決定の記録を書き換えさせない）。"""
    if removed_decisions(main, current, result):
        block(f"{what}で、main にあるオーナーの決定の行が消えます。決定の行は残してください")
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
        if "TODO-OWNER" in cmd and not only_git_commit(cmd) and BASH_WRITE.search(HARMLESS_REDIRECT.sub("", cmd)):
            block("コマンドでマーカーを含むファイルを書き換えようとしています（sed -i、リダイレクト等）")
        cwd = data.get("cwd") or os.getcwd()
        check_write_targets(cmd, os.path.normpath(native_path(cwd)))


if __name__ == "__main__":
    main()
