(function() {
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    if (!value) return 'Inconnue';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Inconnue';

    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }) + ' a ' + date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDuration(seconds) {
    var value = Number(seconds || 0);
    var days = Math.floor(value / 86400);
    var hours = Math.floor((value % 86400) / 3600);
    var minutes = Math.floor((value % 3600) / 60);
    var parts = [];

    if (days > 0) parts.push(days + 'j');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0 || !parts.length) parts.push(minutes + 'm');
    return parts.join(' ');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('fr-FR').format(Number(value || 0));
  }

  function buildLegend(containerId, items) {
    var container = $(containerId);
    if (!container) return;

    container.innerHTML = items.map(function(item) {
      return [
        '<span class="status-legend-item">',
        '<span class="status-legend-dot" style="background:', escapeHtml(item.color), '"></span>',
        escapeHtml(item.label),
        '</span>'
      ].join('');
    }).join('');
  }

  function renderStackedBars(containerId, items, series) {
    var container = $(containerId);
    var maxValue = 0;

    if (!container) return;
    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = '<div class="status-chart-empty">Aucune donnee disponible pour cette periode.</div>';
      return;
    }

    items.forEach(function(item) {
      var total = 0;
      series.forEach(function(entry) {
        total += Number(item[entry.key] || 0);
      });
      maxValue = Math.max(maxValue, total);
    });

    maxValue = Math.max(maxValue, 1);

    container.innerHTML = [
      '<div class="status-bars">',
      items.map(function(item) {
        var titleParts = [item.label];
        return [
          '<div class="status-bar-column" title="',
          escapeHtml(
            titleParts.concat(series.map(function(entry) {
              return entry.label + ': ' + Number(item[entry.key] || 0);
            })).join(' | ')
          ),
          '">',
          '<div class="status-bar-stack">',
          series.map(function(entry) {
            var value = Number(item[entry.key] || 0);
            if (!value) return '';
            return [
              '<div class="status-bar-segment" style="height:',
              Math.max(3, Math.round((value / maxValue) * 100)),
              '%; background:',
              escapeHtml(entry.color),
              '"></div>'
            ].join('');
          }).join(''),
          '</div>',
          '<div class="status-bar-label">', escapeHtml(item.label), '</div>',
          '</div>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderServiceBars(containerId, items) {
    var container = $(containerId);
    var maxHours = 0;

    if (!container) return;
    if (!Array.isArray(items) || !items.length) {
      container.innerHTML = '<div class="status-chart-empty">Aucune prise de service recente.</div>';
      return;
    }

    items.forEach(function(item) {
      maxHours = Math.max(maxHours, Number(item.hours || 0));
    });
    maxHours = Math.max(maxHours, 1);

    container.innerHTML = [
      '<div class="status-bars status-service-bars">',
      items.map(function(item) {
        var hours = Number(item.hours || 0);
        return [
          '<div class="status-bar-column" title="',
          escapeHtml(item.label + ' | ' + item.sessions + ' session(s) | ' + hours + 'h'),
          '">',
          '<div class="status-bar-stack">',
          '<div class="status-bar-segment" style="height:',
          Math.max(3, Math.round((hours / maxHours) * 100)),
          '%; background:#3b7f6b"></div>',
          '</div>',
          '<div class="status-bar-label">', escapeHtml(item.label), '</div>',
          '<div class="status-service-meta-inline">', escapeHtml(hours.toFixed(1)), 'h / ', escapeHtml(String(item.sessions || 0)), '</div>',
          '</div>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderRuntimeList(containerId, rows) {
    var container = $(containerId);
    if (!container) return;

    container.innerHTML = rows.map(function(row) {
      return [
        '<div class="status-runtime-row">',
        '<div><div class="status-runtime-label">', escapeHtml(row.label), '</div></div>',
        '<div class="status-runtime-value">', escapeHtml(row.value), '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function applyStateCard(id, state) {
    var node = $(id);
    if (!node) return;

    node.classList.remove('is-ok', 'is-warning', 'is-error');
    node.classList.add(state.status === 'ok' ? 'is-ok' : state.status === 'warning' ? 'is-warning' : 'is-error');
    node.querySelector('.status-state-value').textContent = state.status === 'ok' ? 'OK' : state.status === 'warning' ? 'A surveiller' : 'Probleme';
    node.querySelector('.status-state-note').textContent = state.label || '';
  }

  function renderServiceCards(services, pm2Available, pm2Error) {
    var grid = $('status-service-grid');
    var meta = $('services-meta');

    if (!grid) return;

    if (meta) {
      meta.innerHTML = pm2Available
        ? '<span class="status-legend-item"><span class="status-legend-dot" style="background:#2e9e57"></span>PM2 joignable</span>'
        : '<span class="status-legend-item"><span class="status-legend-dot" style="background:#c44734"></span>' + escapeHtml(pm2Error || 'PM2 indisponible') + '</span>';
    }

    if (!Array.isArray(services) || !services.length) {
      grid.innerHTML = '<div class="status-empty-state">Aucun service monitoré.</div>';
      return;
    }

    grid.innerHTML = services.map(function(service) {
      var healthClass = service.health === 'ok' ? 'is-ok' : service.health === 'warning' ? 'is-warning' : 'is-error';
      return [
        '<article class="status-service-card ', healthClass, '">',
        '<div class="status-service-head">',
        '<div>',
        '<div class="status-service-label">', escapeHtml(service.name), '</div>',
        '<div class="status-service-name">', escapeHtml(service.label || service.name), '</div>',
        '</div>',
        '<div class="status-service-pill ', healthClass, '">', escapeHtml(service.status || 'unknown'), '</div>',
        '</div>',
        '<div class="status-service-note">', escapeHtml(service.note || 'Aucune note.'), '</div>',
        '<div class="status-service-metrics">',
        '<div class="status-service-metric"><div class="status-service-meta">Uptime</div><div class="status-service-value">', escapeHtml(formatDuration(service.uptimeSeconds)), '</div></div>',
        '<div class="status-service-metric"><div class="status-service-meta">Restarts</div><div class="status-service-value">', escapeHtml(formatNumber(service.restarts)), '</div></div>',
        '<div class="status-service-metric"><div class="status-service-meta">CPU / RAM</div><div class="status-service-value">', escapeHtml(formatNumber(service.cpu)), '% / ', escapeHtml(formatNumber(service.memoryMb)), ' Mo</div></div>',
        '<div class="status-service-metric"><div class="status-service-meta">Mode / Instances</div><div class="status-service-value">', escapeHtml(String(service.mode || '-')), ' / ', escapeHtml(formatNumber(service.instances || 0)), '</div></div>',
        '</div>',
        '</article>'
      ].join('');
    }).join('');
  }

  function renderRecentEvents(items) {
    var list = $('status-events-list');
    if (!list) return;

    if (!Array.isArray(items) || !items.length) {
      list.innerHTML = '<div class="status-empty-state">Aucun evenement recent a signaler.</div>';
      return;
    }

    list.innerHTML = items.map(function(item) {
      return [
        '<div class="status-event-row">',
        '<div>',
        '<div class="status-event-time">', escapeHtml(formatDateTime(item.timestamp)), '</div>',
        '<div class="status-severity is-', escapeHtml(item.severity), '">', escapeHtml(item.severity), '</div>',
        '</div>',
        '<div>',
        '<div class="status-event-title">', escapeHtml(item.label), '</div>',
        '<div class="status-event-meta">',
        item.actorPseudo ? ('Acteur: ' + escapeHtml(item.actorPseudo) + ' | ') : '',
        item.targetLabel ? ('Cible: ' + escapeHtml(item.targetLabel)) : 'Sans cible specifique',
        '</div>',
        '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderStatus(payload) {
    var summary = payload.summary || {};
    var runtime = payload.runtime || {};
    var totals = payload.totals || {};
    var counters = payload.counters || {};
    var backups = payload.backups || {};

    $('status-generated-at').textContent = 'Maj ' + formatDateTime(payload.generatedAt);
    $('monitor-badge').textContent = (summary.monitor && summary.monitor.status === 'ok' ? '\u25cf ' : '\u25cf ') + 'Monitor public actif';

    applyStateCard('state-monitor', summary.monitor || { status: 'warning', label: 'Indetermine' });
    applyStateCard('state-server', summary.server || { status: 'warning', label: 'Indetermine' });
    applyStateCard('state-api', summary.api || { status: 'warning', label: 'Indetermine' });
    applyStateCard('state-database', summary.database || { status: 'warning', label: 'Indetermine' });
    applyStateCard('state-backups', summary.backups || { status: 'warning', label: 'Indetermine' });

    renderServiceCards(payload.services, runtime.pm2Available, runtime.pm2Error);

    $('metric-uptime').textContent = formatDuration(runtime.uptimeSeconds);
    $('metric-started-at').textContent = 'Depuis ' + formatDateTime(runtime.startedAt);
    $('metric-services-online').textContent = formatNumber(counters.onlineServices);
    $('metric-services-note').textContent = formatNumber(counters.onlineServices) + ' / ' + formatNumber(counters.monitoredServices) + ' en ligne';
    $('metric-logins').textContent = formatNumber(counters.logins7d);
    $('metric-logouts').textContent = formatNumber(counters.logouts7d) + ' deconnexions';
    $('metric-restarts').textContent = formatNumber(counters.restartTotal);
    $('metric-errors').textContent = formatNumber(counters.errors30d);
    $('metric-backups').textContent = formatNumber(backups.count);
    $('metric-backups-note').textContent = backups.latest
      ? 'Derniere: ' + formatDateTime(backups.latest.updatedAt || backups.latest.createdAt)
      : 'Aucune sauvegarde detectee';

    renderRuntimeList('runtime-list', [
      { label: 'Service', value: (runtime.service || '?') + ' | v' + (runtime.version || '?') },
      { label: 'Node', value: (runtime.nodeVersion || '?') + ' | ' + (runtime.platform || '?') + '/' + (runtime.arch || '?') },
      { label: 'Memoire RSS', value: formatNumber(runtime.memory && runtime.memory.rssMb) + ' Mo' },
      { label: 'Heap utilise', value: formatNumber(runtime.memory && runtime.memory.heapUsedMb) + ' / ' + formatNumber(runtime.memory && runtime.memory.heapTotalMb) + ' Mo' },
      { label: 'SQLite', value: runtime.sqlite && runtime.sqlite.exists ? (formatNumber(runtime.sqlite.sizeMb) + ' Mo') : 'Introuvable' },
      { label: 'Load average', value: Array.isArray(runtime.loadAverage) ? runtime.loadAverage.map(function(item) { return Number(item || 0).toFixed(2); }).join(' / ') : '--' }
    ]);

    renderRuntimeList('population-list', [
      { label: 'Comptes MDT', value: formatNumber(totals.users) },
      { label: 'Profils RP', value: formatNumber(totals.membres) },
      { label: 'Rapports', value: formatNumber(totals.reports) },
      { label: 'Dossiers', value: formatNumber(totals.dossiers) },
      { label: 'Services actifs', value: formatNumber(totals.activeServiceSessions) },
      { label: 'Evenements 30j', value: formatNumber(totals.auditEvents) }
    ]);

    buildLegend('legend-visits', [
      { label: 'Police', color: '#2e9e57' },
      { label: 'Justice', color: '#7b4cc2' },
      { label: 'Visiteurs', color: '#c79522' }
    ]);
    renderStackedBars('chart-visits', payload.series && payload.series.visits, [
      { key: 'police', label: 'Police', color: '#2e9e57' },
      { key: 'justice', label: 'Justice', color: '#7b4cc2' },
      { key: 'visitors', label: 'Visiteurs', color: '#c79522' }
    ]);

    buildLegend('legend-auth', [
      { label: 'Connexions', color: '#3b7f6b' },
      { label: 'Deconnexions', color: '#b07a20' }
    ]);
    renderStackedBars('chart-auth', payload.series && payload.series.auth, [
      { key: 'auth_login', label: 'Connexions', color: '#3b7f6b' },
      { key: 'auth_logout', label: 'Deconnexions', color: '#b07a20' }
    ]);

    buildLegend('legend-system', [
      { label: 'Starts', color: '#3d78a5' },
      { label: 'Stops', color: '#c79522' },
      { label: 'Erreurs proc.', color: '#c44734' },
      { label: 'Erreurs HTTP', color: '#8641a8' }
    ]);
    renderStackedBars('chart-system', payload.series && payload.series.system, [
      { key: 'system_start', label: 'Starts', color: '#3d78a5' },
      { key: 'system_shutdown', label: 'Stops', color: '#c79522' },
      { key: 'system_error', label: 'Erreurs proc.', color: '#c44734' },
      { key: 'system_http_error', label: 'Erreurs HTTP', color: '#8641a8' }
    ]);

    renderServiceBars('chart-service', payload.series && payload.series.service);
    renderRecentEvents(payload.recentEvents);
  }

  function renderError(message) {
    var shell = document.querySelector('.status-shell');
    if (!shell) return;

    shell.innerHTML = '<section class="status-panel status-chart-empty">' + escapeHtml(message) + '</section>';
  }

  async function loadStatus() {
    try {
      var response = await fetch('/api/status-monitor/overview', {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Impossible de charger le monitor');
      }

      renderStatus(await response.json());
    } catch (error) {
      renderError('La page de statut n a pas pu charger les donnees du service de supervision.');
    }
  }

  function boot() {
    var refreshButton = $('refresh-status-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', function() {
        loadStatus();
      });
    }

    loadStatus();
    window.setInterval(loadStatus, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
