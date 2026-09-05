(function(){
  var icons = document.querySelectorAll('.icon[data-win]');
  var zTop = 20;
  // Keyed by window id, so closeWin() can send focus back to whatever opened it —
  // an icon or a start-menu link — instead of leaving focus stranded on a removed dialog.
  var lastTrigger = {};

  // ---- ARIA setup, done once here at init rather than hand-written into desktop.html,
  // since it's the same handful of attributes repeated across 11 near-identical blocks
  // and deriving them from the visible text keeps the label and the DOM in sync for free.
  document.querySelectorAll('.win').forEach(function(win){
    var titleSpan = win.querySelector('.titlebar span');
    var titleId = win.id + '-title';
    titleSpan.id = titleId;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-labelledby', titleId);
    win.setAttribute('tabindex', '-1');
    win.setAttribute('aria-hidden', win.classList.contains('open') ? 'false' : 'true');
    var closeBtn = win.querySelector('.titlebar [data-close]');
    if (closeBtn) closeBtn.setAttribute('aria-label', 'Close ' + titleSpan.textContent);
    var twinIcon = win.querySelector('.titlebar svg');
    if (twinIcon) twinIcon.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.popup').forEach(function(popup){
    var titleSpan = popup.querySelector('.ptitle span');
    var closeBtn = popup.querySelector('.ptitle [data-close]');
    if (closeBtn && titleSpan) closeBtn.setAttribute('aria-label', 'Close ' + titleSpan.textContent);
  });
  icons.forEach(function(icon){
    var glyphSvg = icon.querySelector('.glyph svg');
    if (glyphSvg) glyphSvg.setAttribute('aria-hidden', 'true');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('role', 'button');
    var label = icon.querySelector('.label');
    if (label) icon.setAttribute('aria-label', label.textContent);
  });

  function openWin(id, trigger){
    var w = document.getElementById(id);
    if (!w) return;
    if (trigger) lastTrigger[id] = trigger;
    w.classList.add('open');
    w.setAttribute('aria-hidden', 'false');
    zTop++;
    w.style.zIndex = zTop;
    reenterViewport(w);
    w.focus();
  }
  function closeWin(id){
    var w = document.getElementById(id);
    if (!w) return;
    w.classList.remove('open');
    w.setAttribute('aria-hidden', 'true');
    var trigger = lastTrigger[id];
    if (trigger) trigger.focus();
    // Start-menu links close their menu (display:none) as they open a window, so by the
    // time this runs they're no longer focusable and the .focus() above was a no-op —
    // fall back to the always-visible Start button rather than stranding focus.
    if (document.activeElement !== trigger){
      document.getElementById('startBtn').focus();
    }
  }

  function activateIcon(icon){
    icons.forEach(function(i){ i.classList.remove('active'); });
    icon.classList.add('active');
    openWin(icon.getAttribute('data-win'), icon);
  }
  icons.forEach(function(icon){
    icon.addEventListener('click', function(){
      activateIcon(icon);
    });
    icon.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){
        e.preventDefault();
        activateIcon(icon);
      }
    });
  });

  document.querySelectorAll('[data-close]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var target = btn.getAttribute('data-close');
      if (target === 'notePopup' || target === 'updatePopup'){
        document.getElementById(target).classList.add('hidden');
      } else {
        closeWin(target);
      }
    });
  });

  // bring window to front + drag by titlebar — Pointer Events (not mouse events) so mouse,
  // touch and pen all use the same code path, with the titlebar taking pointer capture on
  // pointerdown so the drag keeps tracking it even if the finger/cursor slips off mid-drag.
  // Still just one shared pointermove/pointerup pair for all windows (not one per window —
  // see prior cleanup pass for why that mattered), now also reused by the resize handler
  // below so open windows can't get stranded off-screen or under the taskbar.
  var TASKBAR_HEIGHT = 38;
  var dragTarget = null, dragBar = null, dragPointerId = null, dragOffX = 0, dragOffY = 0;

  function clampToViewport(win, left, top){
    var rect = win.getBoundingClientRect();
    var maxLeft = Math.max(0, window.innerWidth - rect.width);
    var maxTop = Math.max(0, window.innerHeight - TASKBAR_HEIGHT - rect.height);
    return {
      left: Math.min(Math.max(left, 0), maxLeft),
      top: Math.min(Math.max(top, 0), maxTop)
    };
  }
  function reenterViewport(win){
    var rect = win.getBoundingClientRect();
    var clamped = clampToViewport(win, rect.left, rect.top);
    win.style.left = clamped.left + 'px';
    win.style.top = clamped.top + 'px';
  }

  document.querySelectorAll('.win').forEach(function(win){
    var bar = win.querySelector('.titlebar');
    win.addEventListener('pointerdown', function(){
      zTop++; win.style.zIndex = zTop;
    });
    bar.addEventListener('pointerdown', function(e){
      if (e.target.tagName === 'BUTTON') return;
      var rect = win.getBoundingClientRect();
      dragTarget = win;
      dragBar = bar;
      dragPointerId = e.pointerId;
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      bar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
  });

  window.addEventListener('pointermove', function(e){
    if (!dragTarget || e.pointerId !== dragPointerId) return;
    var clamped = clampToViewport(dragTarget, e.clientX - dragOffX, e.clientY - dragOffY);
    dragTarget.style.left = clamped.left + 'px';
    dragTarget.style.top = clamped.top + 'px';
  });
  function endDrag(e){
    if (dragPointerId === null || (e && e.pointerId !== dragPointerId)) return;
    if (dragBar && dragBar.hasPointerCapture && dragBar.hasPointerCapture(dragPointerId)){
      dragBar.releasePointerCapture(dragPointerId);
    }
    dragTarget = null; dragBar = null; dragPointerId = null;
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Re-clamp every open window on browser resize so one dragged near an edge doesn't end
  // up off-screen or under the taskbar — re-measures each window's live rect rather than
  // any cached size, since .win's own max-width (min(90vw,460px)) is viewport-relative too.
  window.addEventListener('resize', function(){
    document.querySelectorAll('.win.open').forEach(reenterViewport);
  });

  // start menu
  var startBtn = document.getElementById('startBtn');
  var startMenu = document.getElementById('startMenu');
  startBtn.setAttribute('tabindex', '0');
  startBtn.setAttribute('role', 'button');
  startBtn.setAttribute('aria-controls', 'startMenu');
  startBtn.setAttribute('aria-expanded', 'false');

  function toggleStartMenu(){
    startMenu.classList.toggle('open');
    startBtn.setAttribute('aria-expanded', startMenu.classList.contains('open') ? 'true' : 'false');
  }
  function closeStartMenu(){
    startMenu.classList.remove('open');
    startBtn.setAttribute('aria-expanded', 'false');
  }

  startBtn.addEventListener('click', function(e){
    e.stopPropagation();
    toggleStartMenu();
  });
  startBtn.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){
      e.preventDefault();
      e.stopPropagation();
      toggleStartMenu();
    }
  });
  document.addEventListener('click', function(){
    closeStartMenu();
  });
  startMenu.querySelectorAll('a[data-win]').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      openWin(a.getAttribute('data-win'), a);
      closeStartMenu();
    });
  });

  document.getElementById('backToIntro').addEventListener('click', function(){
    window.location.href = 'index.html';
  });

  // clock
  function updateClock(){
    var d = new Date();
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    var m = String(d.getMinutes()).padStart(2,'0');
    document.getElementById('taskClock').textContent = h + ':' + m + ' ' + ampm;
  }
  setInterval(updateClock, 1000);
  updateClock();
})();
