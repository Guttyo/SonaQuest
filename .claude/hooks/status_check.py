"""SessionStart・PreToolUse hook：docs/STATUS.md の更新漏れに気づかせる（ADR-0022）。

- SessionStart：STATUS.md に書かれたブランチ名のうち、main にマージ済みのものを知らせる。
  STATUS.md はマージ後の main の状態として書き、マージ済みの作業は Issue・PR の番号で書く約束なので、
  ブランチ名が残っていれば「作業中」のまま古くなっている。手元の git だけで調べ、通信しない。
- PreToolUse（gh pr create）：ブランチで STATUS.md が変わっていなければ止める。
  PR本文に「STATUS.md：更新不要（理由）」と書けば通す。
マージの判定は main の「Merge pull request #N from 所有者/ブランチ」というマージコミットの件名による。
squash マージや、fetch していない origin/main には気づけない。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from sonaguard import ROOT, SUBST, sensitive_path, split_commands, use_utf8_stdio

STATUS = "docs/STATUS.md"
MERGE_SUBJECT = re.compile(r"^Merge pull request #(\d+) from [^/\s]+/(\S+)")
NO_UPDATE = re.compile(r"STATUS\.md\s*[：:]\s*更新不要")
HEREDOC = re.compile(r"<<-?[ \t]*(['\"]?)(\w+)\1[^\n]*\n(.*?)^[ \t]*\2[ \t]*$", re.M | re.S)


def git(*args):
    p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True)
    return p.returncode, p.stdout.decode("utf-8", "replace")


def base_ref(branch="main"):
    """origin/<branch> があればそれを、無ければローカルの <branch> を使う。"""
    for ref in (f"origin/{branch}", branch):
        if git("rev-parse", "-q", "--verify", f"{ref}^{{commit}}")[0] == 0:
            return ref
    return None


def merged_branches():
    """{ブランチ名: PR番号}。main に first-parent でマージされたもの。"""
    ref = base_ref()
    if not ref:
        return {}
    code, out = git("log", ref, "--first-parent", "--merges", "--format=%s")
    if code != 0:
        return {}
    found = {}
    for line in out.splitlines():
        m = MERGE_SUBJECT.match(line)
        if m:
            found.setdefault(m.group(2), m.group(1))
    return found


def stale_mentions(text, merged):
    """[(ブランチ名, PR番号, [行番号...])]。"""
    hits = []
    lines = text.splitlines()
    for branch, pr in merged.items():
        pat = re.compile(r"(?<![\w/.-])" + re.escape(branch) + r"(?![\w/-])")
        nums = [i for i, line in enumerate(lines, 1) if pat.search(line)]
        if nums:
            hits.append((branch, pr, nums))
    return hits


def session_start():
    path = ROOT / STATUS
    if not path.exists():
        return
    hits = stale_mentions(path.read_text(encoding="utf-8"), merged_branches())
    if not hits:
        return
    print(f"[STATUS.md の確認] {STATUS} に、main へマージ済みのブランチ名が残っています。作業中のまま古くなっていないか確かめ、"
          "マージ後の main の状態に直してください（マージ済みの作業は Issue・PR の番号で書く。ADR-0022）。")
    for branch, pr, nums in hits:
        print(f"- `{branch}`（PR #{pr} でマージ済み）：{', '.join(f'{n}行目' for n in nums)}")


def option_value(tokens, names):
    for i, t in enumerate(tokens):
        for n in names:
            if t == n and i + 1 < len(tokens):
                return tokens[i + 1]
            if n.startswith("--") and t.startswith(n + "="):
                return t.split("=", 1)[1]
    return None


def heredoc_bodies(cmd):
    return [m.group(3) for m in HEREDOC.finditer(cmd)]


def pr_body_says_no_update(cmd, tokens, cwd):
    """PR本文（--body の値、--body-file の中身）だけを見る。タイトルや前後のコマンドは見ない。"""
    body = option_value(tokens, ("--body", "-b"))
    if body is not None:
        if NO_UPDATE.search(body):
            return True
        # --body "$(cat <<'EOF' ... EOF)" の本文は、置換の印に置き換わっているので heredoc から読む
        return SUBST in body and any(NO_UPDATE.search(b) for b in heredoc_bodies(cmd))
    body_file = option_value(tokens, ("--body-file", "-F"))
    if not body_file:
        return False
    if body_file == "-":  # 標準入力（heredoc）で渡した本文
        return any(NO_UPDATE.search(b) for b in heredoc_bodies(cmd))
    if sensitive_path(body_file):  # 秘密ファイルは開かない（block_secrets.py と同じ境界）
        return False
    p = Path(body_file)
    if not p.is_absolute():
        p = Path(cwd or ROOT) / p
    try:
        return bool(NO_UPDATE.search(p.read_text(encoding="utf-8")))
    except (OSError, UnicodeDecodeError):
        return False


def status_changed(base):
    ref = base_ref(base)
    if not ref:
        return True  # 比べる相手が無いときは止めない
    code, out = git("diff", "--name-only", f"{ref}...HEAD")
    return code != 0 or STATUS in out.splitlines()


def pre_tool_use(data):
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    for _, tokens, _ in split_commands(cmd) or []:
        if tokens[:3] != ["gh", "pr", "create"]:
            continue
        if status_changed(option_value(tokens, ("--base", "-B")) or "main") \
                or pr_body_says_no_update(cmd, tokens, data.get("cwd")):
            continue
        print(f"BLOCKED（STATUS.mdの更新確認）: このブランチで {STATUS} が変わっていません。"
              "マージ後の main の状態として STATUS.md を更新してコミットしてください。"
              "更新が要らないときは、PR本文に「STATUS.md：更新不要（理由）」と書いてください。"
              "あわせて docs/dev-logs/README.md の「いつ書くか」に当てはまるか確かめてください（ADR-0022）。", file=sys.stderr)
        sys.exit(2)


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    if data.get("hook_event_name") == "SessionStart":
        session_start()
    else:
        pre_tool_use(data)


if __name__ == "__main__":
    main()
