/**
 * 靓图匿名用户追踪
 * 不收集任何个人信息，只追踪使用行为
 * 用于了解：有多少真实用户、哪个功能被用、用户是否走完全程
 */
(function() {
  'use strict';

  // ============ 1. 匿名ID ============
  var STORAGE_KEY = 'lt_uid';
  var uid = null;
  try {
    uid = localStorage.getItem(STORAGE_KEY);
    if (!uid) {
      // 生成随机ID：u_随机8位_时间戳
      uid = 'u_' + Math.random().toString(36).substring(2, 10) + '.' + Date.now().toString(36);
      localStorage.setItem(STORAGE_KEY, uid);
    }
  } catch(e) {
    // localStorage不可用（隐私模式等），用session级ID
    uid = 's_' + Math.random().toString(36).substring(2, 10) + '.' + Date.now().toString(36);
  }

  // ============ 2. 当前页面标识 ============
  var pageId = 'home';
  var path = window.location.pathname;
  if (path.indexOf('/sticker/') >= 0) {
    pageId = 'sticker';
  }

  // ============ 3. Session ============
  var sessionId = 's' + Date.now().toString(36);
  var actionChain = [];
  var sessionStart = Date.now();

  // ============ 4. 上报函数 ============
  function report(action, meta) {
    if (!meta) meta = {};
    actionChain.push(action + (meta.tool ? ':' + meta.tool : ''));

    var payload = {
      uid: uid,
      session: sessionId,
      page: pageId,
      action: action,
      meta: meta,
      chain: actionChain,
      sessionAge: Math.round((Date.now() - sessionStart) / 1000),
      ts: new Date().toISOString()
    };

    // 用sendBeacon确保页面关闭时也能发出去
    var apiUrl = '/api/track';
    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([body], {type: 'application/json'});
      navigator.sendBeacon(apiUrl, blob);
    } else {
      // fallback: fetch + 静默失败
      try {
        fetch(apiUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: body,
          keepalive: true
        }).catch(function(){});
      } catch(e) {}
    }
  }

  // ============ 5. 自动上报页面浏览 ============
  report('page_view', {
    referrer: document.referrer || '',
    title: document.title || '',
    screen: window.screen ? window.screen.width + 'x' + window.screen.height : ''
  });

  // ============ 6. 页面关闭时上报离开 ============
  window.addEventListener('beforeunload', function() {
    report('page_leave', {duration: Math.round((Date.now() - sessionStart) / 1000)});
  });

  // ============ 7. 暴露API给业务代码 ============
  window.__lt = {
    uid: uid,
    report: report,
    getChain: function() { return actionChain.slice(); },
    // 业务代码调用：__lt.action('upload') / __lt.action('download') / __lt.action('process',{tool:'crop'})
    action: function(name, meta) { report(name, meta || {}); }
  };

})();
