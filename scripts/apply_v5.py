from pathlib import Path
import base64, json, zlib
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
parts = sorted((ROOT / '.github' / 'v5_payload').glob('part*.txt'))
packed = ''.join(p.read_text(encoding='utf-8').strip() for p in parts)
files = json.loads(zlib.decompress(base64.b64decode(packed)).decode('utf-8'))
for rel, content in files.items():
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
    print('updated', rel)

IMG = ROOT / 'assets' / 'img'
plans = {
    'brand/custom-mind.webp': ((240, 70), 76),
    'decor/trophy.webp': ((400, 480), 68),
    'decor/freeroll.webp': ((240, 200), 68),
    'decor/cash-game.webp': ((240, 160), 68),
    'decor/laurel.webp': ((240, 160), 68),
    'decor/spear.webp': ((120, 40), 72),
    'decor/marble.webp': ((1200, 800), 62),
    'decor/chip-neutral.webp': ((500, 500), 72),
    'decor/seal-simple.webp': ((500, 500), 72),
    'decor/helmet-simple.webp': ((500, 500), 72),
    'photos/room-master.webp': ((1000, 1334), 66),
    'photos/community-01.webp': ((700, 618), 66),
    'photos/community-02.webp': ((700, 700), 66),
    'photos/hero-mobile.webp': ((900, 1200), 66),
    'photos/hero-desktop.webp': ((1440, 810), 66),
}
for rel, (max_size, quality) in plans.items():
    path = IMG / rel
    if not path.exists():
        continue
    with Image.open(path) as im:
        im.load()
        im.thumbnail(max_size, Image.Resampling.LANCZOS)
        im.save(path, 'WEBP', quality=quality, method=6)
    print('optimized', rel, path.stat().st_size // 1024, 'KiB')

logo = IMG / 'brand' / 'logo-caligulas-white.png'
logo_webp = IMG / 'brand' / 'logo-caligulas-white.webp'
if logo.exists():
    with Image.open(logo) as im:
        im.load()
        im.thumbnail((360, 168), Image.Resampling.LANCZOS)
        im.save(logo_webp, 'WEBP', quality=82, method=6)
    print('created', 'brand/logo-caligulas-white.webp', logo_webp.stat().st_size // 1024, 'KiB')