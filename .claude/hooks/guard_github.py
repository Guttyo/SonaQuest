"""PreToolUse hook：main の保護とGitHub設定の変更を止める（.claude/rules/github.md）。

- force push、main へのpush、main の削除
- main にいるときのコミット・マージ等（git pull --ff-only は可）
- PRのマージ（gh pr merge）
- 保護設定・リポジトリ設定の変更（gh api の書き込み、gh repo edit）
これらはオーナーが自分で行うか、オーナーの承認後にGitHub上で行う。
"""
import json
import re
import subprocess
import sys

from sonaguard import ROOT, use_utf8_stdio

PROTECTED = ("main", "master")
RULES = [
    (re.compile(r"\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s--force(?:-with-lease)?\b|\s-f\b|\s\+\S)"),
     "force push はできません。"),
    (re.compile(r"\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s|:)(?:main|master)\b"),
     "main へは直接pushできません。作業ブランチをpushしてPRを作ってください（push自体もオーナーの承認後）。"),
    (re.compile(r"\bgit\b[^;&|]*\bpush\b[^;&|]*\s--delete\b"),
     "リモートのブランチ削除はできません。"),
    (re.compile(r"\bgit\s+branch\s+[^;&|]*-[dD]\b[^;&|]*\b(?:main|master)\b"),
     "main は削除できません。"),
    (re.compile(r"\bgh\s+pr\s+merge\b"),
     "PRのマージはオーナーの明示的な承認後に、オーナーが行います。"),
    (re.compile(r"\bgh\s+repo\s+edit\b"),
     "リポジトリ設定の変更はオーナーの承認が要ります。"),
    (re.compile(r"\bgh\s+api\b[^;&|]*(?:-X|--method)\s*(?:PUT|PATCH|POST|DELETE)\b[^;&|]*(?:protection|rulesets)"),
     "ブランチ保護・Rulesetsの変更はオーナーだけが行います。"),
    (re.compile(r"\bgh\s+api\b[^;&|]*(?:protection|rulesets)[^;&|]*(?:-X|--method)\s*(?:PUT|PATCH|POST|DELETE)\b"),
     "ブランチ保護・Rulesetsの変更はオーナーだけが行います。"),
]
CHANGES_BRANCH = re.compile(r"\bgit\s+(?:commit|merge|cherry-pick|revert|am|rebase|reset)\b")


def block(why):
    print(f"BLOCKED（main・GitHubの保護）: {why}", file=sys.stderr)
    sys.exit(2)


def current_branch():
    p = subprocess.run(["git", "symbolic-ref", "--short", "-q", "HEAD"], cwd=ROOT, capture_output=True)
    return p.stdout.decode("utf-8", "replace").strip()


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    for pat, why in RULES:
        if pat.search(cmd):
            block(why)
    if CHANGES_BRANCH.search(cmd) and not re.search(r"\b(?:switch|checkout)\s+(?:-c\s+|-b\s+)", cmd):
        branch = data.get("_test_branch") or current_branch()
        if branch in PROTECTED:
            block(f"今は {branch} にいます。main を直接変更せず、作業ブランチを作ってください（git switch -c docs/<Issue番号>-<内容>）。")


if __name__ == "__main__":
    main()
