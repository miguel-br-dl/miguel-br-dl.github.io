(function () {
  const ads = document.querySelectorAll('.adsbygoogle');
  if (window.adsbygoogle && ads.length > 0) {
    ads.forEach(() => {
      try {
        window.adsbygoogle.push({});
      } catch (err) {
        console.warn('Falha ao inicializar Google Ads:', err);
      }
    });
  }
})();
