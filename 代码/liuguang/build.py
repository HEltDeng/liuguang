"""Build a portable, offline HTML demo from the exact web app sources."""
from pathlib import Path
import re

src = Path(__file__).resolve().parent
html = (src / 'index.html').read_text()
html, count = re.subn(r'<link\s+rel="stylesheet"\s+href="style\.css"\s*/?>', lambda _: '<style>' + (src/'style.css').read_text() + '</style>', html)
assert count == 1, "Offline stylesheet missing"
for name in ('data', 'match', 'app'):
    html = html.replace(f'<script src="{name}.js"></script>', '<script>' + (src/f'{name}.js').read_text() + '</script>')
dest = src.parents[1] / '交付成品' / '留光-伦敦站-Demo.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(html)
print(dest)
