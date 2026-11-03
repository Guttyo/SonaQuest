"""PreToolUse hook：main の保護とGitHub設定の変更を止める（.claude/rules/github.md）。

- force push（-f を含む短縮オプションの結合、+refspec を含む）
- main へのpush（refs/heads/main、HEAD:main、宛先を省いた push を main 上で行う場合、--all、--mirror を含む）
- リモートのブランチ削除（--delete、-d、:branch）、ローカルの main の削除
- ローカルの main を動かす・同じ名前の参照を作る（branch -f/-m/-c、update-ref、tag、fetch の X:main、
  switch -C・checkout -B）。マーカー解除の判定がローカルの main を見るため（ADR-0024）
- main にいるときのコミット・マージ等（コマンドを区切りごとに順に見て、途中のブランチ切り替えも追う）
- PRのマージ（gh pr merge）、リポジトリ設定の変更、保護設定・Rulesetsへの書き込み
これはClaude Codeを通した誤操作を防ぐ補助で、正は GitHub の Ruleset（ADR-0014）。
"""
import json
import re
import subprocess
import sys

from sonaguard import ROOT, dynamic_name, git_invocation, split_commands, use_utf8_stdio

PROTECTED = {"main", "master"}
CHANGES_BRANCH = {"commit", "merge", "cherry-pick", "revert", "am", "rebase", "reset", "pull"}
GH_WRITE_METHOD = re.compile(r"(?:-X\s*|--method(?:=|\s+))(?:PUT|PATCH|POST|DELETE)\b", re.I)
GH_FIELD = re.compile(r"(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?:=|\s|$)")


class Blocked(Exception):
    pass


def current_branch():
    p = subprocess.run(["git", "symbolic-ref", "--short", "-q", "HEAD"], cwd=ROOT, capture_output=True)
    return p.stdout.decode("utf-8", "replace").strip()


def short_flags(arg):
    """'-uf' → {'u', 'f'}。長いオプションや位置引数は空。"""
    if arg.startswith("-") and not arg.startswith("--") and len(arg) > 1:
        return set(arg[1:])
    return set()


def strip_heads(ref):
    return ref[len("refs/heads/"):] if ref.startswith("refs/heads/") else ref


def check_push(args, branch):
    opts = [a for a in args if a.startswith("-")]
    pos = [a for a in args if not a.startswith("-")]
    if any(o.startswith("--force") for o in opts) or any("f" in short_flags(o) for o in opts):
        raise Blocked("force push はできません。")
    if "--delete" in opts or any("d" in short_flags(o) for o in opts):
        raise Blocked("リモートのブランチ削除はできません。")
    if "--all" in opts or "--mirror" in opts:
        raise Blocked("--all・--mirror は main も送るので使えません。ブランチ名を指定してpushしてください。")
    refspecs = pos[1:]
    if not refspecs:
        if branch in PROTECTED:
            raise Blocked(f"今は {branch} にいるので、宛先を省いた push は main を更新します。作業ブランチ名を指定してください。")
        return
    for spec in refspecs:
        if spec.startswith("+"):
            raise Blocked("force push（+refspec）はできません。")
        if ":" in spec:
            src, dst = spec.split(":", 1)
            if src == "":
                raise Blocked("リモートのブランチ削除（:branch）はできません。")
            target = strip_heads(dst or src)
        else:
            target = branch if spec == "HEAD" else spec
        if names_protected(target):
            raise Blocked("main へは直接pushできません。作業ブランチをpushしてPRを作ってください（push自体もオーナーの承認後）。")


def names_protected(ref):
    """main を指す名前か（main、heads/main、refs/heads/main、refs/main、refs/tags/main など。リモート追跡は除く）。"""
    return not ref.startswith("refs/remotes/") and ref.rsplit("/", 1)[-1] in PROTECTED


MOVES_MAIN = "ローカルの main を、PRのマージ（と git pull --ff-only）以外で動かしたり、同じ名前のタグ・参照を作ったりはできません。" \
             "マーカー解除の判定は main を見ています（ADR-0024）。"


def positionals(args, takes_value=()):
    """位置引数。値を取るオプション（takes_value）の次の引数は除く。"--" より後はそのまま位置引数。"""
    out, skip = [], False
    for i, a in enumerate(args):
        if skip:
            skip = False
        elif a == "--":
            out += args[i + 1:]
            break
        elif a in takes_value:
            skip = True
        elif not a.startswith("-"):
            out.append(a)
    return out


def option_value(args, shorts, longs):
    """-Bmain・-fBmain・-B main・--force-create=main・--force-create main の値。無ければ None。"""
    for i, a in enumerate(args):
        if a == "--":
            break
        nxt = args[i + 1] if i + 1 < len(args) else ""
        for long in longs:
            if a == long:
                return nxt
            if a.startswith(long + "="):
                return a[len(long) + 1:]
        if a.startswith("-") and not a.startswith("--"):
            for j, ch in enumerate(a[1:], 1):
                if ch in shorts:
                    return a[j + 1:] or nxt
    return None


def check_moves_main(sub, args):
    """ローカルの main を動かす・同じ名前の参照を作る操作を止める（ADR-0024）。
    作る・動かす参照の名前だけを見る（main を起点や検索の条件に使うだけなら止めない）。"""
    if sub == "branch":
        pos = positionals(args)
        flags = set().union(*(short_flags(a) for a in args)) if args else set()
        targets = []
        if "f" in flags or "--force" in args:
            targets += pos[:1]
        if flags & {"m", "M"} or "--move" in args:
            targets += pos  # main の名前を変えるのも、main を動かすことになる
        if flags & {"c", "C"} or "--copy" in args:
            targets += pos[-1:]
        if any(names_protected(t) for t in targets):
            raise Blocked(MOVES_MAIN)
    elif sub == "tag":
        query = {"-l", "--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at",
                 "-v", "--verify", "-d", "--delete"}
        if not query & set(args):
            pos = positionals(args, {"-m", "-F", "-u", "--message", "--file", "--local-user", "--cleanup"})
            if pos and names_protected(pos[0]):
                raise Blocked(MOVES_MAIN)
    elif sub == "update-ref":
        if "--stdin" in args:
            raise Blocked("git update-ref --stdin は、どの参照を変えるかを確かめられないので使えません。")
        pos = positionals(args, {"-m"})
        if pos and names_protected(pos[0]):
            raise Blocked(MOVES_MAIN)
    elif sub == "symbolic-ref":
        pos = positionals(args, {"-m"})
        if pos and names_protected(pos[0]):
            raise Blocked(MOVES_MAIN)
    elif sub == "fetch":
        for a in positionals(args):
            if ":" in a and names_protected(a.lstrip("+").split(":", 1)[1]):
                raise Blocked(MOVES_MAIN)
    elif sub in ("switch", "checkout"):
        created = option_value(args, "BC", ("--force-create",))
        if created is not None and names_protected(created):
            raise Blocked(MOVES_MAIN)
    elif sub == "rebase":
        # git rebase <upstream> main は、main に切り替えてから main を書き換える
        pos = positionals(args, {"--onto", "-s", "--strategy", "-X", "--strategy-option", "-x", "--exec"})
        if len(pos) >= 2 and names_protected(pos[1]):
            raise Blocked(MOVES_MAIN)


def ff_pull_from_remote(args):
    """main での git pull --ff-only が、リモート（origin 等）の main からの取り込みか。"""
    pos = positionals(args)
    if len(pos) > 2:
        return False
    if pos and (pos[0] == "." or re.search(r"[/\\:]", pos[0])):
        return False  # 手元のパスや URL から main を進めない
    return len(pos) < 2 or names_protected(pos[1])


def check_git(sub, args, branch):
    """1つのgitコマンドを調べ、実行後のブランチを返す。"""
    check_moves_main(sub, args)
    if sub == "push":
        check_push(args, branch)
    elif sub == "branch":
        deleting = "--delete" in args or any(short_flags(a) & {"d", "D"} for a in args)
        if deleting and any(a in PROTECTED for a in args):
            raise Blocked("main は削除できません。")
    elif sub in ("switch", "checkout"):
        if "--" in args:
            return branch
        for flag in ("-c", "-C", "-b", "-B", "--create"):
            if flag in args:
                i = args.index(flag)
                return args[i + 1] if i + 1 < len(args) else branch
        pos = [a for a in args if not a.startswith("-")]
        return pos[0] if pos else branch
    elif sub in CHANGES_BRANCH and branch in PROTECTED:
        if sub == "pull" and "--ff-only" in args and ff_pull_from_remote(args):
            return branch
        raise Blocked(f"今は {branch} にいます。main を直接変更せず、作業ブランチを作ってください（git switch -c docs/<Issue番号>-<内容>）。")
    return branch


def check_gh(segment, tokens):
    if tokens[:3] == ["gh", "pr", "merge"]:
        raise Blocked("PRのマージはオーナーの明示的な承認後に、オーナーが行います。")
    if tokens[:2] == ["gh", "repo"] and len(tokens) > 2 and tokens[2] in ("edit", "delete", "rename", "archive"):
        raise Blocked("リポジトリ設定の変更・削除はオーナーの承認が要ります。")
    if tokens[:2] == ["gh", "api"] and re.search(r"protection|rulesets", segment) \
            and (GH_WRITE_METHOD.search(segment) or GH_FIELD.search(segment)):
        raise Blocked("ブランチ保護・Rulesetsの変更はオーナーだけが行います。")


def check_command(cmd, branch):
    commands = split_commands(cmd)
    if commands is None:
        if re.search(r"\bgit\b|\bgh\b", cmd):
            raise Blocked("コマンドを解析できません（引用符が閉じていない等）。git・gh の操作は分けて実行してください。")
        return
    for _, tokens, _ in commands:
        if dynamic_name(tokens) and set(tokens[1:]) & ({"push", "pr", "api", "repo", "branch", "update-ref", "tag", "fetch"} | CHANGES_BRANCH):
            raise Blocked("コマンド名が変数・置換で決まるため判定できません。git・gh はそのまま書いてください。")
        g = git_invocation(tokens)
        if g and g["sub"]:
            branch = check_git(g["sub"], g["args"], branch)
        elif tokens and tokens[0] == "gh":
            check_gh(" ".join(tokens), tokens)


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    try:
        check_command(cmd, data.get("_test_branch") or current_branch())
    except Blocked as e:
        print(f"BLOCKED（main・GitHubの保護）: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
