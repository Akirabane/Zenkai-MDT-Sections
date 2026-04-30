(function() {
  function buildStatusLabel(status) {
    if (status === 'active') return 'En ligne';
    if (status === 'mobile') return 'Sur mobile';
    return 'Absent';
  }

  function buildGuestColor(count) {
    var t = Math.min(Math.max(Number(count) || 0, 0), 10) / 10;
    var channel = Math.round(85 + (255 - 85) * t);
    var alpha = 0.28 + (0.9 * t);
    return {
      color: 'rgba(' + channel + ',' + channel + ',' + channel + ',' + alpha.toFixed(3) + ')',
      glow: '0 0 ' + Math.round(4 + t * 10) + 'px rgba(' + channel + ',' + channel + ',' + channel + ',' + Math.min(1, 0.25 + t * 0.75).toFixed(3) + ')'
    };
  }

  function clearElement(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function getClientId() {
    var existing = sessionStorage.getItem('policePresenceClientId');
    if (existing) return existing;
    var created = 'p' + Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem('policePresenceClientId', created);
    return created;
  }

  function renderPresence(target, data) {
    var list = typeof target === 'string' ? document.getElementById(target) : target;
    if (!list) return;

    var rawUsers = Array.isArray(data) ? data : ((data && data.users) || (data && data.shinobis) || []);
    var guestCount = data && typeof data.guestCount !== 'undefined'
      ? data.guestCount
      : ((data && data.visiteurs) || 0);

    var users = rawUsers.map(function(user) {
      var status = user.status;
      if (!status) {
        status = user.statut === 'en_ligne' ? 'active' : 'away';
      }
      return {
        pseudo: user.pseudo || '',
        permission: user.permission || '',
        policeRole: Boolean(typeof user.policeRole !== 'undefined' ? user.policeRole : user.police),
        status: status || 'away'
      };
    }).filter(function(user) {
      return String(user.pseudo || '').trim().length > 0;
    });

    var regularUsers = users.filter(function(user) {
      return String(user.permission || '').toUpperCase() !== 'JUSTICE';
    });
    var justiceUsers = users.filter(function(user) {
      return String(user.permission || '').toUpperCase() === 'JUSTICE';
    });

    if (!users.length && !guestCount) {
      list.innerHTML = '<div class="presence-empty">Aucun shinobi</div>';
      return;
    }

    clearElement(list);

    regularUsers.forEach(function(user) {
      var row = document.createElement('div');
      row.className = 'presence-user';

      var dot = document.createElement('span');
      dot.className = 'presence-dot ' + (user.status || 'away');
      row.appendChild(dot);

      if (user.policeRole) {
        var icon = document.createElement('span');
        icon.className = 'presence-police-icon';
        icon.textContent = '\u2694';
        row.appendChild(icon);
      }

      var name = document.createElement('span');
      name.className = 'presence-name';
      name.textContent = user.pseudo;
      name.title = user.pseudo + ' - ' + buildStatusLabel(user.status) + (user.policeRole ? ' [Police]' : '');
      row.appendChild(name);

      list.appendChild(row);
    });

    justiceUsers.forEach(function(user) {
      var justiceRow = document.createElement('div');
      justiceRow.className = 'presence-justice-row';

      var justiceDot = document.createElement('span');
      justiceDot.className = 'presence-dot justice';
      justiceRow.appendChild(justiceDot);

      var justiceIcon = document.createElement('span');
      justiceIcon.className = 'presence-justice-icon';
      justiceIcon.textContent = '\u2696';
      justiceRow.appendChild(justiceIcon);

      var justiceName = document.createElement('span');
      justiceName.className = 'presence-name';
      justiceName.textContent = 'Justice Konoha';
      justiceName.title = 'Justice Konoha - ' + buildStatusLabel(user.status);
      justiceRow.appendChild(justiceName);

      list.appendChild(justiceRow);
    });

    if (guestCount > 0) {
      var guestRow = document.createElement('div');
      guestRow.className = 'presence-guest-row';

      var guestDot = document.createElement('span');
      guestDot.className = 'presence-guest-dot';
      var guestTone = buildGuestColor(guestCount);
      guestDot.style.background = guestTone.color;
      guestDot.style.boxShadow = guestTone.glow;
      guestRow.appendChild(guestDot);

      var guestName = document.createElement('span');
      guestName.className = 'presence-name';
      guestName.textContent = 'Ninja visiteur x' + guestCount;
      guestName.title = guestCount + ' visiteur' + (guestCount > 1 ? 's' : '') + ' connecte(s) en invite';
      guestRow.appendChild(guestName);

      list.appendChild(guestRow);
    }
  }

  window.PresenceUI = {
    getClientId: getClientId,
    renderPresence: renderPresence,
    buildStatusLabel: buildStatusLabel
  };
})();
