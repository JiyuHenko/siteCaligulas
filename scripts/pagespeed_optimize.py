from pathlib import Path
import re

from bs4 import BeautifulSoup
from PIL import Image, ImageOps
import csscompressor
import rjsmin

ROOT = Path(__file__).resolve().parents[1]
PERF = ROOT / "assets" / "img" / "perf"


def make_webp(src_rel, dst_rel, width, quality=74):
    src = ROOT / src_rel
    dst = ROOT / dst_rel
    if not src.exists():
        print(f"skip missing: {src_rel}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)
        if im.width > width:
            height = max(1, round(im.height * (width / im.width)))
            im = im.resize((width, height), Image.Resampling.LANCZOS)
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        im.save(dst, "WEBP", quality=quality, method=6)
    print(f"optimized {src_rel} -> {dst_rel} ({dst.stat().st_size // 1024} KiB)")


def img_size(rel):
    p = ROOT / rel
    if not p.exists():
        return None
    try:
        with Image.open(p) as im:
            return im.size
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Responsive derivatives. Originals stay in place for lightbox / archival use.
# ---------------------------------------------------------------------------
make_webp("assets/img/photos/hero-mobile.webp", "assets/img/perf/photos/hero-mobile-720.webp", 720, 72)
make_webp("assets/img/photos/hero-desktop.webp", "assets/img/perf/photos/hero-desktop-1440.webp", 1440, 74)

photos_dir = ROOT / "assets/img/photos"
for src in photos_dir.glob("*.webp"):
    if src.stem in {"hero-mobile", "hero-desktop"}:
        continue
    rel = src.relative_to(ROOT).as_posix()
    make_webp(rel, f"assets/img/perf/photos/{src.stem}-360.webp", 360, 68)
    make_webp(rel, f"assets/img/perf/photos/{src.stem}-640.webp", 640, 70)
    if src.stem == "room-master":
        make_webp(rel, "assets/img/perf/photos/room-master-960.webp", 960, 70)

for src in (ROOT / "assets/img/events").glob("*.webp"):
    rel = src.relative_to(ROOT).as_posix()
    make_webp(rel, f"assets/img/perf/events/{src.stem}-240.webp", 240, 66)
    make_webp(rel, f"assets/img/perf/events/{src.stem}-420.webp", 420, 68)

for src in (ROOT / "assets/img/cps").glob("*.webp"):
    rel = src.relative_to(ROOT).as_posix()
    make_webp(rel, f"assets/img/perf/cps/{src.stem}-320.webp", 320, 67)
    make_webp(rel, f"assets/img/perf/cps/{src.stem}-480.webp", 480, 69)

make_webp("assets/img/decor/cash-game.webp", "assets/img/perf/decor/cash-game-220.webp", 220, 78)
make_webp("assets/img/decor/freeroll.webp", "assets/img/perf/decor/freeroll-220.webp", 220, 78)
make_webp("assets/img/decor/trophy.webp", "assets/img/perf/decor/trophy-220.webp", 220, 79)
make_webp("assets/img/decor/trophy.webp", "assets/img/perf/decor/trophy-520.webp", 520, 78)
make_webp("assets/img/decor/spear.webp", "assets/img/perf/decor/spear-96.webp", 96, 82)
make_webp("assets/img/decor/chip-neutral.webp", "assets/img/perf/decor/chip-neutral-260.webp", 260, 80)
make_webp("assets/img/decor/laurel.webp", "assets/img/perf/decor/laurel-220.webp", 220, 80)
make_webp("assets/img/decor/marble.webp", "assets/img/perf/decor/marble-960.webp", 960, 62)
make_webp("assets/img/brand/custom-mind.webp", "assets/img/perf/brand/custom-mind-260.webp", 260, 82)
make_webp("assets/img/brand/logo-caligulas-white.png", "assets/img/perf/brand/logo-caligulas-white-360.webp", 360, 88)


# ---------------------------------------------------------------------------
# CSS: remove font @import chain, use lightweight decorative derivatives,
# improve footer contrast, and create a minified production stylesheet.
# ---------------------------------------------------------------------------
css_path = ROOT / "assets/css/styles.css"
css = css_path.read_text(encoding="utf-8")
css = re.sub(r"^\s*@import\s+url\([^\n]+\);\s*", "", css, count=1)
css = css.replace("../img/decor/laurel.webp", "../img/perf/decor/laurel-220.webp")
css = css.replace("../img/decor/marble.webp", "../img/perf/decor/marble-960.webp")

marker = "/* V6 — PageSpeed delivery */"
if marker not in css:
    css += """

/* V6 — PageSpeed delivery */
.footer-nav a{color:#b7afa4}
.footer-bottom{color:#aaa297}
.creator-credit{color:#aaa297}
.creator-credit img{opacity:.9}
iframe[data-map-embed]:not([src]){background:radial-gradient(circle at 50% 45%,rgba(199,162,88,.08),transparent 34%),#0b0a09}
"""
css_path.write_text(css, encoding="utf-8")
(ROOT / "assets/css/styles.min.css").write_text(csscompressor.compress(css), encoding="utf-8")


# ---------------------------------------------------------------------------
# JS: strict lazy loading for Google Maps + full-resolution lightbox source.
# This keeps Maps out of the initial Lighthouse/network path.
# ---------------------------------------------------------------------------
site_js_path = ROOT / "assets/js/site.js"
site_js = site_js_path.read_text(encoding="utf-8")
old_maps = """  $$('iframe[data-map-embed]').forEach(frame=>{\n    const q=encodeURIComponent(cfg.mapsQuery||cfg.address||'Caligulas Poker Live, Passos, MG');\n    frame.src=`https://www.google.com/maps?q=${q}&output=embed`;\n  });"""
new_maps = """  const mapFrames=$$('iframe[data-map-embed]');\n  const loadMap=frame=>{\n    if(frame.dataset.mapLoaded==='1')return;\n    const q=encodeURIComponent(cfg.mapsQuery||cfg.address||'Caligulas Poker Live, Passos, MG');\n    frame.src=`https://www.google.com/maps?q=${q}&output=embed`;\n    frame.dataset.mapLoaded='1';\n  };\n  if(mapFrames.length&&'IntersectionObserver'in window){\n    const mapObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{\n      if(entry.isIntersecting){loadMap(entry.target);mapObserver.unobserve(entry.target)}\n    }),{rootMargin:'100px 0px',threshold:.01});\n    mapFrames.forEach(frame=>mapObserver.observe(frame));\n  }else mapFrames.forEach(loadMap);"""
if old_maps in site_js:
    site_js = site_js.replace(old_maps, new_maps)
elif "const mapFrames=$$('iframe[data-map-embed]')" not in site_js:
    raise RuntimeError("Map block not found; refusing to silently skip optimization")

site_js = site_js.replace(
    'lbImg.src=img.currentSrc||img.src;lbImg.alt=img.alt||"";lb.classList.add("open");',
    'lbImg.src=img.dataset.full||img.currentSrc||img.src;lbImg.alt=img.alt||"";lb.classList.add("open");'
)
site_js_path.write_text(site_js, encoding="utf-8")

for name in ["site.js", "api.js", "ranking-fallback.js", "ranking-page.js"]:
    src = ROOT / "assets/js" / name
    if src.exists():
        min_name = name.replace(".js", ".min.js")
        (ROOT / "assets/js" / min_name).write_text(rjsmin.jsmin(src.read_text(encoding="utf-8")), encoding="utf-8")


FONT_URL = "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap"
PUBLIC_PAGES = list(ROOT.glob("*.html"))


def has_class(tag, cls):
    return cls in (tag.get("class") or [])


def set_local_dimensions(img):
    src = img.get("src", "")
    if not src or src.startswith(("http://", "https://", "data:")):
        return
    dims = img_size(src)
    if dims:
        img["width"], img["height"] = str(dims[0]), str(dims[1])


def add_font_hints(soup):
    head = soup.head
    if not head:
        return
    for tag in list(head.find_all("link")):
        href = tag.get("href", "")
        if "fonts.googleapis.com" in href or "fonts.gstatic.com" in href:
            tag.decompose()
    for ns in list(head.find_all("noscript")):
        if "fonts.googleapis.com" in str(ns):
            ns.decompose()

    pre1 = soup.new_tag("link", rel="preconnect", href="https://fonts.googleapis.com")
    pre2 = soup.new_tag("link", rel="preconnect", href="https://fonts.gstatic.com")
    pre2["crossorigin"] = ""
    font = soup.new_tag("link", rel="stylesheet", href=FONT_URL)
    font["media"] = "print"
    font["onload"] = "this.media='all'"
    ns = soup.new_tag("noscript")
    ns.append(soup.new_tag("link", rel="stylesheet", href=FONT_URL))

    style_link = head.find("link", href=re.compile(r"assets/css/styles(?:\.min)?\.css"))
    anchor = style_link if style_link else head.find("title")
    for tag in [pre1, pre2, font, ns]:
        if anchor:
            anchor.insert_before(tag)
        else:
            head.append(tag)


def optimize_image_tag(img):
    src = img.get("src", "")
    original = src
    classes = img.get("class") or []
    parent_classes = img.parent.get("class") or [] if img.parent else []

    if img.has_attr("data-lightbox") and src.startswith("assets/img/"):
        img["data-full"] = src

    # Brand assets
    if src == "assets/img/brand/logo-caligulas-white.png":
        src = "assets/img/perf/brand/logo-caligulas-white-360.webp"
    elif src == "assets/img/brand/custom-mind.webp":
        src = "assets/img/perf/brand/custom-mind-260.webp"

    # Small / medium decorative assets
    elif src == "assets/img/decor/spear.webp":
        src = "assets/img/perf/decor/spear-96.webp"
    elif src == "assets/img/decor/chip-neutral.webp":
        src = "assets/img/perf/decor/chip-neutral-260.webp"
    elif src == "assets/img/decor/cash-game.webp":
        src = "assets/img/perf/decor/cash-game-220.webp"
    elif src == "assets/img/decor/freeroll.webp":
        src = "assets/img/perf/decor/freeroll-220.webp"
    elif src == "assets/img/decor/trophy.webp":
        if "home-award-asset" in classes or "award-intro-trophy" in classes:
            src = "assets/img/perf/decor/trophy-520.webp"
        else:
            src = "assets/img/perf/decor/trophy-220.webp"

    # Hero LCP
    elif src == "assets/img/photos/hero-mobile.webp":
        src = "assets/img/perf/photos/hero-mobile-720.webp"
        img["fetchpriority"] = "high"
        img.attrs.pop("loading", None)

    # Real photos: responsive thumbnail for normal page rendering, original for lightbox.
    elif src.startswith("assets/img/photos/") and src.endswith(".webp"):
        stem = Path(src).stem
        if img.has_attr("data-lightbox"):
            img["data-full"] = original
        base360 = f"assets/img/perf/photos/{stem}-360.webp"
        base640 = f"assets/img/perf/photos/{stem}-640.webp"
        img["src"] = base360
        srcset = f"{base360} 360w, {base640} 640w"
        if stem == "room-master":
            base960 = "assets/img/perf/photos/room-master-960.webp"
            srcset += f", {base960} 960w"
        img["srcset"] = srcset
        if "hero-g" in parent_classes or "house-photo" in parent_classes:
            img["sizes"] = "(max-width:699px) calc(100vw - 28px), (max-width:939px) 68vw, 760px"
            img["src"] = base640
        else:
            img["sizes"] = "(max-width:699px) calc(50vw - 24px), (max-width:939px) 33vw, 300px"
        src = img["src"]

    # Historical event posters
    elif src.startswith("assets/img/events/") and src.endswith(".webp"):
        stem = Path(src).stem
        if img.has_attr("data-lightbox"):
            img["data-full"] = original
        p240 = f"assets/img/perf/events/{stem}-240.webp"
        p420 = f"assets/img/perf/events/{stem}-420.webp"
        src = p240
        img["srcset"] = f"{p240} 240w, {p420} 420w"
        img["sizes"] = "(max-width:699px) 72vw, (max-width:939px) 33vw, 300px"

    # CPS posters
    elif src.startswith("assets/img/cps/") and src.endswith(".webp"):
        stem = Path(src).stem
        if img.has_attr("data-lightbox"):
            img["data-full"] = original
        p320 = f"assets/img/perf/cps/{stem}-320.webp"
        p480 = f"assets/img/perf/cps/{stem}-480.webp"
        src = p320
        img["srcset"] = f"{p320} 320w, {p480} 480w"
        img["sizes"] = "(max-width:699px) 72vw, (max-width:939px) 45vw, 420px"

    img["src"] = src
    img["decoding"] = "async"

    # Keep only truly above-the-fold images eager.
    in_nav_logo = bool(img.find_parent(class_="nav-logo"))
    if img.get("fetchpriority") != "high" and "hero-brand" not in classes and not in_nav_logo:
        img["loading"] = "lazy"

    set_local_dimensions(img)


for page in PUBLIC_PAGES:
    soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
    head = soup.head
    if head:
        css_link = head.find("link", href=re.compile(r"assets/css/styles(?:\.min)?\.css"))
        if css_link:
            css_link["href"] = "assets/css/styles.min.css"
        add_font_hints(soup)

        # Hero image preload only on the home page.
        for old in list(head.find_all("link", attrs={"data-hero-preload": True})):
            old.decompose()
        if page.name == "index.html":
            mobile_preload = soup.new_tag("link", rel="preload", href="assets/img/perf/photos/hero-mobile-720.webp")
            mobile_preload["as"] = "image"
            mobile_preload["media"] = "(max-width: 939px)"
            mobile_preload["fetchpriority"] = "high"
            mobile_preload["data-hero-preload"] = "mobile"
            desktop_preload = soup.new_tag("link", rel="preload", href="assets/img/perf/photos/hero-desktop-1440.webp")
            desktop_preload["as"] = "image"
            desktop_preload["media"] = "(min-width: 940px)"
            desktop_preload["fetchpriority"] = "high"
            desktop_preload["data-hero-preload"] = "desktop"
            head.append(mobile_preload)
            head.append(desktop_preload)

    # Desktop hero source.
    for source in soup.find_all("source"):
        if source.get("srcset") == "assets/img/photos/hero-desktop.webp":
            source["srcset"] = "assets/img/perf/photos/hero-desktop-1440.webp"

    for img in soup.find_all("img"):
        optimize_image_tag(img)

    # Production JS minified; remove ranking API payload from pages that do not use it.
    for script in list(soup.find_all("script", src=True)):
        src = script.get("src", "")
        if page.name not in {"index.html", "ranking.html"} and src in {
            "assets/js/api.js", "assets/js/api.min.js",
            "assets/js/ranking-fallback.js", "assets/js/ranking-fallback.min.js"
        }:
            script.decompose()
            continue
        replacements = {
            "assets/js/site.js": "assets/js/site.min.js",
            "assets/js/api.js": "assets/js/api.min.js",
            "assets/js/ranking-fallback.js": "assets/js/ranking-fallback.min.js",
            "assets/js/ranking-page.js": "assets/js/ranking-page.min.js",
        }
        if src in replacements:
            script["src"] = replacements[src]
        if script.get("src"):
            script["defer"] = ""

    page.write_text(str(soup), encoding="utf-8")

print("PageSpeed optimization pass complete")
