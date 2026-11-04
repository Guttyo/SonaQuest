r"""P5：Git 履歴全体の検査（docs/safety-test-plan.md P5、Issue #58）。公開の前に何度でも実行できる。

実行：
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py              秘密情報の形と非公開のパスを調べる
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py --blocklist   ブロックリストの語も調べる（オーナーが実行する）
  sh .claude/hooks/run-python.sh .claude/hooks/scan_history.py --self-test   検査が効くことを、使い捨てのリポジトリで確かめる
PowerShell には sh が無いので、`py .claude\hooks\scan_history.py [--blocklist | --self-test]` と書く（Python 3.9 以上）。
ブロックリストは、実行するリポジトリ（作業ツリー）の .claude/local/blocklist.txt を読む。別の場所に置いているときは、
環境変数 SONAQUEST_BLOCKLIST にそのパスを入れる。見つからないときは「検査できなかった」と報告する（「問題なし」にはしない）。

- 全部の参照と今の HEAD（git log --all HEAD。どの参照からも届かない分離した HEAD も含む）の全コミットについて、
  コミットメッセージと差分を、秘密情報の形で調べる。形は sonaguard.SECRET_PATTERNS で、コミット前フックと同じ判定。
  消した後の履歴にも残る値を拾う。
- マージコミットは、親ごとの差分（git log -m）で調べる。競合の解決で、マージコミットにだけ入った値や語も拾うため。
- 置換オブジェクト（git replace）は無効にして調べる（--no-replace-objects）。実際に送られる履歴を調べるため。
- 履歴に一度でも入った非公開のパス（sonaguard.sensitive_path。コミット前フックと同じ判定）を調べる。
- --blocklist のときだけ、ブロックリストの語も調べる。このファイルはオーナーだけが読む決まり
  （.claude/rules/privacy.md）なので、Claude Code は --blocklist を付けずに実行し、オーナーが自分で実行する。
- 出力は「コミット・種類・件数」だけ。一致した文字列、ブロックリストの語、非公開のパスの名前（語を含みうる）は
  決して出さない（語は番号だけ）。該当のコミットは `git show --stat <コミット>` でオーナーが確かめる。
- 調べないもの：まだコミットしていないファイル、参照も HEAD も届かない古いオブジェクト（push では送られない）。
- 終了コード：0 問題なし、1 要確認、2 検査できなかった。
"""
import argparse
import os
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

COMMIT_HEADER = re.compile(r"^@@@([0-9a-f]{40,64})$", re.M)
GIT = ["git", "--no-replace-objects"]  # 置換オブジェクトを無効にする（sonaguard.py と同じ理由）


def git(repo, *args):
    r = subprocess.run([*GIT, "-C", str(repo), "-c", "core.quotepath=false", *args], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {args[0]} が失敗しました（終了コード {r.returncode}）")
    return r.stdout.decode("utf-8", errors="replace")


def git_ok(repo, *args):
    return subprocess.run([*GIT, "-C", str(repo), *args], capture_output=True).returncode == 0


def revisions(repo):
    """たどり始める先。全部の参照と、今の HEAD（分離した HEAD は参照から届かないことがある）。"""
    return ["--all", "HEAD"] if git_ok(repo, "rev-parse", "--verify", "-q", "HEAD") else ["--all"]


def by_commit(text):
    """「@@@<コミット>」の行で区切った出力を {コミット: 本文} にする。マージは親ごとに続けて出るので足し合わせる。"""
    parts = COMMIT_HEADER.split(text)  # [先頭, sha1, 本文1, sha2, 本文2, ...]
    table = {}
    for i in range(1, len(parts) - 1, 2):
        table[parts[i]] = table.get(parts[i], "") + parts[i + 1]
    return table


def messages(repo, revs):
    """全コミットの {コミット: メッセージ}。マージコミットも含む。"""
    out = git(repo, "log", *revs, "--format=%H%x00%B%x01")
    result = {}
    for entry in out.split("\x01"):
        entry = entry.strip("\n")
        if entry:
            sha, _, body = entry.partition("\x00")
            result[sha] = body
    return result


def diffs(repo, revs):
    """全コミット（マージは親ごと）の {コミット: 差分}。最初のコミットの差分も含む。"""
    return by_commit(git(repo, "log", *revs, "-m", "-p", "--format=@@@%H"))


def path_commits(repo, revs):
    """全コミット（マージは親ごと）の {コミット: そのコミットで変わったパスの集合}。"""
    table = by_commit(git(repo, "log", *revs, "-m", "--name-only", "--format=@@@%H"))
    return {sha: {p for p in text.splitlines() if p} for sha, text in table.items()}


def scan(repo, use_blocklist):
    """(findings, stats, blocklist_ok)。findings は (コミット, 種類, 件数) の並びで、値・語・パス名は含まない。"""
    terms = load_blocklist() if use_blocklist else []
    revs = revisions(repo)
    msgs, dfs, pcs = messages(repo, revs), diffs(repo, revs), path_commits(repo, revs)
    findings = []
    for where, table in (("メッセージ", msgs), ("差分", dfs)):
        for sha, text in table.items():
            for name, pat in SECRET_PATTERNS:
                n = len(pat.findall(text))
                if n:
                    findings.append((sha, f"{where}に{name}の形", n))
            for i in blocklist_hits(text, terms):
                findings.append((sha, f"{where}にブロックリストの{i}番目の語", text.lower().count(terms[i - 1].lower())))
    all_paths = set()
    for sha, paths in pcs.items():
        all_paths |= paths
        private = sum(1 for p in paths if sensitive_path(p))
        if private:
            findings.append((sha, "履歴に入った非公開のパス（名前は表示しない）", private))
        joined = "\n".join(sorted(paths))
        for i in blocklist_hits(joined, terms):
            findings.append((sha, f"パス名にブロックリストの{i}番目の語", joined.lower().count(terms[i - 1].lower())))
    stats = {
        "refs": len(git(repo, "for-each-ref", "--format=%(refname)").splitlines()),
        "detached": not git_ok(repo, "symbolic-ref", "-q", "HEAD"),
        "commits": len(msgs),
        "merges": int(git(repo, "rev-list", "--count", "--merges", *revs).strip() or 0),
        "diffs": len(dfs),
        "paths": len(all_paths),
    }
    return findings, stats, (not use_blocklist) or bool(terms)


def report(findings, stats, use_blocklist, blocklist_ok):
    head = "（HEAD が分離している。HEAD も調べた）" if stats["detached"] else ""
    lines = [
        f"調べたもの：参照 {stats['refs']} 件{head}、コミット {stats['commits']} 件（うちマージ {stats['merges']} 件。"
        f"差分は {stats['diffs']} 件。マージは親ごとの差分）、パス {stats['paths']} 件",
        "検査の種類：秘密情報の形・非公開のパス" + ("・ブロックリストの語" if use_blocklist else "（ブロックリストの語は調べていない）"),
    ]
    if not blocklist_ok:
        lines.append("ブロックリストが空、または見つからないので、語の検査はできなかった")
    for sha, kind, n in findings:
        lines.append(f"- {sha[:7]}  {kind}  {n} 件")
    if not blocklist_ok:
        lines.append("結果：検査できなかった")
    elif findings:
        lines.append(f"結果：要確認 {len(findings)} 件（値は表示しない。該当のコミットを `git show --stat` でオーナーが確かめる）")
    else:
        lines.append("結果：問題なし")
    return "\n".join(lines)


def self_test():
    """使い捨てのリポジトリで、検査が効くこと（一致を拾い、値・語・パス名を出さないこと）を確かめる。"""
    fake = "sk-" + "ant-api03-" + "A" * 32  # 実行時に組み立てる（このファイルを検査に引っかけないため）
    term = "zzfake" + "employer" + "zz"  # ブロックリストの試験用の架空の語
    made = []

    def make(name):
        tmp = tempfile.mkdtemp(prefix=f"scan-history-{name}-")
        made.append(tmp)

        def run(*args):
            subprocess.run(["git", "-C", tmp, "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                            "-c", "commit.gpgsign=false", *args], check=True, capture_output=True)

        def head():
            return subprocess.run(["git", "-C", tmp, "rev-parse", "HEAD"], check=True, capture_output=True,
                                  text=True).stdout.strip()

        run("init", "-q")
        return Path(tmp), run, head

    def write(repo, name, text):
        (repo / name).write_text(text, encoding="utf-8")

    def kinds(findings):
        return [k for _, k, _ in findings]

    saved_blocklist = os.environ.get("SONAQUEST_BLOCKLIST")
    try:
        # 1. きれいな履歴では指摘が出ない
        repo, run, head = make("clean")
        write(repo, "ok.txt", "hello\n")
        run("add", "ok.txt")
        run("commit", "-q", "-m", "clean")
        findings, stats, ok = scan(repo, False)
        assert ok and findings == [], f"きれいな履歴で指摘が出た: {findings}"

        # 2. 消した後の値、メッセージの値、非公開のパスを拾い、値とパス名を出さない
        write(repo, "a.ts", f"const k = '{fake}'\n")
        run("add", "a.ts")
        run("commit", "-q", "-m", "add")
        write(repo, "a.ts", "const k = ''\n")  # 消しても履歴には残る
        run("commit", "-q", "-am", "remove")
        write(repo, "x.pem", "x\n")
        run("add", "x.pem")
        run("commit", "-q", "-m", "pem")
        run("commit", "-q", "--allow-empty", "-m", f"note {fake}")
        findings, stats, ok = scan(repo, False)
        text = report(findings, stats, False, ok)
        ks = kinds(findings)
        assert any(k.startswith("差分に") and "Anthropic" in k for k in ks), f"差分の値を拾えない: {ks}"
        assert any(k.startswith("メッセージに") and "Anthropic" in k for k in ks), f"メッセージの値を拾えない: {ks}"
        assert any(k.startswith("履歴に入った非公開のパス") for k in ks), f"非公開のパスを拾えない: {ks}"
        assert fake not in text and fake[:12] not in text, "報告に値が出ている"
        assert "x.pem" not in text, "報告に非公開のパス名が出ている"
        assert stats["commits"] == 5, f"コミット数が合わない: {stats}"

        # 3. マージコミットにだけ入った値と非公開のパスを拾う（競合の解決で入る場合）
        repo, run, head = make("merge")
        write(repo, "ok.txt", "hello\n")
        run("add", "ok.txt")
        run("commit", "-q", "-m", "base")
        run("branch", "-M", "base")
        run("checkout", "-q", "-b", "side")
        write(repo, "side.txt", "side\n")
        run("add", "side.txt")
        run("commit", "-q", "-m", "side")
        run("checkout", "-q", "base")
        write(repo, "main.txt", "main\n")
        run("add", "main.txt")
        run("commit", "-q", "-m", "main")
        run("merge", "-q", "--no-ff", "--no-commit", "side")
        write(repo, "merged.ts", f"const k = '{fake}'\n")
        write(repo, "m.pem", "x\n")
        run("add", "merged.ts", "m.pem")
        run("commit", "-q", "-m", "merge")
        merge_sha = head()
        findings, stats, ok = scan(repo, False)
        assert any(s == merge_sha and k.startswith("差分に") and "Anthropic" in k for s, k, _ in findings), \
            f"マージコミットにだけ入った値を拾えない: {findings}"
        assert any(s == merge_sha and k.startswith("履歴に入った非公開のパス") for s, k, _ in findings), \
            f"マージコミットにだけ入った非公開のパスを拾えない: {findings}"
        assert stats["merges"] == 1, f"マージ数が合わない: {stats}"

        # 4. 置換オブジェクトで隠しても、実際の履歴を調べる
        repo, run, head = make("replace")
        write(repo, "ok.txt", "hello\n")
        run("add", "ok.txt")
        run("commit", "-q", "-m", "clean")
        clean_sha = head()
        write(repo, "a.ts", f"const k = '{fake}'\n")
        run("add", "a.ts")
        run("commit", "-q", "-m", "add")
        secret_sha = head()
        run("replace", secret_sha, clean_sha)
        findings, stats, ok = scan(repo, False)
        assert any(s == secret_sha and k.startswith("差分に") for s, k, _ in findings), \
            f"置換オブジェクトで隠された値を拾えない: {findings}"

        # 5. どの参照からも届かない分離した HEAD のコミットも調べる
        repo, run, head = make("detached")
        write(repo, "ok.txt", "hello\n")
        run("add", "ok.txt")
        run("commit", "-q", "-m", "clean")
        run("checkout", "-q", "--detach")
        write(repo, "a.ts", f"const k = '{fake}'\n")
        run("add", "a.ts")
        run("commit", "-q", "-m", "detached")
        findings, stats, ok = scan(repo, False)
        assert stats["detached"] and any(s == head() and k.startswith("差分に") for s, k, _ in findings), \
            f"分離した HEAD の値を拾えない: {findings} {stats}"

        # 6. ブロックリストの語は番号だけを出す。語を含む非公開のパス名も出さない
        repo, run, head = make("blocklist")
        write(repo, f"{term}.pem", "x\n")
        run("add", f"{term}.pem")
        run("commit", "-q", "-m", f"msg {term}")
        bl = Path(made[-1]) / "outside-blocklist.txt"
        bl.write_text(f"# 試験用\n{term}\n", encoding="utf-8")
        os.environ["SONAQUEST_BLOCKLIST"] = str(bl)
        findings, stats, ok = scan(repo, True)
        text = report(findings, stats, True, ok)
        ks = kinds(findings)
        assert ok and any("ブロックリストの1番目の語" in k for k in ks), f"ブロックリストの語を拾えない: {ks}"
        assert any(k.startswith("履歴に入った非公開のパス") for k in ks), f"非公開のパスを拾えない: {ks}"
        assert term not in text, "報告にブロックリストの語・語を含むパス名が出ている"
        os.environ["SONAQUEST_BLOCKLIST"] = str(Path(made[-1]) / "missing.txt")
        findings, stats, ok = scan(repo, True)
        assert not ok and "検査できなかった" in report(findings, stats, True, ok), "ブロックリストが無いのに検査できたと言っている"
    finally:
        if saved_blocklist is None:
            os.environ.pop("SONAQUEST_BLOCKLIST", None)
        else:
            os.environ["SONAQUEST_BLOCKLIST"] = saved_blocklist
        for tmp in made:
            shutil.rmtree(tmp, ignore_errors=True)
    print("自己試験：OK（きれいな履歴は指摘なし。消した後の値・メッセージの値・非公開のパス・マージコミットにだけ入った値・"
          "置換オブジェクトで隠された値・分離した HEAD の値を拾い、値・語・パス名は報告に出ない。ブロックリストが無いと検査できなかったと報告する）")


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
