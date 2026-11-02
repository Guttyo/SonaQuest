"""Claude Codeのhookとgitのコミット前フックが共有する判定。標準ライブラリだけを使う。"""
import os
import re
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
