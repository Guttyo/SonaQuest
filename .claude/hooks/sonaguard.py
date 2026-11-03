"""Claude Codeのhookとgitのコミット前フックが共有する判定。標準ライブラリだけを使う。"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 値の形で見分けられる秘密情報。placeholder（短い文字列）には反応しない。
SECRET_PATTERNS = [
    ("Anthropic APIキー", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("ElevenLabs APIキー", re.compile(r"\bsk_[a-f0-9]{40,}\b")),
    ("秘密鍵", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("秘密情報の代入", re.compile(
        r"\b(?:ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN)"
        r"[ \t]*[=:][ \t]*[\"']?[A-Za-z0-9_\-.]{16,}")),
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


def lost_markers(old, new):
    """old から new で減ったマーカーと、その数。内容の書き換えも「減った」に数える。"""
    count = {}
    for m in markers(old):
        count[m] = count.get(m, 0) + 1
    for m in markers(new):
        count[m] = count.get(m, 0) - 1
    return {m: n for m, n in count.items() if n > 0}


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


def undecided(lost, decided):
    """減ったマーカーのうち、決定の行による解除と認められないもの。"""
    return sorted(m for m, n in lost.items() if n > decided.get(m, 0))


def main_text(path):
    """ローカルの main にあるそのファイルの内容（オーナーがPRでマージした状態）。
    リポジトリの外、main に無いファイル、gitが使えないときは None。"""
    if not path:
        return None
    m = re.match(r"^/([a-zA-Z])/(.*)$", path)
    if m and os.name == "nt":
        path = f"{m.group(1)}:/{m.group(2)}"
    p = Path(path)
    try:
        r = subprocess.run(["git", "-C", str(p.parent), "show", f"main:./{p.name}"], capture_output=True)
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
WRAPPERS = {"env", "command", "exec", "nohup", "time", "sudo", "builtin", "nice", "xargs"}
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
}
KEYWORDS = {"{", "}", "!", "if", "then", "else", "elif", "do", "while", "until"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "pwsh", "powershell"}
ASSIGN = re.compile(r"^(?:\$env:)?[A-Za-z_][A-Za-z0-9_]*=", re.I)
SUBST = "$(...)"  # 置換が入った語に残す印。コマンド名が動的かどうかを呼び出し側が見分ける
MAX_DEPTH = 8
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"}


class _Src:
    """読んでいる文字列。heredoc の本文を取り除くと短くなるので、入れ子の読み手で共有する。"""

    def __init__(self, s):
        self.s = s


class _Cmd:
    """読み途中の1コマンド。"""

    def __init__(self):
        self.words, self.redirects, self.stdin_texts = [], [], []
        self.buf, self.started, self.quoted = [], False, False
        self.redirect_op = None  # 直後の語をリダイレクトの宛先として読む

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


def _finish(cmd, out, depth):
    cmd.end_word()
    toks = cmd.words
    # 前置き（VAR=値、env・sudo など、そのオプションと値、{ ! if do など）を読み飛ばす
    assigns, i, wrapper = [], 0, None
    while i < len(toks):
        t = toks[i]
        if ASSIGN.match(t):
            assigns.append(t)
        elif t in WRAPPERS:
            wrapper = t
        elif wrapper and t.startswith("-"):
            takes_value = t in WRAPPER_VALUE_OPTS.get(wrapper, ())
            if wrapper == "env":  # env -S '文字列' は文字列をコマンドとして分けて実行する
                value = None
                if t in ("-S", "--split-string"):
                    value = toks[i + 1] if i + 1 < len(toks) else ""
                elif t.startswith("--split-string="):
                    value = t.split("=", 1)[1]
                elif t.startswith("-S"):
                    value = t[2:]
                if value is not None:
                    _parse(_Src(value), 0, None, out, depth + 1)
            if takes_value:
                i += 1
        elif t not in KEYWORDS:
            break
        i += 1
    toks = toks[i:]
    if not (toks or assigns or cmd.redirects):
        return
    # eval と sh -c・pwsh -Command に渡した文字列、シェルが標準入力で受け取る heredoc も
    # 1つのコマンド列として調べる
    name = _name(toks)
    if name == "eval":
        _parse(_Src(" ".join(toks[1:])), 0, None, out, depth + 1)
    elif name in SHELLS:
        script = _shell_script_arg(toks)
        if script is not None:
            _parse(_Src(toks[script]), 0, None, out, depth + 1)
        for text in cmd.stdin_texts:
            _parse(_Src(text), 0, None, out, depth + 1)
    out.append((assigns, toks, cmd.redirects))


def _name(toks):
    return os.path.basename(toks[0]).lower().removesuffix(".exe") if toks else ""


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
        _dq(_Src(body), 0, None, out, depth + 1, _Cmd())
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
            i = _parse(src, i + 2, ")", out, depth + 1)
            cmd.add(SUBST, True)
        elif c == "`":
            i = _backtick(src, i + 1, out, depth)
            cmd.add(SUBST, True)
        else:
            cmd.add(c, True)
            i += 1
    if end is not None:
        raise ValueError("二重引用符が閉じていない")
    return len(src.s)


def _backtick(src, i, out, depth):
    """`...` の中身を別のコマンド列として読み、閉じた次の位置を返す。"""
    s, inner = src.s, []
    while i < len(s):
        c = s[i]
        if c == "`":
            _parse(_Src("".join(inner)), 0, None, out, depth + 1)
            return i + 1
        if c == "\\" and i + 1 < len(s) and s[i + 1] in "`\\$":
            inner.append(s[i + 1])
            i += 2
        else:
            inner.append(c)
            i += 1
    raise ValueError("` が閉じていない")


def _parse(src, i, stop, out, depth):
    """src.s[i:] を stop（')' か None）まで読み、見つけたコマンドを out に足す。stop の次の位置を返す。"""
    if depth > MAX_DEPTH:
        raise ValueError("入れ子が深すぎる")
    cmd, paren = _Cmd(), 0
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
            i = _parse(src, i + 2, ")", out, depth + 1)
            cmd.add(SUBST)
        elif c == "`":
            i = _backtick(src, i + 1, out, depth)
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
                i = _parse(src, j + 1, ")", out, depth + 1)
                cmd.add(SUBST)
                continue
            while j < len(s) and s[j] in "<>&|":
                j += 1
            cmd.redirect_op = s[i:j]
            i = j
        elif c == ")" and stop == ")" and paren == 0:
            _finish(cmd, out, depth)
            return i + 1
        elif c in ";&|\n()":
            if c == "(":
                paren += 1
            elif c == ")":
                paren = max(paren - 1, 0)
            _finish(cmd, out, depth)
            cmd = _Cmd()
            i += 1
        else:
            cmd.add(c)
            i += 1
    if stop is not None:
        raise ValueError("$( が閉じていない")
    _finish(cmd, out, depth)
    return len(src.s)


def split_commands(cmd):
    """[(前置きの代入, トークン列, 書き込み先のリダイレクト), ...] を返す。
    引用符が閉じていないなど解析できなければ None。"""
    out = []
    try:
        _parse(_Src(cmd or ""), 0, None, out, 0)
    except (ValueError, RecursionError):
        return None
    return out


def dynamic_name(tokens):
    """コマンド名が変数や置換で決まり、何が実行されるか読めないか。"""
    return bool(tokens) and ("$" in tokens[0] or "`" in tokens[0])


def git_invocation(tokens):
    """git コマンドなら {'configs': [-c の値...], 'sub': サブコマンド, 'args': [...]}。違えば None。"""
    if not tokens or os.path.basename(tokens[0]).lower() not in ("git", "git.exe"):
        return None
    configs, i = [], 1
    while i < len(tokens) and tokens[i].startswith("-"):
        opt = tokens[i]
        if opt in GIT_VALUE_OPTS:
            if opt in ("-c", "--config-env") and i + 1 < len(tokens):
                configs.append(tokens[i + 1])
            i += 2
            continue
        if opt.startswith("--config-env="):
            configs.append(opt.split("=", 1)[1])
        i += 1
    return {"configs": configs,
            "sub": tokens[i] if i < len(tokens) else None,
            "args": tokens[i + 1:]}
