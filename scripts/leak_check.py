"""Fail if a tracked file mentions something personal: the owner's machines, servers, other projects or contact details.

The words themselves aren't listed here (that would leak them). Each is stored as the start of its SHA-256, and the
check hashes every word and pair of words in every tracked file. Extra words can go in `notes/leak-words.txt`
(gitignored, one per line, plain text), which only exists in a dev checkout.

Run: `uv run python scripts/leak_check.py`. Exit 1 lists file:line for each hit.
"""

import hashlib
import itertools
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BANNED = {
    "dcebedde787693c6",
    "669d010f4e4be008",
    "6616206a8e67a0e9",
    "83e7d25729f4f491",
    "9985c202d7aa3267",
    "f8028986316ac593",
    "e71edc3b90b4c36d",
    "96b98f8a7417f899",
    "db7b1de406b0d24a",
}

# Plain patterns that are personal by shape, whoever's they are.
PATTERNS = [
    re.compile(r"/(?:var/)?home/(?!linuxbrew\b)[a-z][\w.-]*/", re.I),  # someone's home directory
    re.compile(r"[\w.+-]+@(?:gmail|outlook|hotmail|yahoo|icloud|proton(?:mail)?)\.\w+", re.I),  # a personal email
]

SKIP = {"uv.lock", "app/package-lock.json", "requirements.lock"}
SKIP_SUFFIX = (".png", ".jpg", ".webp", ".woff2", ".ico", ".jar", ".keystore", ".jks")


def digest(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [f for f in out.splitlines() if f not in SKIP and not f.endswith(SKIP_SUFFIX) and (ROOT / f).is_file()]


def main() -> int:
    banned = set(BANNED)
    extra = ROOT / "notes" / "leak-words.txt"
    if extra.exists():
        banned |= {digest(w.strip().lower()) for w in extra.read_text().splitlines() if w.strip()}
    hits = []
    for name in files():
        try:
            text = (ROOT / name).read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            words = re.findall(r"[a-z0-9]+", line.lower())
            grams = words + [f"{a} {b}" for a, b in itertools.pairwise(words)]
            if any(digest(g) in banned for g in grams) or any(p.search(line) for p in PATTERNS):
                hits.append(f"{name}:{n}")
    if hits:
        print("Personal details found in tracked files:", *hits, sep="\n  ")
        return 1
    print(f"leak check: {len(files())} files clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
