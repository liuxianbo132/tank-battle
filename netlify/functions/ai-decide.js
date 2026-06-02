const https = require('https');

let DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const TRIPLE_BT = String.fromCharCode(96, 96, 96);

function callDeepSeek(gameState) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are an AI controlling enemy tanks. Destroy the player. Reply JSON only: {enemies:[{id,move,turret,shoot}]}. move=forward/backward/left/right/none, turret=0-359, shoot=true/false. Strategy: move toward player, avoid walls, aim turret, shoot when clear line of sight, spread out.' },
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

let aiCache = null, aiCacheTime = 0;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const gameState = JSON.parse(event.body);

    if (!DEEPSEEK_API_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify(getFallbackActions(gameState)) };
    }

    const now = Date.now();
    if (aiCache && (now - aiCacheTime) < 1500) {
      return { statusCode: 200, headers, body: JSON.stringify(aiCache) };
    }

    const actions = await callDeepSeek(gameState);
    aiCache = actions;
    aiCacheTime = now;

    return { statusCode: 200, headers, body: JSON.stringify(actions) };
  } catch (e) {
    try {
      const actions = getFallbackActions(JSON.parse(event.body));
      return { statusCode: 200, headers, body: JSON.stringify(actions) };
    } catch (e2) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }
};
