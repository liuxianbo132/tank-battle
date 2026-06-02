exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') { return { statusCode: 204, headers, body: '' }; }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'Set DEEPSEEK_API_KEY in Netlify env vars' }) };
};
