(function () {
  'use strict';

  const aboutImage = document.querySelector('.home-page .about-photo img');
  if (aboutImage) {
    const mobile = window.matchMedia('(max-width: 699px)').matches;
    aboutImage.removeAttribute('srcset');
    aboutImage.removeAttribute('sizes');
    aboutImage.src = mobile
      ? 'assets/img/perf/photos/hero-mobile-720.webp'
      : 'assets/img/perf/photos/hero-desktop-1440.webp';
    aboutImage.alt = 'Noite de poker no Caligulas Poker Live';
  }

  const dock = document.querySelector('.floating-socials');
  const footer = document.querySelector('.site-footer');
  if (!dock || !footer) return;

  let ticking = false;
  const updateDock = () => {
    ticking = false;
    const dockRect = dock.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    dock.classList.toggle('is-footer-hidden', footerRect.top <= dockRect.bottom + 12);
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateDock);
  };

  updateDock();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
})();
