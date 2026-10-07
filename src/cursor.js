(function(){
  // Animated pixel cursor. The source pack is Windows .ani files, which no browser renders,
  // so each was unpacked into its 16 PNG frames under assets/cursors/<css keyword>/ and is
  // animated here by swapping a CSS custom property per keyword (--cur-default,
  // --cur-pointer, ...) at the .ani's own rate (6 jiffies = 100ms per frame). Stylesheets
  // reference those properties with the plain keyword as fallback, so until the frames load
  // — or on touch screens, where this never starts — the browser's own cursor shows.
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;

  var FRAMES = 16, FRAME_MS = 100;
  // keyword -> hotspot, taken from each .ani's first frame header
  var KINDS = {
    'default':     [1, 1],
    'pointer':     [4, 6],
    'move':        [16, 16],
    'text':        [4, 5],
    'wait':        [5, 6],
    'progress':    [4, 5],
    'not-allowed': [6, 6]
  };

  // Resolve against this script's own URL so it works from any page depth.
  var base = (document.currentScript && document.currentScript.src || location.href)
    .replace(/src\/cursor\.js.*$/, '');

  var style = document.createElement('style');
  style.textContent =
    'html{cursor:var(--cur-default,auto)}' +
    'a,button,[role="button"]:not(canvas),label,select,summary{cursor:var(--cur-pointer,pointer)}' +
    'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]),textarea{cursor:var(--cur-text,text)}';
  document.head.appendChild(style);

  var root = document.documentElement.style;
  var values = {};
  var pending = 0;

  Object.keys(KINDS).forEach(function(kind){
    var hs = KINDS[kind];
    values[kind] = [];
    for (var i = 0; i < FRAMES; i++){
      var url = base + 'assets/cursors/' + kind + '/' + (i < 10 ? '0' : '') + i + '.png';
      values[kind].push('url("' + url + '") ' + hs[0] + ' ' + hs[1] + ', ' + kind);
      // Preload so every swap hits cache; an uncached cursor URL briefly falls back.
      var img = new Image();
      pending++;
      img.onload = img.onerror = function(){ if (--pending === 0) start(); };
      img.src = url;
    }
  });

  function start(){
    var frame = 0;
    function tick(){
      for (var kind in values) root.setProperty('--cur-' + kind, values[kind][frame]);
      frame = (frame + 1) % FRAMES;
    }
    tick();
    setInterval(tick, FRAME_MS);
  }
})();
