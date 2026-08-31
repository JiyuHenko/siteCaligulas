window.CALIGULAS_CONFIG = Object.freeze({
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwq4zJ5k8OaIgj9IFTHsMtr-D683RPaE0iW6_ayKNynHEIorrrxgh-_oEPei79VegBB/exec",
  instagram: "https://www.instagram.com/caligulaspokerlive/",
  whatsappNumber: "5535988369317",
  whatsappMessage: "Olá! Vim pelo site do Caligulas Poker Live.",
  address: "Av. Comendador Francisco Avelino Maia, 3427 — Centro, Passos/MG",
  mapsQuery: "Av. Comendador Francisco Avelino Maia, 3427, Passos, MG",
  siteUrl: ""
});

if (document.querySelector('.program-special')) {
  const programAlignStyles = document.createElement('link');
  programAlignStyles.rel = 'stylesheet';
  programAlignStyles.href = 'assets/css/home-program-align.css?v=2';
  document.head.appendChild(programAlignStyles);
}
