/* 主域：成绩上报 + 好友榜（开放数据域 sharedCanvas） */
function createRank() {
  var rank = {
    ready: false,       // 开放数据域是否可用
    loaded: false,      // 好友数据是否已到位
    error: false,
    count: 0,
    shared: null,
    odc: null,
    dpr: 1
  };

  try {
    if (typeof tt !== 'undefined' && tt.getOpenDataContext) {
      rank.odc = tt.getOpenDataContext();
      rank.shared = (rank.odc && rank.odc.canvas) || null;
      rank.ready = !!rank.shared;
    }
  } catch (e) {
    rank.ready = false;
  }

  rank.init = function (w, h, dpr) {
    rank.dpr = dpr || 1;
    rank.w = w; rank.h = h;
    if (!rank.ready) return;
    try {
      rank.shared.width = Math.round(w * rank.dpr);
      rank.shared.height = Math.round(h * rank.dpr);
      rank.odc.postMessage({ type: 'init', width: Math.round(w * rank.dpr), height: Math.round(h * rank.dpr), dpr: rank.dpr });
      rank.loaded = true;   // 开放数据域只收不发，主域乐观认为可绘制
    } catch (e) {}
  };

  /* 上报本局成绩，成功后刷新好友榜 */
  rank.report = function (num, stage) {
    var payload = JSON.stringify({ num: Math.round(num), stage: stage, ts: Date.now() });
    try {
      if (typeof tt !== 'undefined' && tt.setUserCloudStorage) {
        tt.setUserCloudStorage({
          KVDataList: [{ key: 'numdoor', value: payload }],
          success: function () { rank.refresh(); },
          fail: function () { rank.refresh(); }
        });
        return;
      }
    } catch (e) {}
    rank.refresh();
  };

  rank.refresh = function () {
    if (!rank.ready) { rank.error = true; return; }
    try {
      rank.odc.postMessage({ type: 'refresh' });
      rank.loaded = true;
    } catch (e) { rank.error = true; }
  };

  /* 开放数据域回传 */
  rank.onData = function (msg) {
    if (!msg || msg.type !== 'rank') return;
    rank.loaded = true;
    rank.count = msg.count || 0;
    rank.myRank = msg.myRank || 0;
  };

  rank.draw = function (ctx, area) {
    if (!rank.ready || !rank.shared) return false;
    try {
      if (!rank.shared.width || !rank.shared.height) return false;
      var bw = rank.w || area.w, bh = rank.h || area.h;
      var scale = Math.min(area.w / bw, area.h / bh);
      ctx.drawImage(rank.shared, area.x, area.y, bw * scale, bh * scale);
      return true;
    } catch (e) { return false; }
  };

  return rank;
}

module.exports = { createRank: createRank };
