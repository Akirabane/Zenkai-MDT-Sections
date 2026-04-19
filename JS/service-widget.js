(function(global) {
  function canUsePoliceService(currentUser) {
    return !!(currentUser && currentUser.capabilities && currentUser.capabilities.canUsePoliceService);
  }

  function getToken() {
    return sessionStorage.getItem('policeToken');
  }

  function formatDateTime(value) {
    if (!value) return 'Date inconnue';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' a ' +
      date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Number(seconds || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    if (!hours && !minutes) return 'Moins d une minute';
    if (!hours) return minutes + ' min';
    if (!minutes) return hours + ' h';
    return hours + ' h ' + minutes + ' min';
  }

  function getEls() {
    return {
      root: document.getElementById('service-widget'),
      status: document.getElementById('service-status-text'),
      button: document.getElementById('service-toggle-btn'),
      history: document.getElementById('service-history-list'),
      statePill: document.getElementById('service-state-pill')
    };
  }

  function render(payload) {
    var els = getEls();
    if (!els.root || !els.status || !els.button || !els.history) return;

    var active = payload && payload.activeSession;
    els.root.style.display = '';
    els.root.classList.toggle('is-active', !!active);
    els.root.classList.toggle('is-inactive', !active);
    els.status.textContent = active
      ? 'En service depuis ' + formatDateTime(active.startedAt)
      : 'Hors service';
    els.button.textContent = active ? 'Fin de service' : 'Prise de service';
    els.button.classList.toggle('active', !!active);
    if (els.statePill) {
      els.statePill.textContent = active ? 'En service' : 'Hors service';
      els.statePill.classList.toggle('active', !!active);
      els.statePill.classList.toggle('inactive', !active);
    }

    var items = (payload && payload.history ? payload.history : []).slice(0, 6);
    if (!items.length) {
      els.history.innerHTML = '<div class="service-history-empty">Aucun service enregistre.</div>';
      return;
    }

    els.history.innerHTML = items.map(function(item) {
      return [
        '<div class="service-history-item">',
          '<div class="service-history-top">',
            '<span>' + formatDateTime(item.startedAt) + '</span>',
            '<span>' + (item.status === 'active' ? 'En cours' : formatDuration(item.durationSeconds)) + '</span>',
          '</div>',
          item.endedAt ? '<div class="service-history-bottom">Fin ' + formatDateTime(item.endedAt) + '</div>' : '',
        '</div>'
      ].join('');
    }).join('');
  }

  async function refresh(currentUser) {
    var els = getEls();
    if (!els.root) return;

    if (!currentUser || currentUser.permission === 'GUEST' || currentUser.permission === 'JUSTICE') {
      els.root.style.display = 'none';
      return;
    }

    var response = await fetch('/api/v1/service/me', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });

    if (!response.ok) {
      els.root.style.display = 'none';
      return;
    }

    render(await response.json());
  }

  async function toggle(currentUser) {
    var els = getEls();
    if (!els.button) return;
    els.button.disabled = true;

    try {
      var response = await fetch('/api/v1/service/toggle', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      var payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Impossible de changer le statut de service');
      render(payload);
      if (typeof global.onServiceSessionChanged === 'function') {
        global.onServiceSessionChanged(payload, currentUser);
      }
    } catch (error) {
      if (els.status) {
        els.status.textContent = error.message || 'Erreur de service';
      }
    } finally {
      els.button.disabled = false;
    }
  }

  global.ServiceWidget = {
    refresh: refresh,
    toggle: toggle
  };
})(window);
