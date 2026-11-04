r"""P5：Git 履歴全体の検査（docs/safety-test-plan.md P5、Issue #58）。公開の前に何度でも実行できる。

実行：
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py              秘密情報の形と非公開のパスを調べる
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py --blocklist   ブロックリストの語も調べる（オーナーが実行する）
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py --self-test   検査が効くことを、使い捨てのリポジトリで確かめる
PowerShell には sh が無いので、`py .claude\hooks\scan_history.py [--blocklist | --self-test]` と書く（Python 3.9 以上）。
ブロックリストは、実行するリポジトリ（作業ツリー）の .claude/local/blocklist.txt を読む。別の場所に置いているときは、
環境変数 SONAQUEST_BLOCKLIST にそのパスを入れる。見つからないときは「検査できなかった」と報告する（「問題なし」にはしない）。

- 全部の参照（git log --all）の全コミットについて、コミットメッセージと差分を、秘密情報の形で調べる。
  形は sonaguard.SECRET_PATTERNS で、コミット前フックと同じ判定。消した後の履歴にも残る値を拾う。
- 履歴に一度でも入った非公開のパス（sonaguard.sensitive_path。コミット前フックと同じ判定）を調べる。
- --blocklist のときだけ、ブロックリスト（.claude/local/blocklist.txt）の語も調べる。このファイルはオーナーだけが読む決まり
  （.claude/rules/privacy.md）なので、Claude Code は --blocklist を付けずに実行し、オーナーが自分で実行する。
- 出力は「コミット・種類・件数」だけ。一致した文字列も、ブロックリストの語も、決して出さない（語は番号だけ）。
- 調べないもの：まだコミットしていないファイル、GitHub 上だけにある参照（git fetch で取り込んだものは調べる）、
  既に消えて参照されていないオブジェクト（push では送られない）。
- 終了コード：0 問題なし、1 要確認、2 検査できなかった。
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sonaguard import (ROOT, SECRET_PATTERNS, blocklist_hits, load_blocklist,  # noqa: E402
                       sensitive_path, use_utf8_stdio)

COMMIT_HEADER = re.compile(r"^@@@([0-9a-f]{40})$", re.M)


def git(repo, *args):
    r = subprocess.run(["git", "-C", str(repo), "-c", "core.quotepath=false", *args], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {args[0]} が失敗しました（終了コード {r.returncode}）")
    return r.stdout.decode("utf-8", errors="replace")


def messages(repo):
    """全コミットの {sha: メッセージ}。マージコミットも含む。"""
    out = git(repo, "log", "--all", "--format=%H%x00%B%x01")
    result = {}
    for entry in out.split("\x01"):
        entry = entry.strip("\n")
        if entry:
            sha, _, body = entry.partition("\x00")
            result[sha] = body
    return result


def diffs(repo):
    """マージ以外の全コミットの {sha: 差分}。最初のコミットの差分も含む。"""
    out = git(repo, "log", "--all", "--no-merges", "-p", "--format=@@@%H")
    parts = COMMIT_HEADER.split(out)  # [先頭, sha1, 差分1, sha2, 差分2, ...]
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def history_paths(repo):
    out = git(repo, "log", "--all", "--name-only", "--format=")
    return sorted({p for p in out.splitlines() if p})


def scan(repo, use_blocklist):
    """(findings, stats, blocklist_ok)。findings は (sha または "-", 種類, 件数) の並びで、値は含まない。"""
    terms = load_blocklist() if use_blocklist else []
    msgs, dfs, paths = messages(repo), diffs(repo), history_paths(repo)
    findings = []
    for where, table in (("メッセージ", msgs), ("差分", dfs)):
        for sha, text in table.items():
            for name, pat in SECRET_PATTERNS:
                n = len(pat.findall(text))
                if n:
                    findings.append((sha, f"{where}に{name}の形", n))
            for i in blocklist_hits(text, terms):
                findings.append((sha, f"{where}にブロックリストの{i}番目の語", text.lower().count(terms[i - 1].lower())))
    for p in paths:
        if sensitive_path(p):
            findings.append(("-", f"履歴に入った非公開のパス {p}", 1))
    joined = "\n".join(paths)
    for i in blocklist_hits(joined, terms):
        findings.append(("-", f"パス名にブロックリストの{i}番目の語", joined.lower().count(terms[i - 1].lower())))
    stats = {
        "refs": len(git(repo, "for-each-ref", "--format=%(refname)").splitlines()),
        "commits": len(msgs),
        "diffs": len(dfs),
        "paths": len(paths),
    }
    return findings, stats, (not use_blocklist) or bool(terms)


def report(findings, stats, use_blocklist, blocklist_ok):
    lines = [
        f"調べたもの：参照 {stats['refs']} 件、コミット {stats['commits']} 件（差分は {stats['diffs']} 件）、パス {stats['paths']} 件",
        "検査の種類：秘密情報の形・非公開のパス" + ("・ブロックリストの語" if use_blocklist else "（ブロックリストの語は調べていない）"),
    ]
    if not blocklist_ok:
        lines.append("ブロックリストが空、または見つからないので、語の検査はできなかった")
    for sha, kind, n in findings:
        lines.append(f"- {sha[:7]}  {kind}  {n} 件")
    if not blocklist_ok:
        lines.append("結果：検査できなかった")
    elif findings:
        lines.append(f"結果：要確認 {len(findings)} 件（値は表示しない。該当のコミットをオーナーが確かめる）")
    else:
        lines.append("結果：問題なし")
    return "\n".join(lines)


def self_test():
    """使い捨てのリポジトリで、検査が効くこと（一致を拾い、値を出さないこと）を確かめる。"""
    fake = "sk-" + "ant-api03-" + "A" * 32  # 実行時に組み立てる（このファイルを検査に引っかけないため）
    tmp = tempfile.mkdtemp(prefix="scan-history-test-")
    repo = Path(tmp)

    def run(*args):
        subprocess.run(["git", "-C", tmp, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                        "-c", "commit.gpgsign=false", *args], check=True, capture_output=True)

    try:
        run("init", "-q")
        (repo / "ok.txt").write_text("hello\n", encoding="utf-8")
        run("add", "ok.txt")
        run("commit", "-q", "-m", "clean")
        findings, stats, ok = scan(repo, False)
        assert ok and findings == [], f"きれいな履歴で指摘が出た: {findings}"
        (repo / "a.ts").write_text(f"const k = '{fake}'\n", encoding="utf-8")
        run("add", "a.ts")
        run("commit", "-q", "-m", "add")
        (repo / "a.ts").write_text("const k = ''\n", encoding="utf-8")  # 消しても履歴には残る
        run("commit", "-q", "-am", "remove")
        (repo / "x.pem").write_text("x\n", encoding="utf-8")
        run("add", "x.pem")
        run("commit", "-q", "-m", "pem")
        run("commit", "-q", "--allow-empty", "-m", f"note {fake}")
        findings, stats, ok = scan(repo, False)
        text = report(findings, stats, False, ok)
        kinds = [k for _, k, _ in findings]
        assert any(k.startswith("差分に") and "Anthropic" in k for k in kinds), f"差分の値を拾えない: {kinds}"
        assert any(k.startswith("メッセージに") and "Anthropic" in k for k in kinds), f"メッセージの値を拾えない: {kinds}"
        assert any("x.pem" in k for k in kinds), f"非公開のパスを拾えない: {kinds}"
        assert fake not in text and fake[:12] not in text, "報告に値が出ている"
        assert stats["commits"] == 5, f"コミット数が合わない: {stats}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("自己試験：OK（きれいな履歴は指摘なし。消した後の値、メッセージの値、非公開のパスを拾い、値は報告に出ない）")


def main():
    use_utf8_stdio()
    ap = argparse.ArgumentParser(description="Git 履歴全体の秘密情報・非公開パス・ブロックリストの語の検査（値は出さない）")
    ap.add_argument("--blocklist", action="store_true", help="ブロックリストの語も調べる（オーナーが実行する）")
    ap.add_argument("--self-test", action="store_true", help="検査が効くことを使い捨てのリポジトリで確かめる")
    args = ap.parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        findings, stats, ok = scan(ROOT, args.blocklist)
    except (RuntimeError, AssertionError) as e:
        print(f"検査できなかった：{e}", file=sys.stderr)
        return 2
    print(report(findings, stats, args.blocklist, ok))
    if not ok:
        return 2
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
