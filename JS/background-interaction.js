(function() {
  function prefersReducedMotion() {
    try {
      return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  }

  function supportsFinePointer() {
    try {
      return !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch (error) {
      return true;
    }
  }

  if (prefersReducedMotion() || !supportsFinePointer()) {
    document.body.classList.add('background-interaction-disabled');
    return;
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'background-interaction-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild || null);
  document.body.classList.add('background-interaction-ready');

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    canvas.remove();
    return;
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;
  var spacing = 60;
  var radius = 150;
  /* Toutes les coordonnées du pointeur et de la grille sont en espace VIEWPORT
     (clientX/clientY). Problème : le <body> porte 'will-change: opacity, transform,
     filter' (page-transitions.css), ce qui crée un containing block local sur le
     body pour ses descendants position:fixed. Le canvas se retrouve donc ancré
     au body et scrolle avec la page au lieu de rester fixe dans le viewport.
     Correctif : on recompose sa position via CSS transform à chaque frame scroll
     pour le maintenir visuellement aligné au viewport. */
  var pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.35,
    tx: window.innerWidth * 0.5,
    ty: window.innerHeight * 0.35,
    active: false,
    energy: 0
  };
  var running = true;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setPointer(clientX, clientY) {
    pointer.tx = clientX;
    pointer.ty = clientY;
    pointer.active = true;
    pointer.energy = 1;
  }

  function ease(current, target, amount) {
    return current + (target - current) * amount;
  }

  function drawCross(x, y, alpha, pulse) {
    var half = 4 + pulse * 2;
    ctx.strokeStyle = 'rgba(255, 221, 130,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.moveTo(x, y - half);
    ctx.lineTo(x, y + half);
    ctx.stroke();
  }

  function render() {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);

    pointer.x = ease(pointer.x, pointer.tx, 0.18);
    pointer.y = ease(pointer.y, pointer.ty, 0.18);
    pointer.energy = pointer.active ? 1 : Math.max(0, pointer.energy - 0.03);

    if (pointer.energy <= 0.001) {
      requestAnimationFrame(render);
      return;
    }

    var influence = radius + pointer.energy * 26;
    var minCol = Math.floor((pointer.x - influence) / spacing) - 1;
    var maxCol = Math.ceil((pointer.x + influence) / spacing) + 1;
    var minRow = Math.floor((pointer.y - influence) / spacing) - 1;
    var maxRow = Math.ceil((pointer.y + influence) / spacing) + 1;
    var now = performance.now() * 0.0023;

    var glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, influence * 0.95);
    glow.addColorStop(0, 'rgba(255, 223, 140,' + (0.12 * pointer.energy).toFixed(3) + ')');
    glow.addColorStop(0.4, 'rgba(255, 201, 102,' + (0.065 * pointer.energy).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255, 201, 102,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, influence * 0.95, 0, Math.PI * 2);
    ctx.fill();

    for (var row = minRow; row <= maxRow; row += 1) {
      for (var col = minCol; col <= maxCol; col += 1) {
        var x = col * spacing + spacing / 2;
        var y = row * spacing + spacing / 2;
        if (x < -24 || x > width + 24 || y < -24 || y > height + 24) continue;

        var dx = x - pointer.x;
        var dy = y - pointer.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > influence) continue;

        var strength = (1 - (distance / influence)) * pointer.energy;
        var lineAlpha = 0.06 + strength * 0.28;
        var crossAlpha = 0.08 + strength * 0.5;
        var pulse = (Math.sin(now + (row + col) * 0.65) + 1) * 0.5 * strength;

        ctx.strokeStyle = 'rgba(235, 197, 98,' + lineAlpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pointer.x, pointer.y);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 228, 150,' + (0.08 + strength * 0.32).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + strength * 1.7, 0, Math.PI * 2);
        ctx.fill();

        drawCross(x, y, crossAlpha, pulse);
      }
    }

    ctx.fillStyle = 'rgba(255, 227, 142,' + (0.18 + pointer.energy * 0.18).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 2.2 + pointer.energy * 2, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(render);
  }

  window.addEventListener('resize', function() {
    resize();
  }, { passive: true });
  window.addEventListener('mousemove', function(event) {
    setPointer(event.clientX, event.clientY);
  }, { passive: true });
  window.addEventListener('mouseenter', function(event) {
    setPointer(event.clientX, event.clientY);
  }, { passive: true });
  window.addEventListener('mouseleave', function() {
    pointer.active = false;
  }, { passive: true });
  document.addEventListener('visibilitychange', function() {
    running = !document.hidden;
    if (running) {
      requestAnimationFrame(render);
    }
  });

  resize();
  requestAnimationFrame(render);
})();
