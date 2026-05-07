(function(global) {
  var state = {
    currentUser: null,
    users: [],
    membres: [],
    selectedPseudo: null,
    filters: {
      query: '',
      permission: 'all',
      scope: 'all',
      link: 'all'
    },
    registerLastUpdated: null,
    sections: [],
    saving: false,
    toastTimer: null
  };

  var CAPABILITY_LABELS = [
    ['canViewHierarchy', 'Hierarchie'],
    ['canViewRegister', 'Registre'],
    ['canViewCodePenal', 'Code penal'],
    ['canCreateIncidentReport', 'Rapports incident'],
    ['canCreatePatrolReport', 'Rapports patrouille'],
    ['canViewDashboard', 'Dashboard'],
    ['canViewReports', 'Lecture rapports'],
    ['canManageReports', 'Gestion dossiers'],
    ['canViewHistory', 'Historique'],
    ['canEditRegister', 'Edition registre'],
    ['canEditCodePenal', 'Edition code penal'],
    ['canManagePoliceRanks', 'Grades police']
  ];

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

  function getToken() {
    return sessionStorage.getItem('policeToken');
  }

  function formatDate(value) {
    if (!value) return 'Non renseigne';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Non renseigne';
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
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

  function permissionWeight(user) {
    if (!user) return 99;
    if (user.permission === 'ADMIN') return 0;
    if (user.permission === 'JUSTICE') return 1;
    if (user.policeRole) return 2;
    if (user.permission === 'UPDATE') return 3;
    return 4;
  }

  function sortUsers(users) {
    return users.slice().sort(function(left, right) {
      var weight = permissionWeight(left) - permissionWeight(right);
      if (weight !== 0) return weight;
      return String(left.pseudo || '').localeCompare(String(right.pseudo || ''), 'fr', { sensitivity: 'base' });
    });
  }

  function getLinkedMembre(user) {
    if (!user || !user.linkedMembre) return null;
    return state.membres.find(function(membre) {
      return String(membre.pseudoHRP || '').toLowerCase() === String(user.linkedMembre || '').toLowerCase();
    }) || null;
  }

  function getAssignableMembres(user) {
    var currentLinkedKey = String((user && user.linkedMembre) || '').trim().toLowerCase();
    var reservedKeys = {};

    state.users.forEach(function(entry) {
      var linkedKey;

      if (!entry || !entry.linkedMembre) return;
      if (user && entry.pseudo === user.pseudo) return;

      linkedKey = String(entry.linkedMembre).trim().toLowerCase();
      if (linkedKey) {
        reservedKeys[linkedKey] = true;
      }
    });

    return state.membres
      .filter(function(membre) {
        var key = String((membre && membre.pseudoHRP) || '').trim().toLowerCase();
        if (!key) return false;
        if (key === currentLinkedKey) return true;
        return !reservedKeys[key];
      })
      .sort(function(left, right) {
        var leftLabel = String((left && (left.nomRP || left.pseudoHRP)) || '');
        var rightLabel = String((right && (right.nomRP || right.pseudoHRP)) || '');
        return leftLabel.localeCompare(rightLabel, 'fr', { sensitivity: 'base' });
      });
  }

  function getCapabilityLabels(user) {
    var capabilities = (user && user.capabilities) || {};
    return CAPABILITY_LABELS.filter(function(entry) {
      return !!capabilities[entry[0]];
    }).map(function(entry) {
      return entry[1];
    });
  }

  function getFilteredUsers() {
    var query = state.filters.query.trim().toLowerCase();

    return sortUsers(state.users).filter(function(user) {
      if (state.filters.permission !== 'all' && user.permission !== state.filters.permission) {
        return false;
      }

      if (state.filters.scope === 'police' && !user.policeRole) {
        return false;
      }

      if (state.filters.scope === 'civil' && user.policeRole) {
        return false;
      }

      if (state.filters.link === 'linked' && !user.linkedMembre) {
        return false;
      }

      if (state.filters.link === 'unlinked' && user.linkedMembre) {
        return false;
      }

      if (!query) return true;

      var linkedMembre = getLinkedMembre(user);
      var haystack = [
        user.pseudo,
        user.permission,
        user.policeRole ? 'police' : 'civil',
        user.linkedMembre,
        linkedMembre && linkedMembre.nomRP,
        linkedMembre && linkedMembre.rang,
        linkedMembre && linkedMembre.division,
        linkedMembre && linkedMembre.grade
      ].join(' ').toLowerCase();

      return haystack.indexOf(query) !== -1;
    });
  }

  function getSelectedUser() {
    if (!state.users.length) return null;
    var filtered = getFilteredUsers();
    if (!filtered.length) return null;
    var selected = filtered.find(function(user) {
      return user.pseudo === state.selectedPseudo;
    });
    return selected || filtered[0];
  }

  function updateSelection() {
    var selected = getSelectedUser();
    state.selectedPseudo = selected ? selected.pseudo : null;
  }

  function renderSummary() {
    var totalUsers = state.users.length;
    var filteredUsers = getFilteredUsers();
    var adminCount = state.users.filter(function(user) { return user.permission === 'ADMIN'; }).length;
    var policeCount = state.users.filter(function(user) { return !!user.policeRole; }).length;
    var linkedCount = state.users.filter(function(user) { return !!user.linkedMembre; }).length;
    var justiceCount = state.users.filter(function(user) { return user.permission === 'JUSTICE'; }).length;
    var registerCount = state.membres.length;

    $('summary-total').textContent = String(totalUsers);
    $('summary-total-note').textContent = filteredUsers.length + ' visibles';
    $('summary-admin').textContent = String(adminCount);
    $('summary-police').textContent = String(policeCount);
    $('summary-linked').textContent = String(linkedCount);
    $('summary-justice').textContent = String(justiceCount);
    $('summary-register').textContent = String(registerCount);
    $('summary-register-note').textContent = state.registerLastUpdated
      ? 'maj ' + formatDateTime(state.registerLastUpdated)
      : 'maj inconnue';
    $('summary-sections').textContent = String(state.sections.length);
    $('summary-sections-note').textContent = state.sections.map(function(s) { return s.displayName; }).join(', ') || 'aucune';
  }

  function renderRoster() {
    var list = $('admin-roster-list');
    var meta = $('admin-roster-meta');
    var users = getFilteredUsers();

    meta.textContent = users.length + ' compte(s) affiches sur ' + state.users.length;

    if (!users.length) {
      list.innerHTML = '<div class="admin-empty-state">Aucun compte ne correspond aux filtres actifs.</div>';
      return;
    }

    list.innerHTML = users.map(function(user) {
      var linkedMembre = getLinkedMembre(user);
      var permissionClass = 'permission-' + String(user.permission || 'READ').toLowerCase();
      var chips = [
        '<span class="admin-chip ' + permissionClass + '">' + escapeHtml(user.permission) + '</span>'
      ];

      if (user.policeRole) {
        chips.push('<span class="admin-chip role-police">Police</span>');
      }

      if (user.driRole) {
        chips.push('<span class="admin-chip role-dri">DRI</span>');
      }

      if (user.linkedMembre) {
        chips.push('<span class="admin-chip">Lie au registre</span>');
      }

      return [
        '<button type="button" class="admin-roster-card' + (user.pseudo === state.selectedPseudo ? ' is-selected' : '') + '" data-user-pseudo="' + escapeHtml(user.pseudo) + '">',
          '<div class="admin-roster-header">',
            '<div>',
              '<div class="admin-roster-name">' + escapeHtml(user.pseudo) + '</div>',
              '<div class="admin-roster-meta">',
                chips.join(''),
              '</div>',
            '</div>',
            '<div class="admin-chip">' + escapeHtml(formatDate(user.createdAt)) + '</div>',
          '</div>',
          '<div class="admin-panel-copy">',
            linkedMembre
              ? 'Personnage lie : ' + escapeHtml(linkedMembre.nomRP || linkedMembre.pseudoHRP || user.linkedMembre)
              : (user.linkedMembre ? 'Lie a ' + escapeHtml(user.linkedMembre) : 'Aucun personnage lie'),
          '</div>',
        '</button>'
      ].join('');
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('[data-user-pseudo]'), function(node) {
      node.addEventListener('click', function() {
        state.selectedPseudo = node.getAttribute('data-user-pseudo');
        render();
      });
    });
  }

  function renderPermissionOption(user, permission, isLastAdmin) {
    var disabled = state.saving || (isLastAdmin && permission !== 'ADMIN');
    return [
      '<button type="button" class="admin-permission-option' + (user.permission === permission ? ' is-active' : '') + '" data-permission="' + permission + '"' + (disabled ? ' disabled' : '') + '>',
        escapeHtml(permission),
      '</button>'
    ].join('');
  }

  function renderLinkedPreview(linkedMembre) {
    if (!linkedMembre) {
      return [
        '<div class="admin-linked-preview">',
          '<h4 class="admin-linked-title">Aucun rattachement actif</h4>',
          '<p class="admin-linked-copy">Selectionne un personnage dans le registre pour harmoniser le compte avec la chaine de commandement et les droits derives du rang.</p>',
        '</div>'
      ].join('');
    }

    return [
      '<div class="admin-linked-preview">',
        '<h4 class="admin-linked-title">' + escapeHtml(linkedMembre.nomRP || linkedMembre.pseudoHRP) + '</h4>',
        '<p class="admin-linked-copy">Pseudo HRP : ' + escapeHtml(linkedMembre.pseudoHRP || 'Inconnu') + '</p>',
        '<div class="admin-linked-stats">',
          '<div class="admin-linked-stat"><span class="admin-linked-label">Rang section</span><span class="admin-linked-value">' + escapeHtml(linkedMembre.rang || 'Non renseigne') + '</span></div>',
          '<div class="admin-linked-stat"><span class="admin-linked-label">Grade armee</span><span class="admin-linked-value">' + escapeHtml(linkedMembre.grade || 'Non renseigne') + '</span></div>',
          '<div class="admin-linked-stat"><span class="admin-linked-label">Division</span><span class="admin-linked-value">' + escapeHtml(linkedMembre.division || 'Non renseignee') + '</span></div>',
          '<div class="admin-linked-stat"><span class="admin-linked-label">Nature de chakra</span><span class="admin-linked-value">' + escapeHtml(linkedMembre.chakra || 'Non renseignee') + '</span></div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function renderDetail() {
    var container = $('admin-detail-card');
    var user = getSelectedUser();

    if (!user) {
      container.innerHTML = [
        '<div class="admin-detail-placeholder">',
          '<div>',
            '<div class="admin-placeholder-mark">BA</div>',
            '<h2 class="admin-panel-title">Selectionne un compte</h2>',
            '<p class="admin-empty-note">Choisis un profil dans la colonne de gauche pour piloter ses droits, son rattachement au registre et ses acces metier.</p>',
          '</div>',
        '</div>'
      ].join('');
      return;
    }

    var linkedMembre = getLinkedMembre(user);
    var capabilities = getCapabilityLabels(user);
    var adminCount = state.users.filter(function(entry) { return entry.permission === 'ADMIN'; }).length;
    var isLastAdmin = user.permission === 'ADMIN' && adminCount <= 1;
    var assignableMembres = getAssignableMembres(user);
    var linkOptions = [
      '<option value="">- Aucun personnage lie -</option>'
    ].concat(
      assignableMembres.map(function(membre) {
        var selected = membre.pseudoHRP === user.linkedMembre ? ' selected' : '';
        var label = membre.nomRP ? membre.pseudoHRP + ' - ' + membre.nomRP : membre.pseudoHRP;
        return '<option value="' + escapeHtml(membre.pseudoHRP) + '"' + selected + '>' + escapeHtml(label) + '</option>';
      })
    ).join('');

    container.innerHTML = [
      '<div class="admin-detail-header">',
        '<div>',
          '<div class="admin-kicker">Pilotage individuel</div>',
          '<h2 class="admin-detail-title">' + escapeHtml(user.pseudo) + '</h2>',
          '<p class="admin-detail-copy">Ajuste les droits de ce compte, son role operationnel et sa liaison au registre officiel sans quitter le backoffice.</p>',
          '<div class="admin-detail-badges">',
            '<span class="admin-chip permission-' + String(user.permission || 'READ').toLowerCase() + '">' + escapeHtml(user.permission) + '</span>',
            '<span class="admin-chip' + (user.policeRole ? ' role-police' : '') + '">' + (user.policeRole ? 'Role police actif' : 'Compte civil') + '</span>',
            '<span class="admin-chip">' + (user.linkedMembre ? 'Lie : ' + escapeHtml(user.linkedMembre) : 'Aucune liaison') + '</span>',
          '</div>',
        '</div>',
        '<div class="admin-detail-status">Etat de gestion<strong>' + (state.saving ? 'Synchronisation...' : 'Pret') + '</strong></div>',
      '</div>',
      '<div class="admin-detail-grid">',
        '<section class="admin-detail-section is-wide">',
          '<h3 class="admin-section-title">Posture et rattachement</h3>',
          '<p class="admin-section-copy">Vue synthese du compte cible, utile pour controler rapidement son exposition et son rattachement RP.</p>',
          '<div class="admin-data-grid">',
            '<div class="admin-data-card"><span class="admin-data-label">Creation</span><div class="admin-data-value">' + escapeHtml(formatDateTime(user.createdAt)) + '</div></div>',
            '<div class="admin-data-card"><span class="admin-data-label">Personnage lie</span><div class="admin-data-value">' + escapeHtml(user.linkedMembre || 'Non lie') + '</div></div>',
            '<div class="admin-data-card"><span class="admin-data-label">Statut police</span><div class="admin-data-value">' + (user.policeRole ? 'Actif' : 'Inactif') + '</div></div>',
          '</div>',
        '</section>',
        '<section class="admin-detail-section is-wide">',
          '<h3 class="admin-section-title">Permission principale</h3>',
          '<p class="admin-section-copy">Bascule instantanement le niveau d acces. Le dernier administrateur reste protege.</p>',
          '<div class="admin-permission-grid">',
            renderPermissionOption(user, 'READ', isLastAdmin),
            renderPermissionOption(user, 'UPDATE', isLastAdmin),
            renderPermissionOption(user, 'ADMIN', isLastAdmin),
            renderPermissionOption(user, 'JUSTICE', isLastAdmin),
          '</div>',
        '</section>',
        '<section class="admin-detail-section">',
          '<h3 class="admin-section-title">Role police</h3>',
          '<p class="admin-section-copy">Ce drapeau ouvre les parcours terrain et de supervision lies a la Police Militaire.</p>',
          '<div class="admin-action-row">',
            '<button type="button" class="admin-action-button' + (user.policeRole ? ' is-active' : '') + '" id="toggle-police-role">' + (user.policeRole ? 'Retirer le role police' : 'Accorder le role police') + '</button>',
          '</div>',
        '</section>',
        '<section class="admin-detail-section">',
          '<h3 class="admin-section-title">Acces DRI</h3>',
          '<p class="admin-section-copy">Donne acces direct a la Division de Renseignement Interne sans necessiter de personnage RP lie.</p>',
          '<div class="admin-action-row">',
            '<button type="button" class="admin-action-button' + (user.driRole ? ' is-active' : '') + '" id="toggle-dri-role">' + (user.driRole ? 'Retirer l\'acces DRI' : 'Accorder l\'acces DRI') + '</button>',
          '</div>',
        '</section>',
        '<section class="admin-detail-section">',
          '<h3 class="admin-section-title">Liaison registre</h3>',
          '<p class="admin-section-copy">Associe ce compte au bon shinobi pour que les permissions de terrain et de commandement restent coherentes.</p>',
          '<div class="admin-action-row">',
            '<select class="admin-link-select" id="linked-membre-select">' + linkOptions + '</select>',
          '</div>',
        '</section>',
        '<section class="admin-detail-section is-wide">',
          '<h3 class="admin-section-title">Fiche RP liee</h3>',
          '<p class="admin-section-copy">Un apercu rapide du profil rattache, directement issu du registre officiel.</p>',
          renderLinkedPreview(linkedMembre),
        '</section>',
        '<section class="admin-detail-section is-wide">',
          '<h3 class="admin-section-title">Surface d acces</h3>',
          '<p class="admin-section-copy">Lecture immediate des espaces actuellement ouverts pour ce compte selon sa permission, son role police et son rattachement.</p>',
          capabilities.length
            ? '<div class="admin-capability-list">' + capabilities.map(function(label) {
                return '<span class="admin-capability-chip">' + escapeHtml(label) + '</span>';
              }).join('') + '</div>'
            : '<div class="admin-empty-state">Aucun acces metier explicite n a pu etre determine pour ce compte.</div>',
        '</section>',
        '<section class="admin-detail-section is-wide">',
          '<h3 class="admin-section-title">Zone sensible</h3>',
          '<p class="admin-section-copy">Suppression definitive du compte. Cette action retire l acces et force une nouvelle inscription si necessaire.</p>',
          '<div class="admin-action-row">',
            '<button type="button" class="admin-danger-button" id="delete-user-button"' + (isLastAdmin ? ' disabled' : '') + '>Supprimer ce compte</button>',
            isLastAdmin ? '<span class="admin-empty-note">Le dernier administrateur ne peut pas etre supprime.</span>' : '',
          '</div>',
        '</section>',
      '</div>'
    ].join('');

    Array.prototype.forEach.call(container.querySelectorAll('[data-permission]'), function(node) {
      node.addEventListener('click', function() {
        updatePermission(user, node.getAttribute('data-permission'));
      });
    });

    var policeButton = $('toggle-police-role');
    if (policeButton) {
      policeButton.disabled = state.saving;
      policeButton.addEventListener('click', function() {
        updatePoliceRole(user, !user.policeRole);
      });
    }

    var driButton = $('toggle-dri-role');
    if (driButton) {
      driButton.disabled = state.saving;
      driButton.addEventListener('click', function() {
        updateDriRole(user, !user.driRole);
      });
    }

    var linkSelect = $('linked-membre-select');
    if (linkSelect) {
      linkSelect.disabled = state.saving;
      linkSelect.addEventListener('change', function() {
        updateLinkedMembre(user, linkSelect.value || null);
      });
    }

    var deleteButton = $('delete-user-button');
    if (deleteButton) {
      deleteButton.disabled = state.saving || isLastAdmin;
      deleteButton.addEventListener('click', function() {
        deleteUser(user);
      });
    }
  }

  function renderAccessDenied() {
    var roster = $('admin-roster-list');
    var detail = $('admin-detail-card');

    $('admin-roster-meta').textContent = 'Acces refuse';
    roster.innerHTML = '';
    detail.innerHTML = [
      '<div class="admin-access-denied">',
        '<h2>Acces reserve</h2>',
        '<p>Ce backoffice est reserve aux administrateurs. Reviens au registre ou au quartier general pour poursuivre sur les espaces autorises.</p>',
      '</div>'
    ].join('');
  }

  function render() {
    updateSelection();
    renderSummary();
    renderRoster();
    renderDetail();
  }

  function showToast(message, isError) {
    var toast = $('admin-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('is-visible');

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
    }

    state.toastTimer = setTimeout(function() {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options);
    var payload = await response.json().catch(function() { return null; });
    if (!response.ok) {
      throw new Error((payload && payload.error) || 'Erreur serveur');
    }
    return payload;
  }

  async function loadData(preserveSelection) {
    var keepPseudo = preserveSelection || state.selectedPseudo;
    var token = getToken();
    var headers = { Authorization: 'Bearer ' + token };

    var responses = await Promise.all([
      fetchJson('/admin/users', { headers: headers }),
      fetchJson('/api/v1/membres'),
      fetchJson('/admin/sections', { headers: headers })
    ]);

    state.users = Array.isArray(responses[0]) ? responses[0] : [];
    state.membres = Array.isArray(responses[1].membres) ? responses[1].membres : [];
    state.registerLastUpdated = responses[1].lastUpdated || null;
    state.sections = Array.isArray(responses[2]) ? responses[2] : [];
    state.selectedPseudo = keepPseudo;

    if (!state.selectedPseudo && state.users.length) {
      state.selectedPseudo = state.users[0].pseudo;
    }

    render();
  }

  async function runMutation(task, successMessage) {
    if (state.saving) return;
    state.saving = true;
    renderDetail();

    try {
      var selectedPseudo = state.selectedPseudo;
      await task();
      await loadData(selectedPseudo);
      showToast(successMessage, false);
    } catch (error) {
      showToast(error.message || 'Operation impossible', true);
    } finally {
      state.saving = false;
      renderDetail();
    }
  }

  function updatePermission(user, permission) {
    if (!user || user.permission === permission) return;
    runMutation(function() {
      return fetchJson('/admin/users/' + encodeURIComponent(user.pseudo) + '/permission', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({ permission: permission })
      });
    }, 'Permission mise a jour');
  }

  function updatePoliceRole(user, policeRole) {
    if (!user || !!user.policeRole === !!policeRole) return;
    runMutation(function() {
      return fetchJson('/admin/users/' + encodeURIComponent(user.pseudo) + '/police', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({ policeRole: !!policeRole })
      });
    }, policeRole ? 'Role police accorde' : 'Role police retire');
  }

  function updateDriRole(user, driRole) {
    if (!user || !!user.driRole === !!driRole) return;
    runMutation(function() {
      return fetchJson('/admin/users/' + encodeURIComponent(user.pseudo) + '/dri', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({ driRole: !!driRole })
      });
    }, driRole ? 'Acces DRI accorde' : 'Acces DRI retire');
  }

  function updateLinkedMembre(user, linkedMembre) {
    if (!user) return;
    var nextValue = linkedMembre || null;
    if ((user.linkedMembre || null) === nextValue) return;
    runMutation(function() {
      return fetchJson('/admin/users/' + encodeURIComponent(user.pseudo) + '/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken()
        },
        body: JSON.stringify({ pseudoHRP: nextValue })
      });
    }, nextValue ? 'Liaison registre mise a jour' : 'Liaison registre retiree');
  }

  function deleteUser(user) {
    if (!user) return;
    if (!global.confirm('Supprimer definitivement le compte de ' + user.pseudo + ' ?')) return;

    runMutation(function() {
      return fetchJson('/admin/users/' + encodeURIComponent(user.pseudo), {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + getToken()
        }
      });
    }, 'Compte supprime');
  }

  function bindFilters() {
    $('admin-search').addEventListener('input', function(event) {
      state.filters.query = event.target.value || '';
      render();
    });

    $('filter-permission').addEventListener('change', function(event) {
      state.filters.permission = event.target.value;
      render();
    });

    $('filter-scope').addEventListener('change', function(event) {
      state.filters.scope = event.target.value;
      render();
    });

    $('filter-link').addEventListener('change', function(event) {
      state.filters.link = event.target.value;
      render();
    });
  }

  async function pingPresence() {
    if (!state.currentUser || state.currentUser.permission === 'GUEST') return;
    if (!global.UserShell) return;
    await global.UserShell.pingPresence({
      listId: 'presence-list',
      clientId: global.PresenceUI && typeof global.PresenceUI.getClientId === 'function'
        ? global.PresenceUI.getClientId()
        : undefined
    });
  }

  function toggleBurgerMenu() {
    if (global.UserShell) {
      global.UserShell.toggleBurgerMenu('user-bar-inner');
    }
  }

  function closeBurgerMenu() {
    if (global.UserShell) {
      global.UserShell.closeBurgerMenu('user-bar-inner');
    }
  }

  function togglePresenceMobile() {
    if (global.UserShell) {
      global.UserShell.togglePresenceMobile('presence-sidebar');
    }
  }

  async function doLogout() {
    if (global.UserShell) {
      await global.UserShell.logout({ redirectTo: 'login.html' });
    }
  }

  async function boot() {
    bindFilters();

    if (global.UserShell) {
      global.UserShell.installBurgerAutoClose({ rootSelector: '#user-bar', innerId: 'user-bar-inner' });
    }

    state.currentUser = global.UserShell
      ? await global.UserShell.fetchCurrentUser({ redirectTo: 'login.html?redirect=Backoffice_Admin.html' })
      : null;

    global.currentUser = state.currentUser;

    if (!state.currentUser) return;

    if (global.UserShell) {
      global.UserShell.applyUserBar(state.currentUser, { badgeId: 'user-badge' });
    }

    if (state.currentUser.permission !== 'ADMIN') {
      renderAccessDenied();
      return;
    }

    await loadData();
    await pingPresence();
    global.setInterval(pingPresence, 8000);
  }

  global.toggleBurgerMenu = toggleBurgerMenu;
  global.closeBurgerMenu = closeBurgerMenu;
  global.togglePresenceMobile = togglePresenceMobile;
  global.doLogout = doLogout;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
