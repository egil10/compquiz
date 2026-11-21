#!/usr/bin/env python3
"""Add ?v=<hash> to local .js/.css includes in every HTML page.

GitHub Pages caches files for 10 minutes; without versioned URLs a browser can
mix a new page with an old script and buttons stop working. Run after editing
any .js/.css file (the hash is derived from the file contents).
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def digest(name):
    path = ROOT / name
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8] if path.exists() else None


for html in ROOT.glob("*.html"):
    src = html.read_text(encoding="utf-8")

    def stamp(m):
        attr, name = m.group(1), m.group(2)
        v = digest(name)
        return f'{attr}="{name}?v={v}"' if v else m.group(0)

    out = re.sub(r'(src|href)="([\w./-]+\.(?:js|css))(?:\?v=\w+)?"', stamp, src)
    if out != src:
        html.write_text(out, encoding="utf-8")
        print("stamped", html.name)
