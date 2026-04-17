(function() {
  var prefersReducedMotion = false;

  try {
    prefersReducedMotion = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    prefersReducedMotion = false;
  }

  var selectors = [
    '.landing-frame',
    '.nav-overview',
    '.hub-section',
    '.nav-card',
    '.frame',
    '.frame-inner > section',
    '.frame-outer',
    '.stats-grid > *',
    '.chart-grid > *',
    '.records-grid > *',
    '.dossiers-grid > *',
    '.history-list > *',
    '.service-history-list > *',
    '.filters-grid > *',
    '.auth-card',
    '.guest-inner',
    '.justice-inner',
    '.reports-modal',
    '.modal-card',
    '.dossier-modal-card',
    '.docs-header',
    '.swagger-ui .opblock'
  ];

  var observer = null;
  var tagged = new WeakSet();
  var motionIndex = 0;

  function markVisible(node) {
    if (node && node.classList) {
      node.classList.add('is-visible');
    }
  }

  function tagNode(node) {
    if (!node || tagged.has(node)) return;
    tagged.add(node);
    if (!node.hasAttribute('data-motion')) {
      node.setAttribute('data-motion', '');
    }
    node.style.setProperty('--motion-delay', ((motionIndex % 7) * 55) + 'ms');
    motionIndex += 1;

    if (prefersReducedMotion || !observer) {
      markVisible(node);
      return;
    }

    if (isNodeInViewport(node)) {
      markVisible(node);
      return;
    }

    observer.observe(node);
  }

  function collectExistingMotionNodes(root) {
    if (!root) return;

    if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute('data-motion')) {
      tagNode(root);
    }

    if (!root.querySelectorAll) return;

    Array.prototype.forEach.call(root.querySelectorAll('[data-motion]'), function(node) {
      tagNode(node);
    });
  }

  function isNodeInViewport(node) {
    if (!node || !node.getBoundingClientRect) return true;

    var rect = node.getBoundingClientRect();
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

    return rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= (viewportHeight * 0.92) &&
      rect.left <= viewportWidth;
  }

  function collectNodes(root) {
    if (!root || !root.querySelectorAll) return;
    collectExistingMotionNodes(root);
    selectors.forEach(function(selector) {
      Array.prototype.forEach.call(root.querySelectorAll(selector), function(node) {
        tagNode(node);
      });
    });
  }

  function initObserver() {
    if (prefersReducedMotion) return;
    if (!window.IntersectionObserver) return;

    observer = new IntersectionObserver(function(entries) {
      Array.prototype.forEach.call(entries, function(entry) {
        if (entry.isIntersecting) {
          markVisible(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -8% 0px'
    });
  }

  function init() {
    document.body.classList.add(prefersReducedMotion ? 'motion-reduced' : 'motion-ready');
    initObserver();
    collectNodes(document);

    window.setTimeout(function() {
      collectNodes(document);
    }, 700);

    window.setTimeout(function() {
      collectNodes(document);
    }, 1800);

    if (!prefersReducedMotion && window.MutationObserver) {
      var mutationObserver = new MutationObserver(function(mutations) {
        var shouldRescan = mutations.some(function(mutation) {
          return mutation.addedNodes && mutation.addedNodes.length;
        });
        if (shouldRescan) {
          window.requestAnimationFrame(function() {
            collectNodes(document);
          });
        }
      });

      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
