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
  - [TODO-OWNER] マーカーが減る差分。ただし、ローカルの main にあるそのファイルで、マーカーの
    直後の行に「→ オーナー決定（YYYY-MM-DD、…）：」があるマーカーは通す（ADR-0024）。
    それ以外は、オーナーが判断を済ませたときだけ
    SONAQUEST_OWNER_APPROVED=1 git commit ... で通す（PowerShellでは $env: で設定する）
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".claude" / "hooks"))
from sonaguard import (blocklist_hits, decided_markers, load_blocklist, markers, secret_hits,  # noqa: E402
                       sensitive_path, undecided, use_utf8_stdio)


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


def main_file(path):
    """ローカルの main にあるファイルの内容。無ければ空。"""
    p = subprocess.run(["git", "show", f"main:{path}"], capture_output=True)
    return p.stdout.decode("utf-8", "replace") if p.returncode == 0 else ""


def scan_staged():
    problems = scan_branch()
    for name in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0"):
        if name and sensitive_path(name):
            problems.append(f"{name}: 秘密情報・非公開ファイルはコミットできません")

    terms = load_blocklist()
    # マーカーの増減はファイルごとに数える（決定の行による解除をファイル単位で認めるため）
    removed, added = {}, {}
    old_path, current, line_no = "", "", 0
    for line in git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff").splitlines():
        if line.startswith("--- "):
            old_path = line[6:] if line.startswith("--- a/") else ""
        elif line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else old_path
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
            for m in markers(body):
                added.setdefault(current, {})
                added[current][m] = added[current].get(m, 0) + 1
            line_no += 1
        elif line.startswith("-") and not line.startswith("---"):
            for m in markers(line[1:]):
                removed.setdefault(current, {})
                removed[current][m] = removed[current].get(m, 0) + 1

    lost = []
    for path, counts in removed.items():
        less = {m: n - added.get(path, {}).get(m, 0) for m, n in counts.items()}
        less = {m: n for m, n in less.items() if n > 0}
        if less:
            lost += [f"{path}: {m}" for m in undecided(less, decided_markers(main_file(path)))]
    if lost and os.environ.get("SONAQUEST_OWNER_APPROVED") != "1":
        problems.append("TODO-OWNERマーカーが減ります（main で決定の行が付いていないもの）: " + " ".join(lost)
                        + "\n    オーナーが判断を済ませた場合だけ、オーナー自身が次の形で通してください"
                          "\n      Git Bash  : SONAQUEST_OWNER_APPROVED=1 git commit -m \"...\""
                          "\n      PowerShell: $env:SONAQUEST_OWNER_APPROVED = \"1\"; git commit -m \"...\";"
                          " Remove-Item Env:\\SONAQUEST_OWNER_APPROVED")
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
