// API test endpoint - CommonJS format for Vercel v2
module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    ts: Date.now(),
    env: {
      hasToken: !!process.env.VERCEL_API_TOKEN,
      hasEcId: !!process.env.EDGE_CONFIG_ID,
      hasTeamId: !!process.env.TEAM_ID
    }
  }));
};
