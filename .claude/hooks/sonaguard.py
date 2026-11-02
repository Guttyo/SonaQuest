"""Claude Codeのhookとgitのコミット前フックが共有する判定。標準ライブラリだけを使う。"""
import os
import re
import shlex
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


def missing_markers(old, new):
    """old にあって new で減ったマーカー。内容の書き換えも「減った」に数える。"""
    count = {}
    for m in markers(old):
        count[m] = count.get(m, 0) + 1
    for m in markers(new):
        count[m] = count.get(m, 0) - 1
    return sorted(m for m, n in count.items() if n > 0)


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
# 引用符の中は分けない。; & && | || ( ) ` と改行で1コマンドずつに分ける。
# heredoc の本文（コミットメッセージなど）は除く。
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1([^\n]*)\n.*?^[ \t]*\2[ \t]*$", re.S | re.M)
PUNCT = ";&|()`"
WRAPPERS = {"env", "command", "exec", "nohup", "time", "sudo", "builtin", "nice", "xargs"}
ASSIGN = re.compile(r"^(?:\$env:)?[A-Za-z_][A-Za-z0-9_]*=", re.I)
REDIRECT = re.compile(r"^\d*[<>]")
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"}


def split_commands(cmd):
    """[(前置きの代入, トークン列), ...] を返す。引用符が閉じていないなど解析できなければ None。"""
    text = HEREDOC.sub(r"\3", cmd or "").replace("\n", " ; ")
    lex = shlex.shlex(text, posix=True, punctuation_chars=PUNCT)
    lex.whitespace_split = True
    lex.commenters = ""
    try:
        tokens = list(lex)
    except ValueError:
        return None
    out, cur = [], []
    for t in tokens + [";"]:
        if t and all(c in PUNCT for c in t):
            if cur:
                out.append(cur)
            cur = []
        elif not REDIRECT.match(t):
            cur.append(t)
    result = []
    for toks in out:
        # 前置き（VAR=値、env・sudo など、その直後のオプション）を読み飛ばす
        assigns, i, after_wrapper = [], 0, False
        while i < len(toks):
            t = toks[i]
            if ASSIGN.match(t):
                assigns.append(t)
            elif t in WRAPPERS:
                after_wrapper = True
            elif not (after_wrapper and t.startswith("-")):
                break
            i += 1
        result.append((assigns, toks[i:]))
    return result


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
