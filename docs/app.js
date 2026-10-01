const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Keep the page usable even when IntersectionObserver is unavailable.
if ('IntersectionObserver' in window && !reduceMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.13, rootMargin: '0px 0px -35px 0px' });
  $$('.reveal').forEach((item) => revealObserver.observe(item));
} else {
  $$('.reveal').forEach((item) => item.classList.add('in-view'));
}

const flowCopy = {
  mission: ['MISSION', 'Une URL et un objectif concret donnent un cap commun à tous les agents.'],
  personas: ['PERSONAS', 'Les profils font varier le contexte, l’appareil et la manière de décider.'],
  parcours: ['PARCOURS', 'Chaque agent agit dans sa propre session et laisse une trace de ses choix.'],
  resultats: ['RÉSULTATS', 'Les parcours alimentent un rapport de blocages, de points forts et de pistes de correction.'],
};
$$('[data-flow]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-flow]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  const mode = button.dataset.flow;
  $('#flow-display').dataset.mode = mode;
  $('#flow-label').textContent = flowCopy[mode][0];
  $('#flow-detail').textContent = flowCopy[mode][1];
  if (!reduceMotion.matches) {
    const display = $('#flow-display');
    display.classList.remove('flow-animate');
    void display.offsetWidth;
    display.classList.add('flow-animate');
  }
}));
if ('IntersectionObserver' in window && !reduceMotion.matches) {
  const flowObserver = new IntersectionObserver(([entry], observer) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('flow-animate');
      observer.disconnect();
    }
  }, { threshold: 0.4 });
  flowObserver.observe($('#flow-display'));
}

const personas = [
  { name: 'Curieux', device: 'Desktop', tech: 8, trait: 'Explore plusieurs chemins', agents: 7 },
  { name: 'Prudent', device: 'Mobile', tech: 5, trait: 'Vérifie avant d’agir', agents: 4 },
  { name: 'Pressé', device: 'Mobile', tech: 3, trait: 'Cherche le chemin le plus court', agents: 2 },
];
$$('[data-persona]').forEach((button) => button.addEventListener('click', () => {
  const index = Number(button.dataset.persona);
  const persona = personas[index];
  $$('[data-persona]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  $('#screen-index').textContent = String(index + 1).padStart(2, '0');
  $('#screen-name').textContent = persona.name;
  $('#screen-device').textContent = persona.device;
  $('#screen-tech').textContent = `${persona.tech}/10`;
  $('#screen-trait').textContent = persona.trait;
  $('#screen-meter').style.width = `${persona.tech * 10}%`;
  $('#screen-count').textContent = '0';
  $$('#screen-crowd span').forEach((dot) => dot.classList.remove('active'));
  if (reduceMotion.matches) {
    $('#screen-count').textContent = String(persona.agents);
    $$('#screen-crowd span').forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex < persona.agents));
  } else {
    let value = 0;
    const tick = () => {
      if (value >= persona.agents) return;
      value += 1;
      $('#screen-count').textContent = String(value);
      $$('#screen-crowd span')[value - 1]?.classList.add('active');
      setTimeout(tick, 70);
    };
    tick();
  }
}));
$$('#screen-crowd span').forEach((dot, index) => dot.classList.toggle('active', index < personas[0].agents));

const routePaths = ['#route-one', '#route-two', '#route-three'].map($);
const routeDots = $$('[data-route-dot]');
const routeLengths = routePaths.map((path) => path.getTotalLength());
let routeFrame = 0;
function placeRoutes(progress) {
  routePaths.forEach((path, index) => {
    const length = routeLengths[index];
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = String(length * (1 - progress));
    const point = path.getPointAtLength(length * progress);
    routeDots[index].setAttribute('cx', point.x);
    routeDots[index].setAttribute('cy', point.y);
  });
}
function playRoutes() {
  cancelAnimationFrame(routeFrame);
  if (reduceMotion.matches) {
    placeRoutes(1);
    return;
  }
  const start = performance.now();
  const duration = 2300;
  const animate = (now) => {
    const raw = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - raw, 3);
    placeRoutes(eased);
    if (raw < 1) routeFrame = requestAnimationFrame(animate);
  };
  placeRoutes(0);
  routeFrame = requestAnimationFrame(animate);
}
placeRoutes(reduceMotion.matches ? 1 : 0);
$('#replay-paths').addEventListener('click', playRoutes);
if ('IntersectionObserver' in window) {
  const pathsObserver = new IntersectionObserver((entries, observer) => {
    if (entries[0].isIntersecting) {
      playRoutes();
      observer.disconnect();
    }
  }, { threshold: 0.35 });
  pathsObserver.observe($('#paths-board'));
} else playRoutes();

const canvas = $('#crowd-field');
const context = canvas.getContext('2d');
if (context) {
  let width = 0;
  let height = 0;
  let nodes = [];
  let visible = true;
  let frame = 0;
  let lastFrame = 0;
  const makeNodes = () => {
    const count = width < 650 ? 10 : 22;
    nodes = Array.from({ length: count }, (_, index) => ({
      x: (index % 6 + .45 + (index * 17 % 11) / 16) / 6 * width,
      y: (Math.floor(index / 6) + .5 + (index * 7 % 9) / 15) / Math.ceil(count / 6) * height,
      ox: 0,
      oy: 0,
      speed: .25 + index % 5 * .08,
      phase: index * 1.31,
      size: index % 5 === 0 ? 3 : 2,
    }));
  };
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    makeNodes();
    draw(0);
  };
  const draw = (time) => {
    context.clearRect(0, 0, width, height);
    nodes.forEach((node) => {
      const drift = reduceMotion.matches ? 0 : time * .0004 * node.speed;
      node.ox = Math.sin(node.phase + drift) * 13;
      node.oy = Math.cos(node.phase * 1.3 + drift) * 11;
    });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x + a.ox - b.x - b.ox, dy = a.y + a.oy - b.y - b.oy;
        const distance = Math.hypot(dx, dy);
        if (distance < Math.min(width * .29, 230)) {
          context.strokeStyle = `rgba(113,182,211,${(1 - distance / 230) * .17})`;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(a.x + a.ox, a.y + a.oy);
          context.lineTo(b.x + b.ox, b.y + b.oy);
          context.stroke();
        }
      }
    }
    nodes.forEach((node, index) => {
      context.fillStyle = index % 4 === 0 ? '#aa9be9' : '#75dce7';
      context.globalAlpha = .4 + index % 3 * .15;
      context.beginPath();
      context.arc(node.x + node.ox, node.y + node.oy, node.size, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  };
  const animate = (time) => {
    if (!visible || document.hidden || reduceMotion.matches) return;
    if (time - lastFrame > 34) { draw(time); lastFrame = time; }
    frame = requestAnimationFrame(animate);
  };
  const syncMotion = () => {
    cancelAnimationFrame(frame);
    if (visible && !document.hidden && !reduceMotion.matches) frame = requestAnimationFrame(animate);
    else draw(0);
  };
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', syncMotion);
  reduceMotion.addEventListener?.('change', syncMotion);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncMotion(); }).observe(canvas);
  }
  syncMotion();
}
