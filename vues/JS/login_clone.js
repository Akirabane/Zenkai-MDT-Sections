(function() {
  var body = document.body;
  var canvas = document.getElementById('bg-canvas');
  var overlay = document.getElementById('access-overlay');
  var controlChip = document.getElementById('control-chip');
  var focusChip = document.getElementById('focus-chip');
  var messageToast = document.getElementById('message-toast');
  var activePanelKey = null;
  var toastTimer = null;
  var keys = Object.create(null);
  var panelEls = {
    police: document.getElementById('panel-police'),
    justice: document.getElementById('panel-justice'),
    visitor: document.getElementById('panel-visitor')
  };
  var hallPeerId = (function createHallPeerId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'peer-' + window.crypto.randomUUID();
    }
    return 'peer-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  })();
  var hallPresenceName = (function resolvePresenceName() {
    try {
      var rawUser = sessionStorage.getItem('policeUser');
      if (rawUser) {
        var parsedUser = JSON.parse(rawUser);
        if (parsedUser && parsedUser.pseudo) return String(parsedUser.pseudo).slice(0, 32);
      }
    } catch (error) {}
    if (sessionStorage.getItem('policeGuest') === 'true') return 'Visiteur';
    return 'Shinobi';
  })();

  function showMsg(msg, type) {
    clearTimeout(toastTimer);
    messageToast.textContent = msg;
    messageToast.className = 'message-toast is-visible ' + type;
    toastTimer = setTimeout(function() {
      messageToast.className = 'message-toast';
    }, 2800);
  }

  function saveAuth(token, pseudo, permission, policeRole) {
    sessionStorage.removeItem('policeGuest');
    sessionStorage.removeItem('policeGuestId');
    sessionStorage.setItem('policeToken', token);
    sessionStorage.setItem('policeUser', JSON.stringify({
      pseudo: pseudo,
      permission: permission,
      policeRole: policeRole || false
    }));
  }

  function redirect() {
    var params = new URLSearchParams(window.location.search);
    window.location.href = params.get('redirect') || 'index.html';
  }

  function doGuest() {
    sessionStorage.removeItem('policeToken');
    sessionStorage.removeItem('policeUser');
    sessionStorage.removeItem('policeGuestId');
    sessionStorage.setItem('policeGuest', 'true');
    redirect();
  }

  async function doJusticeLogin() {
    var pseudo = (document.getElementById('justice-pseudo').value || '').trim();
    var password = document.getElementById('justice-password').value || '';
    if (!pseudo || !password) {
      showMsg('Renseigne les identifiants Justice.', 'error');
      return;
    }
    try {
      var response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: pseudo, password: password })
      });
      var data = await response.json();
      if (!response.ok) {
        showMsg(data.error || 'Connexion Justice impossible.', 'error');
        return;
      }
      saveAuth(data.token, data.pseudo, data.permission, data.policeRole);
      showMsg('Acces Justice etabli, redirection...', 'success');
      setTimeout(redirect, 600);
    } catch (error) {
      showMsg('Serveur inaccessible.', 'error');
    }
  }

  async function doLogin() {
    var pseudo = document.getElementById('login-pseudo').value.trim();
    var password = document.getElementById('login-password').value;
    if (!pseudo || !password) {
      showMsg('Remplis tous les champs.', 'error');
      return;
    }
    var button = document.getElementById('btn-login');
    button.disabled = true;
    button.textContent = 'Verification...';
    try {
      var response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: pseudo, password: password })
      });
      var data = await response.json();
      if (!response.ok) {
        showMsg(data.error || 'Erreur de connexion.', 'error');
      } else {
        saveAuth(data.token, data.pseudo, data.permission, data.policeRole);
        showMsg('Connexion reussie, redirection...', 'success');
        setTimeout(redirect, 600);
      }
    } catch (error) {
      showMsg('Serveur inaccessible.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = "S'identifier";
    }
  }

  async function doRegister() {
    var pseudo = document.getElementById('reg-pseudo').value.trim();
    var password = document.getElementById('reg-password').value;
    var confirm = document.getElementById('reg-confirm').value;
    var secret = document.getElementById('reg-secret').value;
    if (!pseudo || !password || !confirm || !secret) {
      showMsg('Remplis tous les champs.', 'error');
      return;
    }
    if (password !== confirm) {
      showMsg('Les mots de passe ne correspondent pas.', 'error');
      return;
    }
    if (password.length < 4) {
      showMsg('Mot de passe trop court (4 caracteres minimum).', 'error');
      return;
    }
    var button = document.getElementById('btn-register');
    button.disabled = true;
    button.textContent = 'Enrolement...';
    try {
      var response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: pseudo, password: password, secret: secret })
      });
      var data = await response.json();
      if (!response.ok) {
        showMsg(data.error || "Erreur d'enrolement.", 'error');
      } else {
        saveAuth(data.token, data.pseudo, data.permission, data.policeRole);
        showMsg('Enrolement reussi, redirection...', 'success');
        setTimeout(redirect, 600);
      }
    } catch (error) {
      showMsg('Serveur inaccessible.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Rejoindre la police';
    }
  }

  function showTab(tab) {
    document.querySelectorAll('.auth-pane').forEach(function(pane) {
      pane.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(function(button) {
      button.classList.remove('active');
    });
    document.getElementById('pane-' + tab).classList.add('active');
    document.querySelector('.tab-btn[data-tab-target="' + tab + '"]').classList.add('active');
  }

  document.querySelectorAll('.tab-btn').forEach(function(button) {
    button.addEventListener('click', function() {
      showTab(button.getAttribute('data-tab-target'));
    });
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('btn-register').addEventListener('click', doRegister);
  document.getElementById('btn-justice').addEventListener('click', doJusticeLogin);
  document.getElementById('btn-guest').addEventListener('click', doGuest);

  document.querySelectorAll('[data-close-panel]').forEach(function(button) {
    button.addEventListener('click', function() {
      closePanel();
    });
  });

  (function checkExistingSession() {
    var token = sessionStorage.getItem('policeToken');
    if (!token) return;
    fetch('/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function(response) {
        if (response.ok) redirect();
      })
      .catch(function() {});
  })();

  var audioContext = null;
  function ensureAudioContext() {
    if (!audioContext) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function playDoorSfx() {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    master.connect(ctx.destination);

    var low = ctx.createOscillator();
    low.type = 'triangle';
    low.frequency.setValueAtTime(130, now);
    low.frequency.exponentialRampToValueAtTime(54, now + 0.65);
    low.connect(master);
    low.start(now);
    low.stop(now + 0.7);

    var scrape = ctx.createOscillator();
    var scrapeFilter = ctx.createBiquadFilter();
    scrape.type = 'sawtooth';
    scrape.frequency.setValueAtTime(280, now);
    scrape.frequency.exponentialRampToValueAtTime(92, now + 0.44);
    scrapeFilter.type = 'lowpass';
    scrapeFilter.frequency.setValueAtTime(1200, now);
    scrapeFilter.frequency.exponentialRampToValueAtTime(280, now + 0.48);
    scrape.connect(scrapeFilter);
    scrapeFilter.connect(master);
    scrape.start(now + 0.01);
    scrape.stop(now + 0.46);
  }

  var ambientStarted = false;
  function startAmbientLoop() {
    var ctx = ensureAudioContext();
    if (!ctx || ambientStarted) return;
    ambientStarted = true;

    var padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    padGain.gain.linearRampToValueAtTime(0.028, ctx.currentTime + 2.8);
    padGain.connect(ctx.destination);

    var masterFilter = ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 620;
    masterFilter.Q.value = 0.4;
    masterFilter.connect(padGain);

    [110, 146.83, 196].forEach(function(freq, index) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = index === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = index === 0 ? 0.42 : 0.18;
      osc.connect(gain);
      gain.connect(masterFilter);
      osc.start();
    });

    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 80;
    lfo.connect(lfoGain);
    lfoGain.connect(masterFilter.frequency);
    lfo.start();
  }

  var panelNodes = Object.create(null);
  var controlsLocked = false;
  var focusedPanelKey = null;
  var threeState = null;

  function updateHudText() {
    if (activePanelKey) {
      controlChip.textContent = 'Acces ouvert. Echap pour fermer, puis clique dans le hall pour reprendre le controle.';
      focusChip.textContent = 'Interaction avec la porte ' + activePanelKey + '.';
      return;
    }
    if (focusedPanelKey) {
      var label = focusedPanelKey === 'police' ? 'Police' : (focusedPanelKey === 'justice' ? 'Justice' : 'Visiteur');
      controlChip.textContent = controlsLocked ? 'ZQSD pour avancer, souris pour regarder, E pour acceder, Echap pour liberer la souris.' : 'Clique dans le hall pour reprendre le controle. ZQSD pour avancer.';
      focusChip.textContent = 'Porte ' + label + ' a proximite. Appuie sur E pour entrer.';
      return;
    }
    controlChip.textContent = controlsLocked ? 'ZQSD pour avancer, souris pour regarder. Suis le panneau suspendu: gauche Justice, droite Visiteur, au fond Police.' : 'Clique dans le hall pour prendre le controle. ZQSD pour avancer.';
    focusChip.textContent = 'Le panneau suspendu au-dessus de l allee indique les trois acces.';
  }


  function setPanelVisible(key, visible) {
    var panel = panelEls[key];
    if (!panel) return;
    if (visible) panel.classList.add('is-visible');
    else panel.classList.remove('is-visible');
  }

  function openPanel(key) {
    if (!panelEls[key]) return;
    activePanelKey = key;
    overlay.classList.add('is-visible');
    body.classList.add('panel-open');
    Object.keys(panelEls).forEach(function(panelKey) {
      setPanelVisible(panelKey, panelKey === key);
    });
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (panelNodes[key]) panelNodes[key].manualHold = true;
    updateHudText();
  }

  function closePanel() {
    if (!activePanelKey) return;
    var closingKey = activePanelKey;
    activePanelKey = null;
    overlay.classList.remove('is-visible');
    body.classList.remove('panel-open');
    Object.keys(panelEls).forEach(function(panelKey) {
      setPanelVisible(panelKey, false);
    });
    if (panelNodes[closingKey]) panelNodes[closingKey].manualHold = false;
    updateHudText();
  }

  canvas.addEventListener('click', function() {
    ensureAudioContext();
    startAmbientLoop();
    if (activePanelKey) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', function() {
    controlsLocked = document.pointerLockElement === canvas;
    updateHudText();
  });

  function isTypingTarget(target) {
    if (!target) return false;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
  }

  document.addEventListener('keydown', function(event) {
    ensureAudioContext();
    var code = event.code;
    if (code === 'Escape' && activePanelKey) {
      event.preventDefault();
      closePanel();
      return;
    }
    if (code === 'Enter' && activePanelKey) {
      if (activePanelKey === 'justice') {
        event.preventDefault();
        doJusticeLogin();
        return;
      }
      if (activePanelKey === 'police') {
        event.preventDefault();
        if (document.getElementById('pane-login').classList.contains('active')) doLogin();
        else doRegister();
        return;
      }
    }
    if (activePanelKey && isTypingTarget(document.activeElement)) return;
    if (code === 'KeyE' && focusedPanelKey && !activePanelKey) {
      event.preventDefault();
      openPanel(focusedPanelKey);
      return;
    }
    if (/^Key[WASDQZ]$/.test(code) || code === 'ShiftLeft' || code === 'ShiftRight') {
      keys[code] = true;
      event.preventDefault();
    }
  });

  document.addEventListener('keyup', function(event) {
    if (/^Key[WASDQZ]$/.test(event.code) || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      keys[event.code] = false;
      event.preventDefault();
    }
  });

  function initThree() {
    if (!window.THREE) return;

    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
    renderer.physicallyCorrectLights = true;
    renderer.setClearColor(0x030201, 1);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050201, 0.015);

    var camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 300);

    var player = {
      position: new THREE.Vector3(0, 1.72, 18),
      yaw: 0,
      pitch: -0.03
    };

    var clock = new THREE.Clock();
    var hall = new THREE.Group();
    scene.add(hall);
    var remotePlayers = new Map();
    var presenceEventSource = null;
    var lastPresenceSentAt = 0;
    var lastPresencePayload = '';

    function hashHue(input) {
      var hash = 0;
      for (var index = 0; index < input.length; index++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(index);
        hash |= 0;
      }
      return Math.abs(hash) % 360;
    }

    function createNameSprite(label) {
      var spriteCanvas = document.createElement('canvas');
      spriteCanvas.width = 512;
      spriteCanvas.height = 128;
      var ctx = spriteCanvas.getContext('2d');
      ctx.fillStyle = 'rgba(10, 10, 10, 0.78)';
      ctx.fillRect(24, 24, 464, 80);
      ctx.strokeStyle = 'rgba(240, 216, 112, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, 464, 80);
      ctx.fillStyle = '#f4e8c4';
      ctx.font = '600 44px Cinzel';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 18), 256, 64);
      var texture = new THREE.CanvasTexture(spriteCanvas);
      texture.needsUpdate = true;
      var material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      });
      var sprite = new THREE.Sprite(material);
      sprite.scale.set(2.8, 0.7, 1);
      return sprite;
    }

    function createRemoteAvatar(peer) {
      var hue = hashHue(peer.id || 'peer');
      var accentColor = new THREE.Color('hsl(' + hue + ', 58%, 58%)');
      var robeMat = new THREE.MeshPhysicalMaterial({
        color: accentColor,
        roughness: 0.62,
        metalness: 0.1,
        clearcoat: 0.18,
        clearcoatRoughness: 0.32
      });
      var skinMat = new THREE.MeshStandardMaterial({
        color: 0xe8d2ba,
        roughness: 0.88,
        metalness: 0.02
      });
      var trimMat = new THREE.MeshStandardMaterial({
        color: 0x2f2d2c,
        roughness: 0.64,
        metalness: 0.2
      });

      var group = new THREE.Group();
      var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.72, 6, 10), robeMat);
      torso.position.y = 0.72;
      group.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 18), skinMat);
      head.position.y = 1.42;
      group.add(head);
      var headband = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.28), trimMat);
      headband.position.set(0, 1.44, 0.03);
      group.add(headband);
      var leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.58, 10), trimMat);
      leftLeg.position.set(-0.09, 0.22, 0);
      group.add(leftLeg);
      var rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.58, 10), trimMat);
      rightLeg.position.set(0.09, 0.22, 0);
      group.add(rightLeg);
      var leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.54, 10), robeMat);
      leftArm.position.set(-0.28, 0.86, 0);
      leftArm.rotation.z = 0.18;
      group.add(leftArm);
      var rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.54, 10), robeMat);
      rightArm.position.set(0.28, 0.86, 0);
      rightArm.rotation.z = -0.18;
      group.add(rightArm);

      var label = createNameSprite(peer.name || 'Shinobi');
      label.position.set(0, 2, 0);
      group.add(label);

      group.position.set(peer.x || 0, 0, peer.z || 0);
      group.rotation.y = peer.yaw || 0;
      group.userData.targetX = peer.x || 0;
      group.userData.targetZ = peer.z || 0;
      group.userData.targetYaw = peer.yaw || 0;
      group.userData.label = label;
      hall.add(group);
      return group;
    }

    function syncRemotePlayers(peers) {
      var activeIds = Object.create(null);
      peers.forEach(function(peer) {
        if (!peer || peer.id === hallPeerId) return;
        activeIds[peer.id] = true;
        var avatar = remotePlayers.get(peer.id);
        if (!avatar) {
          avatar = createRemoteAvatar(peer);
          remotePlayers.set(peer.id, avatar);
        }
        avatar.userData.targetX = peer.x || 0;
        avatar.userData.targetZ = peer.z || 0;
        avatar.userData.targetYaw = peer.yaw || 0;
      });

      remotePlayers.forEach(function(avatar, id) {
        if (activeIds[id]) return;
        hall.remove(avatar);
        remotePlayers.delete(id);
      });
    }

    function publishPresence(force) {
      var now = performance.now();
      var payload = JSON.stringify({
        id: hallPeerId,
        name: hallPresenceName,
        x: Number(player.position.x.toFixed(3)),
        z: Number(player.position.z.toFixed(3)),
        yaw: Number(player.yaw.toFixed(3)),
        pitch: Number(player.pitch.toFixed(3))
      });
      if (!force && payload === lastPresencePayload && (now - lastPresenceSentAt) < 1800) {
        return;
      }
      if (!force && (now - lastPresenceSentAt) < 120) {
        return;
      }
      lastPresencePayload = payload;
      lastPresenceSentAt = now;
      fetch('/api/login-hall/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }

    function connectPresenceStream() {
      presenceEventSource = new EventSource('/api/login-hall/stream');
      presenceEventSource.onmessage = function(event) {
        try {
          var payload = JSON.parse(event.data);
          if (payload && payload.type === 'snapshot' && Array.isArray(payload.peers)) {
            syncRemotePlayers(payload.peers);
          }
        } catch (error) {}
      };
      presenceEventSource.onerror = function() {
        if (presenceEventSource) {
          presenceEventSource.close();
          presenceEventSource = null;
        }
        setTimeout(function() {
          if (!presenceEventSource) connectPresenceStream();
        }, 1500);
      };
    }

    function createCanvasTexture(width, height, painter, repeatX, repeatY) {
      var canvasTexture = document.createElement('canvas');
      canvasTexture.width = width;
      canvasTexture.height = height;
      var ctx = canvasTexture.getContext('2d');
      painter(ctx, width, height);
      var texture = new THREE.CanvasTexture(canvasTexture);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX || 1, repeatY || 1);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
      return texture;
    }

    /* ── Bruit de valeurs 2D (Value Noise) ───────────────────────────────────
       Base : hash entier → interpolation bicubique → fBm
       Utilisé exclusivement pour les textures procédurales bois/pierre.    */
    function txHash(xi, yi, s) {
      var h = ((xi * 374761393) ^ (yi * 668265263) ^ (s * 2246822519)) >>> 0;
      h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
      return (h ^ (h >>> 16)) / 4294967295;
    }

    function txNoise(x, y, s) {
      var ix = x | 0, iy = y | 0;
      var fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx); // smoothstep
      fy = fy * fy * (3 - 2 * fy);
      var n00 = txHash(ix,   iy,   s);
      var n10 = txHash(ix+1, iy,   s);
      var n01 = txHash(ix,   iy+1, s);
      var n11 = txHash(ix+1, iy+1, s);
      return n00*(1-fx)*(1-fy) + n10*fx*(1-fy) + n01*(1-fx)*fy + n11*fx*fy;
    }

    function txFbm(x, y, oct, s) {
      var v = 0, a = 0.5, f = 1, m = 0;
      for (var oi = 0; oi < oct; oi++) {
        v += txNoise(x * f, y * f, s + oi * 127) * a;
        m += a; a *= 0.5; f *= 2.12;
      }
      return v / m;
    }

    function txParseHex(c) {
      var h = c.replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)];
    }

    /* ── Bois : anneaux annulaires distordus par turbulence ─────────────── */
    function createWoodTexture(baseHex, darkHex, lightHex, repeatX, repeatY) {
      var seed  = Math.random() * 8999 | 0;
      var dc    = txParseHex(darkHex);
      var lc    = txParseHex(lightHex);
      var mc    = txParseHex(baseHex);
      var dr = dc[0], dg = dc[1], db = dc[2];
      var lr = lc[0], lg = lc[1], lb = lc[2];
      var mr = mc[0], mg = mc[1], mb = mc[2];

      var ringFreq = 16 + Math.random() * 12; // nombre d'anneaux
      var turbAmp  = 2.6 + Math.random() * 1.6; // amplitude de distorsion

      return createCanvasTexture(512, 512, function(ctx, W, H) {
        var img = ctx.createImageData(W, H);
        var d   = img.data;

        for (var py = 0; py < H; py++) {
          for (var px = 0; px < W; px++) {
            var u  = px / W;
            var v  = py / H;
            var sx = u * 5.8;
            var sy = v * 5.8;

            /* Turbulence : somme de |bruit - 0.5| * 2 sur plusieurs octaves
               → forme des ondes irrégulières (vraie texture de bois)         */
            var turb = 0;
            turb += Math.abs(txNoise(sx,    sy,    seed)   - 0.5) * 2.0;
            turb += Math.abs(txNoise(sx*2,  sy*2,  seed+1) - 0.5) * 1.0;
            turb += Math.abs(txNoise(sx*4,  sy*4,  seed+2) - 0.5) * 0.5;
            turb += Math.abs(txNoise(sx*8,  sy*8,  seed+3) - 0.5) * 0.25;

            /* Position dans l'anneau : sinus distordu par la turbulence       */
            var ring = (Math.sin((v * ringFreq + turb * turbAmp) * Math.PI * 2) + 1) * 0.5;
            ring = ring * ring * (3 - 2 * ring); // contraste

            /* Grain fin le long des fibres (u : direction du fil du bois)     */
            var fiber = (txNoise(sx * 11, sy * 0.55, seed+10) - 0.5) * 0.22;
            ring = Math.max(0, Math.min(1, ring + fiber));

            /* Variation large échelle (aubier ↔ duramen)                      */
            var lv = (txFbm(sx * 0.22, sy * 0.22, 3, seed+20) - 0.5) * 30;

            /* Interpolation trilinéaire bois sombre → mi-ton → bois clair     */
            var r, g, b;
            if (ring < 0.5) {
              var t2 = ring * 2;
              r = dr + (mr - dr) * t2;
              g = dg + (mg - dg) * t2;
              b = db + (mb - db) * t2;
            } else {
              var t2 = (ring - 0.5) * 2;
              r = mr + (lr - mr) * t2;
              g = mg + (lg - mg) * t2;
              b = mb + (lb - mb) * t2;
            }
            r += lv; g += lv * 0.62; b += lv * 0.32;

            /* Pores du bois (ponctuations sombres le long du grain)            */
            var pore = txNoise(px / 2.0, py / 10, seed+30);
            if (pore > 0.83) {
              var ps = (pore - 0.83) / 0.17 * 0.55;
              r -= r * ps; g -= g * ps; b -= b * ps;
            }

            /* Rayons ligneux (minces stries perpendiculaires au grain)         */
            var ray = txNoise(px / 14, py / 1.4, seed+40);
            if (ray > 0.86) {
              var rs = (ray - 0.86) / 0.14 * 0.18;
              r = r*(1-rs) + lr*rs; g = g*(1-rs) + lg*rs; b = b*(1-rs) + lb*rs;
            }

            var idx = (py * W + px) * 4;
            d[idx]   = Math.max(0, Math.min(255, r | 0));
            d[idx+1] = Math.max(0, Math.min(255, g | 0));
            d[idx+2] = Math.max(0, Math.min(255, b | 0));
            d[idx+3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);

        /* Noeuds (superposés en canvas, au-dessus du grain pixel)             */
        for (var k = 0; k < 5; k++) {
          var kx = Math.random() * W, ky = Math.random() * H;
          var kr = 10 + Math.random() * 22;
          var kg = ctx.createRadialGradient(kx, ky, kr * 0.1, kx, ky, kr);
          kg.addColorStop(0,   'rgba(' + (dr|0) + ',' + ((dg*0.55)|0) + ',' + ((db*0.35)|0) + ',0.92)');
          kg.addColorStop(0.4, 'rgba(' + (dr|0) + ',' + (dg|0) + ',' + (db|0) + ',0.45)');
          kg.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = kg;
          ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
        }
      }, repeatX, repeatY);
    }

    /* ── Pierre : grain continu sans artefacts ponctuels ───────────────────
       Règle : AUCUN échantillonnage en coordonnées pixel (px/N, py/N).
       Tout se fait en UV normalisé → transitions toujours lisses.             */
    function createStoneTexture(baseHex, shadowArg, lineArg, repeatX, repeatY) {
      var seed = (Math.random() * 8999 | 0) + 1000;

      var bc  = baseHex.charAt(0) === '#' ? txParseHex(baseHex) : [110, 94, 82];
      var br  = bc[0],  bg2 = bc[1],  bb  = bc[2];
      var dr  = (br  * 0.34) | 0;
      var dg  = (bg2 * 0.34) | 0;
      var db2 = (bb  * 0.34) | 0;
      var lr  = Math.min(255, (br  * 1.65) | 0);
      var lg  = Math.min(255, (bg2 * 1.56) | 0);
      var lb  = Math.min(255, (bb  * 1.48) | 0);
      /* Veines : ton légèrement plus froid et plus clair que la base          */
      var vr  = Math.min(255, br  + 46);
      var vg  = Math.min(255, bg2 + 38);
      var vb  = Math.min(255, bb  + 34);

      return createCanvasTexture(512, 512, function(ctx, W, H) {
        var img = ctx.createImageData(W, H);
        var d   = img.data;

        for (var py = 0; py < H; py++) {
          for (var px = 0; px < W; px++) {
            var u  = px / W;   /* coordonnées normalisées 0→1                 */
            var v  = py / H;
            var sx = u * 4.2;
            var sy = v * 4.2;

            /* ── Trois échelles de grain, toutes en UV ──────────────────── */
            /* Grande échelle : strates géologiques                           */
            var strata = txFbm(sx * 0.28, sy * 0.28, 4, seed);
            /* Échelle moyenne : agrégats minéraux (1-5 cm)                  */
            var grain  = txFbm(sx * 1.10, sy * 1.10, 5, seed + 60);
            /* Petite échelle : texture de surface (sans points !)            */
            var fine   = txFbm(sx * 3.0,  sy * 3.0,  3, seed + 130);

            /* Combinaison continue — pas de seuil dur                        */
            var base = strata * 0.40 + grain * 0.42 + fine * 0.18;
            base = Math.max(0, Math.min(1, base));

            /* Couleur par interpolation linéaire double (sombre→base→clair)  */
            var r, g, b;
            if (base < 0.44) {
              var t = base / 0.44;
              r = dr  + (br  - dr)  * t;
              g = dg  + (bg2 - dg)  * t;
              b = db2 + (bb  - db2) * t;
            } else {
              var t = (base - 0.44) / 0.56;
              r = br  + (lr - br)  * t;
              g = bg2 + (lg - bg2) * t;
              b = bb  + (lb - bb)  * t;
            }

            /* Variation chaud/froid (caractère naturel de la roche)          */
            var tint = txFbm(sx * 0.16 + 6.8, sy * 0.16 + 3.4, 3, seed + 310);
            r += (tint - 0.5) * 20;
            g += (tint - 0.5) * 13;
            b -= (tint - 0.5) * 9;

            /* Luminosité douce de la texture fine (remplace les seuils durs) */
            var fineShift = (fine - 0.5) * 24;
            r += fineShift;
            g += fineShift * 0.92;
            b += fineShift * 0.86;

            /* ── Veines : iso-surface du fBm ────────────────────────────── */
            /* Réseau 1 — veines larges, claires                              */
            var vn  = txFbm(sx * 0.85 + 4.1, sy * 0.85 + 1.5, 6, seed + 110);
            var vd  = Math.abs(vn - 0.50);
            if (vd < 0.030) {
              var vs = (1 - vd / 0.030); vs = vs * vs * 0.80;
              r = r*(1-vs) + vr*vs;
              g = g*(1-vs) + vg*vs;
              b = b*(1-vs) + vb*vs;
            }
            /* Réseau 2 — veines fines, sombres, angle différent              */
            var vn2 = txFbm(sx * 0.62 + 9.3, sy * 1.05 + 5.7, 5, seed + 170);
            var vd2 = Math.abs(vn2 - 0.488);
            if (vd2 < 0.022) {
              var vs2 = (1 - vd2 / 0.022); vs2 = vs2 * vs2 * 0.50;
              r = r*(1-vs2) + dr*vs2;
              g = g*(1-vs2) + dg*vs2;
              b = b*(1-vs2) + db2*vs2;
            }

            var idx = (py * W + px) * 4;
            d[idx]   = Math.max(0, Math.min(255, r | 0));
            d[idx+1] = Math.max(0, Math.min(255, g | 0));
            d[idx+2] = Math.max(0, Math.min(255, b | 0));
            d[idx+3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);

        /* Microfissures de surface (canvas par-dessus)                       */
        ctx.strokeStyle = 'rgba(' + (dr|0) + ',' + (dg|0) + ',' + (db2|0) + ',0.16)';
        ctx.lineWidth = 0.6;
        for (var ci = 0; ci < 50; ci++) {
          var cx = Math.random() * W, cy = Math.random() * H;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          cx += (Math.random()-0.5)*42; cy += (Math.random()-0.5)*28;
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
      }, repeatX, repeatY);
    }

    function createPaperTexture(baseTone, sealTone) {
      return createCanvasTexture(512, 256, function(ctx, width, height) {
        var grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#f5e6bf');
        grad.addColorStop(0.55, baseTone);
        grad.addColorStop(1, '#d4c094');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        for (var speck = 0; speck < 900; speck++) {
          ctx.fillStyle = 'rgba(90,60,20,' + (Math.random() * 0.08) + ')';
          ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
        }
        ctx.fillStyle = sealTone;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(width * 0.08, height * 0.14, width * 0.84, 2);
        ctx.fillRect(width * 0.08, height * 0.82, width * 0.84, 2);
        ctx.globalAlpha = 1;
      }, 1, 1);
    }

    function createSignTexture(title, subtitle, arrow, accent) {
      return createCanvasTexture(1024, 512, function(ctx, width, height) {
        var wood = ctx.createLinearGradient(0, 0, width, height);
        wood.addColorStop(0, '#4b2c12');
        wood.addColorStop(0.5, '#7b4a20');
        wood.addColorStop(1, '#41240f');
        ctx.fillStyle = wood;
        ctx.fillRect(0, 0, width, height);
        for (var grain = 0; grain < 200; grain++) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,220,170,0.03)' : 'rgba(20,10,4,0.08)';
          ctx.fillRect(0, Math.random() * height, width, 1 + Math.random() * 6);
        }
        ctx.strokeStyle = '#c79318';
        ctx.lineWidth = 18;
        ctx.strokeRect(18, 18, width - 36, height - 36);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(249,227,160,0.7)';
        ctx.strokeRect(38, 38, width - 76, height - 76);

        ctx.fillStyle = accent;
        ctx.beginPath();
        if (arrow === 'left') {
          ctx.moveTo(108, height / 2);
          ctx.lineTo(220, height / 2 - 74);
          ctx.lineTo(220, height / 2 - 30);
          ctx.lineTo(356, height / 2 - 30);
          ctx.lineTo(356, height / 2 + 30);
          ctx.lineTo(220, height / 2 + 30);
          ctx.lineTo(220, height / 2 + 74);
        } else if (arrow === 'right') {
          ctx.moveTo(width - 108, height / 2);
          ctx.lineTo(width - 220, height / 2 - 74);
          ctx.lineTo(width - 220, height / 2 - 30);
          ctx.lineTo(width - 356, height / 2 - 30);
          ctx.lineTo(width - 356, height / 2 + 30);
          ctx.lineTo(width - 220, height / 2 + 30);
          ctx.lineTo(width - 220, height / 2 + 74);
        } else {
          ctx.moveTo(width / 2, 92);
          ctx.lineTo(width / 2 - 70, 210);
          ctx.lineTo(width / 2 - 28, 210);
          ctx.lineTo(width / 2 - 28, 332);
          ctx.lineTo(width / 2 + 28, 332);
          ctx.lineTo(width / 2 + 28, 210);
          ctx.lineTo(width / 2 + 70, 210);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f6e6b8';
        ctx.font = '700 74px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, height * 0.42);
        ctx.fillStyle = '#1d0f05';
        ctx.globalAlpha = 0.2;
        ctx.fillText(title, width / 2 + 4, height * 0.42 + 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f0d870';
        ctx.font = '600 34px Cinzel';
        ctx.fillText(subtitle, width / 2, height * 0.68);
      }, 1, 1);
    }

    function createTabletTexture(config) {
      return createCanvasTexture(1024, 640, function(ctx, width, height) {
        var bg = ctx.createLinearGradient(0, 0, width, height);
        if (config.theme === 'blue') {
          bg.addColorStop(0, '#09131b');
          bg.addColorStop(0.45, '#112230');
          bg.addColorStop(1, '#070c11');
        } else {
          bg.addColorStop(0, '#161008');
          bg.addColorStop(0.5, '#24160d');
          bg.addColorStop(1, '#0c0704');
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        for (var line = 0; line < 34; line++) {
          ctx.fillStyle = line % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.06)';
          ctx.fillRect(0, line * 20, width, 1);
        }

        ctx.strokeStyle = config.theme === 'blue' ? 'rgba(121,215,255,0.8)' : 'rgba(240,216,112,0.75)';
        ctx.lineWidth = 5;
        ctx.strokeRect(24, 24, width - 48, height - 48);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(38, 38, width - 76, height - 76);

        ctx.fillStyle = config.theme === 'blue' ? '#8fdcff' : '#f0d870';
        ctx.font = '700 52px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillText(config.heading, width / 2, 94);

        ctx.fillStyle = 'rgba(250,236,204,0.9)';
        ctx.font = '600 24px Cinzel';
        ctx.fillText(config.subheading, width / 2, 136);

        var fieldY = 206;
        config.fields.forEach(function(field) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(132, fieldY, width - 264, 74);
          ctx.strokeStyle = 'rgba(240,216,112,0.22)';
          ctx.lineWidth = 2;
          ctx.strokeRect(132, fieldY, width - 264, 74);
          ctx.fillStyle = '#cdbf95';
          ctx.font = '600 22px Cinzel';
          ctx.textAlign = 'left';
          ctx.fillText(field.label, 152, fieldY + 24);
          ctx.fillStyle = 'rgba(255,255,255,0.62)';
          ctx.font = '400 26px Crimson Text';
          ctx.fillText(field.value, 152, fieldY + 54);
          fieldY += 102;
        });

        ctx.fillStyle = config.theme === 'blue' ? 'rgba(86,158,190,0.9)' : 'rgba(158,106,30,0.92)';
        ctx.fillRect(214, height - 136, width - 428, 62);
        ctx.fillStyle = '#f7f4ec';
        ctx.font = '700 24px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillText(config.button, width / 2, height - 95);

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = 'italic 22px Crimson Text';
        ctx.fillText(config.footer, width / 2, height - 34);
      }, 1, 1);
    }

    var floorStoneTex = createStoneTexture('#746455', 'rgba(20,14,10,0.34)', 'rgba(191,166,124,0.16)', 5, 7);
    var wallStoneTex = createStoneTexture('#5a4c40', 'rgba(18,12,8,0.32)', 'rgba(170,142,104,0.12)', 2.2, 1.4);
    var polishedStoneTex = createStoneTexture('#3c3027', 'rgba(10,7,5,0.28)', 'rgba(132,104,76,0.1)', 1.2, 1.8);
    var marbleTex = createStoneTexture('#d6ddd8', 'rgba(90,102,102,0.16)', 'rgba(248,252,250,0.16)', 1.2, 1.6);
    var cedarTex = createWoodTexture('#7a431c', '#2c1205', '#c18a52', 3, 2);
    var darkWoodTex = createWoodTexture('#4a2510', '#180903', '#9a6330', 2, 3);
    var lacquerWoodTex = createWoodTexture('#6f2716', '#220907', '#b96436', 1, 8);
    var paperGoldTex = createPaperTexture('#eadbb1', '#b07a18');
    var paperBlueTex = createPaperTexture('#d7e6ef', '#4b88a0');

    var floorStoneMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: floorStoneTex,
      roughness: 0.72,
      metalness: 0.06,
      clearcoat: 0.08,
      clearcoatRoughness: 0.86
    });
    var wallStoneMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: wallStoneTex,
      roughness: 0.76,
      metalness: 0.05
    });
    var polishedStoneMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: polishedStoneTex,
      roughness: 0.34,
      metalness: 0.18,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3
    });
    var marbleMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: marbleTex,
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.82,
      clearcoatRoughness: 0.1
    });
    var cedarMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: cedarTex,
      roughness: 0.38,
      metalness: 0.08,
      clearcoat: 0.42,
      clearcoatRoughness: 0.26
    });
    var darkWoodMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: darkWoodTex,
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.32,
      clearcoatRoughness: 0.32
    });
    var lacquerWoodMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: lacquerWoodTex,
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18
    });
    var goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xc79318,
      roughness: 0.18,
      metalness: 0.96,
      emissive: 0x543406,
      emissiveIntensity: 0.28,
      clearcoat: 0.24,
      clearcoatRoughness: 0.18
    });
    var blueMat = new THREE.MeshPhysicalMaterial({
      color: 0x2c6d8a,
      roughness: 0.2,
      metalness: 0.88,
      emissive: 0x112634,
      emissiveIntensity: 0.58,
      clearcoat: 0.16,
      clearcoatRoughness: 0.2
    });
    var glassMat = new THREE.MeshBasicMaterial({
      color: 0x89dbff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    scene.add(new THREE.AmbientLight(0x2f2418, 2.2));

    var keySpot = new THREE.SpotLight(0xeac061, 15.8, 180, 0.46, 0.5, 1);
    keySpot.position.set(0, 26, -18);
    keySpot.target.position.set(0, 0, -30);
    scene.add(keySpot);
    scene.add(keySpot.target);

    var floorFill = new THREE.PointLight(0xf6c878, 5.2, 52);
    floorFill.position.set(0, 0.8, -6);
    scene.add(floorFill);

    var sideBlueLeft = new THREE.PointLight(0x6fcdf2, 5.1, 64);
    sideBlueLeft.position.set(-18, 6, -18);
    scene.add(sideBlueLeft);

    var sideBlueRight = new THREE.PointLight(0x6fcdf2, 5.1, 64);
    sideBlueRight.position.set(18, 6, -18);
    scene.add(sideBlueRight);

    var redBack = new THREE.PointLight(0xd44b2d, 5.4, 48);
    redBack.position.set(0, 7, -48);
    scene.add(redBack);

    function addFloor(width, depth, x, z, material) {
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material || floorStoneMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, -0.02, z);
      hall.add(mesh);
      return mesh;
    }

    addFloor(12, 74, 0, -16);
    addFloor(52, 16, 0, -18);
    addFloor(18, 18, -19, -18);
    addFloor(18, 18, 19, -18);
    addFloor(16, 18, 0, -46);

    function addWalkway(width, depth, x, z) {
      var walkway = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.16, depth),
        lacquerWoodMat
      );
      walkway.position.set(x, 0.03, z);
      hall.add(walkway);
      var trimGeo = new THREE.BoxGeometry(0.18, 0.05, depth);
      [-width / 2 + 0.14, width / 2 - 0.14].forEach(function(offset) {
        var trim = new THREE.Mesh(trimGeo, goldMat);
        trim.position.set(x + offset, 0.12, z);
        hall.add(trim);
      });
    }

    addWalkway(5.6, 64, 0, -14);
    addWalkway(3.8, 18, -18.8, -18);
    addWalkway(3.8, 18, 18.8, -18);

    var grid = new THREE.GridHelper(120, 42, 0x6c490a, 0x171008);
    grid.position.y = 0;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    hall.add(grid);

    function addWall(width, height, depth, x, y, z) {
      var wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallStoneMat);
      wall.position.set(x, y, z);
      hall.add(wall);
      return wall;
    }

    addWall(0.55, 12, 28, -7, 6, 7);
    addWall(0.55, 12, 26, -7, 6, -39);
    addWall(0.55, 12, 28, 7, 6, 7);
    addWall(0.55, 12, 26, 7, 6, -39);
    addWall(50, 12, 2, 0, 6, -10);
    addWall(50, 12, 2, 0, 6, -26);
    addWall(2, 12, 18, -27, 6, -18);
    addWall(2, 12, 18, 27, 6, -18);
    addWall(18, 12, 2, -18.8, 6, -28);
    addWall(18, 12, 2, 18.8, 6, -28);
    addWall(18, 12, 2, 0, 6, -54);

    function addWallBand(length, x, y, z, rotationY) {
      var band = new THREE.Mesh(new THREE.BoxGeometry(length, 0.28, 0.26), cedarMat);
      band.position.set(x, y, z);
      band.rotation.y = rotationY || 0;
      hall.add(band);
      var trim = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, 0.12), goldMat);
      trim.position.set(x, y + 0.18, z + (rotationY ? 0 : 0.08));
      trim.rotation.y = rotationY || 0;
      hall.add(trim);
    }

    addWallBand(28, -6.02, 2.2, 7, Math.PI / 2);
    addWallBand(26, -6.02, 2.2, -39, Math.PI / 2);
    addWallBand(28, 6.02, 2.2, 7, Math.PI / 2);
    addWallBand(26, 6.02, 2.2, -39, Math.PI / 2);
    addWallBand(50, 0, 2.2, -10, 0);
    addWallBand(50, 0, 2.2, -26, 0);

    function addColumn(x, z, height) {
      var column = new THREE.Mesh(new THREE.BoxGeometry(1.8, height, 1.8), polishedStoneMat);
      column.position.set(x, height / 2, z);
      hall.add(column);
      var base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), goldMat);
      base.position.set(x, 0.25, z);
      hall.add(base);
      var cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 2.6), goldMat);
      cap.position.set(x, height - 0.25, z);
      hall.add(cap);
    }

    [].forEach(function(pos) {
      addColumn(pos[0], pos[1], 10.5);
    });

    function addDoorway(x, z, rotationY, theme) {
      var gate = new THREE.Group();
      gate.position.set(x, 0, z);
      gate.rotation.y = rotationY || 0;

      var sideMat = polishedStoneMat;
      var beamMat = theme === 'blue' ? blueMat : cedarMat;
      var doorPanelMat = theme === 'blue' ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: paperBlueTex,
        roughness: 0.48,
        metalness: 0.04,
        clearcoat: 0.18,
        clearcoatRoughness: 0.4
      }) : marbleMat.clone();

      var leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.72, 8.4, 0.72), sideMat);
      leftPost.position.set(-2.58, 4.2, 0);
      gate.add(leftPost);
      var rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.72, 8.4, 0.72), sideMat);
      rightPost.position.set(2.58, 4.2, 0);
      gate.add(rightPost);

      var lintel = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.84, 0.72), beamMat);
      lintel.position.set(0, 8.4, 0);
      gate.add(lintel);
      var lintelTrim = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.16, 0.18), goldMat);
      lintelTrim.position.set(0, 7.92, 0.46);
      gate.add(lintelTrim);

      var threshold = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.24, 1.6), lacquerWoodMat);
      threshold.position.set(0, 0.12, 0);
      gate.add(threshold);

      var doorLeft = new THREE.Mesh(new THREE.BoxGeometry(1.38, 5.4, 0.14), doorPanelMat);
      doorLeft.position.set(-1.56, 2.86, 0.1);
      gate.add(doorLeft);
      var doorRight = new THREE.Mesh(new THREE.BoxGeometry(1.38, 5.4, 0.14), doorPanelMat.clone());
      doorRight.position.set(1.56, 2.86, 0.1);
      gate.add(doorRight);

      var rail = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.16, 0.14), goldMat);
      rail.position.set(0, 6.25, 0.32);
      gate.add(rail);

      var portalGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 5.3), new THREE.MeshBasicMaterial({
        color: theme === 'blue' ? 0x7ad6ff : 0xffdf9b,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      }));
      portalGlow.position.set(0, 3.2, -0.26);
      gate.add(portalGlow);

      hall.add(gate);
      gate.userData.doorLeft = doorLeft;
      gate.userData.doorRight = doorRight;
      gate.userData.portalGlow = portalGlow;
      return gate;
    }

    var justiceDoor = addDoorway(-7.02, -18, Math.PI / 2, 'gold');
    var visitorDoor = addDoorway(7.02, -18, -Math.PI / 2, 'gold');
    var policeDoor = addDoorway(0, -30.5, 0, 'blue');

    var ceiling = new THREE.Mesh(new THREE.BoxGeometry(58, 0.9, 58), darkWoodMat);
    ceiling.position.set(0, 11.8, -18);
    hall.add(ceiling);

    for (var beamIndex = 0; beamIndex < 6; beamIndex++) {
      var beam = new THREE.Mesh(new THREE.BoxGeometry(34, 0.56, 0.56), cedarMat);
      beam.position.set(0, 10.8, 8 - beamIndex * 11.5);
      hall.add(beam);
      var beamTrim = new THREE.Mesh(new THREE.BoxGeometry(34, 0.08, 0.18), goldMat);
      beamTrim.position.set(0, 10.55, 8 - beamIndex * 11.5);
      hall.add(beamTrim);
    }

    function addHoloFrame(x, z, rotationY) {
      var group = new THREE.Group();
      group.position.set(x, 4.1, z);
      group.rotation.y = rotationY;
      var frame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.6, 0.18), cedarMat);
      var inner = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.2, 0.08), polishedStoneMat);
      var holo = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.6), glassMat);
      group.add(frame);
      inner.position.z = 0.08;
      group.add(inner);
      holo.position.z = 0.18;
      group.add(holo);
      for (var lineIndex = 0; lineIndex < 4; lineIndex++) {
        var line = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 0.08), new THREE.MeshBasicMaterial({
          color: 0x8be1ff,
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending
        }));
        line.position.set(0, 1.2 - lineIndex * 0.72, 0.2);
        group.add(line);
      }
      hall.add(group);
      return group;
    }

    var holoFrames = [];

    function addDirectionalSign(config) {
      var signGroup = new THREE.Group();
      signGroup.position.copy(config.position);
      signGroup.rotation.y = config.rotationY || 0;
      signGroup.userData.baseY = config.position.y;

      var postMat = cedarMat;
      if (config.hanging) {
        var chainLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), goldMat);
        chainLeft.position.set(-1.9, 0.8, 0);
        signGroup.add(chainLeft);
        var chainRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), goldMat);
        chainRight.position.set(1.9, 0.8, 0);
        signGroup.add(chainRight);
      } else {
        var postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), postMat);
        postLeft.position.set(-1.95, -0.6, 0);
        signGroup.add(postLeft);
        var postRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), postMat);
        postRight.position.set(1.95, -0.6, 0);
        signGroup.add(postRight);
      }

      var boardMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: createSignTexture(config.title, config.subtitle, config.arrow, config.accent),
        roughness: 0.46,
        metalness: 0.08,
        clearcoat: 0.34,
        clearcoatRoughness: 0.22
      });
      var board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 0.28), boardMat);
      board.position.y = config.hanging ? -0.2 : 0.5;
      signGroup.add(board);

      var frame = new THREE.Mesh(new THREE.BoxGeometry(4.9, 2.5, 0.16), goldMat);
      frame.position.y = board.position.y;
      frame.position.z = -0.02;
      signGroup.add(frame);

      hall.add(signGroup);
      return signGroup;
    }

    var signBoards = [
      addDirectionalSign({
        title: 'Justice <-  Police  -> Visiteur',
        subtitle: 'Gauche / tout droit / droite',
        arrow: 'up',
        accent: '#5ea5c6',
        position: new THREE.Vector3(0, 8.1, 8.8),
        rotationY: 0,
        hanging: true
      })
    ];

    panelNodes.police = {
      key: 'police',
      node: policeDoor,
      doorLeft: policeDoor.userData.doorLeft,
      doorRight: policeDoor.userData.doorRight,
      glow: policeDoor.userData.portalGlow,
      trigger: new THREE.Vector3(0, 1.7, -38.8),
      targetOpen: 0,
      open: 0,
      manualHold: false,
      didPlay: false
    };
    panelNodes.justice = {
      key: 'justice',
      node: justiceDoor,
      doorLeft: justiceDoor.userData.doorLeft,
      doorRight: justiceDoor.userData.doorRight,
      glow: justiceDoor.userData.portalGlow,
      trigger: new THREE.Vector3(-11.2, 1.7, -18),
      targetOpen: 0,
      open: 0,
      manualHold: false,
      didPlay: false
    };
    panelNodes.visitor = {
      key: 'visitor',
      node: visitorDoor,
      doorLeft: visitorDoor.userData.doorLeft,
      doorRight: visitorDoor.userData.doorRight,
      glow: visitorDoor.userData.portalGlow,
      trigger: new THREE.Vector3(11.2, 1.7, -18),
      targetOpen: 0,
      open: 0,
      manualHold: false,
      didPlay: false
    };

    var emberCount = 900;
    var emberPositions = new Float32Array(emberCount * 3);
    var emberColors = new Float32Array(emberCount * 3);
    var emberVelocity = new Float32Array(emberCount);
    for (var emberIndex = 0; emberIndex < emberCount; emberIndex++) {
      var ember3 = emberIndex * 3;
      emberPositions[ember3] = (Math.random() - 0.5) * 52;
      emberPositions[ember3 + 1] = Math.random() * 12;
      emberPositions[ember3 + 2] = 16 - Math.random() * 90;
      emberVelocity[emberIndex] = 0.012 + Math.random() * 0.028;
      emberColors[ember3] = 1;
      emberColors[ember3 + 1] = 0.58 + Math.random() * 0.24;
      emberColors[ember3 + 2] = Math.random() < 0.2 ? 1 : 0.06;
    }
    var emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
    emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
    var embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.84,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    }));
    scene.add(embers);

    function isWalkable(x, z) {
      var inMain = Math.abs(x) <= 5.4 && z <= 20 && z >= -52;
      var inCross = Math.abs(z + 18) <= 6.2 && x >= -24 && x <= 24;
      var inJustice = x >= -26 && x <= -15 && z >= -26 && z <= -10;
      var inVisitor = x >= 15 && x <= 26 && z >= -26 && z <= -10;
      var inFront = Math.abs(x) <= 8 && z >= -52 && z <= -34;
      return inMain || inCross || inJustice || inVisitor || inFront;
    }

    document.addEventListener('mousemove', function(event) {
      if (!controlsLocked || activePanelKey) return;
      player.yaw += event.movementX * 0.0022;
      player.pitch -= event.movementY * 0.0015;
      player.pitch = Math.max(-0.45, Math.min(0.3, player.pitch));
    });

    window.addEventListener('resize', function() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    function updateMovement(delta) {
      if (!controlsLocked || activePanelKey) return;
      var forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      var right = new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw));
      var direction = new THREE.Vector3();
      if (keys.KeyZ || keys.KeyW) direction.add(forward);
      if (keys.KeyS) direction.sub(forward);
      if (keys.KeyQ || keys.KeyA) direction.sub(right);
      if (keys.KeyD) direction.add(right);
      if (!direction.lengthSq()) return;
      direction.normalize();
      var speed = (keys.ShiftLeft || keys.ShiftRight) ? 8.5 : 4.9;
      var candidateX = player.position.x + direction.x * speed * delta;
      var candidateZ = player.position.z + direction.z * speed * delta;
      if (isWalkable(candidateX, player.position.z)) player.position.x = candidateX;
      if (isWalkable(player.position.x, candidateZ)) player.position.z = candidateZ;
    }

    function updateFocus() {
      var forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      var nearest = null;
      var nearestDist = Infinity;

      Object.keys(panelNodes).forEach(function(key) {
        var panel = panelNodes[key];
        var toPanel = new THREE.Vector3().subVectors(panel.trigger, player.position);
        var dist = toPanel.length();
        var facing = forward.dot(toPanel.normalize());
        var shouldOpen = panel.manualHold || (dist < 10.5 && facing > -0.15);
        panel.targetOpen = shouldOpen ? 1 : 0;
        if (shouldOpen && !panel.didPlay) {
          playDoorSfx();
          panel.didPlay = true;
        }
        if (!shouldOpen) panel.didPlay = false;
        if (!activePanelKey && dist < 7.2 && facing > -0.05 && dist < nearestDist) {
          nearestDist = dist;
          nearest = key;
        }
      });

      focusedPanelKey = nearest;
      updateHudText();
    }

    function updateDoors(delta, elapsed) {
      Object.keys(panelNodes).forEach(function(key) {
        var panel = panelNodes[key];
        panel.open += (panel.targetOpen - panel.open) * Math.min(1, delta * 5.2);
        var slide = 1.12 * panel.open;
        panel.doorLeft.position.x = -1.56 - slide;
        panel.doorRight.position.x = 1.56 + slide;
        panel.glow.material.opacity = 0.06 + panel.open * 0.16;
      });
    }

    function updateCamera(elapsed) {
      var bob = controlsLocked && !activePanelKey ? Math.sin(elapsed * 8) * 0.015 : 0;
      camera.position.set(player.position.x, player.position.y + bob, player.position.z);
      var cosPitch = Math.cos(player.pitch);
      var lookX = Math.sin(player.yaw) * cosPitch;
      var lookY = Math.sin(player.pitch);
      var lookZ = -Math.cos(player.yaw) * cosPitch;
      camera.lookAt(
        player.position.x + lookX,
        player.position.y + bob + lookY,
        player.position.z + lookZ
      );
    }

    function animate() {
      requestAnimationFrame(animate);
      var delta = Math.min(clock.getDelta(), 0.05);
      var elapsed = clock.elapsedTime;

      updateMovement(delta);
      updateFocus();
      updateDoors(delta, elapsed);
      updateCamera(elapsed);
      publishPresence(false);

      signBoards.forEach(function(sign, index) {
        sign.rotation.z = Math.sin(elapsed * 0.9 + index * 0.8) * 0.035;
        sign.position.y = sign.userData.baseY + Math.sin(elapsed * 0.8 + index) * 0.05;
      });

      remotePlayers.forEach(function(avatar, index) {
        avatar.position.x += (avatar.userData.targetX - avatar.position.x) * Math.min(1, delta * 7.2);
        avatar.position.z += (avatar.userData.targetZ - avatar.position.z) * Math.min(1, delta * 7.2);
        avatar.rotation.y += (avatar.userData.targetYaw - avatar.rotation.y) * Math.min(1, delta * 7.2);
        avatar.position.y = Math.sin(elapsed * 2.4 + avatar.position.x * 0.2 + avatar.position.z * 0.18) * 0.02;
        if (avatar.userData.label) {
          avatar.userData.label.material.rotation = Math.sin(elapsed * 0.45 + avatar.position.x) * 0.015;
        }
      });

      for (var emberIndex = 0; emberIndex < emberCount; emberIndex++) {
        var ember3 = emberIndex * 3;
        emberPositions[ember3 + 1] += emberVelocity[emberIndex] * delta * 40;
        emberPositions[ember3] += Math.sin(elapsed * 1.5 + emberIndex * 0.1) * 0.002;
        if (emberPositions[ember3 + 1] > 12) {
          emberPositions[ember3] = (Math.random() - 0.5) * 52;
          emberPositions[ember3 + 1] = 0;
          emberPositions[ember3 + 2] = 16 - Math.random() * 90;
        }
      }
      emberGeo.attributes.position.needsUpdate = true;

      keySpot.intensity = 15.4 + Math.sin(elapsed * 0.7 + 1.2) * 1.2;
      floorFill.intensity = 4.9 + Math.sin(elapsed * 1.2) * 0.5;
      sideBlueLeft.intensity = 4.8 + Math.sin(elapsed * 1.3 + 0.5) * 0.8;
      sideBlueRight.intensity = 4.8 + Math.sin(elapsed * 1.3 + 1.8) * 0.8;
      redBack.intensity = 5.1 + Math.sin(elapsed * 1.1 + 0.2) * 0.65;

      renderer.render(scene, camera);
    }

    threeState = {
      scene: scene,
      camera: camera,
      renderer: renderer,
      player: player
    };

    connectPresenceStream();
    publishPresence(true);
    updateHudText();
    animate();
  }

  window.addEventListener('beforeunload', function() {
    fetch('/api/login-hall/presence/' + encodeURIComponent(hallPeerId), {
      method: 'DELETE',
      keepalive: true
    }).catch(function() {});
  });

  initThree();
})();
