(function (global) {
  var _config = null;
  var _callbacks = [];

  function onReady(fn) {
    if (_config) { fn(_config); return; }
    _callbacks.push(fn);
  }

  function _resolve(cfg) {
    _config = cfg;
    _callbacks.forEach(function (fn) { try { fn(cfg); } catch (e) {} });
    _callbacks = [];
  }

  function applyConfig(cfg) {
    // Titres de page
    var pageTitle = document.title;
    if (pageTitle) {
      document.title = pageTitle
        .replace(/Police Militaire de Konoha/gi, cfg.instanceName)
        .replace(/Police Militaire/gi, cfg.displayName)
        .replace(/\bKonoha\b/g, cfg.village || 'Konoha')
        .replace(/Section [Pp]olice/gi, cfg.displayName);
    }

    // Textes portant la classe instance-name
    var nameEls = document.querySelectorAll('.instance-name');
    for (var i = 0; i < nameEls.length; i++) {
      nameEls[i].textContent = cfg.instanceName;
    }

    // Éléments data-section-hide="police,medical,..."
    var hideEls = document.querySelectorAll('[data-section-hide]');
    for (var j = 0; j < hideEls.length; j++) {
      var el = hideEls[j];
      var sections = el.getAttribute('data-section-hide').split(',').map(function (s) { return s.trim(); });
      if (sections.indexOf(cfg.section) !== -1) {
        el.style.display = 'none';
      }
    }

    // Éléments data-section-only="police,medical,..."
    var onlyEls = document.querySelectorAll('[data-section-only]');
    for (var k = 0; k < onlyEls.length; k++) {
      var el2 = onlyEls[k];
      var allowed = el2.getAttribute('data-section-only').split(',').map(function (s) { return s.trim(); });
      if (allowed.indexOf(cfg.section) === -1) {
        el2.style.display = 'none';
      }
    }

    // Éléments data-feature-hide="codePenal,dri,..."
    var featEls = document.querySelectorAll('[data-feature-hide]');
    for (var m = 0; m < featEls.length; m++) {
      var el3 = featEls[m];
      var features = el3.getAttribute('data-feature-hide').split(',').map(function (s) { return s.trim(); });
      for (var n = 0; n < features.length; n++) {
        if (!cfg.features[features[n]]) {
          el3.style.display = 'none';
          break;
        }
      }
    }

    // Textes dynamiques data-label="casier|rapport|registre|..."
    var labelEls = document.querySelectorAll('[data-label]');
    for (var p = 0; p < labelEls.length; p++) {
      var el4 = labelEls[p];
      var key = el4.getAttribute('data-label');
      if (cfg.labels[key]) {
        el4.textContent = cfg.labels[key];
      }
    }

    // Rediriger vers index si la page n'est pas disponible pour cette section
    var pageGuard = document.querySelector('[data-require-feature]');
    if (pageGuard) {
      var required = pageGuard.getAttribute('data-require-feature');
      if (!cfg.features[required]) {
        global.location.replace('index.html');
        return;
      }
    }

    // Recalculer la visibilité des sections nav si présente (index.html)
    if (typeof global.refreshNavSections === 'function') {
      global.refreshNavSections();
    }
  }

  function load() {
    fetch('/api/config')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg) {
          cfg = { section: 'police', village: '', displayName: 'Police Militaire', instanceName: 'Police Militaire', features: {}, labels: {} };
        }
        _resolve(cfg);
        applyConfig(cfg);
      })
      .catch(function () {
        var fallback = { section: 'police', village: '', displayName: 'Police Militaire', instanceName: 'Police Militaire', features: {}, labels: {} };
        _resolve(fallback);
      });
  }

  global.SiteConfig = { onReady: onReady, load: load };
  document.addEventListener('DOMContentLoaded', load);
})(window);
