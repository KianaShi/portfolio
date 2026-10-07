(function(){
  // Time-of-day wallpaper set (assets/wallpapers/): each period has an eyes-open wallpaper
  // (desktop.html background) and an eyes-closed screensaver (the 3D monitor's idle screen
  // in index.html, drawn by screen/screen-canvas.js). Shared by both pages.
  //   morning   05:00-12:00
  //   afternoon 12:00-18:00
  //   night     18:00-05:00
  function period(){
    var h = new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    return 'night';
  }

  function url(kind, p){
    return 'assets/wallpapers/' + (p || period()) + (kind === 'screensaver' ? '-screensaver' : '') + '.webp';
  }

  // Calls fn(period) now and again whenever the period rolls over.
  function watch(fn){
    var current = period();
    fn(current);
    setInterval(function(){
      var p = period();
      if (p !== current){ current = p; fn(p); }
    }, 60000);
  }

  window.Wallpaper = { period: period, url: url, watch: watch };
})();
