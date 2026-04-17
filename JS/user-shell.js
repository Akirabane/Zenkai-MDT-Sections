(function(global) {
  function getToken() {
    return sessionStorage.getItem('policeToken');
  }

  function getCachedUser() {
    try {
      return JSON.parse(sessionStorage.getItem('policeUser') || 'null');
    } catch (error) {
      return null;
    }
  }

  function saveUser(user) {
    if (!user) return;
    sessionStorage.setItem('policeUser', JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.clear();
  }

  async function fetchCurrentUser(options) {
    const settings = options || {};
    const token = getToken();

    if (!token) {
      if (settings.redirectTo) {
        global.location.replace(settings.redirectTo);
      }
      return null;
    }

    try {
      const response = await fetch('/auth/me', {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (!response.ok) {
        clearSession();
        if (settings.redirectTo) {
          global.location.replace(settings.redirectTo);
        }
        return null;
      }

      const user = await response.json();
      saveUser(user);
      return user;
    } catch (error) {
      return getCachedUser();
    }
  }

  function applyUserBar(user, options) {
    const settings = options || {};
    const badge = document.getElementById(settings.badgeId || 'user-badge');
    const adminButton = document.getElementById(settings.adminButtonId || 'btn-admin-panel');

    if (!badge) return;

    if (!user || user.permission === 'GUEST') {
      badge.textContent = '\u25c8 Visiteur';
      badge.classList.add('guest');
      return;
    }

    badge.textContent = '\u25c6 ' + user.pseudo;
    badge.classList.remove('guest');

    if (adminButton) {
      adminButton.style.display = user.permission === 'ADMIN' ? '' : 'none';
    }
  }

  async function logout(options) {
    const settings = options || {};
    const redirectTo = settings.redirectTo || 'login.html';
    const token = getToken();

    if (token) {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
      } catch (error) {}
    }

    clearSession();
    global.location.href = redirectTo;
  }

  function openAdminShortcut(target) {
    global.location.href = target || 'Backoffice_Admin.html';
  }

  function toggleBurgerMenu(innerId) {
    const target = document.getElementById(innerId || 'user-bar-inner');
    if (target) {
      target.classList.toggle('open');
    }
  }

  function closeBurgerMenu(innerId) {
    const target = document.getElementById(innerId || 'user-bar-inner');
    if (target) {
      target.classList.remove('open');
    }
  }

  function installBurgerAutoClose(options) {
    const settings = options || {};
    const rootSelector = settings.rootSelector || '#user-bar';
    const innerId = settings.innerId || 'user-bar-inner';

    document.addEventListener('click', function(event) {
      if (!event.target.closest(rootSelector)) {
        closeBurgerMenu(innerId);
      }
    });
  }

  function togglePresenceMobile(sidebarId) {
    const sidebar = document.getElementById(sidebarId || 'presence-sidebar');
    if (!sidebar) return;

    if (global.innerWidth <= 700) {
      sidebar.classList.toggle('mobile-open');
    }
  }

  function currentPresenceStatus() {
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (document.hidden || !document.hasFocus()) return 'away';
    if (isMobile) return 'mobile';
    return 'active';
  }

  function renderPresence(listId, data) {
    if (global.PresenceUI) {
      global.PresenceUI.renderPresence(listId || 'presence-list', data);
    }
  }

  async function pingPresence(options) {
    const settings = options || {};
    const token = settings.token || getToken();
    if (!token) return null;

    try {
      const response = await fetch('/presence/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          status: currentPresenceStatus(),
          clientId: settings.clientId || undefined
        })
      });

      if (!response.ok) return null;

      const payload = await response.json();
      renderPresence(settings.listId || 'presence-list', payload);
      return payload;
    } catch (error) {
      return null;
    }
  }

  global.UserShell = {
    applyUserBar,
    clearSession,
    closeBurgerMenu,
    currentPresenceStatus,
    fetchCurrentUser,
    getCachedUser,
    getToken,
    installBurgerAutoClose,
    logout,
    openAdminShortcut,
    pingPresence,
    renderPresence,
    saveUser,
    toggleBurgerMenu,
    togglePresenceMobile
  };
})(window);
