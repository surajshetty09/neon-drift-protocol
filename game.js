const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  start: document.querySelector("#start-overlay"),
  result: document.querySelector("#result-overlay"),
  pause: document.querySelector("#pause-card"),
  score: document.querySelector("#score"),
  combo: document.querySelector("#combo"),
  comboFill: document.querySelector("#combo-fill"),
  wave: document.querySelector("#wave-label"),
  threat: [...document.querySelectorAll("#threat-meter i")],
  shield: [...document.querySelectorAll("#shield-pips i")],
  dash: document.querySelector("#dash-ring"),
  dashText: document.querySelector("#dash-ring b"),
  mission: document.querySelector("#mission"),
  flash: document.querySelector("#flash"),
  sound: document.querySelector("#sound-button"),
  finalScore: document.querySelector("#final-score"),
  bestChain: document.querySelector("#best-chain"),
  finalWave: document.querySelector("#final-wave"),
};

const C = {
  lime: "#6dffb8",
  cyan: "#5defff",
  violet: "#9b7bff",
  danger: "#ff4d78",
  ink: "#edfdf5",
  void: "#05060a",
};

const state = {
  width: 0,
  height: 0,
  dpr: 1,
  mode: "menu",
  last: performance.now(),
  time: 0,
  runTime: 0,
  score: 0,
  combo: 1,
  bestCombo: 1,
  comboTimer: 1,
  wave: 1,
  spawnTimer: 0,
  coreTimer: 0,
  shake: 0,
  muted: false,
  keys: new Set(),
  enemies: [],
  cores: [],
  particles: [],
  trails: [],
  stars: [],
  audio: null,
  joystick: { x: 0, y: 0, active: false, id: null },
};

const player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2,
  radius: 11,
  shield: 3,
  invulnerable: 0,
  dash: 1,
  dashing: 0,
};

const random = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function rgb(hex, alpha = 1) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = state.width * state.dpr;
  canvas.height = state.height * state.dpr;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  if (!player.x) {
    player.x = state.width / 2;
    player.y = state.height / 2;
  } else {
    player.x = clamp(player.x, 30, state.width - 30);
    player.y = clamp(player.y, 80, state.height - 40);
  }
  makeStars();
}

function makeStars() {
  const count = Math.round((state.width * state.height) / 7000);
  state.stars = Array.from({ length: count }, () => ({
    x: random(0, state.width),
    y: random(0, state.height),
    z: random(0.2, 1),
    phase: random(0, Math.PI * 2),
  }));
}

function initAudio() {
  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    if (!state.audio) state.audio = new AudioEngine();
    if (state.audio.state === "suspended") state.audio.resume();
  } catch (error) {
    state.muted = true;
    ui.sound.classList.add("is-muted");
    ui.sound.setAttribute("aria-pressed", "false");
  }
}

function tone(frequency, duration, type = "sine", gain = 0.03, bend = 0) {
  if (state.muted || !state.audio) return;
  const now = state.audio.currentTime;
  const osc = state.audio.createOscillator();
  const amp = state.audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + bend), now + duration);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(amp).connect(state.audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function resetRun() {
  state.score = 0;
  state.combo = 1;
  state.bestCombo = 1;
  state.comboTimer = 1;
  state.wave = 1;
  state.runTime = 0;
  state.spawnTimer = 0.6;
  state.coreTimer = 0;
  state.enemies = [];
  state.cores = [];
  state.particles = [];
  state.trails = [];
  player.x = state.width / 2;
  player.y = state.height / 2;
  player.vx = 0;
  player.vy = 0;
  player.angle = -Math.PI / 2;
  player.shield = 3;
  player.invulnerable = 0;
  player.dash = 1;
  player.dashing = 0;
  for (let i = 0; i < 4; i += 1) spawnCore();
  updateHud();
}

function startGame() {
  if (state.mode === "playing") return;
  state.mode = "playing";
  ui.start.classList.remove("is-visible");
  ui.result.classList.remove("is-visible");
  resetRun();
  initAudio();
  tone(180, 0.55, "sawtooth", 0.025, 420);
}

function endGame() {
  state.mode = "gameover";
  ui.finalScore.textContent = String(Math.floor(state.score)).padStart(6, "0");
  ui.bestChain.textContent = `×${state.bestCombo}`;
  ui.finalWave.textContent = String(state.wave).padStart(2, "0");
  ui.result.classList.add("is-visible");
  tone(170, 0.8, "sawtooth", 0.035, -110);
}

function togglePause() {
  if (state.mode === "playing") {
    state.mode = "paused";
    ui.pause.classList.add("is-visible");
  } else if (state.mode === "paused") {
    state.mode = "playing";
    ui.pause.classList.remove("is-visible");
    state.last = performance.now();
  }
}

function spawnCore() {
  let x;
  let y;
  do {
    x = random(70, state.width - 70);
    y = random(100, state.height - 60);
  } while (Math.hypot(x - player.x, y - player.y) < 150);
  state.cores.push({ x, y, radius: 7, phase: random(0, Math.PI * 2), life: 18 });
}

function spawnEnemy() {
  const side = Math.floor(random(0, 4));
  const pad = 35;
  let x = random(0, state.width);
  let y = random(80, state.height);
  if (side === 0) x = -pad;
  if (side === 1) x = state.width + pad;
  if (side === 2) y = 55;
  if (side === 3) y = state.height + pad;
  const elite = Math.random() < Math.min(0.32, state.wave * 0.035);
  state.enemies.push({
    x,
    y,
    vx: 0,
    vy: 0,
    radius: elite ? 16 : 12,
    speed: random(0.72, 1.08) + state.wave * 0.045,
    angle: 0,
    elite,
    phase: random(0, Math.PI * 2),
  });
}

function burst(x, y, hex, count = 16, speed = 3.5) {
  for (let i = 0; i < count; i += 1) {
    const angle = random(0, Math.PI * 2);
    const force = random(0.5, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life: 1,
      decay: random(0.018, 0.045),
      size: random(1, 3.5),
      color: hex,
    });
  }
}

function dash() {
  if (state.mode !== "playing" || player.dash < 1) return;
  let x = 0;
  let y = 0;
  if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) x -= 1;
  if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) x += 1;
  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) y -= 1;
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) y += 1;
  x += state.joystick.x;
  y += state.joystick.y;
  if (!x && !y) {
    x = Math.cos(player.angle);
    y = Math.sin(player.angle);
  }
  const length = Math.hypot(x, y) || 1;
  player.vx = (x / length) * 16;
  player.vy = (y / length) * 16;
  player.dash = 0;
  player.dashing = 0.28;
  player.invulnerable = 0.42;
  state.shake = 6;
  burst(player.x, player.y, C.violet, 24, 5);
  tone(110, 0.28, "sawtooth", 0.025, 520);
}

function damage() {
  if (player.invulnerable > 0) return;
  player.shield -= 1;
  player.invulnerable = 1.25;
  state.combo = 1;
  state.comboTimer = 1;
  state.shake = 14;
  burst(player.x, player.y, C.danger, 30, 6);
  ui.flash.classList.remove("hit");
  void ui.flash.offsetWidth;
  ui.flash.classList.add("hit");
  tone(120, 0.38, "square", 0.045, -70);
  if (player.shield <= 0) endGame();
}

function collect(core) {
  state.score += 100 * state.combo;
  state.combo = Math.min(12, state.combo + 1);
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.comboTimer = 1;
  burst(core.x, core.y, C.lime, 18, 4.5);
  ui.mission.textContent = `SIGNAL LOCKED · ×${state.combo} SYNC`;
  ui.mission.classList.add("pulse");
  window.setTimeout(() => ui.mission.classList.remove("pulse"), 180);
  tone(280 + state.combo * 24, 0.15, "triangle", 0.024, 130);
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) dx -= 1;
  if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) dx += 1;
  if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) dy -= 1;
  if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) dy += 1;
  dx += state.joystick.x;
  dy += state.joystick.y;
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    dx /= length;
    dy /= length;
    const acceleration = player.dashing > 0 ? 0 : 0.72;
    player.vx += dx * acceleration * dt;
    player.vy += dy * acceleration * dt;
    player.angle += ((((Math.atan2(dy, dx) - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.18) * dt;
  }

  const maxSpeed = player.dashing > 0 ? 16 : 6.4;
  const speed = Math.hypot(player.vx, player.vy);
  if (speed > maxSpeed) {
    player.vx *= maxSpeed / speed;
    player.vy *= maxSpeed / speed;
  }
  player.vx *= Math.pow(player.dashing > 0 ? 0.96 : 0.9, dt);
  player.vy *= Math.pow(player.dashing > 0 ? 0.96 : 0.9, dt);
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 24, state.width - 24);
  player.y = clamp(player.y, 82, state.height - 38);
  player.invulnerable = Math.max(0, player.invulnerable - dt / 60);
  player.dashing = Math.max(0, player.dashing - dt / 60);
  player.dash = Math.min(1, player.dash + dt / 120);

  if (speed > 0.5 || player.dashing > 0) {
    state.trails.push({ x: player.x, y: player.y, angle: player.angle, life: 1, dash: player.dashing > 0 });
  }
}

function updateGame(dt) {
  state.runTime += dt / 60;
  state.wave = 1 + Math.floor(state.runTime / 18);
  state.score += dt * (0.22 + state.wave * 0.025);
  state.comboTimer = Math.max(0, state.comboTimer - dt / (210 - Math.min(90, state.wave * 6)));
  if (state.comboTimer <= 0 && state.combo > 1) {
    state.combo -= 1;
    state.comboTimer = 0.65;
  }

  updatePlayer(dt);

  state.spawnTimer -= dt / 60;
  if (state.spawnTimer <= 0) {
    spawnEnemy();
    state.spawnTimer = Math.max(0.32, 1.45 - state.wave * 0.085) * random(0.78, 1.18);
  }
  state.coreTimer -= dt / 60;
  if (state.coreTimer <= 0 && state.cores.length < 5) {
    spawnCore();
    state.coreTimer = random(1.4, 2.5);
  }

  for (const core of state.cores) {
    core.phase += 0.045 * dt;
    core.life -= dt / 60;
  }
  for (const core of [...state.cores]) {
    if (distance(player, core) < player.radius + core.radius + 5) {
      collect(core);
      state.cores.splice(state.cores.indexOf(core), 1);
      spawnCore();
    } else if (core.life <= 0) {
      state.cores.splice(state.cores.indexOf(core), 1);
      spawnCore();
    }
  }

  for (const enemy of state.enemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const prediction = enemy.elite ? 10 : 4;
    const targetX = player.x + player.vx * prediction;
    const targetY = player.y + player.vy * prediction;
    const aimX = targetX - enemy.x;
    const aimY = targetY - enemy.y;
    const aimLength = Math.hypot(aimX, aimY) || 1;
    enemy.vx += (aimX / aimLength) * enemy.speed * 0.045 * dt;
    enemy.vy += (aimY / aimLength) * enemy.speed * 0.045 * dt;
    enemy.vx *= Math.pow(0.97, dt);
    enemy.vy *= Math.pow(0.97, dt);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    enemy.phase += 0.06 * dt;

    if (dist < player.radius + enemy.radius) {
      if (player.dashing > 0) {
        state.score += 250 * state.combo;
        burst(enemy.x, enemy.y, C.violet, 26, 5.5);
        tone(220, 0.18, "square", 0.02, 330);
        state.enemies.splice(state.enemies.indexOf(enemy), 1);
      } else {
        damage();
        enemy.x -= (dx / dist) * 55;
        enemy.y -= (dy / dist) * 55;
      }
    }
  }

  const maxEnemies = 7 + state.wave * 2;
  if (state.enemies.length > maxEnemies) state.enemies.splice(0, state.enemies.length - maxEnemies);

  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.965, dt);
    particle.vy *= Math.pow(0.965, dt);
    particle.life -= particle.decay * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.trails.forEach((trail) => { trail.life -= (trail.dash ? 0.055 : 0.095) * dt; });
  state.trails = state.trails.filter((trail) => trail.life > 0);
  state.shake *= Math.pow(0.83, dt);
  updateHud();
}

function updateHud() {
  ui.score.textContent = String(Math.floor(state.score)).padStart(6, "0");
  ui.combo.textContent = `×${state.combo}`;
  ui.comboFill.style.transform = `scaleX(${state.comboTimer})`;
  ui.wave.textContent = `WAVE ${String(state.wave).padStart(2, "0")}`;
  ui.shield.forEach((pip, index) => pip.classList.toggle("is-empty", index >= player.shield));
  const charge = Math.round(player.dash * 100);
  ui.dash.style.setProperty("--charge", `${charge}%`);
  ui.dashText.textContent = charge >= 100 ? "READY" : `${charge}%`;
  ui.threat.forEach((bar, index) => bar.classList.toggle("is-active", index < Math.min(5, Math.ceil(state.wave / 2))));
}

function drawGrid() {
  ctx.fillStyle = C.void;
  ctx.fillRect(0, 0, state.width, state.height);
  const glow = ctx.createRadialGradient(state.width * 0.52, state.height * 0.47, 0, state.width * 0.52, state.height * 0.47, state.width * 0.65);
  glow.addColorStop(0, "rgba(22, 39, 40, 0.48)");
  glow.addColorStop(0.46, "rgba(10, 16, 23, 0.28)");
  glow.addColorStop(1, "rgba(5, 6, 10, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.strokeStyle = "rgba(109, 255, 184, 0.045)";
  ctx.lineWidth = 1;
  const size = 54;
  const offsetX = (state.time * 5) % size;
  const offsetY = (state.time * 2.5) % size;
  ctx.beginPath();
  for (let x = -size + offsetX; x < state.width + size; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
  }
  for (let y = -size + offsetY; y < state.height + size; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
  }
  ctx.stroke();

  for (const star of state.stars) {
    const pulse = 0.2 + Math.sin(state.time * star.z + star.phase) * 0.16;
    ctx.fillStyle = `rgba(183, 255, 225, ${pulse})`;
    ctx.fillRect(star.x, star.y, star.z * 1.5, star.z * 1.5);
  }
}

function polygon(x, y, radius, sides, rotation) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawCore(core) {
  const pulse = 1 + Math.sin(core.phase) * 0.18;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = C.lime;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = rgb(C.lime, 0.9);
  ctx.lineWidth = 1.2;
  polygon(core.x, core.y, core.radius * 2 * pulse, 6, core.phase * 0.25);
  ctx.stroke();
  ctx.fillStyle = rgb(C.lime, 0.84);
  polygon(core.x, core.y, core.radius * 0.72, 4, core.phase);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.angle);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = enemy.elite ? C.violet : C.danger;
  ctx.shadowBlur = enemy.elite ? 24 : 16;
  ctx.strokeStyle = enemy.elite ? rgb(C.violet, 0.95) : rgb(C.danger, 0.9);
  ctx.fillStyle = enemy.elite ? rgb(C.violet, 0.15) : rgb(C.danger, 0.12);
  ctx.lineWidth = enemy.elite ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.moveTo(enemy.radius * 1.2, 0);
  ctx.lineTo(-enemy.radius, enemy.radius * 0.72);
  ctx.lineTo(-enemy.radius * 0.45, 0);
  ctx.lineTo(-enemy.radius, -enemy.radius * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (enemy.elite) {
    ctx.strokeStyle = rgb(C.danger, 0.45 + Math.sin(enemy.phase) * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 1.45, -0.8, 0.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShipAt(x, y, angle, alpha, dash = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = dash ? C.violet : C.cyan;
  ctx.shadowBlur = dash ? 30 : 17;
  ctx.strokeStyle = dash ? C.violet : C.ink;
  ctx.fillStyle = dash ? rgb(C.violet, 0.18) : rgb(C.cyan, 0.12);
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.lineTo(-11, 9);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-11, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = dash ? C.violet : C.lime;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-17 - Math.random() * 8, 0);
  ctx.stroke();
  ctx.restore();
}

function drawScene() {
  const shakeX = random(-state.shake, state.shake);
  const shakeY = random(-state.shake, state.shake);
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawGrid();

  for (const trail of state.trails) drawShipAt(trail.x, trail.y, trail.angle, trail.life * 0.16, trail.dash);
  for (const core of state.cores) drawCore(core);
  for (const enemy of state.enemies) drawEnemy(enemy);

  for (const particle of state.particles) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = rgb(particle.color, particle.life * 0.8);
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";

  const flicker = player.invulnerable > 0 && Math.floor(state.time * 16) % 2 === 0 ? 0.24 : 1;
  drawShipAt(player.x, player.y, player.angle, flicker, player.dashing > 0);
  ctx.restore();
}

function loop(now) {
  const elapsed = Math.min(32, now - state.last);
  state.last = now;
  const dt = elapsed / 16.667;
  state.time += elapsed / 1000;
  if (state.mode === "playing") updateGame(dt);
  else if (state.mode === "menu") {
    player.angle += 0.004 * dt;
    player.x = state.width * 0.5 + Math.cos(state.time * 0.35) * 80;
    player.y = state.height * 0.5 + Math.sin(state.time * 0.52) * 45;
  }
  drawScene();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  state.keys.add(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (state.mode === "menu" && ["Enter", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    startGame();
  }
  if ((event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "Space") && !event.repeat) dash();
  if (event.code === "KeyP" && !event.repeat) togglePause();
  if (event.code === "Enter" && state.mode === "menu") startGame();
});
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener("blur", () => {
  state.keys.clear();
  if (state.mode === "playing") togglePause();
});

const launchButton = document.querySelector("#launch-button");
launchButton.addEventListener("click", startGame);
launchButton.addEventListener("pointerdown", startGame);
document.querySelector("#restart-button").addEventListener("click", startGame);
ui.sound.addEventListener("click", () => {
  state.muted = !state.muted;
  ui.sound.classList.toggle("is-muted", state.muted);
  ui.sound.setAttribute("aria-pressed", String(!state.muted));
  ui.sound.lastChild.textContent = state.muted ? " SOUND OFF" : " SOUND ON";
  if (!state.muted) {
    initAudio();
    tone(440, 0.1, "sine", 0.02, 80);
  }
});

const joystick = document.querySelector("#joystick");
const knob = document.querySelector("#joystick-knob");

function moveJoystick(event) {
  if (!state.joystick.active) return;
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const length = Math.hypot(dx, dy);
  const max = rect.width * 0.32;
  if (length > max) {
    dx = (dx / length) * max;
    dy = (dy / length) * max;
  }
  state.joystick.x = dx / max;
  state.joystick.y = dy / max;
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

joystick.addEventListener("pointerdown", (event) => {
  state.joystick.active = true;
  state.joystick.id = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
joystick.addEventListener("pointermove", moveJoystick);
joystick.addEventListener("pointerup", () => {
  state.joystick.active = false;
  state.joystick.x = 0;
  state.joystick.y = 0;
  knob.style.transform = "translate(-50%, -50%)";
});
document.querySelector("#dash-button").addEventListener("pointerdown", dash);

window.addEventListener("resize", resize);
resize();
resetRun();
requestAnimationFrame(loop);
