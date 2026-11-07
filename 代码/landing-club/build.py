"""Build a portable, offline HTML demo from the exact web app sources."""
from pathlib import Path

src = Path(__file__).resolve().parent
html = (src / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (src/'style.css').read_text() + '</style>')
for name in ('data', 'match', 'app'):
    html = html.replace(f'<script src="{name}.js"></script>', '<script>' + (src/f'{name}.js').read_text() + '</script>')
dest = src.parents[1] / '交付成品' / '岸友-伦敦站-Demo.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(html)
print(dest)
