"""gitのコミット前検査。.githooks/pre-commit と .githooks/commit-msg から呼ばれる。

  scan_staged.py              ステージした内容を検査（pre-commit）
  scan_staged.py --msg FILE   コミットメッセージを検査（commit-msg）
  scan_staged.py --branch     main へのマージコミットを止める（pre-merge-commit）

止める条件：
  - main（master）へのコミット・マージコミット。main はGitHubのPR経由でだけ変える
    （.claude/rules/github.md）
  - 秘密情報・非公開ファイル（.dev.vars、.env*、.claude/local/ など）のステージ
  - 追加行・メッセージにAPIキーの形をした値
  - 追加行・メッセージに .claude/local/blocklist.txt の語（ファイルが無ければ検査しない）
  - [TODO-OWNER] マーカーが減る差分。ただし、ローカルの main（refs/heads/main）にあるそのファイルで、
    マーカーの直後の行に「→ オーナー決定（YYYY-MM-DD、…）：」があるマーカーは、決定の行を残せば通す（ADR-0024）。
    それ以外は、オーナーが判断を済ませたときだけ
    SONAQUEST_OWNER_APPROVED=1 git commit ... で通す（PowerShellでは $env: で設定する）
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".claude" / "hooks"))
from sonaguard import (blocklist_hits, load_blocklist, marker_counts, marker_shortfall,  # noqa: E402
                       missing_decisions, secret_hits, sensitive_path, use_utf8_stdio)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout.decode("utf-8", "replace")


def scan_message(path):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    text = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
    problems = []
    if secret_hits(text):
        problems.append(f"コミットメッセージに秘密情報らしき値（{'、'.join(secret_hits(text))}）")
    hits = blocklist_hits(text, load_blocklist())
    if hits:
        problems.append(f"コミットメッセージにブロックリストの語（{'、'.join(f'{i}番目' for i in hits)}）")
    return problems


def scan_branch():
    p = subprocess.run(["git", "symbolic-ref", "--short", "-q", "HEAD"], capture_output=True)
    branch = p.stdout.decode("utf-8", "replace").strip()
    if branch in ("main", "master"):
        return [f"{branch} へは直接コミットできません。作業ブランチを作ってください"
                "（git switch -c docs/<Issue番号>-<内容>）。main はPR経由でだけ変えます"]
    return []


def show(spec):
    """git show <spec> の内容。無ければ空。"""
    p = subprocess.run(["git", "show", spec], capture_output=True)
    return p.stdout.decode("utf-8", "replace") if p.returncode == 0 else ""


def staged_changes():
    """ステージした変更の (変更前のパス, 変更後のパス)。追加は前が空、削除は後が空。名前の変更を追う。"""
    parts = git("diff", "--cached", "--name-status", "-z", "-M").split("\0")
    changes, i = [], 0
    while i < len(parts) and parts[i]:
        status = parts[i][0]
        if status in "RC":
            old, new = parts[i + 1], parts[i + 2]
            i += 3
            if status == "C":
                old = ""  # 複製では元のファイルは残る
        else:
            old = new = parts[i + 1]
            i += 2
            if status == "A":
                old = ""
            elif status == "D":
                new = ""
        changes.append((old, new))
    return changes


def marker_problems():
    """マーカーが減るファイルを、ファイル全体で確かめる（ADR-0024）。
    減ってよいのは、ローカルの main（refs/heads/main）で直後に決定の行が付いたマーカーだけで、
    決定の行は残す。同じ文のマーカーが別のファイルで増えた分は、移したものとして差し引く。"""
    short, moved_in, lost_decisions = {}, {}, []
    for old, new in staged_changes():
        head = show(f"HEAD:{old}") if old else ""
        staged = show(f":{new}") if new else ""
        cur_n, res_n = marker_counts(head), marker_counts(staged)
        for m, n in res_n.items():
            if n > cur_n.get(m, 0):
                moved_in[m] = moved_in.get(m, 0) + n - cur_n.get(m, 0)
        if all(res_n.get(m, 0) >= n for m, n in cur_n.items()):
            continue
        main = show(f"refs/heads/main:{old}")
        for m, n in marker_shortfall(main, head, staged).items():
            short.setdefault(m, []).append((old, n))
        if missing_decisions(main, staged):
            lost_decisions.append(old)
    lost = [f"{path}: {m}" for m, items in short.items()
            if sum(n for _, n in items) > moved_in.get(m, 0) for path, _ in items]
    return lost, lost_decisions


def scan_staged():
    problems = scan_branch()
    for name in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0"):
        if name and sensitive_path(name):
            problems.append(f"{name}: 秘密情報・非公開ファイルはコミットできません")

    terms = load_blocklist()
    current, line_no = "", 0
    for line in git("-c", "core.quotePath=false", "diff", "--cached", "-U0", "--no-color", "--no-ext-diff").splitlines():
        if line.startswith("+++ "):
            current = (line[6:] if line.startswith("+++ b/") else line[4:]).rstrip("\t")
        elif line.startswith("@@"):
            try:
                line_no = int(line.split("+")[1].split(",")[0].split(" ")[0])
            except (IndexError, ValueError):
                line_no = 0
        elif line.startswith("+") and not line.startswith("+++"):
            body = line[1:]
            s = secret_hits(body)
            if s:
                problems.append(f"{current}:{line_no}: 秘密情報らしき値（{'、'.join(s)}）")
            h = blocklist_hits(body, terms)
            if h:
                problems.append(f"{current}:{line_no}: ブロックリストの語（{'、'.join(f'{i}番目' for i in h)}）")
            line_no += 1

    if os.environ.get("SONAQUEST_OWNER_APPROVED") != "1":
        lost, lost_decisions = marker_problems()
        how = ("\n    オーナーが判断を済ませた場合だけ、オーナー自身が次の形で通してください"
               "\n      Git Bash  : SONAQUEST_OWNER_APPROVED=1 git commit -m \"...\""
               "\n      PowerShell: $env:SONAQUEST_OWNER_APPROVED = \"1\"; git commit -m \"...\";"
               " Remove-Item Env:\\SONAQUEST_OWNER_APPROVED")
        if lost:
            problems.append("TODO-OWNERマーカーが減ります（main で決定の行が付いていないもの）: " + " ".join(lost) + how)
        if lost_decisions:
            problems.append("マーカーと一緒にオーナーの決定の行が消えます。決定の行は残してください: "
                            + " ".join(lost_decisions) + how)
    return problems


def main():
    use_utf8_stdio()
    if len(sys.argv) == 3 and sys.argv[1] == "--msg":
        problems = scan_message(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "--branch":
        problems = scan_branch()
    else:
        problems = scan_staged()
    if problems:
        print("コミットを止めました:", file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
