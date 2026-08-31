from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
css_path = ROOT / 'assets' / 'css' / 'styles.css'
css = css_path.read_text(encoding='utf-8')
marker = '/* V5 — mobile figure/grid hotfix */'
fix = r'''

/* V5 — mobile figure/grid hotfix */
/* Browser default <figure> margins were shrinking cards inside narrow grids. */
figure{margin:0;min-width:0}

@media (max-width:699px){
  /* Gallery: two useful columns at 360px, without inherited figure margins. */
  .gallery-grid{
    width:100%;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:10px
  }
  .gallery-item,.gallery-item.tall,.gallery-item.wide{
    width:auto;
    min-width:0;
    margin:0;
    aspect-ratio:1/1
  }

  /* Home editorial gallery: one full-width hero and two balanced supporting shots. */
  .home-gallery-editorial{width:100%;gap:10px}
  .home-gallery-editorial .g{margin:0;min-width:0}
  .home-gallery-editorial .g.hero-g{width:100%}

  /* Tournament archive: larger swipeable cards instead of three squeezed columns. */
  .archive-preview-grid{
    display:flex;
    gap:10px;
    overflow-x:auto;
    scroll-snap-type:x mandatory;
    padding:2px 0 8px;
    scrollbar-width:none;
    -webkit-overflow-scrolling:touch
  }
  .archive-preview-grid::-webkit-scrollbar{display:none}
  .archive-preview-grid .archive-card{
    flex:0 0 min(72vw,238px);
    min-width:0;
    margin:0;
    scroll-snap-align:start
  }
  .archive-preview-grid .archive-card img{
    width:100%;
    aspect-ratio:4/5;
    object-fit:cover
  }
  .archive-preview-grid .archive-card span{
    font-size:.66rem;
    padding:9px 10px
  }
}
'''

if marker not in css:
    css_path.write_text(css.rstrip() + fix + '\n', encoding='utf-8')
    print('applied responsive figure/grid hotfix')
else:
    print('responsive figure/grid hotfix already present')
