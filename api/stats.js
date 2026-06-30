/**
 * 靓图统计 API (Edge Config 版)
 * Vercel Serverless Function
 * GET /api/stats
 */

const EC_ID = process.env.EDGE_CONFIG_ID;
const TEAM_ID = process.env.TEAM_ID;
const TOKEN = process.env.VERCEL_API_TOKEN;
const API_BASE = `https://api.vercel.com/v1/edge-config/${EC_ID}`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 读取 stats
    let stats;
    try {
      const raw = await ecRead('track_stats');
      stats = (raw && typeof raw === 'object') ? raw : {};
    } catch (e) {
      stats = {};
    }

    const todayStats = (stats.today && stats.today[today]) || {};
    const recentEvents = stats.recentEvents || [];

    // 聚合 action 计数（从最近事件中推算）
    const actionCounts = {};
    for (const e of recentEvents) {
      const key = (e.pg || '?') + ':' + (e.a || '?');
      actionCounts[key] = (actionCounts[key] || 0) + 1;
    }

    const summary = {
      todayEvents: todayStats.events || 0,
      todayDownloads: todayStats.downloads || 0,
      todayNewUsers: todayStats.newUsers || 0,
      totalUsers: stats.totalUsers || 0,
      completedSessions: stats.completedSessions || 0,
      completionRate: 0
    };

    // 估算走完全程比例
    if (summary.totalUsers > 0 && summary.completedSessions > 0) {
      summary.completionRate = Math.min(100, Math.round(
        (summary.completedSessions / summary.totalUsers) * 100
      ));
    }

    return new Response(JSON.stringify({
      summary,
      actionCounts,
      recentEvents: recentEvents.slice(0, 15)
    }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('stats error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }
}

async function ecRead(key) {
  const url = `${API_BASE}/item/${encodeURIComponent(key)}?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`EC read failed: ${res.status}`);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return text; }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
