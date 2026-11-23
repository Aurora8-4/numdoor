/* =========================================================
 * 开放数据域：拉好友成绩并绘制到 sharedCanvas
 * 这里能访问关系链数据，但看不到主域的任何变量
 * ========================================================= */

var sharedCanvas = null;
try {
  sharedCanvas = (tt.getSharedCanvas && tt.getSharedCanvas()) || tt.createCanvas();
} catch (e) {
  sharedCanvas = null;
}
var ctx = sharedCanvas ? sharedCanvas.getContext('2d') : null;

var state = {
  width: 0,
  height: 0,
  dpr: 1,
  list: [],
  loaded: false,
  error: false,
  myRank: 0
};

var FONT = 'sans-serif';
var KEY = 'numdoor';

function fmt(n) {
  n = Math.max(0, Math.round(n));
  if (n < 10000) return String(n);
  var U = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (var i = 0; i < U.length; i++) {
    if (n >= U[i][0]) {
      var q = n / U[i][0];
      return (q >= 100 ? q.toFixed(0) : q.toFixed(1).replace(/\.0$/, '')) + U[i][1];
    }
  }
  return String(n);
}

function parseKV(kvList) {
  var out = null;
  if (!kvList) return out;
  for (var i = 0; i < kvList.length; i++) {
    if (kvList[i].key === KEY) {
      try { out = JSON.parse(kvList[i].value); } catch (e) { out = null; }
    }
  }
  return out;
}

/* ---------- 拉数据 ---------- */
function refresh() {
  if (typeof tt.getFriendCloudStorage !== 'function') {
    state.error = true;
    draw();
    return;
  }
  tt.getFriendCloudStorage({
    keyList: [KEY],
    success: function (res) {
      var arr = (res && res.data) || [];
      var list = [];
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        var v = parseKV(it.KVDataList);
        if (!v || typeof v.num !== 'number') continue;
        list.push({
          name: it.nickname || '好友',
          avatar: it.avatarUrl || '',
          num: v.num,
          stage: v.stage || 0
        });
      }
      list.sort(function (a, b) {
        if (b.num !== a.num) return b.num - a.num;
        return b.stage - a.stage;
      });
      state.list = list.slice(0, 10);
      state.loaded = true;
      state.error = false;
      loadAvatars();
      draw();
      postRankInfo();
    },
    fail: function () {
      state.error = true;
      draw();
      postRankInfo();
    }
  });
}

/* ---------- 头像 ---------- */
function loadAvatars() {
  state.list.forEach(function (item) {
    if (!item.avatar || item.avatarImg) return;
    try {
      var img = tt.createImage();
      img.onload = function () { draw(); };
      img.onerror = function () {};
      img.src = item.avatar;
      item.avatarImg = img;
    } catch (e) {}
  });
}

/* ---------- 绘制 ---------- */
function draw() {
  if (!ctx || !sharedCanvas) return;
  var W = (state.width || 300) / state.dpr;
  var H = (state.height || 180) / state.dpr;

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (state.error) {
    text('好友数据加载失败', W / 2, H / 2, 12, '#6f88a8', 'center', 'middle');
    return;
  }
  if (!state.loaded) {
    text('正在拉取好友排行…', W / 2, H / 2, 12, '#6f88a8', 'center', 'middle');
    return;
  }
  if (!state.list.length) {
    text('还没有好友上榜，快去@他们', W / 2, H / 2, 12, '#6f88a8', 'center', 'middle');
    return;
  }

  var rowH = Math.min(34, (H - 4) / Math.max(3, state.list.length));
  for (var i = 0; i < state.list.length; i++) {
    var it = state.list[i];
    var y = 4 + i * rowH + rowH / 2;
    if (y - rowH / 2 > H) break;

    // 名次
    text(String(i + 1), 14, y, 13, i < 3 ? '#ffd83d' : '#6f88a8', 'center', 'middle');

    // 头像
    var ax = 26, ar = 11;
    var drewAvatar = false;
    if (it.avatarImg && it.avatarImg.width) {
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax + ar, y, ar, 0, 6.284);
        ctx.clip();
        ctx.drawImage(it.avatarImg, ax, y - ar, ar * 2, ar * 2);
        drewAvatar = true;
      } catch (e) {
        drewAvatar = false;
      }
      ctx.restore();
    }
    if (!drewAvatar) circle(ax + ar, y, ar, 'rgba(70,150,255,0.5)');

    // 昵称
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cfe3ff';
    ctx.font = 'bold 12px ' + FONT;
    var maxW = W - 150;
    var name = String(it.name).slice(0, 8);
    while (ctx.measureText(name).width > maxW && name.length > 1) name = name.slice(0, -1);
    ctx.fillText(name, 48, y);
    ctx.restore();

    // 数字 + 关卡
    text(fmt(it.num), W - 52, y, 13, '#eafcff', 'right', 'middle', true);
    text(it.stage + '关', W - 8, y, 10, '#8fa8cc', 'right', 'middle');
  }
}

function text(str, x, y, size, color, align, baseline, bold) {
  ctx.save();
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'alphabetic';
  ctx.fillStyle = color;
  ctx.font = (bold ? '900 ' : 'bold ') + size + 'px ' + FONT;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function circle(x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.284);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ---------- 与主域通信 ---------- */
function postRankInfo() {
  try {
    if (tt.getOpenDataContext) {
      var odc = tt.getOpenDataContext();
      if (odc && odc.postMessage) {
        odc.postMessage({ type: 'rank', count: state.list.length });
      }
    }
  } catch (e) {}
}

try {
  tt.onMessage(function (msg) {
    if (!msg) return;
    if (msg.type === 'init') {
      state.width = msg.width || 300;
      state.height = msg.height || 180;
      state.dpr = msg.dpr || 1;
      if (sharedCanvas) {
        sharedCanvas.width = state.width;
        sharedCanvas.height = state.height;
      }
      draw();
    } else if (msg.type === 'refresh') {
      refresh();
    }
  });
} catch (e) {}

draw();
