(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const cfg = window.CALIGULAS_CONFIG || {};
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compact = window.matchMedia('(max-width: 699px)').matches;

  const icons = {
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.5 6.5h.01"></path></svg>',
    whatsapp:
      '<svg class="icon-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.074-.297-.148-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.009-.371-.011-.57-.011-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.897a9.825 9.825 0 0 1 2.893 6.99c-.003 5.45-4.437 9.884-9.884 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.334.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"></path></svg>',
    mail:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path></svg>'
  };

  function esc(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]);
  }

  function hydratePublicLinks() {
    $$('a[href="casa.html"]').forEach(anchor => {
      anchor.textContent = 'Sobre';
    });

    $$('[data-instagram]').forEach(anchor => {
      anchor.href = cfg.instagram || '#';
      anchor.target = '_blank';
      anchor.rel = 'noopener';
    });

    $$('[data-whatsapp]').forEach(anchor => {
      const message = encodeURIComponent(anchor.dataset.message || cfg.whatsappMessage || 'Olá!');
      anchor.href = `https://wa.me/${cfg.whatsappNumber}?text=${message}`;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
    });

    $$('[data-email]').forEach(anchor => {
      anchor.href = `mailto:${cfg.email || ''}`;
    });

    $$('[data-map]').forEach(anchor => {
      const query = encodeURIComponent(cfg.mapsQuery || cfg.address || '');
      anchor.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
    });

    $$('[data-address]').forEach(element => {
      element.textContent = cfg.address || '';
    });

    $$('.js-year').forEach(element => {
      element.textContent = new Date().getFullYear();
    });

    $$('[data-icon]').forEach(element => {
      const markup = icons[element.dataset.icon];
      if (markup) element.innerHTML = markup;
    });
  }

  function mountFloatingSocials() {
    if (!cfg.whatsappNumber && !cfg.instagram) return;

    const dock = document.createElement('nav');
    dock.className = 'floating-socials';
    dock.setAttribute('aria-label', 'Atalhos sociais');

    const items = [
      cfg.whatsappNumber
        ? {
            label: 'Falar no WhatsApp',
            href: `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent(cfg.whatsappMessage || 'Olá!')}`,
            icon: 'whatsapp'
          }
        : null,
      cfg.instagram
        ? {
            label: 'Abrir Instagram',
            href: cfg.instagram,
            icon: 'instagram'
          }
        : null
    ].filter(Boolean);

    dock.innerHTML = items.map(item => `
      <a class="floating-social" href="${esc(item.href)}" target="_blank" rel="noopener" aria-label="${esc(item.label)}">
        ${icons[item.icon]}
      </a>
    `).join('');

    document.body.appendChild(dock);

    const footer = $('.site-footer');
    if (!footer) return;

    let ticking = false;
    const updateVisibility = () => {
      ticking = false;
      const dockRect = dock.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      dock.classList.toggle('is-footer-hidden', footerRect.top <= dockRect.bottom + 12);
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateVisibility);
    };

    updateVisibility();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
  }

  function setupNavigation() {
    const header = $('.site-header');
    const menuButton = $('#menuBtn');
    const mobileNav = $('#mobileNav');

    const closeMenu = () => {
      mobileNav?.classList.remove('open');
      document.body.classList.remove('menu-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    };

    menuButton?.addEventListener('click', () => {
      const shouldOpen = !mobileNav?.classList.contains('open');
      mobileNav?.classList.toggle('open', shouldOpen);
      document.body.classList.toggle('menu-open', shouldOpen);
      menuButton.setAttribute('aria-expanded', String(shouldOpen));
    });

    $$('#mobileNav a').forEach(anchor => anchor.addEventListener('click', closeMenu));

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });

    if (!document.body.classList.contains('home-page')) {
      const update = () => header?.classList.toggle('scrolled', window.scrollY > 20);
      update();
      window.addEventListener('scroll', update, { passive: true });
    }
  }

  function setupHomeHeroTransition() {
    if (!document.body.classList.contains('home-page')) return;

    const hero = $('[data-home-hero]');
    const header = $('.site-header');
    const headerLogo = $('.nav-logo img');
    const flight = $('#heroLogoFlight');

    if (!hero || !header || !headerLogo || !flight) {
      header?.classList.add('header-revealed', 'logo-arrived');
      return;
    }

    if (prefersReducedMotion) {
      header.classList.add('header-revealed', 'logo-arrived');
      flight.hidden = true;
      return;
    }

    let target = null;
    let ticking = false;

    const measure = () => {
      const targetRect = headerLogo.getBoundingClientRect();
      const flightStyle = getComputedStyle(flight);
      const sourceWidth = flight.offsetWidth || 1;
      const sourceHeight = flight.offsetHeight || 1;
      const sourceTop = parseFloat(flightStyle.top) || 0;

      target = {
        dx: targetRect.left + targetRect.width / 2 - window.innerWidth / 2,
        dy: targetRect.top + targetRect.height / 2 - (sourceTop + sourceHeight / 2),
        scale: Math.max(.2, Math.min(1, targetRect.width / sourceWidth))
      };
    };

    const render = () => {
      ticking = false;
      if (!target) measure();

      const heroHeight = Math.max(hero.offsetHeight, window.innerHeight);
      const flightEnd = Math.max(220, heroHeight * .68);
      const progress = Math.min(1, Math.max(0, window.scrollY / flightEnd));
      const eased = 1 - Math.pow(1 - progress, 3);

      flight.style.setProperty('--flight-x', `${target.dx * eased}px`);
      flight.style.setProperty('--flight-y', `${target.dy * eased}px`);
      flight.style.setProperty('--flight-scale', String(1 + (target.scale - 1) * eased));

      const heroBottom = hero.getBoundingClientRect().bottom;
      const revealHeader = heroBottom <= Math.max(84, header.offsetHeight + 18);

      header.classList.toggle('header-revealed', revealHeader);
      header.classList.toggle('logo-arrived', revealHeader);
      flight.classList.toggle('is-complete', revealHeader);
    };

    const requestRender = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(render);
    };

    measure();
    render();
    window.addEventListener('scroll', requestRender, { passive: true });
    window.addEventListener('resize', () => {
      target = null;
      requestRender();
    }, { passive: true });
  }

  function setupSmoothAnchors() {
    $$('[data-scroll]').forEach(anchor => {
      anchor.addEventListener('click', event => {
        const href = anchor.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        const target = $(href);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });

        if (history.replaceState) history.replaceState(null, '', href);
      });
    });
  }

  function setupReveal() {
    const items = $$('[data-reveal]');
    if (!items.length) return;

    if (compact || prefersReducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12 });

    items.forEach(item => observer.observe(item));
  }

  function setupMaps() {
    const frames = $$('iframe[data-map-embed]');
    if (!frames.length) return;

    const load = frame => {
      if (frame.dataset.mapLoaded === '1') return;
      const query = encodeURIComponent(cfg.mapsQuery || cfg.address || 'Caligulas Poker Live, Passos, MG');
      frame.src = `https://www.google.com/maps?q=${query}&output=embed`;
      frame.dataset.mapLoaded = '1';
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          load(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '120px 0px', threshold: .01 });
      frames.forEach(frame => observer.observe(frame));
    } else {
      frames.forEach(load);
    }
  }

  function setupLightbox() {
    const lightbox = $('#lightbox');
    const image = $('#lightboxImg');
    if (!lightbox || !image) return;

    const close = () => {
      lightbox.classList.remove('open');
      image.src = '';
    };

    $$('[data-lightbox]').forEach(item => {
      item.addEventListener('click', () => {
        image.src = item.dataset.full || item.currentSrc || item.src;
        image.alt = item.alt || '';
        lightbox.classList.add('open');
      });
    });

    lightbox.addEventListener('click', event => {
      if (event.target === lightbox || event.target.closest('[data-close-lightbox]')) close();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }

  async function setupHomeGalleryPreview() {
    if (!document.body.classList.contains('home-page')) return;

    const grid = $('.gallery-grid');
    if (!grid) return;

    const targets = $$('[data-lightbox]', grid).slice(0, 4);
    if (targets.length < 4) return;

    try {
      const response = await fetch('galeria.html', { cache: 'no-cache' });
      if (!response.ok) return;

      const html = await response.text();
      const galleryDocument = new DOMParser().parseFromString(html, 'text/html');
      const sources = $$('.gallery-grid [data-lightbox]', galleryDocument).slice(0, 4);
      if (sources.length < 4) return;

      targets.forEach((target, index) => {
        const source = sources[index];
        ['src', 'srcset', 'sizes', 'width', 'height', 'alt', 'data-full'].forEach(attribute => {
          const value = source.getAttribute(attribute);
          if (value !== null) target.setAttribute(attribute, value);
          else target.removeAttribute(attribute);
        });
      });
    } catch (error) {
      // Keep the static fallback if the gallery page cannot be read.
    }
  }

  function setupHomeRankingPreview() {
    const preview = $('#rankingPreview');
    if (!preview || !window.CaligulasAPI) return;

    const render = async () => {
      try {
        const data = await window.CaligulasAPI.getRanking();
        const rows = data.rows.slice(0, 3);
        preview.innerHTML = rows.map((row, index) => `
          <article class="rank-tile glass">
            <div class="pos">${String(index + 1).padStart(2, '0')}</div>
            <div>
              <div class="name">${esc(row.name)}</div>
              <div class="small">${row.presences} presenças</div>
            </div>
            <div class="score">${window.CaligulasAPI.fmt(row.finalPoints)}</div>
          </article>
        `).join('');

        const status = $('#homeRankingStatus');
        if (status) {
          const local = data.source === 'local-fallback';
          status.innerHTML = `<span class="live-dot ${local ? 'demo' : ''}"></span>${local ? 'Prévia local' : 'Atualizado ' + window.CaligulasAPI.fmtDate(data.updatedAt)}`;
        }
      } catch (error) {
        preview.innerHTML = '<article class="rank-tile glass"><div class="muted">Ranking temporariamente indisponível.</div></article>';
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(render, { timeout: 1800 });
    } else {
      setTimeout(render, 250);
    }
  }

  hydratePublicLinks();
  mountFloatingSocials();
  setupNavigation();
  setupHomeHeroTransition();
  setupSmoothAnchors();
  setupReveal();
  setupMaps();
  setupLightbox();
  setupHomeGalleryPreview();
  setupHomeRankingPreview();
})();
