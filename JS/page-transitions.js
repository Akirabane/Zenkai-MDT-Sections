(function() {
  var prefersReducedMotion = false;
  var LEAVE_DURATION_MS = 760;

  try {
    prefersReducedMotion = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    prefersReducedMotion = false;
  }

  function getPageSlug() {
    var path = (window.location.pathname || '').split('/').pop() || 'index.html';
    return path.replace(/\.[^.]+$/, '').toLowerCase();
  }

  function shouldInterceptLink(anchor) {
    if (!anchor) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.getAttribute('data-no-transition') === 'true') return false;

    var href = anchor.getAttribute('href');
    if (!href || href.indexOf('javascript:') === 0 || href.indexOf('#') === 0) return false;

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (error) {
      return false;
    }

    if (url.origin !== window.location.origin) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;

    var lastSegment = (url.pathname.split('/').pop() || '').toLowerCase();
    return !lastSegment || lastSegment.endsWith('.html') || lastSegment === 'index';
  }

  function appendOverlay() {
    if (document.querySelector('.page-transition-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'page-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    var core = document.createElement('div');
    core.className = 'page-transition-core';
    overlay.appendChild(core);

    document.body.appendChild(overlay);
  }

  function markReady() {
    window.requestAnimationFrame(function() {
      window.requestAnimationFrame(function() {
        document.body.classList.add('page-ready');
      });
    });
  }

  function leaveTo(url) {
    if (document.body.classList.contains('page-leaving')) return;
    document.body.classList.add('page-leaving');

    if (prefersReducedMotion) {
      window.location.href = url;
      return;
    }

    window.setTimeout(function() {
      window.location.href = url;
    }, LEAVE_DURATION_MS);
  }

  function init() {
    document.documentElement.classList.add('page-transitions-enabled');
    document.body.classList.add('page-' + getPageSlug());
    appendOverlay();
    markReady();

    document.addEventListener('click', function(event) {
      var anchor = event.target.closest('a[href]');
      if (!shouldInterceptLink(anchor)) return;
      event.preventDefault();
      leaveTo(anchor.href);
    });

    window.addEventListener('pageshow', function() {
      document.body.classList.remove('page-leaving');
      document.body.classList.add('page-ready');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
