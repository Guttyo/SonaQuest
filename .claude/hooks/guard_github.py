"""PreToolUse hook：main の保護とGitHub設定の変更を止める（.claude/rules/github.md）。

- force push（-f を含む短縮オプションの結合、+refspec を含む）
- main へのpush（refs/heads/main、HEAD:main、宛先を省いた push を main 上で行う場合、--all、--mirror を含む）
- リモートのブランチ削除（--delete、-d、:branch）、ローカルの main の削除
- ローカルの main を動かす・同じ名前の参照を作る（branch -f/-m/-c、update-ref、tag、fetch の X:main、
  switch -C・checkout -B、worktree add -b main）。マーカー解除の判定がローカルの main を見るため（ADR-0024）
- main にいるときのコミット・マージ等（コマンドを区切りごとに順に見て、途中のブランチ切り替えも追う）
- PRのマージ（gh pr merge）は止めずに、確認の画面を出す（permissionDecision: "ask"。ADR-0041）。
  ただし --admin・--auto と、PR を番号・URLで1つ指さないもの（省くと今のブランチのPRになる）は止める
- リポジトリ設定の変更、保護設定・Rulesetsへの書き込み
- コミット前の検査（pre-commit）を通らない操作：git am、コミットまで行う cherry-pick・revert、
  git commit -n・--no-verify の省略形（Issue #30。merge は pre-merge-commit が検査する）
- push・fetch の宛先を設定で変える操作（-c remote.*.push=…、push.default、remote.*.fetch、git remote add 等）
- git のエイリアスを作る操作（-c alias.*、--config-env=alias.*、git config alias.*。Issue #291）
- xargs・find -exec の後の push などと gh（引数が実行時に足されるので判定できない。Issue #291）
- gh api での、リポジトリそのものと main の参照（git/refs/heads/main）への書き込み（Issue #291）
- gh の別名を作る操作（gh alias set・import）と、gh の既知のコマンドに無い名前（別名・拡張。Issue #291）
- pwsh・powershell の -EncodedCommand（中身を読めない）と、Start-Process で git・gh を起動する操作（Issue #291）

どのブランチで実行されるかは、実際に操作する作業ツリーで決める（Issue #82）。hook の入力の cwd から始め、
コマンドの cd・pushd・Set-Location の行き先、git -C の指定の順にたどる。worktree ごとにブランチを見る。
行き先を判定できないとき（変数・置換、cd -、popd、まだ無いフォルダ、--git-dir・GIT_DIR）は、
main を変えうる操作を止める。
止める区切りが1つでもあれば止める（終了コード2）。止めるものが無く、確認が要る区切りがあれば、
標準出力に確認を求める JSON だけを出して終了コード0で終える。
これはClaude Codeを通した誤操作を防ぐ補助で、正は GitHub の Ruleset（ADR-0014）。
"""
import json
import os
import re
import shlex
import subprocess
import sys

from sonaguard import (STDIN_ARGS, SUBST, command_name, dynamic_name, git_invocation, split_commands_detail,
                       use_utf8_stdio)

PROTECTED = {"main", "master"}
CHANGES_BRANCH = {"commit", "merge", "cherry-pick", "revert", "am", "rebase", "reset", "pull"}
GH_WRITE_METHOD = re.compile(r"(?:-X\s*|--method(?:=|\s+))(?:PUT|PATCH|POST|DELETE)\b", re.I)
GH_FIELD = re.compile(r"(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?:=|\s|$)")
UNKNOWN = "（判定できないブランチ）"  # 作業ツリーを判定できないときのブランチ。main として扱う
UNKNOWN_MSG = ("どの作業ツリー（ブランチ）で実行されるかを判定できません（変数・置換を使った cd・git -C、cd -、popd、"
               "まだ無いフォルダ、--git-dir・GIT_DIR など）。cd を別に実行するか、パスをそのまま書いてください（Issue #82）。")
CD = {"cd", "chdir", "pushd", "set-location", "sl", "push-location"}
POPD = {"popd", "pop-location"}
GIT_REPO_ENV = re.compile(r"^(?:\$env:)?GIT_(?:DIR|WORK_TREE|COMMON_DIR)(?:=|$)", re.I)
# push・fetch の宛先を変える設定（-c と git config での書き込みを止める。Issue #30）
ROUTING_KEY = re.compile(r"^(?:remote\..+\.(?:push|fetch|mirror|url|pushurl)|push\.default|url\..+\.(?:insteadof|pushinsteadof))$",
                         re.I)


class Blocked(Exception):
    pass


def run_git(cwd, *args):
    try:
        p = subprocess.run(["git", *args], cwd=cwd, capture_output=True)
    except OSError:
        return 1, ""
    return p.returncode, p.stdout.decode("utf-8", "replace").strip()


def native_path(p):
    """Git Bash 形式の /c/... を Windows の C:/... にする。"""
    m = re.match(r"^/([a-zA-Z])(/.*)?$", p)
    if m and os.name == "nt":
        return f"{m.group(1)}:{m.group(2) or '/'}"
    return p


def resolve_dir(base, arg):
    """cd・git -C の行き先。判定できなければ None。"""
    if base is None or not arg or SUBST in arg or arg == "-":
        return None
    a = re.sub(r"\$env:(\w+)", lambda m: os.environ.get(m.group(1), "\0"), arg, flags=re.I)
    a = os.path.expandvars(os.path.expanduser(a))
    if "$" in a or "\0" in a or "`" in a:
        return None
    return os.path.normpath(os.path.join(base, native_path(a)))


def cd_target(tokens):
    """cd・pushd・Set-Location の行き先の文字列。引数が無ければ ~。"""
    args = tokens[1:]
    for i, a in enumerate(args):
        low = a.lower()
        if low in ("-path", "-literalpath", "-lp"):
            return args[i + 1] if i + 1 < len(args) else None
        if a == "-":
            return "-"
        if a.startswith("-") and len(a) > 1:
            continue
        return a
    return "~"


class Trees:
    """コマンド列の中の、今いるフォルダと、作業ツリーごとのブランチ（Issue #82）。"""

    def __init__(self, cwd, test_branch=None):
        self.cwd = cwd  # None は判定できない
        self.tops = {}  # フォルダ → 作業ツリーの根（"" は git の外）
        self.branches = {}  # 作業ツリーの根 → ブランチ
        self.switched = set()
        self.created = {}  # 作業ツリーの根 → 同じコマンド列の中で作ったブランチ
        if test_branch is not None:  # 試験用：最初のフォルダのブランチを決めておく
            self.tops[cwd] = "<test>"
            self.branches["<test>"] = test_branch

    def key(self, d):
        if d is None:
            return None
        if d not in self.tops:
            if not os.path.isdir(d):
                return None
            code, out = run_git(d, "rev-parse", "--show-toplevel")
            self.tops[d] = os.path.normcase(os.path.normpath(native_path(out))) if code == 0 and out else ""
        return self.tops[d]

    def branch(self, d):
        k = self.key(d)
        if k is None:
            return UNKNOWN
        if k not in self.branches:
            code, out = run_git(k, "symbolic-ref", "--short", "-q", "HEAD") if k else (1, "")
            self.branches[k] = out if code == 0 else ""
        return self.branches[k]

    def switch(self, d, target):
        k = self.key(d)
        if k is None:
            return
        if target == "-" or re.fullmatch(r"@\{-\d+\}", target or ""):
            target = self.previous(k, target)
        self.branches[k] = target
        self.switched.add(k)

    def previous(self, k, spec):
        """git switch -・@{-1} の行き先。同じコマンドの中で切り替えた後なら判定しない。"""
        if not k or k in self.switched or k == "<test>":
            return UNKNOWN
        code, out = run_git(k, "rev-parse", "--symbolic-full-name", "@{-1}" if spec == "-" else spec)
        if code != 0:
            return UNKNOWN
        return out[len("refs/heads/"):] if out.startswith("refs/heads/") else ""

    def create(self, d, name):
        k = self.key(d)
        if k is not None and name:
            self.created.setdefault(k, set()).add(name)

    def checks_out(self, d, name):
        """git checkout <name> がブランチ（かコミット）への切り替えか。False はファイルの復元。
        作業ツリーを判定できないときは None（Issue #291）。"""
        k = self.key(d)
        if k is None:
            return None
        if k == "<test>" or name in self.created.get(k, ()):  # 試験用の作業ツリーでは、今までどおり切り替えとして扱う
            return True
        if not k:
            return False
        if run_git(k, "rev-parse", "--verify", "-q", f"{name}^{{commit}}")[0] == 0:
            return True
        # refs/remotes/<リモート>/<name> がちょうど1つなら、git がブランチを作って切り替える
        code, out = run_git(k, "for-each-ref", "--format=%(refname)", "refs/remotes")
        return code == 0 and sum(1 for r in out.splitlines() if r.split("/", 3)[3:] == [name]) == 1

    def git_commands(self):
        """git の本物のコマンドの名前（組み込みと、PATH にある git-*）。取れなければ None。
        git は、本物のコマンドと同じ名前のエイリアスを無視する（Issue #291）。"""
        if not hasattr(self, "_git_commands"):
            code, out = run_git(self.cwd if self.cwd and os.path.isdir(self.cwd) else None,
                                "--list-cmds=main,others,nohelpers")
            self._git_commands = set(out.split()) if code == 0 and out else None
        return self._git_commands

    def alias(self, d, name):
        """その作業ツリーで alias.<name> に設定されている中身（全体の設定を含む）。無ければ None。"""
        k = self.key(d)
        if not k or k == "<test>":
            return None
        code, out = run_git(k, "config", "--get", f"alias.{name}")
        return out if code == 0 else None

    def config(self, d, pattern):
        """[(キー, 値)]。作業ツリーが分からない・git の外なら空。"""
        k = self.key(d)
        if not k or k == "<test>":
            return []
        code, out = run_git(k, "config", "--get-regexp", pattern)
        if code != 0:
            return []
        return [tuple(line.split(" ", 1)) if " " in line else (line, "") for line in out.splitlines()]


def short_flags(arg):
    """'-uf' → {'u', 'f'}。長いオプションや位置引数は空。"""
    if arg.startswith("-") and not arg.startswith("--") and len(arg) > 1:
        return set(arg[1:])
    return set()


def strip_heads(ref):
    return ref[len("refs/heads/"):] if ref.startswith("refs/heads/") else ref


def full_ref(ref):
    """refspec の名前を refs/… の形にする（main → refs/heads/main）。"""
    if ref.startswith("refs/"):
        return ref
    if ref.startswith(("heads/", "remotes/", "tags/")):
        return "refs/" + ref
    return "refs/heads/" + ref


def is_main(branch):
    return branch is not None and branch != UNKNOWN and names_protected(branch)


def glob_match(pattern, target):
    """refspec の * を target に当てはめた部分。合わなければ None。* が無ければ一致で ""。"""
    if "*" not in pattern:
        return "" if pattern == target else None
    pre, post = pattern.split("*", 1)
    if target.startswith(pre) and target.endswith(post) and len(target) >= len(pre) + len(post):
        return target[len(pre):len(target) - len(post)]
    return None


def refspec_moves_main(spec, remotes=("origin",)):
    """fetch の refspec がローカルの main か、リモートの main 以外から refs/remotes/<名前>/main を書くか。
    refs/remotes/origin/main は、main の取り込みの判定（.githooks/scan_staged.py）が信頼する。"""
    spec = spec.lstrip("+")
    if ":" not in spec:
        return False
    src, dst = spec.split(":", 1)
    if not dst:
        return False
    dst = full_ref(dst)
    targets = [f"refs/heads/{n}" for n in PROTECTED] + [f"refs/remotes/{r}/{n}" for r in remotes for n in PROTECTED]
    for target in targets:
        star = glob_match(dst, target)
        if star is None:
            continue
        if target.startswith("refs/heads/"):
            return True
        source = src.replace("*", star, 1) if "*" in src else src
        if strip_heads(full_ref(source)) not in PROTECTED:
            return True
    return False


# git push の、次の語を値として取るオプション（値を位置引数に数えない。Issue #291）
PUSH_VALUE_OPTS = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}


def check_push(args, branch, trees=None, d=None):
    opts = [a for a in args if a.startswith("-")]
    pos = positionals(args, PUSH_VALUE_OPTS)
    if any(o.startswith("--force") for o in opts) or any("f" in short_flags(o) for o in opts):
        raise Blocked("force push はできません。")
    if "--delete" in opts or any("d" in short_flags(o) for o in opts):
        raise Blocked("リモートのブランチ削除はできません。")
    if "--all" in opts or "--mirror" in opts:
        raise Blocked("--all・--mirror は main も送るので使えません。ブランチ名を指定してpushしてください。")
    refspecs = pos[1:]
    if trees is not None:
        # 宛先を設定で決める push（remote.*.push、push.default=upstream など）。設定が既にあるときも止める（Issue #30）
        cfg = trees.config(d, r"^(remote\..*\.(push|mirror)|push\.default)$")
        if any(k.endswith(".mirror") and v.lower() in ("", "true", "yes", "on", "1") for k, v in cfg):
            raise Blocked("remote.*.mirror が設定されたリモートへの push は main も送るので使えません。")
        mapped = any(k.endswith(".push") for k, _ in cfg)
        default = [v.lower() for k, v in cfg if k == "push.default"]
        if mapped and (not refspecs or any(":" not in s for s in refspecs)):
            raise Blocked("remote.*.push が設定されているので、宛先は「作業ブランチ:作業ブランチ」の形で書いてください。")
        if not refspecs and default and default[-1] in ("matching", "upstream", "tracking"):
            raise Blocked(f"push.default={default[-1]} では宛先を省いた push が main を更新しうるので、ブランチ名を指定してください。")
    if not refspecs:
        if branch == UNKNOWN:
            raise Blocked(UNKNOWN_MSG)
        if is_main(branch):
            raise Blocked(f"今は {branch} にいるので、宛先を省いた push は main を更新します。作業ブランチ名を指定してください。")
        return
    for spec in refspecs:
        if spec.startswith("+"):
            raise Blocked("force push（+refspec）はできません。")
        if ":" in spec:
            src, dst = spec.split(":", 1)
            if src == "":
                raise Blocked("リモートのブランチ削除（:branch）はできません。")
            if dst.startswith(("refs/remotes/", "remotes/")):
                raise Blocked("リモート追跡の参照（refs/remotes/…）へは push できません。")
            target = strip_heads(dst or src)
        else:
            if spec == "HEAD" and branch == UNKNOWN:
                raise Blocked(UNKNOWN_MSG)
            target = branch if spec == "HEAD" else spec
        if names_protected(target):
            raise Blocked("main へは直接pushできません。作業ブランチをpushしてPRを作ってください（push自体もオーナーの承認後）。")


PROTECTED_REFS = {f"{prefix}{name}" for name in PROTECTED
                  for prefix in ("", "heads/", "refs/heads/", "refs/", "tags/", "refs/tags/")}


def names_protected(ref):
    """main を指す名前か（main、heads/main、refs/heads/main、refs/main、refs/tags/main）。
    feature/main のような、末尾が main なだけの別の名前は含めない。"""
    return ref in PROTECTED_REFS


def names_tracking_main(ref):
    """refs/remotes/<名前>/main（remotes/<名前>/main）か。"""
    return re.fullmatch(r"(?:refs/)?remotes/[^/]+/(?:main|master)", ref) is not None


MOVES_MAIN = "ローカルの main を、PRのマージ（と git pull --ff-only）以外で動かしたり、同じ名前のタグ・参照を作ったりはできません。" \
             "マーカー解除の判定は main を見ています（ADR-0024）。"
SKIPS_PRE_COMMIT = "コミット前の検査（pre-commit）を通らずにコミットを作るので使えません（Issue #30、ADR-0024）。"


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
        if pos and (names_protected(pos[0]) or names_tracking_main(pos[0])):
            raise Blocked(MOVES_MAIN)
    elif sub == "symbolic-ref":
        # git symbolic-ref HEAD refs/heads/main も、後に続く操作のブランチを取り違えさせるので止める
        pos = positionals(args, {"-m"})
        if any(names_protected(p) or names_tracking_main(p) for p in pos[:2]):
            raise Blocked(MOVES_MAIN)
    elif sub in ("fetch", "pull"):
        pos = positionals(args)
        for a in pos[1:] if sub == "pull" else pos:
            if ":" in a and (names_protected(a.lstrip("+").split(":", 1)[1]) or refspec_moves_main(a)):
                raise Blocked(MOVES_MAIN)
    elif sub in ("switch", "checkout"):
        created = option_value(args, "BCbc", ("--force-create", "--create"))
        if created is not None and names_protected(created):
            raise Blocked(MOVES_MAIN)
    elif sub == "worktree":
        if args[:1] == ["add"]:
            created = option_value(args[1:], "bB", ("--orphan",))
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


COMMIT_VALUE_SHORT = set("mFCct")
COMMIT_VALUE_LONG = {"--message", "--file", "--author", "--date", "--reuse-message", "--reedit-message", "--fixup",
                     "--squash", "--template", "--cleanup", "--trailer", "--pathspec-from-file"}


def commit_no_verify(args):
    """git commit -n（-anm などの結合も）か。-m の値の中の n は数えない。"""
    skip = False
    for a in args:
        if skip:
            skip = False
            continue
        if a == "--":
            break
        if a.startswith("--"):
            skip = a in COMMIT_VALUE_LONG
            continue
        if a.startswith("-") and len(a) > 1:
            for j, ch in enumerate(a[1:], 1):
                if ch == "n":
                    return True
                if ch in COMMIT_VALUE_SHORT:
                    skip = j == len(a) - 1
                    break
    return False


def short_flag_before_value(arg, flag, value_chars):
    """-xn のような短いオプションの結合に flag があるか。値を取る文字（value_chars）より後は値として見ない。"""
    if not arg.startswith("-") or arg.startswith("--") or len(arg) < 2:
        return False
    for ch in arg[1:]:
        if ch == flag:
            return True
        if ch in value_chars:
            return False
    return False


def abbreviates(arg, option, shortest):
    """--no-ver のような、git が受け付ける長いオプションの省略形か。"""
    name = arg.split("=", 1)[0]
    return len(name) >= shortest and option.startswith(name)


def check_skips_pre_commit(sub, args):
    """コミット前の検査を通らずにコミットを作る操作を止める（Issue #30）。
    git 2.56 で確かめたこと：am・cherry-pick・revert・rebase は pre-commit を呼ばない。merge は pre-merge-commit を呼ぶ。"""
    if sub in ("commit", "merge", "pull", "am", "cherry-pick", "revert", "rebase", "push") \
            and any(abbreviates(a, "--no-verify", 6) for a in args if a.startswith("--")):
        raise Blocked("--no-verify（省略形を含む）はコミット前の検査を迂回するので使えません。")
    if sub == "commit" and commit_no_verify(args):
        raise Blocked("git commit -n はコミット前の検査を迂回するので使えません。")
    if sub == "am":
        if not args or not all(a in ("--abort", "--quit") or a.startswith("--show-current-patch") for a in args):
            raise Blocked("git am は" + SKIPS_PRE_COMMIT + "git apply --index <パッチ> の後に git commit してください。")
    elif sub in ("cherry-pick", "revert"):
        if args and all(a in ("--abort", "--quit") for a in args):
            return
        if "--continue" in args or "--skip" in args:
            raise Blocked(f"git {sub} --continue・--skip は" + SKIPS_PRE_COMMIT + "取り消して -n で当て直し、git commit してください。")
        if not any(abbreviates(a, "--no-commit", 6) if a.startswith("--") else short_flag_before_value(a, "n", "mSX")
                   for a in args):
            raise Blocked(f"コミットまで行う git {sub} は" + SKIPS_PRE_COMMIT +
                          f"git {sub} -n（--no-commit）の後に git commit してください。")


def config_written_key(args):
    """git config が書き込む（消す）キー。読むだけなら None。"""
    pos = positionals(args, {"-f", "--file", "--blob", "--type", "--default", "--comment", "--value"})
    if not pos:
        return None
    if pos[0] in ("get", "list"):
        return None
    if pos[0] in ("set", "unset", "rename-section", "remove-section"):
        return pos[1] if len(pos) > 1 else None
    if set(args) & {"--add", "--unset", "--unset-all", "--replace-all", "--rename-section", "--remove-section"}:
        return pos[0]
    if set(args) & {"--get", "--get-all", "--get-regexp", "--get-urlmatch", "-l", "--list", "--get-color",
                    "--get-colorbool"}:
        return None
    return pos[0] if len(pos) >= 2 else None


ALIAS_MSG = ("git のエイリアス（alias.*）は作れません。エイリアスを通すと、main の保護とコミット前の検査の判定が"
             "働かないためです。コマンドをそのまま書いてください（Issue #291）。")


def check_routing(sub, args, configs):
    """push・fetch の宛先を設定で変える操作を止める（Issue #30）。"""
    for c in configs:
        if ROUTING_KEY.match(c.split("=", 1)[0]):
            raise Blocked("git -c で push・fetch の宛先（remote.*.push・fetch・url、push.default など）は変えられません。")
        if c.split("=", 1)[0].lower().startswith("alias."):
            raise Blocked(ALIAS_MSG)
    if sub == "config":
        key = config_written_key(args)
        if key and ROUTING_KEY.match(key):
            raise Blocked("push・fetch の宛先の設定（remote.*.push・fetch・url、push.default など）はオーナーが変えます。")
        if key and key.lower().startswith("alias."):
            raise Blocked(ALIAS_MSG)
    if sub == "remote" and args[:1] and args[0] in ("add", "rename", "set-url", "remove", "rm", "set-branches"):
        raise Blocked("リモートの設定（git remote add・set-url など）はオーナーが変えます。")


# hook がサブコマンドの名前で判定している git のコマンド。エイリアスを引かずに、本物のコマンドとして判定する
# （alias.commit のような設定があっても、git は本物のコマンドを優先するため。Issue #291）
JUDGED_SUBS = CHANGES_BRANCH | {"push", "branch", "tag", "update-ref", "symbolic-ref", "fetch", "switch", "checkout",
                                "worktree", "config", "remote"}
MAX_ALIAS_DEPTH = 5
ALIAS_UNKNOWN_MSG = ("git のエイリアスかもしれない名前を、作業ツリーを判定できない場所で実行しようとしています。"
                     "エイリアスの中身を確かめられないので、コマンドをそのまま書くか、cd を別に実行してください（Issue #291）。")


def tree_dir(g, trees, repo_env):
    """git の -C・--git-dir と GIT_DIR を考えた、git が操作する作業ツリーのフォルダ。判定できなければ None。"""
    d = trees.cwd
    for c in g["chdirs"]:
        d = resolve_dir(d, c)
    return None if g["repo_opts"] or repo_env else d


def expand_alias(tokens, g, trees, repo_env, depth=0):
    """設定にある git のエイリアスを展開した (語の列, git_invocation の結果) を返す（Issue #291）。
    ! で始まる（シェルで実行する）エイリアスは、main と判定できないブランチでは止める。"""
    sub = g["sub"]
    if not sub or sub in JUDGED_SUBS or sub.startswith("-") or SUBST in sub or "$" in sub:
        return tokens, g
    commands = trees.git_commands()
    if commands is not None and sub in commands:
        return tokens, g
    d = tree_dir(g, trees, repo_env)
    if trees.key(d) is None:
        if commands is None:  # 本物のコマンドの一覧が取れないときは、git status なども止めないよう通す
            return tokens, g
        raise Blocked(ALIAS_UNKNOWN_MSG)
    value = trees.alias(d, sub.lower())
    if value is None:
        return tokens, g
    if value.startswith("!"):
        branch = trees.branch(d)
        if branch == UNKNOWN:
            raise Blocked(UNKNOWN_MSG)
        if is_main(branch):
            raise Blocked(f"今は {branch} にいます。シェルで実行する git のエイリアス（! で始まるもの）は、中身を判定できないので"
                          "main では使えません。作業ブランチで実行するか、コマンドをそのまま書いてください（Issue #291）。")
        return tokens, g
    if "core.hookspath" in value.lower():
        raise Blocked("core.hooksPath を変える git のエイリアスは使えません。コミット前の検査が外れるためです（Issue #291）。")
    try:
        words = shlex.split(value)
    except ValueError:
        raise Blocked("git のエイリアスの中身を読めません。コマンドをそのまま書いてください（Issue #291）。")
    if depth >= MAX_ALIAS_DEPTH:
        raise Blocked("git のエイリアスの入れ子が深すぎます。コマンドをそのまま書いてください（Issue #291）。")
    prefix = tokens[:len(tokens) - len(g["args"]) - 1]
    expanded = prefix + words + g["args"]
    return expand_alias(expanded, git_invocation(expanded), trees, repo_env, depth + 1)


def check_git(sub, args, branch, configs=(), trees=None, d=None):
    """1つのgitコマンドを調べ、実行後のブランチを返す。branch が None なら判定しない（status_check.py）。"""
    check_moves_main(sub, args)
    check_routing(sub, args, configs)
    check_skips_pre_commit(sub, args)
    if trees is not None and sub in ("fetch", "pull"):
        cfg = trees.config(d, r"^remote\..*\.fetch$")
        remotes = {"origin"} | {k.split(".")[1] for k, _ in cfg if k.count(".") >= 2}
        if any(refspec_moves_main(v, sorted(remotes)) for _, v in cfg):
            raise Blocked("remote.*.fetch の設定がローカルの main（か refs/remotes/*/main）を書き換えます。" + MOVES_MAIN)
    if sub == "push":
        check_push(args, branch, trees, d)
    elif sub == "branch":
        deleting = "--delete" in args or any(short_flags(a) & {"d", "D"} for a in args)
        if deleting and any(a in PROTECTED for a in args):
            raise Blocked("main は削除できません。")
        pos = positionals(args)
        if trees is not None and pos and all(a in ("-f", "--force", "-t", "--track", "--no-track", "-q", "--quiet")
                                             for a in args if a.startswith("-")):
            trees.create(d, pos[0])  # git branch X の後の git checkout X を、切り替えとして扱うため
    elif sub in ("switch", "checkout"):
        if "--" in args:
            return branch
        for flag in ("-c", "-C", "-b", "-B", "--create"):
            if flag in args:
                i = args.index(flag)
                if i + 1 < len(args) and trees is not None:
                    trees.create(d, args[i + 1])
                return args[i + 1] if i + 1 < len(args) else branch
        pos = [a for a in args if not a.startswith("-") or a == "-"]
        if not pos:
            return branch
        target = pos[0]
        # git checkout <ファイル> はファイルの復元で、ブランチは変わらない（Issue #291）
        if sub == "checkout" and trees is not None and target != "-" and not re.fullmatch(r"@\{-\d+\}", target) \
                and not names_protected(target) and not trees.checks_out(d, target):
            return branch
        return target
    elif sub in CHANGES_BRANCH and branch == UNKNOWN:
        raise Blocked(UNKNOWN_MSG)
    elif sub in CHANGES_BRANCH and is_main(branch):
        if sub == "pull" and "--ff-only" in args and ff_pull_from_remote(args):
            return branch
        raise Blocked(f"今は {branch} にいます。main を直接変更せず、作業ブランチを作ってください（git switch -c docs/<Issue番号>-<内容>）。")
    return branch


MERGE_ASK = ("PRのマージは、オーナーがチャットで明示的に頼んだときだけ行います。"
             "許可する前に、PR番号がオーナーの頼んだものと同じか確かめてください（ADR-0041）。")
GH_MERGE_VALUE_OPTS = {"-R", "--repo", "-t", "--subject", "-b", "--body", "-F", "--body-file",
                       "-A", "--author-email", "--match-head-commit"}
PR_URL = re.compile(r"https://github\.com/[^/\s]+/[^/\s]+/pull/\d+/?")


def check_pr_merge(args):
    """gh pr merge の引数を確かめる。止めるなら Blocked、確認の画面を出すならその理由を返す（ADR-0041）。"""
    for a in args:
        if a == "--":
            break
        name = a.split("=", 1)[0]
        if name == "--admin":
            raise Blocked("gh pr merge --admin（保護を飛ばすマージ）は使いません。")
        if name == "--auto":
            raise Blocked("gh pr merge --auto（条件がそろうと自動でマージする）は使いません。")
    targets = positionals(args, GH_MERGE_VALUE_OPTS)
    if len(targets) != 1:
        raise Blocked("gh pr merge には、マージするPRの番号かURLを1つだけ書いてください（省くと今のブランチのPRになります）。")
    if not (targets[0].isdigit() or PR_URL.fullmatch(targets[0])):
        raise Blocked("gh pr merge のPRは、番号かURLで指してください（ブランチ名・変数・置換では指さない）。")
    return MERGE_ASK


GH_VALUE_OPTS = {"-R", "--repo"}
GH_API_VALUE_OPTS = {"-X", "--method", "-H", "--header", "-f", "-F", "--field", "--raw-field", "--input", "-q", "--jq",
                     "-t", "--template", "--hostname", "--cache", "-p", "--preview"}
REPO_ITSELF = re.compile(r"/?repos/[^/\s]+/[^/\s]+/?")
MAIN_REF = re.compile(r"/?repos/[^/\s]+/[^/\s]+/git/refs/heads/(?:main|master)/?")


def gh_subcommand(tokens):
    """gh の最初の2つの位置引数（pr merge など）の位置。-R・--repo の値は位置引数に数えない。
    pr と merge の間にフラグを置く書き方も読む（Issue #291）。"""
    idx, skip = [], False
    for i, a in enumerate(tokens[1:], 1):
        if skip:
            skip = False
        elif a.startswith("-"):
            skip = a in GH_VALUE_OPTS
        else:
            idx.append(i)
            if len(idx) == 2:
                break
    return idx


def gh_api_method(args):
    """gh api のメソッド。-X・--method が無ければ、フィールドがあれば POST、無ければ GET。"""
    method = option_value(args, "X", ("--method",))
    if method:
        return method.upper()
    return "POST" if GH_FIELD.search(" ".join(args)) else "GET"


# gh の組み込みのコマンドと、コマンドの短い名前（gh 2.103.2 の gh help で確かめた）。
# これに無い名前は、gh alias set で作った別名か拡張なので、何が実行されるか判定できない（Issue #291）。
# co は gh help に出るが、設定の別名（gh alias）なので、中身を書き換えられる。入れない（gh pr checkout と書く）
GH_COMMANDS = {
    "auth", "browse", "codespace", "cs", "discussion", "gist", "issue", "org", "pr", "project", "release", "repo",
    "skill", "cache", "run", "workflow", "agent-task", "alias", "api", "attestation", "at", "completion",
    "config", "copilot", "extension", "extensions", "ext", "gpg-key", "label", "licenses", "preview", "ruleset", "rs",
    "search", "secret", "ssh-key", "status", "variable", "help", "version",
    # gh help <話題> の話題
    "accessibility", "a11y", "actions", "environment", "exit-codes", "formatting", "mintty", "reference", "telemetry",
}


def check_gh(segment, tokens):
    """止めるなら Blocked。確認の画面を出すなら、その理由を返す。
    tokens[0] は、basename を小文字にして .exe を外すと gh になる語（gh.exe・フルパスも含む。Issue #291）。"""
    if STDIN_ARGS in tokens:
        raise Blocked("xargs・find -exec の後の gh は、引数が実行時に足されるので判定できません。gh はそのまま書いてください。")
    idx = gh_subcommand(tokens)
    pos = [tokens[i] for i in idx]
    if pos[:1] == ["alias"] and pos[1:2] and pos[1] in ("set", "import"):
        raise Blocked("gh の別名（gh alias set・import）は作れません。別名を通すと、PRのマージなどの判定が働かないためです。"
                      "コマンドをそのまま書いてください（Issue #291）。")
    if pos and pos[0] not in GH_COMMANDS:  # 止めた文には、コマンドの語を入れない
        raise Blocked("gh の組み込みのコマンドではない名前（gh alias で作った別名か拡張）は、何が実行されるかを"
                      "判定できないので、組み込みのコマンドで書いてください（Issue #291）。")
    if pos == ["pr", "merge"]:  # pr と merge の間のフラグも、merge の後の引数と合わせて確かめる
        return check_pr_merge([t for j, t in enumerate(tokens[1:], 1) if j not in idx])
    if pos[:1] == ["repo"] and pos[1:2] and pos[1] in ("edit", "delete", "rename", "archive"):
        raise Blocked("リポジトリ設定の変更・削除はオーナーの承認が要ります。")
    if pos[:1] == ["api"]:
        args = tokens[idx[0] + 1:]
        if re.search(r"protection|ruleset", segment, re.I) and (GH_WRITE_METHOD.search(segment) or GH_FIELD.search(segment)):
            raise Blocked("ブランチ保護・Rulesetsの変更はオーナーだけが行います。")
        endpoint = positionals(args, GH_API_VALUE_OPTS)[:1]
        method = gh_api_method(args)
        if endpoint and method != "GET":
            if REPO_ITSELF.fullmatch(endpoint[0]) and method in ("PATCH", "DELETE", "PUT", "POST"):
                raise Blocked("リポジトリそのものの設定の変更・削除（公開の切り替えなど）はオーナーだけが行います。")
            if MAIN_REF.fullmatch(endpoint[0]):
                raise Blocked("リモートの main の参照（git/refs/heads/main）は書き換えられません。")


# xargs・find -exec の後で、引数が足されると判定が変わる git のサブコマンド（Issue #291）
STDIN_SENSITIVE = {"push", "branch", "tag", "update-ref", "fetch", "config"}
POWERSHELLS = {"pwsh", "powershell"}
START_PROCESS = {"start-process", "saps", "start"}
# Start-Process の、値を取らないオプション（これ以外のオプションは次の語を値として取る）
START_PROCESS_SWITCHES = ("passthru", "wait", "nonewwindow", "usenewenvironment", "loaduserprofile")


def encoded_command(tokens):
    """pwsh・powershell に -EncodedCommand（-e・-ec・-enc などの省略形、-EncodedArguments も）を渡しているか。
    中身は Base64 で、hook は読めない（Issue #291）。-ex・-ep（ExecutionPolicy）は当てない。"""
    for t in tokens[1:]:
        m = re.fullmatch(r"(?:--?|/)([a-z]+)(?::.*)?", t.lower())
        if not m:
            continue
        opt = m.group(1)
        if opt in ("e", "ec") or (len(opt) >= 2 and ("encodedcommand".startswith(opt) or "encodedarguments".startswith(opt))):
            return True
    return False


def start_process_target(tokens):
    """Start-Process が起動するもの（-FilePath・-Path の値か、最初の位置引数）。無ければ None（Issue #291）。"""
    args, i = tokens[1:], 0
    while i < len(args):
        a = args[i]
        if not a.startswith("-"):
            return a
        opt = a[1:].split(":", 1)[0].lower()
        if ":" in a[1:]:
            value = a[1:].split(":", 1)[1]
            if opt and ("filepath".startswith(opt) or opt in ("path", "pspath")):
                return value
            i += 1
            continue
        if opt and ("filepath".startswith(opt) or opt in ("path", "pspath")):
            return args[i + 1] if i + 1 < len(args) else None
        i += 1 if any(sw.startswith(opt) for sw in START_PROCESS_SWITCHES) else 2
    return None


def check_command(cmd, trees):
    """止める区切りがあれば Blocked。無ければ、確認の画面を出す理由の一覧（空なら何もしない）を返す。
    確認が要る区切りの後に止める区切りがあっても止めるよう、最後の区切りまで見てから返す。"""
    asks = []
    commands = split_commands_detail(cmd)
    if commands is None:
        if re.search(r"\bgit\b|\bgh\b", cmd):
            raise Blocked("コマンドを解析できません（引用符が閉じていない等）。git・gh の操作は分けて実行してください。")
        return asks
    # GIT_DIR・GIT_WORK_TREE を設定すると、git が操作する作業ツリーを判定できない
    repo_env = any(GIT_REPO_ENV.match(t) for c in commands for t in c.assigns + c.toks)
    # サブシェル（( … )・$(…) など）の中の cd は、外のコマンドの場所を変えない（Issue #291）
    cwds = {(): trees.cwd}
    for c in commands:
        tokens = c.toks
        trees.cwd = next(cwds[c.scope[:k]] for k in range(len(c.scope), -1, -1) if c.scope[:k] in cwds)
        if dynamic_name(tokens) and set(tokens[1:]) & ({"push", "pr", "api", "repo", "branch", "update-ref", "tag", "fetch"} | CHANGES_BRANCH):
            raise Blocked("コマンド名が変数・置換で決まるため判定できません。git・gh はそのまま書いてください。")
        name = command_name(tokens[0]) if tokens else ""
        if name in POWERSHELLS and encoded_command(tokens):
            raise Blocked("pwsh・powershell の -EncodedCommand は、中身を読んで判定できないので使えません。"
                          "コマンドはそのまま書いてください（Issue #291）。")
        if name in START_PROCESS:
            target = start_process_target(tokens)
            if target is not None and command_name(target) in ("git", "gh"):
                raise Blocked("Start-Process で git・gh を起動すると、引数を判定できません。git・gh はそのまま実行してください"
                              "（Issue #291）。")
        if name in CD:
            cwds[c.scope] = resolve_dir(trees.cwd, cd_target(tokens))
            continue
        if name in POPD:
            cwds[c.scope] = None
            continue
        g = git_invocation(tokens)
        if g and g["sub"]:
            if g["sub"] == STDIN_ARGS or (g["sub"] in STDIN_SENSITIVE and STDIN_ARGS in g["args"]):
                raise Blocked(f"xargs・find -exec の後の git {'' if g['sub'] == STDIN_ARGS else g['sub']} は、"
                              "引数が実行時に足されるので判定できません。宛先などをそのまま書いてください。")
            # 設定にあるエイリアスは、中身を展開してから判定する（Issue #291）
            tokens, g = expand_alias(tokens, g, trees, repo_env)
            d = tree_dir(g, trees, repo_env)
            branch = trees.branch(d)
            after = check_git(g["sub"], g["args"], branch, g["configs"], trees, d)
            if g["sub"] in ("switch", "checkout") and after != branch:
                trees.switch(d, after)
        elif name == "gh":
            reason = check_gh(" ".join(tokens), tokens)
            if reason and reason not in asks:
                asks.append(reason)
    return asks


def main():
    use_utf8_stdio()
    try:
        data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except ValueError:
        return
    if data.get("tool_name") not in ("Bash", "PowerShell"):
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    cwd = data.get("cwd") or os.getcwd()
    cwd = os.path.normpath(native_path(cwd))
    try:
        # 試験用のブランチは、hook の入力ではなく環境変数で受け取る（Issue #291）
        asks = check_command(cmd, Trees(cwd, os.environ.get("SONAQUEST_TEST_BRANCH")))
    except Blocked as e:
        print(f"BLOCKED（main・GitHubの保護）: {e}", file=sys.stderr)
        sys.exit(2)
    if asks:
        # 標準出力にはこの JSON だけを出す。終了コード0なら、Claude Code が確認の画面を出す（ADR-0041）
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": " ".join(asks),
        }}, ensure_ascii=False))


if __name__ == "__main__":
    main()
