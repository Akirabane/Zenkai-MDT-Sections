(function() {
  function getToken() {
    return (window.UserShell && window.UserShell.getToken ? window.UserShell.getToken() : sessionStorage.getItem('policeToken')) || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fillSelect(selectOrId, options, config) {
    var select = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
    if (!select) return;

    var settings = config || {};
    var items = Array.isArray(options) ? options : [];
    var html = [];

    if (settings.placeholder) {
      html.push('<option value="">' + escapeHtml(settings.placeholder) + '</option>');
    }

    items.forEach(function(option) {
      var value = option;
      var label = option;
      if (option && typeof option === 'object') {
        value = option.value;
        label = option.label;
      }
      html.push('<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + '</option>');
    });

    select.innerHTML = html.join('');
    if (settings.value != null) {
      select.value = settings.value;
    } else if (settings.placeholder) {
      select.value = '';
    } else if (settings.defaultFirst && items.length) {
      select.value = items[0];
    }
  }

  function showToast(id, message, isError) {
    var toast = document.getElementById(id || 'dri-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function() {
      toast.classList.remove('show');
    }, 3600);
  }

  function renderChipList(containerId, values, onRemove, emptyLabel) {
    var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;
    var items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) {
      container.innerHTML = '<div class="dri-chip-empty">' + escapeHtml(emptyLabel || 'Aucun element') + '</div>';
      return;
    }

    container.innerHTML = items.map(function(item, index) {
      var remove = onRemove
        ? '<button type="button" data-chip-index="' + index + '" aria-label="Retirer">&times;</button>'
        : '';
      return '<span class="dri-chip">' + escapeHtml(item) + remove + '</span>';
    }).join('');

    if (onRemove) {
      container.querySelectorAll('button[data-chip-index]').forEach(function(button) {
        button.addEventListener('click', function() {
          var index = Number(button.getAttribute('data-chip-index'));
          onRemove(index);
        });
      });
    }
  }

  function normalizeAssignedAgents(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).reduce(function(items, value) {
      var trimmed = String(value || '').trim();
      var key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) {
        return items;
      }
      seen.add(key);
      items.push(trimmed);
      return items;
    }, []);
  }

  function normalizeIdList(values) {
    var seen = new Set();
    return (Array.isArray(values) ? values : []).reduce(function(items, value) {
      var trimmed = String(value || '').trim();
      var key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) {
        return items;
      }
      seen.add(key);
      items.push(trimmed);
      return items;
    }, []);
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var data = null;
    try {
      data = await response.json();
    } catch (error) {}

    if (!response.ok) {
      var message = data && (data.error || data.message);
      throw new Error(message || ('Requete impossible (' + response.status + ')'));
    }

    return data;
  }

  async function bootstrap(options) {
    var settings = options || {};
    var redirectTo = settings.redirectTo || 'DRI.html';
    var loginRedirect = 'login.html?redirect=' + encodeURIComponent(redirectTo);
    var token = getToken();

    if (!token) {
      window.location.replace(loginRedirect);
      return null;
    }

    var user;
    try {
      user = await fetchJson('/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (window.UserShell && window.UserShell.saveUser) {
        window.UserShell.saveUser(user);
      }
    } catch (error) {
      sessionStorage.clear();
      window.location.replace(loginRedirect);
      return null;
    }

    var caps;
    try {
      caps = await fetchJson('/auth/capabilities', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!caps || !caps.canAccessDRI) {
        window.location.replace('index.html');
        return null;
      }
    } catch (error) {
      window.location.replace('index.html');
      return null;
    }

    if (window.UserShell && window.UserShell.applyUserBar) {
      window.currentUser = user;
      window.currentCapabilities = caps || null;
      window.UserShell.applyUserBar(user);
    }

    var focused = document.hasFocus();

    function closeBurgerMenu() {
      if (window.UserShell && window.UserShell.closeBurgerMenu) {
        window.UserShell.closeBurgerMenu();
      }
    }

    async function pingPresence() {
      try {
        var response = await fetch('/presence/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ status: document.hidden || !focused ? 'away' : window.UserShell.currentPresenceStatus() })
        });
        if (response.ok && window.UserShell && window.UserShell.renderPresence) {
          window.UserShell.renderPresence('presence-list', await response.json());
        }
      } catch (error) {}
    }

    document.addEventListener('click', function(event) {
      if (!event.target.closest('#user-bar')) closeBurgerMenu();
    });
    document.addEventListener('visibilitychange', pingPresence);
    window.addEventListener('focus', function() {
      focused = true;
      pingPresence();
    });
    window.addEventListener('blur', function() {
      focused = false;
      pingPresence();
    });

    window.toggleBurgerMenu = function() {
      if (window.UserShell && window.UserShell.toggleBurgerMenu) window.UserShell.toggleBurgerMenu();
    };
    window.closeBurgerMenu = closeBurgerMenu;
    window.togglePresenceMobile = function() {
      if (window.UserShell && window.UserShell.togglePresenceMobile) window.UserShell.togglePresenceMobile('presence-sidebar');
    };
    window.openAdminShortcut = function() {
      if (window.UserShell && window.UserShell.openAdminShortcut) window.UserShell.openAdminShortcut('Backoffice_Admin.html');
    };
    window.doLogout = async function() {
      if (window.UserShell && window.UserShell.logout) {
        await window.UserShell.logout({ redirectTo: 'login.html' });
      }
    };

    await pingPresence();
    setInterval(pingPresence, 25000);
    return {
      user: user,
      capabilities: caps || null
    };
  }

  window.DRICommon = {
    bootstrap: bootstrap,
    escapeHtml: escapeHtml,
    fetchJson: fetchJson,
    fillSelect: fillSelect,
    getToken: getToken,
    normalizeIdList: normalizeIdList,
    normalizeAssignedAgents: normalizeAssignedAgents,
    renderChipList: renderChipList,
    showToast: showToast
  };
})();
