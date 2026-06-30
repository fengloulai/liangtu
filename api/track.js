/**
 * 靓图追踪接收 API (Edge Config 版)
 * Vercel Serverless Function
 * POST /api/track
 *
 * 数据存于 Edge Config，一个 JSON key：track_stats
 * 8KB 限制下：存聚合统计 + 最近15条事件
 */

const EC_ID = process.env.EDGE_CONFIG_ID;
const TEAM_ID = process.env.TEAM_ID;
const TOKEN = process.env.VERCEL_API_TOKEN;
const API_BASE = `https://api.vercel.com/v1/edge-config/${EC_ID}`;

const MAX_EVENTS = 15;

export default async function handler(req) {
  // 预检
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  try {
    const event = await req.json();
    if (!event.uid || !event.action) {
      return new Response(JSON.stringify({ error: 'Missing uid or action' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. 读取当前统计数据
    let stats;
    try {
      stats = await ecRead('track_stats');
    } catch (e) {
      stats = null;
    }

    if (!stats || typeof stats !== 'object') {
      stats = { totalUsers: 0, completedSessions: 0, today: {}, recentEvents: [] };
    }
    if (!stats.today) stats.today = {};
    if (!stats.recentEvents) stats.recentEvents = [];

    // 今天的 key
    const todayKey = today;
    if (!stats.today[todayKey]) {
      stats.today[todayKey] = { events: 0, downloads: 0, newUsers: 0 };
    }

    const todayStats = stats.today[todayKey];

    // 2. 更新今天的事件计数
    todayStats.events++;

    if (event.action === 'download') {
      todayStats.downloads++;
    }

    // 3. 事件追加入最近列表
    const slimEvent = {
      a: event.action,
      t: event.meta && event.meta.tool ? event.meta.tool : '',
      pg: event.page,
      s: event.session && event.session.slice(-4),
      ts: event.ts || new Date().toISOString()
    };
    stats.recentEvents.unshift(slimEvent);
    if (stats.recentEvents.length > MAX_EVENTS) {
      stats.recentEvents = stats.recentEvents.slice(0, MAX_EVENTS);
    }

    // 4. 总用户数（简单递增，不精确去重）
    // 用 heuristic：如果是 page_view 且是新 session 才 +1
    if (event.action === 'page_view') {
      stats.totalUsers = (stats.totalUsers || 0) + 1;
    }

    // 5. 完整链路检测
    if (event.action === 'download' && event.chain) {
      const hasUpload = event.chain.some(a => a.startsWith('upload'));
      if (hasUpload) {
        stats.completedSessions = (stats.completedSessions || 0) + 1;
      }
    }

    // 只保留今天 + 昨天的 stats（清理旧数据）
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const keep = {};
    if (stats.today[todayKey]) keep[todayKey] = stats.today[todayKey];
    if (stats.today[yesterday]) keep[yesterday] = stats.today[yesterday];
    stats.today = keep;

    // 6. 写回 Edge Config
    await ecUpsert([
      { key: 'track_stats', value: stats }
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('track error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }
}

// 读 Edge Config 单个 key
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

// 写 Edge Config（批量 upsert）
async function ecUpsert(items) {
  const url = `${API_BASE}/items?teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: items.map(it => ({
        operation: 'upsert',
        key: it.key,
        value: typeof it.value === 'string' ? it.value : JSON.stringify(it.value)
      }))
    })
  });
  if (!res.ok) {
    throw new Error(`EC write failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
