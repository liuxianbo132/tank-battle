// ==================== 坦克大战 - Game Engine ====================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game dimensions
const TILE = 40;
const COLS = 20;
const ROWS = 15;
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

// Game state
let player, enemies, bullets, particles;
let map = [];
let score = 0;
let gameRunning = false;
let gameOver = false;
let gameWon = false;
let enemyCount = 3;

// Input state
const keys = {};
let mouseX = 0, mouseY = 0;
let mouseDown = false;

// AI state
let aiActions = null;
let aiTimer = 0;
const AI_INTERVAL = 800; // ms between AI calls
let aiEnabled = true;
let aiCalling = false;

// Particles for explosions
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 30 + Math.random() * 20;
    this.maxLife = this.life;
    this.color = color;
    this.size = 2 + Math.random() * 3;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.96;
    this.vy *= 0.96;
    this.life--;
  }
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  get alive() { return this.life > 0; }
}

// Tank base class
class Tank {
  constructor(x, y, color, isPlayer) {
    this.x = x; this.y = y;
    this.width = TILE - 4;
    this.height = TILE - 4;
    this.speed = isPlayer ? 2.5 : 1.5;
    this.turnSpeed = isPlayer ? 3 : 2;
    this.color = color;
    this.isPlayer = isPlayer;
    this.angle = isPlayer ? 0 : 180; // facing direction (degrees)
    this.turretAngle = isPlayer ? 0 : 180;
    this.health = isPlayer ? 5 : 1;
    this.maxHealth = isPlayer ? 5 : 1;
    this.shootCooldown = 0;
    this.shootDelay = isPlayer ? 20 : 80;
    this.id = Tank.nextId++;
    this.alive = true;
    // Pre-calc corners for smoother collision
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;
  }
  getBounds() {
    return { x: this.x - this.halfW, y: this.y - this.halfH, w: this.width, h: this.height };
  }
  collidesWith(other) {
    const a = this.getBounds();
    const b = other.getBounds();
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  collidesWithMap() {
    const b = this.getBounds();
    // Check all 4 corners and edges
    const points = [
      { x: b.x + 2, y: b.y + 2 },
      { x: b.x + b.w - 2, y: b.y + 2 },
      { x: b.x + 2, y: b.y + b.h - 2 },
      { x: b.x + b.w - 2, y: b.y + b.h - 2 },
    ];
    for (const p of points) {
      const col = Math.floor(p.x / TILE);
      const row = Math.floor(p.y / TILE);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
      if (map[row][col] >= 1) return true;
    }
    return false;
  }
  move(dir) {
    const rad = this.angle * Math.PI / 180;
    const origX = this.x, origY = this.y;
    switch (dir) {
      case 'forward':
        this.x += Math.cos(rad) * this.speed;
        this.y -= Math.sin(rad) * this.speed;
        break;
      case 'backward':
        this.x -= Math.cos(rad) * this.speed;
        this.y += Math.sin(rad) * this.speed;
        break;
      case 'left':
        this.angle = (this.angle + this.turnSpeed) % 360;
        break;
      case 'right':
        this.angle = (this.angle - this.turnSpeed + 360) % 360;
        break;
    }
    if (dir === 'forward' || dir === 'backward') {
      if (this.collidesWithMap()) { this.x = origX; this.y = origY; }
    }
    // Clamp to map
    this.x = Math.max(this.halfW, Math.min(canvas.width - this.halfW, this.x));
    this.y = Math.max(this.halfH, Math.min(canvas.height - this.halfH, this.y));
  }
  shoot() {
    if (this.shootCooldown > 0 || !this.alive) return null;
    this.shootCooldown = this.shootDelay;
    const rad = this.turretAngle * Math.PI / 180;
    const bx = this.x + Math.cos(rad) * (this.halfW + 6);
    const by = this.y - Math.sin(rad) * (this.halfH + 6);
    return new Bullet(bx, by, this.turretAngle, this.isPlayer);
  }
  update() {
    if (this.shootCooldown > 0) this.shootCooldown--;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Tank body
    ctx.rotate((-this.angle) * Math.PI / 180);
    const hw = this.halfW, hh = this.halfH;
    ctx.fillStyle = this.color;
    ctx.fillRect(-hw, -hh, this.width, this.height);

    // Tracks
    const trackW = 5;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-hw - 2, -hh, trackW, this.height);
    ctx.fillRect(hw - trackW + 2, -hh, trackW, this.height);

    // Turret base circle
    ctx.rotate((this.angle) * Math.PI / 180); // reset rotation
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, hw * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Turret barrel
    ctx.rotate((-this.turretAngle) * Math.PI / 180);
    ctx.fillStyle = this.isPlayer ? '#4f4' : '#f44';
    ctx.fillRect(-3, -hh - 2, 6, hh + 8);
    ctx.fillRect(-2, -hh - 6, 4, 6);

    // Muzzle flash indicator
    if (this.shootCooldown > this.shootDelay - 4) {
      ctx.fillStyle = '#ff0';
      ctx.beginPath();
      ctx.arc(0, -hh - 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
Tank.nextId = 1;

// Bullet class
class Bullet {
  constructor(x, y, angle, isPlayer) {
    this.x = x; this.y = y;
    this.speed = 6;
    this.angle = angle;
    const rad = angle * Math.PI / 180;
    this.vx = Math.cos(rad) * this.speed;
    this.vy = -Math.sin(rad) * this.speed;
    this.isPlayer = isPlayer;
    this.alive = true;
    this.radius = 3;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    // Check out of bounds
    if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
      this.alive = false;
    }
    // Check wall collision
    const col = Math.floor(this.x / TILE);
    const row = Math.floor(this.y / TILE);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS && map[row][col] >= 1) {
      if (map[row][col] === 2) { // Brick - destroy it
        map[row][col] = 0;
        spawnExplosion(col * TILE + TILE / 2, row * TILE + TILE / 2, '#d90');
      }
      this.alive = false;
    }
  }
  draw(ctx) {
    ctx.fillStyle = this.isPlayer ? '#ff0' : '#f66';
    ctx.shadowColor = this.isPlayer ? '#ff0' : '#f00';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Trail
    ctx.strokeStyle = this.isPlayer ? 'rgba(255,255,0,0.4)' : 'rgba(255,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 2, this.y - this.vy * 2);
    ctx.stroke();
  }
}

// Particle effects
function spawnExplosion(x, y, color) {
  for (let i = 0; i < 12; i++) {
    particles.push(new Particle(x, y, color || '#f80'));
  }
}

// Map generation
function generateMap() {
  map = [];
  for (let row = 0; row < ROWS; row++) {
    map[row] = [];
    for (let col = 0; col < COLS; col++) {
      // Border walls
      if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) {
        map[row][col] = 1; // Steel (indestructible)
      } else {
        map[row][col] = 0;
      }
    }
  }

  // Create interior obstacles - patterned layout
  const patterns = [
    // Top area - enemy spawn zone (rows 1-3)
    { row: 1, col: 3, w: 2, h: 1, type: 2 },
    { row: 1, col: COLS - 5, w: 2, h: 1, type: 2 },
    { row: 3, col: 1, w: 1, h: 2, type: 1 },
    { row: 3, col: COLS - 2, w: 1, h: 2, type: 1 },

    // Middle area (rows 4-10)
    { row: 5, col: 4, w: 1, h: 2, type: 2 },
    { row: 5, col: COLS - 5, w: 1, h: 2, type: 2 },
    { row: 6, col: 8, w: 4, h: 1, type: 1 },
    { row: 4, col: 9, w: 2, h: 1, type: 2 },
    { row: 8, col: 2, w: 3, h: 1, type: 2 },
    { row: 8, col: COLS - 5, w: 3, h: 1, type: 2 },
    { row: 6, col: 1, w: 1, h: 2, type: 1 },
    { row: 6, col: COLS - 2, w: 1, h: 2, type: 1 },
    { row: 9, col: 9, w: 2, h: 1, type: 2 },

    // Bottom area - player zone (rows 11-13)
    { row: 11, col: 3, w: 2, h: 1, type: 2 },
    { row: 11, col: COLS - 5, w: 2, h: 1, type: 2 },
    { row: 12, col: 1, w: 1, h: 2, type: 1 },
    { row: 12, col: COLS - 2, w: 1, h: 2, type: 1 },
  ];

  for (const p of patterns) {
    if (p.row < 0 || p.row + p.h > ROWS || p.col < 0 || p.col + p.w > COLS) continue;
    for (let r = p.row; r < p.row + p.h; r++) {
      for (let c = p.col; c < p.col + p.w; c++) {
        map[r][c] = p.type;
      }
    }
  }

  // Ensure spawn areas are clear
  const clearZones = [
    { row: 1, col: 1 }, // Enemy spawn 1
    { row: 1, col: COLS - 2 }, // Enemy spawn 2
    { row: 1, col: Math.floor(COLS / 2) }, // Enemy spawn 3
    { row: ROWS - 2, col: Math.floor(COLS / 2) }, // Player spawn
  ];
  for (const z of clearZones) {
    for (let r = z.row - 1; r <= z.row + 1; r++) {
      for (let c = z.col - 1; c <= z.col + 1; c++) {
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
          map[r][c] = 0;
        }
      }
    }
  }
}

// Initialize game
function initGame() {
  generateMap();
  score = 0;
  gameOver = false;
  gameWon = false;
  gameRunning = true;
  particles = [];
  bullets = [];
  Tank.nextId = 1;

  // Player at bottom center
  const px = Math.floor(COLS / 2) * TILE + TILE / 2;
  const py = (ROWS - 2) * TILE + TILE / 2;
  player = new Tank(px, py, '#4ade80', true);
  player.health = 5;
  player.maxHealth = 5;

  // Enemy tanks - at least 3
  enemies = [];
  const spawnPositions = [
    { x: 2 * TILE + TILE / 2, y: 2 * TILE + TILE / 2 },
    { x: Math.floor(COLS / 2) * TILE + TILE / 2, y: 2 * TILE + TILE / 2 },
    { x: (COLS - 3) * TILE + TILE / 2, y: 2 * TILE + TILE / 2 },
    { x: 1 * TILE + TILE / 2, y: 1 * TILE + TILE / 2 },
    { x: (COLS - 2) * TILE + TILE / 2, y: 1 * TILE + TILE / 2 },
  ];
  const enemyColors = ['#ef4444', '#f97316', '#eab308', '#ec4899', '#a855f7'];
  for (let i = 0; i < enemyCount; i++) {
    const pos = spawnPositions[i % spawnPositions.length];
    const enemy = new Tank(pos.x, pos.y, enemyColors[i], false);
    enemy.angle = 180;
    enemy.turretAngle = 180;
    enemies.push(enemy);
  }

  aiActions = null;
  aiTimer = 0;

  // Update HUD
  updateHUD();
}

// Update HUD elements
function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('enemy-count').textContent = enemies.filter(e => e.alive).length;
  const hp = Math.max(0, player.health);
  document.getElementById('health-bar').style.width = (hp / player.maxHealth * 100) + '%';
  if (hp <= 2) document.getElementById('health-bar').style.background = 'linear-gradient(90deg, #ff0000, #ff4444)';
  else if (hp <= 3) document.getElementById('health-bar').style.background = 'linear-gradient(90deg, #f97316, #eab308)';
  else document.getElementById('health-bar').style.background = 'linear-gradient(90deg, #4ade80, #22c55e)';
}

// Show overlay
function showOverlay(title, subtitle, titleColor) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-title').style.color = titleColor || '#e94560';
  document.getElementById('overlay-subtitle').textContent = subtitle;
  document.getElementById('overlay').classList.remove('hidden');
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

// API config
function showApiConfig() {
  document.getElementById('api-config').classList.remove('hidden');
}

function hideApiConfig() {
  document.getElementById('api-config').classList.add('hidden');
}

// ==================== AI System ====================

function buildGameState() {
  const aliveEnemies = enemies.filter(e => e.alive);
  return {
    player: {
      x: Math.round(player.x),
      y: Math.round(player.y),
      angle: Math.round(player.angle),
      turretAngle: Math.round(player.turretAngle),
      health: player.health,
    },
    enemies: aliveEnemies.map(e => ({
      id: e.id,
      x: Math.round(e.x),
      y: Math.round(e.y),
      angle: Math.round(e.angle),
      turretAngle: Math.round(e.turretAngle),
      health: e.health,
    })),
    bullets: bullets.filter(b => b.alive).map(b => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      angle: Math.round(b.angle),
      isPlayer: b.isPlayer,
    })),
    mapSize: { cols: COLS, rows: ROWS, tileSize: TILE },
    walls: getNearbyObstacles(),
  };
}

function getNearbyObstacles() {
  const obstacles = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (map[row][col] >= 1) {
        obstacles.push({
          x: col * TILE + TILE / 2,
          y: row * TILE + TILE / 2,
          type: map[row][col] === 1 ? 'steel' : 'brick',
        });
      }
    }
  }
  return obstacles;
}

async function fetchAiDecisions() {
  if (aiCalling || !aiEnabled) return;
  const aliveEnemies = enemies.filter(e => e.alive);
  if (aliveEnemies.length === 0) return;

  aiCalling = true;
  document.getElementById('ai-dot').style.background = '#ff0';
  document.getElementById('ai-text').textContent = 'AI 思考中...';

  try {
    const gameState = buildGameState();
    const resp = await fetch('/api/ai-decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameState),
    });
    if (resp.ok) {
      aiActions = await resp.json();
    }
    document.getElementById('ai-dot').style.background = '#0f0';
    document.getElementById('ai-text').textContent = 'AI 就绪';
  } catch (e) {
    console.error('AI fetch error:', e);
    document.getElementById('ai-dot').style.background = '#f44';
    document.getElementById('ai-text').textContent = 'AI 离线(本地)';
    aiActions = null;
  }
  aiCalling = false;
}

function applyAiActions() {
  if (!aiActions || !aiActions.enemies) return;
  for (const action of aiActions.enemies) {
    const enemy = enemies.find(e => e.id === action.id);
    if (!enemy || !enemy.alive) continue;

    // Apply movement
    const validMoves = ['forward', 'backward', 'left', 'right'];
    if (validMoves.includes(action.move)) {
      enemy.move(action.move);
    }

    // Apply turret rotation
    if (typeof action.turret === 'number') {
      enemy.turretAngle = ((action.turret % 360) + 360) % 360;
    }

    // Apply shooting
    if (action.shoot) {
      const bullet = enemy.shoot();
      if (bullet) bullets.push(bullet);
    }
  }
}

// Fallback AI when server is unavailable
function fallbackAI() {
  if (aiActions) return; // Already have server AI
  const aliveEnemies = enemies.filter(e => e.alive);
  for (const enemy of aliveEnemies) {
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleToPlayer = Math.atan2(-dy, dx) * 180 / Math.PI;
    enemy.turretAngle = ((angleToPlayer % 360) + 360) % 360;

    // Move toward player with some randomness
    if (dist > 300) {
      enemy.move('forward');
    } else if (dist < 150) {
      enemy.move(Math.random() > 0.5 ? 'left' : 'right');
    } else {
      if (Math.random() > 0.7) enemy.move('forward');
      else if (Math.random() > 0.5) enemy.move(Math.random() > 0.5 ? 'left' : 'right');
    }

    // Shoot when facing player
    const angleDiff = Math.abs(((enemy.turretAngle - angleToPlayer + 540) % 360) - 180);
    if (angleDiff < 15 && Math.random() > 0.7) {
      const bullet = enemy.shoot();
      if (bullet) bullets.push(bullet);
    }
  }
}

// ==================== Input Handling ====================

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseDown = true;
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ==================== Game Update ====================

function updatePlayer() {
  if (!player.alive || gameOver) return;

  // Movement
  if (keys['w'] || keys['arrowup']) player.move('forward');
  if (keys['s'] || keys['arrowdown']) player.move('backward');
  if (keys['a'] || keys['arrowleft']) player.move('left');
  if (keys['d'] || keys['arrowright']) player.move('right');

  // Turret always points toward mouse
  const dx = mouseX - player.x;
  const dy = -(mouseY - player.y); // Flip Y for screen coords
  player.turretAngle = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (player.turretAngle < 0) player.turretAngle += 360;

  // Shooting
  if (mouseDown) {
    const bullet = player.shoot();
    if (bullet) bullets.push(bullet);
  }
}

function updateEnemies() {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    // Check collisions with other tanks
    for (const other of enemies) {
      if (other !== enemy && other.alive && enemy.collidesWith(other)) {
        // Push apart slightly
        const dx = enemy.x - other.x;
        const dy = enemy.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        enemy.x += (dx / dist) * 2;
        enemy.y += (dy / dist) * 2;
      }
    }

    // Check collision with player
    if (player.alive && enemy.collidesWith(player)) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      enemy.x += (dx / dist) * 2;
      enemy.y += (dy / dist) * 2;
    }
  }
}

function updateBullets() {
  for (const bullet of bullets) {
    if (!bullet.alive) continue;
    bullet.update();

    if (!bullet.alive) continue;

    // Check bullet-tank collisions
    if (bullet.isPlayer) {
      // Player bullets hit enemies
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < enemy.halfW) {
          enemy.alive = false;
          bullet.alive = false;
          score += 100;
          spawnExplosion(enemy.x, enemy.y, enemy.color);
          updateHUD();
          break;
        }
      }
    } else {
      // Enemy bullets hit player
      if (player.alive) {
        const dx = bullet.x - player.x;
        const dy = bullet.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < player.halfW) {
          player.health--;
          bullet.alive = false;
          spawnExplosion(player.x, player.y, '#f44');
          updateHUD();
          if (player.health <= 0) {
            player.alive = false;
            spawnExplosion(player.x, player.y, '#4ade80');
            spawnExplosion(player.x + 10, player.y - 10, '#4ade80');
            gameOver = true;
            gameRunning = false;
          }
        }
      }
    }
  }

  // Clean up dead bullets
  bullets = bullets.filter(b => b.alive);
}

function updateParticles() {
  for (const p of particles) p.update();
  particles = particles.filter(p => p.alive);
}

function checkWinLose() {
  if (gameOver) return;

  // Lose: player dead
  if (!player.alive) {
    gameOver = true;
    gameRunning = false;
    showOverlay('游戏结束', '最终得分: ' + score, '#ef4444');
    return;
  }

  // Win: all enemies dead
  const aliveEnemies = enemies.filter(e => e.alive);
  if (aliveEnemies.length === 0) {
    gameOver = true;
    gameWon = true;
    gameRunning = false;
    score += 500;
    updateHUD();
    showOverlay('胜利!', '最终得分: ' + score, '#4ade80');
  }
}

// ==================== Rendering ====================

function drawMap() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * TILE;
      const y = row * TILE;
      if (map[row][col] === 0) continue;

      if (map[row][col] === 1) {
        // Steel wall
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#718096';
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        // Rivets
        ctx.fillStyle = '#a0aec0';
        [{rx:4, ry:4}, {rx:TILE-6, ry:4}, {rx:4, ry:TILE-6}, {rx:TILE-6, ry:TILE-6}].forEach(p => {
          ctx.beginPath();
          ctx.arc(x + p.rx, y + p.ry, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (map[row][col] === 2) {
        // Brick wall
        ctx.fillStyle = '#b45309';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1;
        // Brick pattern
        for (let br = 0; br < TILE; br += 10) {
          ctx.beginPath();
          ctx.moveTo(x, y + br);
          ctx.lineTo(x + TILE, y + br);
          ctx.stroke();
          const offset = (br / 10) % 2 === 0 ? 0 : TILE / 2;
          for (let bc = offset; bc < TILE; bc += TILE) {
            ctx.beginPath();
            ctx.moveTo(x + bc, y + br);
            ctx.lineTo(x + bc, y + Math.min(br + 10, TILE));
            ctx.stroke();
          }
        }
      }
    }
  }
}

function drawMinimap() {
  const mmSize = 120;
  const mmX = canvas.width - mmSize - 10;
  const mmY = 40;
  const mmTile = mmSize / Math.max(COLS, ROWS);

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);
  ctx.strokeStyle = '#0f3460';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);

  // Draw map tiles
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (map[row][col] === 0) continue;
      ctx.fillStyle = map[row][col] === 1 ? '#718096' : '#b45309';
      ctx.fillRect(mmX + col * mmTile, mmY + row * mmTile, mmTile, mmTile);
    }
  }

  // Draw player
  if (player.alive) {
    const px = mmX + (player.x / canvas.width) * mmSize;
    const py = mmY + (player.y / canvas.height) * mmSize;
    ctx.fillStyle = '#0f0';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw enemies
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    ctx.fillStyle = enemy.color;
    const ex = mmX + (enemy.x / canvas.width) * mmSize;
    const ey = mmY + (enemy.y / canvas.height) * mmSize;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw bullets
  ctx.fillStyle = '#ff0';
  for (const b of bullets) {
    if (!b.alive) continue;
    const bx = mmX + (b.x / canvas.width) * mmSize;
    const by = mmY + (b.y / canvas.height) * mmSize;
    ctx.fillRect(bx - 1, by - 1, 2, 2);
  }
}

function render() {
  // Clear
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines (subtle)
  ctx.strokeStyle = 'rgba(15, 52, 96, 0.3)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= canvas.width; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw map
  drawMap();

  // Draw player
  if (player.alive) {
    // Player glow
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 10;
    player.draw(ctx);
    ctx.shadowBlur = 0;
  }

  // Draw enemies
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.draw(ctx);
  }

  // Draw bullets
  for (const bullet of bullets) {
    if (!bullet.alive) continue;
    bullet.draw(ctx);
  }

  // Draw particles
  for (const p of particles) {
    p.draw(ctx);
  }

  // Draw minimap
  drawMinimap();

  // Crosshair at mouse
  if (gameRunning && player.alive) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouseX - 16, mouseY);
    ctx.lineTo(mouseX - 6, mouseY);
    ctx.moveTo(mouseX + 6, mouseY);
    ctx.lineTo(mouseX + 16, mouseY);
    ctx.moveTo(mouseX, mouseY - 16);
    ctx.lineTo(mouseX, mouseY - 6);
    ctx.moveTo(mouseX, mouseY + 6);
    ctx.lineTo(mouseX, mouseY + 16);
    ctx.stroke();
  }
}

// ==================== Game Loop ====================

function update() {
  if (!gameRunning) {
    // Still render particles
    updateParticles();
    return;
  }

  // Player
  player.update();
  updatePlayer();

  // Enemies
  for (const enemy of enemies) {
    enemy.update();
  }

  // AI decisions
  aiTimer += 16; // ~60fps
  if (aiTimer >= AI_INTERVAL) {
    aiTimer = 0;
    if (aiEnabled) {
      fetchAiDecisions();
    }
    fallbackAI(); // Always run fallback as supplement
  }
  applyAiActions();

  // Enemy movement
  updateEnemies();

  // Bullets
  updateBullets();

  // Particles
  updateParticles();

  // Win/Lose
  checkWinLose();
}

function gameLoop() {
  update();
  render();
  requestAnimationFrame(gameLoop);
}

// ==================== Init ====================

document.getElementById('restart-btn').addEventListener('click', () => {
  hideOverlay();
  initGame();
  document.getElementById('ai-dot').style.background = '#0f0';
  document.getElementById('ai-text').textContent = 'AI 就绪';
});

document.getElementById('api-save-btn').addEventListener('click', async () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) {
    try {
      await fetch('/api/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
    } catch (e) {
      console.error('Failed to set API key:', e);
    }
  }
  hideApiConfig();
  initGame();
  gameLoop();
});

document.getElementById('api-skip-btn').addEventListener('click', () => {
  hideApiConfig();
  initGame();
  gameLoop();
});

// Start
initGame();
gameLoop();

console.log('坦克大战已就绪！');
console.log('WASD 移动 | 鼠标瞄准 | 左键射击');
console.log('敌方坦克由 AI 控制');
