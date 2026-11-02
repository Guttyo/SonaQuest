"""gitのコミット前検査。.githooks/pre-commit と .githooks/commit-msg から呼ばれる。

  scan_staged.py              ステージした内容を検査（pre-commit）
  scan_staged.py --msg FILE   コミットメッセージを検査（commit-msg）

止める条件：
  - 秘密情報・非公開ファイル（.dev.vars、.env*、.claude/local/ など）のステージ
  - 追加行・メッセージにAPIキーの形をした値
  - 追加行・メッセージに .claude/local/blocklist.txt の語（ファイルが無ければ検査しない）
  - [TODO-OWNER] マーカーが減る差分。オーナーが判断を済ませたときだけ
    SONAQUEST_OWNER_APPROVED=1 git commit ... で通す
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".claude" / "hooks"))
from sonaguard import blocklist_hits, load_blocklist, markers, secret_hits, sensitive_path, use_utf8_stdio  # noqa: E402


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


def scan_staged():
    problems = []
    for name in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0"):
        if name and sensitive_path(name):
            problems.append(f"{name}: 秘密情報・非公開ファイルはコミットできません")

    terms = load_blocklist()
    removed, added = {}, {}
    current, line_no = "", 0
    for line in git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff").splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else line[4:]
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
                added[m] = added.get(m, 0) + 1
            line_no += 1
        elif line.startswith("-") and not line.startswith("---"):
            for m in markers(line[1:]):
                removed[m] = removed.get(m, 0) + 1

    lost = sorted(m for m, n in removed.items() if n > added.get(m, 0))
    if lost and os.environ.get("SONAQUEST_OWNER_APPROVED") != "1":
        problems.append("TODO-OWNERマーカーが減ります: " + " ".join(lost)
                        + "\n    オーナーが判断を済ませた場合だけ、オーナー自身が"
                          " SONAQUEST_OWNER_APPROVED=1 git commit ... で通してください")
    return problems


def main():
    use_utf8_stdio()
    if len(sys.argv) == 3 and sys.argv[1] == "--msg":
        problems = scan_message(sys.argv[2])
    else:
        problems = scan_staged()
    if problems:
        print("コミットを止めました:", file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
