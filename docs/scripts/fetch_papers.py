#!/usr/bin/env python3
"""Download arXiv papers (PDF) and extract plain text alongside them.

Usage:
    python3 docs/scripts/fetch_papers.py            # fetch the curated list
    python3 docs/scripts/fetch_papers.py 1707.06347 # fetch specific arXiv id(s)

PDFs land in docs/papers/<id>-<slug>.pdf and extracted text in
docs/papers/<id>-<slug>.txt so they are greppable without re-parsing.
"""
import sys
import re
import time
import urllib.request
from pathlib import Path

import fitz  # PyMuPDF

PAPERS_DIR = Path(__file__).resolve().parents[1] / "papers"

# Curated reading list. arXiv id -> short slug.
# (The AlphaStar Nature paper is not on arXiv; the rest are.)
CURATED = {
    "1707.06347": "ppo",
    "1802.01561": "impala-vtrace",
    "1708.04782": "sc2le-starcraft2-env",
    "1712.01815": "alphazero",
    "1911.08265": "muzero",
    "1912.06680": "openai-five-dota",
    "2308.03526": "alphastar-unplugged",
    "2301.04104": "dreamerv3",
    "2007.05929": "efficientzero",
    "2105.13807": "gym-microrts",
    "2011.07193": "smac-revisited",
    "2006.07869": "podracer-anakin",  # Acme/podracer scalable RL agents
}

ARXIV_PDF = "https://arxiv.org/pdf/{id}"


def fetch_one(arxiv_id: str, slug: str | None = None) -> None:
    slug = slug or arxiv_id
    pdf_path = PAPERS_DIR / f"{arxiv_id}-{slug}.pdf"
    txt_path = PAPERS_DIR / f"{arxiv_id}-{slug}.txt"
    if pdf_path.exists() and txt_path.exists():
        print(f"  skip (exists): {pdf_path.name}")
        return
    url = ARXIV_PDF.format(id=arxiv_id)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (rts-research)"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                pdf_path.write_bytes(r.read())
            break
        except Exception as e:  # noqa: BLE001
            wait = 2 ** (attempt + 1)
            print(f"  retry {arxiv_id} in {wait}s ({e})")
            time.sleep(wait)
    else:
        print(f"  FAILED: {arxiv_id}")
        return
    # Extract text
    with fitz.open(pdf_path) as doc:
        text = "\n".join(page.get_text() for page in doc)
    txt_path.write_text(text)
    print(f"  ok: {pdf_path.name} ({len(text)//1000}k chars, {pdf_path.stat().st_size//1024}KB)")


def main() -> None:
    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    if args:
        for a in args:
            aid = re.sub(r"^arxiv:", "", a, flags=re.I)
            print(f"fetching {aid}")
            fetch_one(aid)
    else:
        print(f"fetching {len(CURATED)} curated papers -> {PAPERS_DIR}")
        for aid, slug in CURATED.items():
            fetch_one(aid, slug)


if __name__ == "__main__":
    main()
