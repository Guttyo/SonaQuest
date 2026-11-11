"""gitのコミット前検査。.githooks/pre-commit と .githooks/commit-msg から呼ばれる。

  scan_staged.py              ステージした内容を検査（pre-commit）
  scan_staged.py --msg FILE   コミットメッセージを検査（commit-msg）
  scan_staged.py --merge      マージコミットを検査（pre-merge-commit。main へのマージを止め、
                              ステージした内容と同じ検査をする。Issue #30）
  scan_staged.py --branch     main へのコミットだけを止める（前の pre-merge-commit との互換）

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
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".claude" / "hooks"))
from sonaguard import (blocklist_hits, decision_lines, load_blocklist, marker_counts,  # noqa: E402
                       marker_shortfall, markers, removed_decisions, secret_hits, sensitive_path, use_utf8_stdio)


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
    p = subprocess.run(["git", "--no-replace-objects", "show", spec], capture_output=True)
    return p.stdout.decode("utf-8", "replace") if p.returncode == 0 else ""


C_ESCAPES = {"a": 7, "b": 8, "t": 9, "n": 10, "v": 11, "f": 12, "r": 13, '"': 34, "\\": 92}


def header_path(rest, prefix):
    """差分の見出し（--- a/x、+++ b/x）のパス。/dev/null なら空。
    git は「"」「\\」・制御文字を含むパスを "..." で囲んで C の書き方でエスケープするので、元に戻す
    （戻さないと staged_changes() のパスと合わず、マーカーの確認が抜ける）。"""
    if rest.startswith('"') and rest.rstrip("\t").endswith('"'):
        body, out, i = rest.rstrip("\t")[1:-1], bytearray(), 0
        while i < len(body):
            if body[i] == "\\" and i + 1 < len(body):
                if body[i + 1] in "01234567":
                    out.append(int(body[i + 1:i + 4], 8))
                    i += 4
                    continue
                out.append(C_ESCAPES.get(body[i + 1], ord(body[i + 1])))
                i += 2
                continue
            out += body[i].encode("utf-8")
            i += 1
        rest = out.decode("utf-8", "replace")
    else:
        rest = rest.rstrip("\t")  # 空白を含むパスには、git が末尾にタブを付ける
    return rest[len(prefix):] if rest.startswith(prefix) else ""


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


MAIN_REFS = ("refs/heads/main", "refs/remotes/origin/main")


def merge_heads():
    """進行中のマージで取り込むコミット。
    pre-commit（衝突を直した後の git commit、merge --continue）では MERGE_HEAD を読む。
    pre-merge-commit の時点では MERGE_HEAD がまだ無いので（git 2.56 で確認）、GIT_REFLOG_ACTION
    （「merge origin/main」「pull …」）から読む。pull は FETCH_HEAD のうち、マージするものを使う。"""
    def path(name):
        p = subprocess.run(["git", "rev-parse", "--git-path", name], capture_output=True)
        return Path(p.stdout.decode("utf-8", "replace").strip()) if p.returncode == 0 else None

    def lines(name):
        p = path(name)
        try:
            return p.read_text(encoding="utf-8", errors="replace").splitlines() if p else []
        except OSError:
            return []

    heads = [x.strip() for x in lines("MERGE_HEAD") if x.strip()]
    if heads:
        return heads
    action = os.environ.get("GIT_REFLOG_ACTION", "").split()
    if action[:1] == ["merge"]:
        names = [a for a in action[1:] if not a.startswith("-")]
        out = []
        for n in names:
            p = subprocess.run(["git", "rev-parse", "-q", "--verify", f"{n}^{{commit}}"], capture_output=True)
            if p.returncode != 0:
                return []
            out.append(p.stdout.decode().strip())
        return out
    if action[:1] == ["pull"]:
        return [x.split("\t", 1)[0] for x in lines("FETCH_HEAD") if x and "\tnot-for-merge\t" not in x]
    return []


def main_being_merged():
    """main の取り込み（取り込むコミットが1つで、ローカルの main か origin/main に含まれる）なら、そのコミット。
    origin/main は GitHub の main を fetch したもの（guard_github.py が手元からの書き換えを止める）。"""
    heads = merge_heads()
    if len(heads) != 1:
        return None
    for ref in MAIN_REFS:
        p = subprocess.run(["git", "merge-base", "--is-ancestor", heads[0], ref], capture_output=True)
        if p.returncode == 0:
            return heads[0]
    return None


def marker_problems(removed_in, moved_in, decisions_in):
    """マーカーと決定の行が減るファイルを、ファイル全体で確かめる（ADR-0024）。
    マーカーが減ってよいのは、ローカルの main（refs/heads/main）で直後に決定の行が付いたものだけ。
    main の取り込み（マージ）では、取り込む main 側に無いマーカー・決定の行も減ってよい（Issue #30）。
    main にあるオーナーの決定の行は、マーカーが減らなくても消させない。
    同じ文のマーカー・決定の行が別のファイルで増えた分は、移したものとして差し引く（1つの追加で差し引けるのは1つだけ）。
    ファイル全体を読むのは、差分でマーカー・決定の行が消えたファイルと、削除・名前の変更だけ（速さのため）。"""
    short, lost_decisions = {}, []
    available = Counter(decisions_in)
    taken = main_being_merged()
    changes = staged_changes()
    # 見出しから取ったパスが変更の一覧と合わなければ、取り違えを疑ってすべてのファイルを確かめる
    check_all = bool(set(removed_in) - {p for change in changes for p in change})
    for old, new in changes:
        if not old or (old == new and new not in removed_in and not check_all):
            continue
        head = show(f"HEAD:{old}")
        staged = show(f":{new}") if new else ""
        main = show(f"refs/heads/main:{old}")
        theirs = show(f"{taken}:{old}") if taken else None
        gone = removed_decisions(main, head, staged)
        if theirs:  # main の取り込みで、main 側が消した決定の行は消えてよい
            gone -= Counter(decision_lines(head)) - Counter(decision_lines(theirs))
        moved = gone & available
        available -= moved
        if gone - moved:
            lost_decisions.append(old)
        res_n = marker_counts(staged)
        head_n = marker_counts(head)
        if all(res_n.get(m, 0) >= n for m, n in head_n.items()):
            continue
        theirs_n = marker_counts(theirs) if theirs else None
        for m, n in marker_shortfall(main, head, staged).items():
            # main の取り込みで、main 側に無いマーカー（オーナーが解除したもの）は消えてよい。
            # 両方にあるものは残す。取り込む側にファイルが無いときは、この扱いをしない
            if theirs_n is not None and res_n.get(m, 0) >= min(head_n.get(m, 0), theirs_n.get(m, 0)):
                continue
            short.setdefault(m, []).append((old, n))
    lost = [f"{path}: {m}" for m, items in short.items()
            if sum(n for _, n in items) > moved_in.get(m, 0) for path, _ in items]
    return lost, lost_decisions


def scan_staged():
    problems = scan_branch()
    for name in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split("\0"):
        if name and sensitive_path(name):
            problems.append(f"{name}: 秘密情報・非公開ファイルはコミットできません")

    terms = load_blocklist()
    # マーカーの増減と、足された決定の行（ファイルをまたいだ移動を差し引くため）
    added_m, removed_m, added_d, removed_d = {}, {}, {}, {}
    old_path, current, line_no = "", "", 0
    for line in git("-c", "core.quotePath=false", "diff", "--cached", "-U0", "-M", "--no-color",
                    "--no-ext-diff", "--no-textconv").splitlines():
        if line.startswith("--- "):
            old_path = header_path(line[4:], "a/")
        elif line.startswith("+++ "):
            current = header_path(line[4:], "b/") or old_path
        elif line.startswith("-") and not line.startswith("---"):
            if markers(line[1:]):
                removed_m.setdefault(current, Counter()).update(markers(line[1:]))
            if decision_lines(line[1:]):
                removed_d.setdefault(current, Counter()).update(decision_lines(line[1:]))
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
            added_m.setdefault(current, Counter()).update(markers(body))
            added_d.setdefault(current, Counter()).update(decision_lines(body))
            line_no += 1

    if os.environ.get("SONAQUEST_OWNER_APPROVED") != "1":
        # ファイルごとに増えた分だけを、別のファイルから移したものとして数える
        moved_in, decisions_in = Counter(), Counter()
        for path, counts in added_m.items():
            moved_in.update(+(counts - removed_m.get(path, Counter())))
        for path, counts in added_d.items():
            decisions_in.update(+(counts - removed_d.get(path, Counter())))
        lost, lost_decisions = marker_problems(set(removed_m) | set(removed_d), moved_in, decisions_in)
        how = ("\n    オーナーが判断を済ませた場合だけ、オーナー自身が次の形で通してください"
               "\n      Git Bash  : SONAQUEST_OWNER_APPROVED=1 git commit -m \"...\""
               "\n      PowerShell: $env:SONAQUEST_OWNER_APPROVED = \"1\"; git commit -m \"...\";"
               " Remove-Item Env:\\SONAQUEST_OWNER_APPROVED")
        if lost:
            problems.append("TODO-OWNERマーカーが減ります（main で決定の行が付いていないもの）: " + " ".join(lost) + how)
        if lost_decisions:
            problems.append("main にあるオーナーの決定の行が消えます。決定の行は残してください: "
                            + " ".join(lost_decisions) + how)
    return problems


def main():
    use_utf8_stdio()
    if len(sys.argv) == 3 and sys.argv[1] == "--msg":
        problems = scan_message(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "--merge":
        problems = scan_staged()
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
