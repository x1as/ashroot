# python tools/icon.py -> public/favicon.png (32), public/icon-192.png, public/apple-touch-icon.png (180)
# A Corinthian helmet with an ember plume: Heracles' bronze and the ash he rises from. 16x16 pixel grid, nearest-neighbour scaling.
import os
from PIL import Image

GRID = [
    '................',
    '...OOOOOOo......',
    '..OOOOOOOOoo....',
    '.oO.....OOOoo...',
    '.........OOOo...',
    '....LLLLL..Oo...',
    '...LBBBBBBb.....',
    '..LBBBBBBBBb....',
    '..LBkkkBkkkb....',
    '..LBBkkBkkBb....',
    '..LBBBkkkBBb....',
    '..LBBBkkkBBb....',
    '...LBBkkkBb.....',
    '...LBBk.kBb.....',
    '....LBk.kb......',
    '................',
]
PAL = {'O': (255, 143, 58), 'o': (181, 72, 28), 'L': (240, 217, 160), 'B': (200, 146, 74), 'b': (122, 81, 38), 'k': (7, 5, 12)}
BG = (7, 5, 12, 255)

def render(size, bg):
    cell = 16
    im = Image.new('RGBA', (cell, cell), bg if bg else (0, 0, 0, 0))
    for y, row in enumerate(GRID):
        for x, ch in enumerate(row):
            if ch in PAL:
                im.putpixel((x + 1, y), PAL[ch] + (255,))  # shift right one pixel to centre the silhouette
    scale = size // cell
    big = im.resize((cell * scale, cell * scale), Image.NEAREST)
    out = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    out.paste(big, ((size - big.width) // 2, (size - big.height) // 2), big)
    return out

root = os.path.join(os.path.dirname(__file__), '..', 'public')
os.makedirs(root, exist_ok=True)
render(32, None).save(os.path.join(root, 'favicon.png'))
render(192, BG).save(os.path.join(root, 'icon-192.png'))
render(180, BG).save(os.path.join(root, 'apple-touch-icon.png'))
print('icons written to public/')
