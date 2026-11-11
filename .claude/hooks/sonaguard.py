"""Claude Codeのhookとgitのコミット前フックが共有する判定。標準ライブラリだけを使う。"""
import itertools
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 値の形で見分けられる秘密情報。placeholder（短い文字列）には反応しない。
SECRET_PATTERNS = [
    ("Anthropic APIキー", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("ElevenLabs APIキー", re.compile(r"\bsk_[a-f0-9]{40,}\b")),
    ("秘密鍵", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    # 名前を引用符で囲む JSON・YAML の書き方と、小文字の名前も拾う（Issue #290）。
    # 値が16字以上のときだけ当てるので、雛形の空の代入（ANTHROPIC_API_KEY=）や型の宣言には当たらない
    ("秘密情報の代入", re.compile(
        r"(?i)[\"']?\b(?:ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\b[\"']?"
        r"[ \t]*[=:][ \t]*[\"']?[A-Za-z0-9_\-.]{16,}")),
    ("GitHub のトークン", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("GitHub のトークン（fine-grained）", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{80,}")),
]

MARKER = re.compile(r"\[TODO-OWNER(?::[^\]\n]*)?\]")


def use_utf8_stdio():
    for s in (sys.stdout, sys.stderr):
        s.reconfigure(encoding="utf-8")


def secret_hits(text):
    return [name for name, pat in SECRET_PATTERNS if text and pat.search(text)]


def sensitive_path(p):
    """中身を会話やコミットに出してはいけないファイルか。*.example は対象外。"""
    if not p:
        return False
    p = p.replace("\\", "/").strip("\"'")
    base = p.rsplit("/", 1)[-1]
    if base.endswith(".example"):
        return False
    if base == ".dev.vars" or base.startswith(".dev.vars."):
        return True
    if base == ".env" or base.startswith(".env."):
        return True
    if re.search(r"\.(?:pem|p12|key)$", base):
        return True
    return re.search(r"(?:^|/)\.claude/local/", p) is not None


def markers(text):
    """[TODO-OWNER] と [TODO-OWNER: 内容] を内容まで含めて取り出す。"""
    return MARKER.findall(text or "")


def marker_counts(text):
    return Counter(markers(text))


# マーカーの直後（空行を除く次の行）に置く、オーナーの決定の行（ADR-0024）。
# 「オーナー指示」「オーナー（…）：〜の方向」「方針」は確定した決定として扱わない。
DECISION = re.compile(r"^\s*(?:(?:[-*>#]|//|<!--)\s*)*→\s*オーナー決定（\d{4}-\d{2}-\d{2}[^）\n]*）：\s*\S")


def decision_lines(text):
    """オーナーの決定の行（前後の空白を除いた文）。"""
    return [x.strip() for x in (text or "").splitlines() if DECISION.match(x)]


def decided_markers(text):
    """直後の行にオーナーの決定があるマーカーと、その数。"""
    lines = (text or "").splitlines()
    count = {}
    for i, line in enumerate(lines):
        found = markers(line)
        if not found:
            continue
        nxt = next((x for x in lines[i + 1:] if x.strip()), "")
        if DECISION.match(nxt):
            for m in found:
                count[m] = count.get(m, 0) + 1
    return count


def marker_shortfall(main, current, result):
    """current → result で、解除を認められないのに消えるマーカーと、その数（ADR-0024）。

    解除してよいのは、main で直後に決定の行があるマーカーだけ。同じ文のマーカーが複数あるときに
    どれを消したかを取り違えないよう、ファイル全体の数で比べる：result に残る「決定の無いマーカー」が、
    main の決定の無いマーカーと、作業ブランチで増えたマーカーの合計（current の数まで）を下回れば足りない。
    result で決定の行が付いて見えるマーカーは、main の決定済みの数までしか決定済みに数えない。
    """
    main_n, cur_n, res_n = marker_counts(main), marker_counts(current), marker_counts(result)
    decided, res_decided = decided_markers(main), decided_markers(result)
    short = {}
    for m, n in cur_n.items():
        if res_n.get(m, 0) >= n:
            continue
        required = min(n, main_n.get(m, 0) - decided.get(m, 0) + max(0, n - main_n.get(m, 0)))
        have = res_n.get(m, 0) - min(res_decided.get(m, 0), decided.get(m, 0))
        if have < required:
            short[m] = required - have
    return short


def removed_decisions(main, current, result):
    """current → result で消える、main にあるオーナーの決定の行（数で比べる）。"""
    gone = Counter(decision_lines(current)) - Counter(decision_lines(result))
    return gone & Counter(decision_lines(main))


def missing_decisions(main, result, elsewhere=()):
    """main にあって result から消えたオーナーの決定の行（同じ文が複数あれば数で比べる）。
    解除しても決定の行は記録として残す。elsewhere は、別のファイルへ移した決定の行。"""
    lost = Counter(decision_lines(main)) - Counter(decision_lines(result)) - Counter(elsewhere)
    return list(lost.elements())


def main_text(path):
    """ローカルの main（refs/heads/main。同じ名前のタグ等に取り違えない）にあるそのファイルの内容。
    オーナーがPRでマージした状態として扱う。リポジトリの外、main に無いファイル、gitが使えないときは None。"""
    if not path:
        return None
    m = re.match(r"^/([a-zA-Z])/(.*)$", path)
    if m and os.name == "nt":
        path = f"{m.group(1)}:/{m.group(2)}"
    p = Path(path)
    try:
        # --no-replace-objects：git replace で main の中身を差し替えて見せかけられないようにする
        r = subprocess.run(["git", "--no-replace-objects", "-C", str(p.parent), "show", f"refs/heads/main:./{p.name}"],
                           capture_output=True)
    except OSError:
        return None
    return r.stdout.decode("utf-8", "replace") if r.returncode == 0 else None


def read_text(path):
    """ファイルが無ければ None。Git Bash形式の /c/... も読めるようにする。"""
    if not path:
        return None
    cands = [path]
    m = re.match(r"^/([a-zA-Z])/(.*)$", path)
    if m and os.name == "nt":
        cands.append(f"{m.group(1)}:/{m.group(2)}")
    for c in cands:
        if os.path.isfile(c):
            return Path(c).read_text(encoding="utf-8", errors="replace")
    return None


def load_blocklist():
    """.claude/local/blocklist.txt（gitignore済み）。無ければ空。1行1語、#で始まる行は無視。"""
    path = os.environ.get("SONAQUEST_BLOCKLIST") or str(ROOT / ".claude" / "local" / "blocklist.txt")
    text = read_text(path)
    if text is None:
        return []
    return [t.strip() for t in text.splitlines() if t.strip() and not t.strip().startswith("#")]


def blocklist_hits(text, terms):
    """該当した語の番号（1始まり）だけを返す。語そのものは表示に使わない。"""
    low = (text or "").lower()
    return [i + 1 for i, t in enumerate(terms) if t.lower() in low]


# ---- シェルのコマンド列の分解（hookが共有する） ----
# 引用符の外の ; & && | || ( ) と改行で1コマンドずつに分ける。
# 単一引用符の中は文字どおり。二重引用符の中と引用符の外の $(...) `...` は、中身を別のコマンドとして調べる。
# リダイレクト（> file、2>&1 など）は宛先ごと取り除き、書き込み先は別に返す。
# heredoc（<<EOF）は引用符の外の << だけを認め、次の行からの本文を受け取るコマンドに結び付ける。
# 本文は、シェル（bash など）が受け取るときだけコマンドとして調べる。
# 引用符なしの区切り（<<EOF）では本文の $(...) が展開されるので、そちらも調べる。
# 前置きのコマンド（読み飛ばして、後に続くコマンドを調べる）。大文字と小文字は区別しない（Issue #291）
WRAPPERS = {"env", "command", "exec", "nohup", "time", "sudo", "builtin", "nice", "xargs",
            "timeout", "stdbuf", "doas", "flock", "ionice", "chrt", "watch"}
# 前置きのコマンドのうち、次の語を値として取るオプション（値をコマンド名と取り違えないため）
WRAPPER_VALUE_OPTS = {
    "env": {"-u", "--unset", "-C", "--chdir", "-S", "--split-string"},
    "sudo": {"-u", "--user", "-g", "--group", "-C", "--close-from", "-D", "--chdir", "--host", "-p", "--prompt",
             "-r", "--role", "-t", "--type", "-U", "--other-user", "-R", "--chroot", "-T", "--command-timeout"},
    "nice": {"-n", "--adjustment"},
    "time": {"-f", "--format", "-o", "--output"},
    "xargs": {"-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L", "-n", "--max-args", "-P", "--max-procs",
              "-s", "--max-chars"},
    "exec": {"-a"},
    "timeout": {"-s", "--signal", "-k", "--kill-after"},
    "stdbuf": {"-i", "--input", "-o", "--output", "-e", "--error"},
    "doas": {"-u", "-C"},
    "flock": {"-w", "--timeout", "--wait", "-E", "--conflict-exit-code"},
    "ionice": {"-c", "--class", "-n", "--classdata", "-p", "--pid", "-P", "--pgid", "-u", "--uid"},
    "chrt": {"-T", "--sched-runtime", "-P", "--sched-period", "-D", "--sched-deadline"},
    "watch": {"-n", "--interval", "-q", "--equexit"},
}
# 前置きのコマンドのうち、オプションの後に位置引数を取るものと、その数（timeout の秒数、flock のロックファイル、
# chrt の優先度）
WRAPPER_POSITIONALS = {"timeout": 1, "flock": 1, "chrt": 1}
KEYWORDS = {"{", "}", "!", "if", "then", "else", "elif", "do", "while", "until"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "pwsh", "powershell"}
ASSIGN = re.compile(r"^(?:\$env:)?[A-Za-z_][A-Za-z0-9_]*=", re.I)
SUBST = "$(...)"  # 置換が入った語に残す印。コマンド名が動的かどうかを呼び出し側が見分ける
# xargs・find -exec の後のコマンドの末尾に足す印。実行時に標準入力やファイル名から引数が足されるので、
# 引数を読んで判定できない（SUBST とは分ける。"$(…)" を引数に使う普段の commit・push を止めないため。Issue #291）
STDIN_ARGS = "\0実行時に足される引数\0"
FIND_EXEC = {"-exec", "-execdir", "-ok", "-okdir"}
# wsl の、次の語を値として取るオプション。-e・--exec・-- の後と、最初の位置引数からはコマンド（Issue #291）
WSL_VALUE_OPTS = {"-d", "--distribution", "-u", "--user", "--cd", "--shell-type", "--distribution-id"}
# PowerShell の、スクリプトブロック（{ … }）を引数に取るコマンドレット（Issue #291）。
# ブロックの中の ; の後は、解析の段階で外のコマンド列に分かれるので、ブロックの中の cd は外にも効くものとして扱う
# （Invoke-Command・Start-Job の中の Set-Location は本当は外に効かないが、止めすぎの側に倒す）
SCRIPT_BLOCK_CMDLETS = {"foreach-object", "%", "where-object", "?", "foreach", ".", "measure-command",
                        "invoke-command", "icm", "start-job", "sajb", "start-threadjob", "try"}
MAX_DEPTH = 8
_SUBSHELL_IDS = itertools.count(1)
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"}


class _Src:
    """読んでいる文字列。heredoc の本文を取り除くと短くなるので、入れ子の読み手で共有する。"""

    def __init__(self, s):
        self.s = s


class Command:
    """分けた1つのコマンド（split_commands_detail の結果）。
    assigns：前置きの代入、toks：語の列、redirects：書き込み先のリダイレクト、
    stdin_texts：heredoc の本文と <<< の文字列、
    scope：そのコマンドが動くサブシェルの並び（( … )・$(…)・sh -c などに入るたびに番号が1つ増える。Issue #291）。"""

    __slots__ = ("assigns", "toks", "redirects", "stdin_texts", "scope")

    def __init__(self, assigns, toks, redirects, stdin_texts, scope):
        self.assigns, self.toks, self.redirects = assigns, toks, redirects
        self.stdin_texts, self.scope = stdin_texts, scope


def _child(scope):
    """新しいサブシェル（別のプロセス）の scope。"""
    return scope + (next(_SUBSHELL_IDS),)


class _Cmd:
    """読み途中の1コマンド。"""

    def __init__(self, scope=()):
        self.words, self.redirects, self.stdin_texts = [], [], []
        self.buf, self.started, self.quoted = [], False, False
        self.redirect_op = None  # 直後の語をリダイレクトの宛先として読む
        self.scope = scope

    def add(self, text, quoted=False):
        self.buf.append(text)
        self.started = True
        self.quoted |= quoted

    def end_word(self):
        if not self.started:
            return
        w = "".join(self.buf)
        if self.redirect_op is not None:
            if self.redirect_op.startswith("<<<"):
                self.stdin_texts.append(w)
            elif ">" in self.redirect_op:
                self.redirects.append(w)
            self.redirect_op = None
        else:
            self.words.append(w)
        self.buf, self.started, self.quoted = [], False, False


def _parse_marked(text, out, depth, scope, mark):
    """text を1つのコマンド列として読む。mark なら、読んだコマンドの末尾に STDIN_ARGS を足す
    （xargs・find -exec から sh -c '…' などに渡した文字列の中のコマンドも、引数が実行時に足される。Issue #291）。"""
    if not mark:
        _parse(_Src(text), 0, None, out, depth + 1, scope)
        return
    inner = []
    _parse(_Src(text), 0, None, inner, depth + 1, scope)
    for c in inner:
        if c.toks and STDIN_ARGS not in c.toks:
            c.toks = c.toks + [STDIN_ARGS]
    out.extend(inner)


def _finish_words(words, out, depth, scope, mark, stdin_texts=()):
    """分け終えた語の列を、1つのコマンドとして読む（語をつないで読み直すと引用符が外れて、
    wsl bash -c "git push …" が bash -c git に見えるため。Issue #291）。"""
    if depth > MAX_DEPTH:
        raise ValueError("入れ子が深すぎる")
    sub = _Cmd(scope)
    sub.words = list(words) + ([STDIN_ARGS] if mark else [])
    sub.stdin_texts = list(stdin_texts)
    _finish(sub, out, depth + 1)


def _script_blocks(words):
    """語の列の中の { … } の中身（PowerShell のスクリプトブロック）を、語の列のまま返す。閉じていなければ最後の語まで。
    ブロックの中の ; や | は、解析の段階で外のコマンド列に分かれているので、1つのブロックは1つのコマンドになる。"""
    blocks, i = [], 0
    while i < len(words):
        if not words[i].startswith("{"):
            i += 1
            continue
        level, j = 0, i
        while j < len(words):
            level += words[j].count("{") - words[j].count("}")
            if level <= 0:
                break
            j += 1
        block = list(words[i:j + 1])
        block[0] = block[0][1:]
        if level <= 0 and block[-1].endswith("}"):
            block[-1] = block[-1][:-1]
        blocks.append([w for w in block if w])
        i = j + 1
    return blocks


def _wsl_command(toks):
    """wsl の後に続くコマンドの語。無ければ空（Issue #291）。"""
    i = 1
    while i < len(toks):
        low = toks[i].lower()
        if low in ("-e", "--exec", "--"):
            return toks[i + 1:]
        if low in WSL_VALUE_OPTS:
            i += 2
        elif low.startswith("-"):
            i += 1
        else:
            return toks[i:]
    return []


def _finish(cmd, out, depth):
    cmd.end_word()
    toks, scope = cmd.words, cmd.scope
    # %{ … }・ForEach-Object{ … } のように、コマンドレットの名前に { が続く書き方を分ける（Issue #291）
    if toks:
        m = re.match(r"^([%?]|foreach-object|where-object|invoke-command|icm)(\{.*)$", toks[0], re.I)
        if m:
            toks = [m.group(1), m.group(2)] + toks[1:]
    # 前置き（VAR=値、env・sudo など、そのオプションと値・位置引数、{ ! if do など）を読み飛ばす
    assigns, i, wrapper, pending, stdin_args = [], 0, None, 0, False
    while i < len(toks):
        t = toks[i]
        low = t.lower()
        if ASSIGN.match(t):
            assigns.append(t)
        elif low in WRAPPERS:
            wrapper, pending = low, WRAPPER_POSITIONALS.get(low, 0)
            stdin_args |= low == "xargs"
        elif wrapper and t.startswith("-"):
            takes_value = t in WRAPPER_VALUE_OPTS.get(wrapper, ())
            value = None
            if wrapper == "env":  # env -S '文字列' は文字列をコマンドとして分けて実行する
                if t in ("-S", "--split-string"):
                    value = toks[i + 1] if i + 1 < len(toks) else ""
                elif t.startswith("--split-string="):
                    value = t.split("=", 1)[1]
                elif t.startswith("-S"):
                    value = t[2:]
            elif wrapper == "flock" and t in ("-c", "--command"):  # flock <ファイル> -c '文字列' はシェルで実行する
                value = toks[i + 1] if i + 1 < len(toks) else ""
                takes_value = True
            if value is not None:
                _parse(_Src(value), 0, None, out, depth + 1, _child(scope))
            if takes_value:
                i += 1
        elif wrapper and pending:  # timeout の秒数など
            pending -= 1
        elif t not in KEYWORDS:
            break
        i += 1
    toks = toks[i:]
    if not (toks or assigns or cmd.redirects):
        return
    if stdin_args and toks:  # xargs は標準入力から引数を足す
        toks = toks + [STDIN_ARGS]
    # eval・Invoke-Expression と sh -c・pwsh -Command・cmd /c・wsl に渡した文字列、シェルが標準入力で受け取る heredoc、
    # watch に渡した文字列、find -exec のコマンド、PowerShell のスクリプトブロックも、1つのコマンド列として調べる。
    # xargs・find -exec の後なら（mark）、その中のコマンドにも STDIN_ARGS を付ける（Issue #291）
    name = _name(toks)
    mark = STDIN_ARGS in toks
    words = [t for t in toks if t != STDIN_ARGS]
    if wrapper == "watch":  # watch は引数をつないでシェルで実行する
        _parse_marked(" ".join(words), out, depth, _child(scope), mark)
    if name == "eval":
        _parse_marked(" ".join(words[1:]), out, depth, scope, mark)
    elif name in ("invoke-expression", "iex"):  # PowerShell の eval。今のスコープで実行する
        _parse_marked(" ".join(t for t in words[1:] if t.lower() != "-command"), out, depth, scope, mark)
    elif name == "cmd":  # cmd /c '…'（Git Bash では //c とも書く）
        k = next((k for k, t in enumerate(words[1:], 1) if t.lower() in ("/c", "/k", "//c", "//k")), None)
        if k is not None:
            _parse_marked(" ".join(words[k + 1:]), out, depth, _child(scope), mark)
    elif name == "wsl":  # wsl git …・wsl -e git …・wsl -- git …（Issue #291）
        rest = _wsl_command(words)
        if rest:
            _finish_words(rest, out, depth, _child(scope), mark, cmd.stdin_texts)
    elif name == "find":
        _find_exec(toks, out, depth, scope)
    elif name in SCRIPT_BLOCK_CMDLETS:  # 1..3 | ForEach-Object { git … }・Invoke-Command { … }・try { … }（Issue #291）
        for block in _script_blocks(words[1:]):
            if block:
                _finish_words(block, out, depth, scope, mark)
    elif name in SHELLS:
        script = _shell_script_arg(toks)
        if script is not None:
            _parse_marked(toks[script], out, depth, _child(scope), mark)
        for text in cmd.stdin_texts:
            _parse_marked(text, out, depth, _child(scope), mark)
    out.append(Command(assigns, toks, cmd.redirects, cmd.stdin_texts, scope))


def _find_exec(toks, out, depth, scope):
    """find … -exec コマンド … ; の「コマンド …」を、末尾に STDIN_ARGS を付けて別のコマンドとして足す。"""
    k = 1
    while k < len(toks):
        if toks[k] not in FIND_EXEC:
            k += 1
            continue
        end = next((j for j in range(k + 1, len(toks)) if toks[j] in (";", "+")), len(toks))
        if end > k + 1:
            sub = _Cmd(_child(scope))
            sub.words = toks[k + 1:end] + [STDIN_ARGS]
            _finish(sub, out, depth + 1)
        k = end + 1


def command_name(word):
    """コマンド名の basename を小文字にし、.exe を外したもの。/ と \\ のどちらでも区切る（Issue #291）。"""
    return re.split(r"[/\\]", word or "")[-1].lower().removesuffix(".exe")


def _name(toks):
    return command_name(toks[0]) if toks else ""


def _shell_script_arg(toks):
    """sh -c '…'・pwsh -Command '…' のスクリプト文字列の位置。無ければ None。"""
    name = _name(toks)
    for k, t in enumerate(toks[1:-1], 1):
        low = t.lower()
        if low in ("-c", "-command") or (re.fullmatch(r"-[a-z]*c[a-z]*", low) and name not in ("pwsh", "powershell")):
            return k + 1
    return None


def shell_reads_stdin(tokens):
    """シェルがスクリプトを標準入力から読むか（echo … | bash など、中身をhookが読めない）。"""
    if _name(tokens) not in SHELLS or _shell_script_arg(tokens) is not None:
        return False
    return not any(not t.startswith("-") for t in tokens[1:])


def _heredoc(src, i, cmd, out, depth):
    """<< の直後から区切りの語を読む。次の行からの本文を src から取り除き、cmd の標準入力に結び付ける。"""
    s = src.s
    dash = s.startswith("-", i)
    i += dash
    while i < len(s) and s[i] in " \t":
        i += 1
    delim, quoted = [], False
    while i < len(s) and s[i] not in " \t\r\n;&|()<>":
        c = s[i]
        if c in "'\"":
            j = s.find(c, i + 1)
            if j < 0:
                raise ValueError("heredoc の区切りの引用符が閉じていない")
            delim.append(s[i + 1:j])
            quoted, i = True, j + 1
        elif c == "\\" and i + 1 < len(s):
            delim.append(s[i + 1])
            quoted, i = True, i + 2
        else:
            delim.append(c)
            i += 1
    delim = "".join(delim)
    if not delim:
        raise ValueError("heredoc の区切りが無い")
    line_end = s.find("\n", i)
    if line_end < 0:
        return i
    pos = line_end + 1
    while True:
        nl = s.find("\n", pos)
        end = len(s) if nl < 0 else nl
        if s[pos:end].strip(" \t") == delim:
            body, src.s = s[line_end + 1:pos], s[:line_end + 1] + s[end:]
            break
        if nl < 0:  # 区切りの行が無ければ残り全部が本文
            body, src.s = s[line_end + 1:], s[:line_end + 1]
            break
        pos = nl + 1
    cmd.stdin_texts.append(body)
    if not quoted:  # 区切りが引用符なしなら本文の $(...) は実行される
        _dq(_Src(body), 0, None, out, depth + 1, _Cmd(cmd.scope))
    return i


def _dq(src, i, end, out, depth, cmd):
    """二重引用符の中（end が None なら heredoc の本文）を読み、閉じた次の位置を返す。"""
    while i < len(src.s):
        s = src.s
        c = s[i]
        if end is not None and c == end:
            return i + 1
        if c == "\\" and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt != "\n":
                cmd.add(nxt if nxt in "\"\\$`" else c + nxt, True)
            i += 2
        elif s.startswith("$(", i):
            i = _parse(src, i + 2, ")", out, depth + 1, _child(cmd.scope))
            cmd.add(SUBST, True)
        elif c == "`":
            i = _backtick(src, i + 1, out, depth, _child(cmd.scope))
            cmd.add(SUBST, True)
        else:
            cmd.add(c, True)
            i += 1
    if end is not None:
        raise ValueError("二重引用符が閉じていない")
    return len(src.s)


def _backtick(src, i, out, depth, scope):
    """`...` の中身を別のコマンド列として読み、閉じた次の位置を返す。"""
    s, inner = src.s, []
    while i < len(s):
        c = s[i]
        if c == "`":
            _parse(_Src("".join(inner)), 0, None, out, depth + 1, scope)
            return i + 1
        if c == "\\" and i + 1 < len(s) and s[i + 1] in "`\\$":
            inner.append(s[i + 1])
            i += 2
        else:
            inner.append(c)
            i += 1
    raise ValueError("` が閉じていない")


def _parse(src, i, stop, out, depth, scope=()):
    """src.s[i:] を stop（')' か None）まで読み、見つけたコマンドを out に足す。stop の次の位置を返す。
    scope は、読んでいる文字列が動くサブシェルの並び。( … ) に入るたびに番号を1つ足す。"""
    if depth > MAX_DEPTH:
        raise ValueError("入れ子が深すぎる")
    stack = []  # 開いている ( … ) のサブシェルの番号
    cmd = _Cmd(scope)
    while i < len(src.s):
        s = src.s
        c = s[i]
        if c == "#" and not cmd.started:  # 語頭の # から行末まではコメント（中の引用符も読まない）
            j = s.find("\n", i)
            i = len(s) if j < 0 else j
        elif c == "\\":
            if i + 1 < len(s) and s[i + 1] != "\n":
                cmd.add(s[i + 1], True)
            i += 2
        elif c == "'":
            j = s.find("'", i + 1)
            if j < 0:
                raise ValueError("単一引用符が閉じていない")
            cmd.add(s[i + 1:j], True)
            i = j + 1
        elif c == '"':
            cmd.add("", True)
            i = _dq(src, i + 1, '"', out, depth, cmd)
        elif s.startswith("$(", i):
            i = _parse(src, i + 2, ")", out, depth + 1, _child(cmd.scope))
            cmd.add(SUBST)
        elif c == "`":
            i = _backtick(src, i + 1, out, depth, _child(cmd.scope))
            cmd.add(SUBST)
        elif c in " \t\r":
            cmd.end_word()
            i += 1
        elif c in "<>" or s.startswith("&>", i):
            # 直前の語が引用符なしの数字だけならファイル記述子（2>）
            if c != "&" and cmd.started and not cmd.quoted and "".join(cmd.buf).isdigit():
                cmd.buf, cmd.started = [], False
            else:
                cmd.end_word()
            if s.startswith("<<", i) and not s.startswith("<<<", i):
                i = _heredoc(src, i + 2, cmd, out, depth)
                continue
            j = i + (2 if c == "&" else 1)
            if c != "&" and s.startswith("(", j):  # プロセス置換 <(...) >(...)
                i = _parse(src, j + 1, ")", out, depth + 1, _child(cmd.scope))
                cmd.add(SUBST)
                continue
            while j < len(s) and s[j] in "<>&|":
                j += 1
            cmd.redirect_op = s[i:j]
            i = j
        elif c == ")" and stop == ")" and not stack:
            _finish(cmd, out, depth)
            return i + 1
        elif c in ";&|\n()":
            _finish(cmd, out, depth)
            if c == "(":
                stack.append(next(_SUBSHELL_IDS))
            elif c == ")" and stack:
                stack.pop()
            cmd = _Cmd(scope + tuple(stack))
            i += 1
        else:
            cmd.add(c)
            i += 1
    if stop is not None:
        raise ValueError("$( が閉じていない")
    _finish(cmd, out, depth)
    return len(src.s)


def split_commands_detail(cmd):
    """[Command, ...]（heredoc の本文とサブシェルの並びも持つ）を返す。解析できなければ None（Issue #291）。"""
    out = []
    try:
        _parse(_Src(cmd or ""), 0, None, out, 0)
    except (ValueError, RecursionError):
        return None
    return out


def split_commands(cmd):
    """[(前置きの代入, トークン列, 書き込み先のリダイレクト), ...] を返す。
    引用符が閉じていないなど解析できなければ None。"""
    detail = split_commands_detail(cmd)
    return None if detail is None else [(c.assigns, c.toks, c.redirects) for c in detail]


def dynamic_name(tokens):
    """コマンド名が変数や置換で決まり、何が実行されるか読めないか。"""
    return bool(tokens) and ("$" in tokens[0] or "`" in tokens[0])


def git_invocation(tokens):
    """git コマンドなら {'configs': [-c の値...], 'chdirs': [-C の値...], 'repo_opts': --git-dir・--work-tree の有無,
    'sub': サブコマンド, 'args': [...]}。違えば None。"""
    if not tokens or command_name(tokens[0]) != "git":
        return None
    configs, chdirs, repo_opts, i = [], [], False, 1
    while i < len(tokens) and tokens[i].startswith("-"):
        opt = tokens[i]
        if opt.split("=", 1)[0] in ("--git-dir", "--work-tree"):
            repo_opts = True
        if opt in GIT_VALUE_OPTS:
            value = tokens[i + 1] if i + 1 < len(tokens) else None
            if opt in ("-c", "--config-env") and value is not None:
                configs.append(value)
            if opt == "-C":
                chdirs.append(value)
            i += 2
            continue
        if opt.startswith("--config-env="):
            configs.append(opt.split("=", 1)[1])
        i += 1
    return {"configs": configs, "chdirs": chdirs, "repo_opts": repo_opts,
            "sub": tokens[i] if i < len(tokens) else None,
            "args": tokens[i + 1:]}
