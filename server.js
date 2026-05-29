const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = 'deepseek-chat';
const TRIPLE_BT = String.fromCharCode(96, 96, 96);

function callDeepSeek(gameState) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: 'You are an AI controlling enemy tanks in a top-down tank battle. Destroy the player. Reply JSON only: {enemies:[{id,move,turret,shoot}]}. move=forward/backward/left/right/none, turret=0-359 degrees, shoot=true/false. Strategy: move toward player, avoid walls, aim turret, shoot when clear line of sight, spread out, be smart.' },
        { role: 'user', content: JSON.stringify(gameState) }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const url = new URL('https://api.deepseek.com/v1/chat/completions');
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_API_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const content = result.choices[0].message.content;
          let jsonStr = content.trim();
          jsonStr = jsonStr.replace(new RegExp('^' + TRIPLE_BT + 'json\\s*\\n?', 'i'), '').replace(new RegExp(TRIPLE_BT + '\\s*$'), '');
          resolve(JSON.parse(jsonStr));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let aiCache = null, aiCacheTime = 0;
const AI_CACHE_TTL = 1500;

function getFallbackActions(gameState) {
  const actions = { enemies: [] };
  const player = gameState.player;
  for (const enemy of gameState.enemies) {
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleToPlayer = Math.atan2(dy, dx) * 180 / Math.PI;
    const normalizedAngle = ((angleToPlayer % 360) + 360) % 360;
    let move = 'forward';
    if (dist < 200) move = Math.random() > 0.5 ? 'left' : 'right';
    actions.enemies.push({
      id: enemy.id, move: move,
      turret: Math.round(normalizedAngle),
      shoot: dist < 400 && Math.random() > 0.5
    });
  }
  return actions;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/set-key') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.apiKey) { DEEPSEEK_API_KEY = data.apiKey; aiCache = null; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ai-decide') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const gameState = JSON.parse(body);
        if (!DEEPSEEK_API_KEY) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(getFallbackActions(gameState)));
          return;
        }
        const now = Date.now();
        if (aiCache && (now - aiCacheTime) < AI_CACHE_TTL) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(aiCache));
          return;
        }
        console.log('Calling DeepSeek API...');
        const actions = await callDeepSeek(gameState);
        aiCache = actions; aiCacheTime = now;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(actions));
      } catch (e) {
        console.error('AI error:', e.message);
        try {
          const actions = getFallbackActions(JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(actions));
        } catch (e2) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal error' }));
        }
      }
    });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);
  const extMap = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
  const contentType = extMap[path.extname(filePath)] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log('  Tank Battle - http://localhost:' + PORT);
  console.log('========================================');
  if (!DEEPSEEK_API_KEY) {
    console.log('DEEPSEEK_API_KEY not set, using fallback AI.');
    console.log('Set via: set DEEPSEEK_API_KEY=your-key');
  } else {
    console.log('DeepSeek API connected.');
  }
});
