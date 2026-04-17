(function(global) {
  var pendingAvatar = null;
  var currentAvatar = '';
  var notificationsCache = [];
  var unreadNotificationCount = 0;
  var notificationPollHandle = null;
  var notificationsBootstrapped = false;
  var notificationAudioContext = null;

  function getToken() {
    return sessionStorage.getItem('policeToken');
  }

  function getCurrentUser() {
    try {
      return global.currentUser || JSON.parse(sessionStorage.getItem('policeUser') || 'null');
    } catch (error) {
      return global.currentUser || null;
    }
  }

  async function hydrateCurrentUser() {
    var token = getToken();
    if (!token) return getCurrentUser();

    try {
      var response = await fetch('/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!response.ok) return getCurrentUser();
      var user = await response.json();
      global.currentUser = user;
      sessionStorage.setItem('policeUser', JSON.stringify(user));
      return user;
    } catch (error) {
      return getCurrentUser();
    }
  }

  function getPopup() {
    return document.getElementById('profile-popup');
  }

  function getPreview() {
    return document.getElementById('profile-avatar-preview');
  }

  function getSaveButton() {
    return document.getElementById('profile-save-btn');
  }

  function getStatus() {
    return document.getElementById('profile-save-status');
  }

  function getControls() {
    return document.querySelector('#profile-popup .profile-avatar-controls');
  }

  function getPoliceCardButton() {
    return document.getElementById('profile-card-btn');
  }

  function getBadge() {
    return document.getElementById('user-badge');
  }

  function getNotificationsButton() {
    return document.getElementById('profile-notifications-btn');
  }

  function getNotificationsPopover() {
    return document.getElementById('profile-notifications-popover');
  }

  function canGeneratePoliceCard(user) {
    return !!(user && user.capabilities && user.capabilities.canGeneratePoliceCard);
  }

  function canUsePoliceService(user) {
    return !!(user && user.capabilities && user.capabilities.canUsePoliceService);
  }

  function setStatusMessage(message, tone) {
    var status = getStatus();
    if (!status) return;

    status.textContent = message || '';

    if (tone === 'success') {
      status.style.color = '#dff1b5';
      return;
    }

    if (tone === 'error') {
      status.style.color = '#f4a6a6';
      return;
    }

    status.style.color = '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setPreviewImage(source) {
    var preview = getPreview();
    if (!preview) return;

    preview.innerHTML = '';
    currentAvatar = source || '';

    if (source) {
      var image = document.createElement('img');
      image.src = source;
      image.alt = 'Photo de profil';
      preview.appendChild(image);
      return;
    }

    var placeholder = document.createElement('span');
    placeholder.className = 'profile-avatar-placeholder';
    placeholder.id = 'profile-avatar-ph';
    placeholder.innerHTML = '&#128100;';
    preview.appendChild(placeholder);
  }

  function resizeImageToBase64(file, maxSize, quality, callback) {
    var reader = new FileReader();
    reader.onload = function(event) {
      var img = new Image();
      img.onload = function() {
        var width = img.width;
        var height = img.height;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function loadAvatar() {
    var user = getCurrentUser();
    if (!user || !user.pseudo) return '';
    var token = getToken();
    if (!token) return '';
    try {
      var response = await fetch('/auth/profile/avatar/' + encodeURIComponent(user.pseudo), {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!response.ok) {
        setPreviewImage('');
        return '';
      }
      var payload = await response.json();
      setPreviewImage(payload.avatar || '');
      return payload.avatar || '';
    } catch (error) {
      return '';
    }
  }

  function ensurePoliceCardButton() {
    var user = getCurrentUser();
    var controls = getControls();
    var status = getStatus();
    var saveButton = getSaveButton();
    var button = getPoliceCardButton();

    if (!controls) return null;
    if (!canGeneratePoliceCard(user)) {
      if (button && button.parentNode) {
        button.parentNode.removeChild(button);
      }
      return null;
    }
    if (button) return button;

    button = document.createElement('button');
    button.type = 'button';
    button.id = 'profile-card-btn';
    button.className = 'profile-save-btn profile-card-btn';
    button.textContent = 'Carte de police';
    button.addEventListener('click', exportPoliceCard);

    if (status && status.parentNode === controls) {
      controls.insertBefore(button, status);
    } else if (saveButton && saveButton.parentNode === controls && saveButton.nextSibling) {
      controls.insertBefore(button, saveButton.nextSibling);
    } else {
      controls.appendChild(button);
    }

    return button;
  }

  function ensureNotificationHeaderActions() {
    var popup = getPopup();
    if (!popup) return null;

    var head = popup.querySelector('.profile-popup-head');
    var statePill = popup.querySelector('.profile-state-pill');
    if (!head || !statePill) return null;

    var actions = popup.querySelector('.profile-head-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'profile-head-actions';
      head.appendChild(actions);
      actions.appendChild(statePill);
    }

    return actions;
  }

  function ensureNotificationsButton() {
    var user = getCurrentUser();
    if (!user || user.permission === 'GUEST') return null;

    var actions = ensureNotificationHeaderActions();
    if (!actions) return null;

    var button = getNotificationsButton();
    if (button) return button;

    button = document.createElement('button');
    button.type = 'button';
    button.id = 'profile-notifications-btn';
    button.className = 'profile-bell-btn';
    button.setAttribute('aria-label', 'Voir les notifications');
    button.innerHTML = '&#128276;';
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      toggleNotificationsPopover();
    });
    actions.insertBefore(button, actions.firstChild);
    return button;
  }

  function ensureNotificationsPopover() {
    var popup = getPopup();
    if (!popup) return null;

    var popover = getNotificationsPopover();
    if (popover) return popover;

    popover = document.createElement('div');
    popover.id = 'profile-notifications-popover';
    popover.className = 'profile-notifications-popover';
    popover.innerHTML = [
      '<div class="profile-notifications-head">',
      '<div class="profile-notifications-title">Notifications</div>',
      '<div class="profile-notifications-actions">',
      '<button type="button" class="profile-notifications-readall" id="profile-notifications-readall">Tout marquer lu</button>',
      '<button type="button" class="profile-notifications-clearall" id="profile-notifications-clearall">Tout effacer</button>',
      '</div>',
      '</div>',
      '<div class="profile-notifications-list" id="profile-notifications-list"><div class="profile-notification-empty">Chargement...</div></div>'
    ].join('');
    popup.appendChild(popover);

    var readAll = popover.querySelector('#profile-notifications-readall');
    if (readAll) {
      readAll.addEventListener('click', function(event) {
        event.stopPropagation();
        markAllNotificationsRead();
      });
    }

    var clearAll = popover.querySelector('#profile-notifications-clearall');
    if (clearAll) {
      clearAll.addEventListener('click', function(event) {
        event.stopPropagation();
        clearAllNotifications();
      });
    }

    return popover;
  }

  function renderNotificationBadge() {
    var badge = getBadge();
    if (!badge) return;

    badge.classList.toggle('has-alert', unreadNotificationCount > 0);

    var dot = badge.querySelector('.user-badge-dot');
    if (unreadNotificationCount > 0) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'user-badge-dot';
        badge.appendChild(dot);
      }
      dot.setAttribute('title', unreadNotificationCount + ' notification(s) non lue(s)');
    } else if (dot) {
      dot.remove();
    }
  }

  function formatNotificationDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' - ' +
      date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderNotificationsList() {
    var popover = ensureNotificationsPopover();
    if (!popover) return;

    var list = popover.querySelector('#profile-notifications-list');
    if (!list) return;

    if (!notificationsCache.length) {
      list.innerHTML = '<div class="profile-notification-empty">Aucune notification pour le moment.</div>';
      return;
    }

    list.innerHTML = notificationsCache.map(function(item) {
      return [
        '<article class="profile-notification-item' + (item.unread ? ' unread' : '') + '">',
        '<div class="profile-notification-item-head">',
        '<strong>' + escapeHtml(item.title || 'Notification') + '</strong>',
        '<span>' + escapeHtml(formatNotificationDate(item.createdAt)) + '</span>',
        '</div>',
        item.body ? '<div class="profile-notification-body">' + escapeHtml(item.body) + '</div>' : '',
        item.entityId ? '<div class="profile-notification-meta">Reference : ' + escapeHtml(item.entityId) + '</div>' : '',
        '</article>'
      ].join('');
    }).join('');
  }

  async function fetchNotifications(limit) {
    var token = getToken();
    if (!token) return { items: [], unreadCount: 0 };

    var response = await fetch('/api/v1/notifications?limit=' + encodeURIComponent(limit || 20), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!response.ok) {
      throw new Error('Notifications indisponibles');
    }

    return response.json();
  }

  function playNotificationBlip() {
    try {
      var AudioContextRef = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextRef) return;

      if (!notificationAudioContext) {
        notificationAudioContext = new AudioContextRef();
      }

      var context = notificationAudioContext;
      if (context.state === 'suspended' && typeof context.resume === 'function') {
        context.resume();
      }

      var now = context.currentTime;
      var oscillator = context.createOscillator();
      var gainNode = context.createGain();

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(1180, now);
      oscillator.frequency.exponentialRampToValueAtTime(1480, now + 0.09);

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.18);
    } catch (error) {}
  }

  async function refreshNotifications(options) {
    var settings = options || {};
    var user = getCurrentUser();
    if (!user || user.permission === 'GUEST') {
      notificationsCache = [];
      unreadNotificationCount = 0;
      renderNotificationBadge();
      return;
    }

    try {
      var previousUnread = unreadNotificationCount;
      var payload = await fetchNotifications(settings.limit || 20);
      notificationsCache = payload.items || [];
      unreadNotificationCount = Number(payload.unreadCount || 0);
      renderNotificationBadge();
      renderNotificationsList();
      if (notificationsBootstrapped && settings.announce !== false && unreadNotificationCount > previousUnread) {
        playNotificationBlip();
      }
      notificationsBootstrapped = true;
    } catch (error) {}
  }

  async function markAllNotificationsRead() {
    var token = getToken();
    if (!token) return;

    try {
      await fetch('/api/v1/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      notificationsCache = notificationsCache.map(function(item) {
        return Object.assign({}, item, { unread: false, readAt: item.readAt || new Date().toISOString() });
      });
      unreadNotificationCount = 0;
      renderNotificationBadge();
      renderNotificationsList();
    } catch (error) {}
  }

  async function clearAllNotifications() {
    var token = getToken();
    if (!token) return;

    try {
      await fetch('/api/v1/notifications/clear-all', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      notificationsCache = [];
      unreadNotificationCount = 0;
      renderNotificationBadge();
      renderNotificationsList();
      closeNotificationsPopover();
    } catch (error) {}
  }

  async function openNotificationsPopover() {
    var popover = ensureNotificationsPopover();
    if (!popover) return;
    popover.classList.add('open');
    await refreshNotifications({ limit: 30 });
    if (unreadNotificationCount > 0) {
      markAllNotificationsRead();
    }
  }

  function closeNotificationsPopover() {
    var popover = getNotificationsPopover();
    if (popover) {
      popover.classList.remove('open');
    }
  }

  function toggleNotificationsPopover() {
    var popover = ensureNotificationsPopover();
    if (!popover) return;
    if (popover.classList.contains('open')) {
      closeNotificationsPopover();
    } else {
      openNotificationsPopover();
    }
  }

  function startNotificationPolling() {
    if (notificationPollHandle) return;
    notificationPollHandle = global.setInterval(function() {
      hydrateCurrentUser().then(function(user) {
        if (user && user.permission !== 'GUEST') {
          ensureNotificationsButton();
          ensureNotificationsPopover();
          refreshNotifications({ limit: 8 });
        }
      });
    }, 6000);
  }

  function scheduleNotificationRefreshes() {
    [200, 1000, 2500, 5000].forEach(function(delay) {
      global.setTimeout(function() {
        hydrateCurrentUser().then(function(user) {
          if (user && user.permission !== 'GUEST') {
            ensureNotificationsButton();
            ensureNotificationsPopover();
            refreshNotifications({ limit: 8, announce: false });
          }
        });
      }, delay);
    });
  }

  async function openProfilePopup() {
    var user = await hydrateCurrentUser();
    var popup = getPopup();
    if (!popup || !user || user.permission === 'GUEST') return;
    popup.classList.add('open');
    ensureNotificationsButton();
    ensureNotificationsPopover();
    ensurePoliceCardButton();
    await loadAvatar();
    await refreshNotifications({ limit: 12 });
    if (global.ServiceWidget) {
      global.ServiceWidget.refresh(user);
    }
  }

  function closeProfilePopup() {
    var popup = getPopup();
    if (popup) popup.classList.remove('open');
    closeNotificationsPopover();
  }

  function toggleProfilePopup() {
    var popup = getPopup();
    if (!popup) return;
    if (popup.classList.contains('open')) {
      closeProfilePopup();
    } else {
      openProfilePopup();
    }
  }

  function handleAvatarSelect(event) {
    var file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    resizeImageToBase64(file, 256, 0.82, function(base64) {
      pendingAvatar = base64;
      setPreviewImage(base64);
      var saveButton = getSaveButton();
      if (saveButton) saveButton.disabled = false;
    });
  }

  async function saveAvatar() {
    if (!pendingAvatar) return;
    var saveButton = getSaveButton();
    if (saveButton) saveButton.disabled = true;
    setStatusMessage('Envoi...', 'neutral');
    try {
      var response = await fetch('/auth/profile/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + getToken()
        },
        body: JSON.stringify({ avatar: pendingAvatar })
      });
      var payload = await response.json().catch(function() { return {}; });
      if (!response.ok) throw new Error(payload.error || 'Erreur');
      pendingAvatar = null;
      setStatusMessage('Photo sauvegardee', 'success');
      setTimeout(function() {
        setStatusMessage('', 'neutral');
      }, 2500);
    } catch (error) {
      if (saveButton) saveButton.disabled = false;
      setStatusMessage('Erreur : ' + (error.message || 'impossible de sauvegarder'), 'error');
    }
  }

  function uniqueNonEmpty(values) {
    var seen = {};
    return values.filter(function(value) {
      var key = String(value || '').trim().toLowerCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  async function fetchMemberRecord(user) {
    var candidates = uniqueNonEmpty([
      user && user.linkedMembre,
      user && user.pseudo
    ]);

    for (var index = 0; index < candidates.length; index += 1) {
      try {
        var response = await fetch('/api/v1/membres/' + encodeURIComponent(candidates[index]));
        if (!response.ok) continue;
        return await response.json();
      } catch (error) {}
    }

    return null;
  }

  async function fetchServiceSnapshot(user) {
    if (!user || user.permission === 'GUEST' || !canUsePoliceService(user)) {
      return null;
    }

    try {
      var response = await fetch('/api/v1/service/me', {
        headers: { 'Authorization': 'Bearer ' + getToken() }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  function loadImage(source) {
    return new Promise(function(resolve) {
      if (!source) {
        resolve(null);
        return;
      }

      var image = new Image();
      image.onload = function() { resolve(image); };
      image.onerror = function() { resolve(null); };
      image.src = source;
    });
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fillRoundedRect(context, x, y, width, height, radius, fillStyle, strokeStyle, lineWidth) {
    roundedRectPath(context, x, y, width, height, radius);
    if (fillStyle) {
      context.fillStyle = fillStyle;
      context.fill();
    }
    if (strokeStyle) {
      context.lineWidth = lineWidth || 1;
      context.strokeStyle = strokeStyle;
      context.stroke();
    }
  }

  function wrapText(context, text, maxWidth) {
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var current = '';

    words.forEach(function(word) {
      var candidate = current ? current + ' ' + word : word;
      if (context.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    });

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  function truncateText(context, text, maxWidth) {
    var value = String(text || '');
    if (context.measureText(value).width <= maxWidth) return value;

    while (value.length > 1 && context.measureText(value + '…').width > maxWidth) {
      value = value.slice(0, -1);
    }

    return value + '…';
  }

  function drawField(context, options) {
    var x = options.x;
    var y = options.y;
    var width = options.width;
    var height = options.height;
    var label = options.label;
    var value = options.value;

    fillRoundedRect(
      context,
      x,
      y,
      width,
      height,
      18,
      'rgba(255, 248, 224, 0.84)',
      'rgba(151, 107, 20, 0.22)',
      2
    );

    context.fillStyle = 'rgba(128, 89, 17, 0.7)';
    context.font = '11px Cinzel, serif';
    context.fillText(label.toUpperCase(), x + 20, y + 24);

    context.fillStyle = '#2f1f0d';
    context.font = '600 18px "IM Fell English", serif';
    var lines = wrapText(context, value, width - 40);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = truncateText(context, lines[1], width - 40);
    }
    lines.forEach(function(line, index) {
      context.fillText(line, x + 20, y + 54 + index * 20);
    });
  }

  function formatCardDate(value) {
    if (!value) return 'Non renseignee';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  function getCardAvatarSource() {
    return pendingAvatar || currentAvatar || '';
  }

  async function buildPoliceCardBlob(payload) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var width = 1180;
    var height = 720;
    var avatarSource = payload.avatarSource;
    var cardTitle = 'Police Militaire de Konoha';
    var cardSubtitle = 'Carte de police officielle';
    var member = payload.member || {};
    var user = payload.user || {};
    var service = payload.service || {};
    var permissionText = user.permission === 'ADMIN' ? 'Administration' : (user.permission || 'Lecture');
    var gradeText = member.grade || 'Non renseigne';
    var rangText = member.rang || (user.policeRole ? 'Police active' : 'Aucun rang');
    var chakraText = member.chakra || 'Non renseigne';
    var divisionText = member.division || 'Aucune';
    var specialisationText = member.specialisation || 'Non renseignee';
    var avatarImage = await loadImage(avatarSource);
    var logoImage = await loadImage('Uchiwa_Symbole.svg');

    canvas.width = width;
    canvas.height = height;

    var background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#160d03');
    background.addColorStop(0.45, '#2d1d08');
    background.addColorStop(1, '#090603');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    var glow = context.createRadialGradient(140, 120, 10, 140, 120, 340);
    glow.addColorStop(0, 'rgba(250, 212, 110, 0.26)');
    glow.addColorStop(1, 'rgba(250, 212, 110, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    fillRoundedRect(context, 26, 26, width - 52, height - 52, 26, 'rgba(0, 0, 0, 0)', 'rgba(210, 157, 40, 0.92)', 3);
    fillRoundedRect(context, 44, 44, width - 88, height - 88, 22, 'rgba(241, 213, 117, 0.92)', 'rgba(102, 69, 12, 0.85)', 2);

    var panel = context.createLinearGradient(60, 60, width - 60, height - 60);
    panel.addColorStop(0, '#f7e3a2');
    panel.addColorStop(0.52, '#d8ab22');
    panel.addColorStop(1, '#f2d78a');
    fillRoundedRect(context, 62, 62, width - 124, height - 124, 20, panel, 'rgba(132, 88, 12, 0.35)', 2);

    context.save();
    context.translate(width / 2 + 30, height / 2 + 12);
    context.rotate(-0.26);
    context.fillStyle = 'rgba(127, 58, 15, 0.08)';
    context.font = '700 68px Cinzel, serif';
    context.textAlign = 'center';
    context.fillText('POLICE DE KONOHA', 0, 0);
    context.restore();

    context.textAlign = 'left';
    context.fillStyle = '#2a1807';
    context.font = '700 38px Cinzel, serif';
    context.fillText(cardTitle, 110, 128);

    context.fillStyle = 'rgba(126, 86, 18, 0.88)';
    context.font = '15px Cinzel, serif';
    context.fillText(cardSubtitle.toUpperCase(), 112, 156);

    if (logoImage) {
      context.drawImage(logoImage, width - 164, 80, 64, 64);
    }

    fillRoundedRect(context, 104, 184, 286, 474, 26, 'rgba(45, 29, 9, 0.78)', 'rgba(165, 118, 24, 0.56)', 2);
    fillRoundedRect(context, 128, 208, 238, 248, 20, 'rgba(250, 244, 228, 0.94)', 'rgba(165, 118, 24, 0.45)', 2);

    if (avatarImage) {
      context.save();
      roundedRectPath(context, 128, 208, 238, 248, 18);
      context.clip();

      var imageRatio = avatarImage.width / avatarImage.height;
      var targetRatio = 238 / 248;
      var drawWidth;
      var drawHeight;
      var drawX;
      var drawY;

      if (imageRatio > targetRatio) {
        drawHeight = 248;
        drawWidth = drawHeight * imageRatio;
        drawX = 128 - (drawWidth - 238) / 2;
        drawY = 208;
      } else {
        drawWidth = 238;
        drawHeight = drawWidth / imageRatio;
        drawX = 128;
        drawY = 208 - (drawHeight - 248) / 2;
      }

      context.drawImage(avatarImage, drawX, drawY, drawWidth, drawHeight);
      context.restore();
    } else {
      var avatarGradient = context.createLinearGradient(128, 208, 366, 456);
      avatarGradient.addColorStop(0, '#714912');
      avatarGradient.addColorStop(1, '#26170a');
      fillRoundedRect(context, 128, 208, 238, 248, 18, avatarGradient, null, 0);
      context.fillStyle = 'rgba(255, 233, 173, 0.72)';
      context.beginPath();
      context.arc(247, 284, 46, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(247, 406, 86, Math.PI, 0, false);
      context.fill();
    }

    context.fillStyle = '#f4df9a';
    context.font = '11px Cinzel, serif';
    context.fillText('Portrait de service', 128, 486);

    context.fillStyle = '#fff2cd';
    context.font = '700 18px "IM Fell English", serif';
    context.fillText(truncateText(context, member.nomRP || user.linkedMembre || 'Personnage non lie', 226), 128, 516);

    fillRoundedRect(context, 128, 540, 238, 88, 16, 'rgba(255, 245, 214, 0.09)', 'rgba(201, 156, 43, 0.18)', 1);
    context.fillStyle = 'rgba(241, 221, 164, 0.84)';
    context.font = '11px Cinzel, serif';
    context.fillText('Reference interne', 146, 562);
    context.fillText('Division', 146, 600);

    context.fillStyle = '#fff2cd';
    context.font = '700 17px "IM Fell English", serif';
    context.fillText(truncateText(context, 'PMK-' + String((member.pseudoHRP || user.pseudo || 'agent')).toUpperCase(), 198), 146, 580);
    context.fillText(truncateText(context, divisionText, 198), 146, 618);

    var fields = [
      { label: 'Nom RP', value: member.nomRP || 'Non renseigne' },
      { label: 'Grade Armee', value: gradeText },
      { label: 'Rang section', value: rangText },
      { label: 'Division', value: divisionText },
      { label: 'Nature de chakra', value: chakraText },
      { label: 'Specialisation', value: specialisationText },
      { label: 'Acces MDT', value: permissionText }
    ];

    var fieldWidth = 298;
    var fieldHeight = 88;
    var startX = 442;
    var startY = 194;
    var gapX = 22;
    var gapY = 16;

    fields.forEach(function(field, index) {
      var column;
      var row;
      var widthOverride = fieldWidth;

      if (index === fields.length - 1) {
        column = 0;
        row = 3;
        widthOverride = fieldWidth * 2 + gapX;
      } else {
        column = index % 2;
        row = Math.floor(index / 2);
      }

      drawField(context, {
        x: startX + column * (fieldWidth + gapX),
        y: startY + row * (fieldHeight + gapY),
        width: widthOverride,
        height: fieldHeight,
        label: field.label,
        value: field.value
      });
    });

    fillRoundedRect(context, 452, 604, 414, 50, 18, 'rgba(48, 30, 9, 0.82)', 'rgba(167, 118, 24, 0.38)', 2);
    context.fillStyle = '#f0d998';
    context.font = '11px Cinzel, serif';
    context.fillText('Date d arrivee', 480, 622);
    context.fillText('Emission', 690, 622);

    context.fillStyle = '#fff3cb';
    context.font = '700 18px "IM Fell English", serif';
    context.fillText(formatCardDate(member.dateArrivee), 480, 642);
    context.fillText(formatCardDate(new Date().toISOString()), 690, 642);

    var footerText = member.notes ? String(member.notes) : 'Document officiel du Commandement de la Police Militaire de Konoha.';
    context.fillStyle = 'rgba(112, 72, 13, 0.84)';
    context.font = '14px "IM Fell English", serif';
    context.fillText(truncateText(context, footerText, 920), 110, 672);

    return new Promise(function(resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function(blob) {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error('Impossible de generer la carte.'));
        }, 'image/png');
        return;
      }

      try {
        var dataUrl = canvas.toDataURL('image/png');
        var base64 = dataUrl.split(',')[1];
        var binary = atob(base64);
        var length = binary.length;
        var bytes = new Uint8Array(length);
        for (var i = 0; i < length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve(new Blob([bytes], { type: 'image/png' }));
      } catch (error) {
        reject(error);
      }
    });
  }

  function sanitizeFileName(value) {
    return String(value || 'agent')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent';
  }

  async function exportPoliceCard() {
    var user = await hydrateCurrentUser();
    var button = ensurePoliceCardButton();

    if (!button || !user || user.permission === 'GUEST' || !canGeneratePoliceCard(user)) {
      setStatusMessage('Generation reservee aux policiers autorises.', 'error');
      return;
    }

    button.disabled = true;
    setStatusMessage('Generation de la carte...', 'neutral');

    try {
      if (!getCardAvatarSource()) {
        await loadAvatar();
      }

      var avatarSource = getCardAvatarSource();
      var tasks = [fetchMemberRecord(user), fetchServiceSnapshot(user)];

      if (document.fonts && document.fonts.ready) {
        tasks.push(document.fonts.ready.catch(function() { return null; }));
      }

      var results = await Promise.all(tasks);
      var member = results[0] || null;
      var service = results[1] || null;
      var blob = await buildPoliceCardBlob({
        user: user,
        member: member,
        service: service,
        avatarSource: avatarSource
      });

      var link = document.createElement('a');
      var objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = 'carte-police-konoha-' + sanitizeFileName(user.pseudo || (member && member.pseudoHRP) || 'agent') + '.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);

      setStatusMessage('Carte de police generee en PNG.', 'success');
      setTimeout(function() {
        setStatusMessage('', 'neutral');
      }, 3200);
    } catch (error) {
      setStatusMessage('Erreur : ' + (error.message || 'generation impossible'), 'error');
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    hydrateCurrentUser().then(function(user) {
      if (user && user.permission !== 'GUEST') {
        ensureNotificationsButton();
        ensureNotificationsPopover();
        refreshNotifications({ limit: 8, announce: false });
      }
    });
    ensurePoliceCardButton();
    startNotificationPolling();
    scheduleNotificationRefreshes();
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      hydrateCurrentUser().then(function(user) {
        if (user && user.permission !== 'GUEST') {
          ensureNotificationsButton();
          ensureNotificationsPopover();
          refreshNotifications({ limit: 8, announce: false });
        }
      });
    }
  });

  document.addEventListener('click', function(event) {
    var popup = getPopup();
    if (!popup || !popup.classList.contains('open')) return;
    if (!event.target.closest('#profile-popup') && !event.target.closest('#user-badge')) {
      closeProfilePopup();
    }
    if (!event.target.closest('#profile-notifications-popover') && !event.target.closest('#profile-notifications-btn')) {
      closeNotificationsPopover();
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closeProfilePopup();
    }
  });

  if (typeof global.toggleProfilePopup !== 'function') {
    global.toggleProfilePopup = toggleProfilePopup;
  }
  if (typeof global.openProfilePopup !== 'function') {
    global.openProfilePopup = openProfilePopup;
  }
  if (typeof global.closeProfilePopup !== 'function') {
    global.closeProfilePopup = closeProfilePopup;
  }
  if (typeof global.handleAvatarSelect !== 'function') {
    global.handleAvatarSelect = handleAvatarSelect;
  }
  if (typeof global.saveAvatar !== 'function') {
    global.saveAvatar = saveAvatar;
  }
})(window);
