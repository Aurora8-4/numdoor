/* =========================================================
 * 神也过不了第二关 · 抖音小游戏入口
 * 主域：游戏渲染 + UI + 触摸 + 成绩上报
 * ========================================================= */
var core = require('./js/core.js');
var createWorld = core.createWorld;
var fmt = core.fmt;
var createUI = require('./js/ui.js').createUI;
var createRank = require('./js/rank.js').createRank;

/* ---------- 系统信息 ---------- */
var info = {};
try {
  info = (tt.getWindowInfo && tt.getWindowInfo()) || tt.getSystemInfoSync();
} catch (e) { info = {}; }

var W = info.windowWidth || info.screenWidth || 375;
var H = info.windowHeight || info.screenHeight || 667;
var DPR = Math.min(info.pixelRatio || 2, 2);
var SAFE_TOP = (info.safeArea && info.safeArea.top) || info.statusBarHeight || 20;

/* ---------- 画布 ---------- */
var canvas = tt.createCanvas();
canvas.width = Math.round(W * DPR);
canvas.height = Math.round(H * DPR);
var ctx = canvas.getContext('2d');
if (ctx.setTransform) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
else if (ctx.scale) ctx.scale(DPR, DPR);

/* ---------- 存档 ---------- */
var best = { num: 1, stage: 0 };
try {
  var raw = tt.getStorageSync('numdoor.best');
  if (typeof raw === 'string' && raw) raw = JSON.parse(raw);
  if (raw && typeof raw === 'object') {
    if (typeof raw.num === 'number') best.num = raw.num;
    if (typeof raw.stage === 'number') best.stage = raw.stage;
  }
} catch (e) {}

/* ---------- 模块 ---------- */
var world = createWorld(W, H);
world.safeTop = SAFE_TOP + 8;
world.layout();

var ui = createUI(W, H);
var rank = createRank();
rank.init(ui.hit.rank.w - 16, ui.hit.rank.h - 40, DPR);
rank.onData = function (msg) {
  if (!msg || msg.type !== 'rank') return;
  rank.loaded = true;
  rank.count = msg.count || 0;
  rank.myRank = msg.myRank || 0;
};

/* ---------- 场景 ---------- */
var scene = 'ready';        // ready | play | over
var lastT = 0;
var overState = { overTitle: '', runNum: 0, runStage: 0, bestNum: best.num, rankPos: '' };
var startState = { bestNum: best.num, bestStage: best.stage };

world.startRun();

/* ---------- 触摸 ---------- */
var touchDownX = 0, touchDownY = 0, touchDownT = 0, dragging = false, swipeDone = false;

function laneFromX(x) {
  var ratio = x / Math.max(1, W);
  return ratio < 0.36 ? 0 : ratio > 0.64 ? 2 : 1;
}

function onDown(id, x, y) {
  touchDownX = x; touchDownY = y;
  touchDownT = Date.now();
  dragging = true;
  swipeDone = false;
  if (scene !== 'play') {
    var hit = ui.hitTest(x, y);
    if (hit === 'start' || hit === 'retry') doStart();
    else if (hit === 'rank') rank.refresh();
    else if (hit === 'sidebar') goSidebar();
    return;
  }
}

/* 侧边栏复访：抖音平台必接能力，必须调用 tt.navigateToScene */
function goSidebar() {
  try {
    if (typeof tt !== 'undefined' && tt.navigateToScene) {
      tt.navigateToScene({
        scene: 'sidebar',
        success: function () {},
        fail: function () {
          try {
            tt.showToast({ title: '当前抖音版本不支持，请升级后再试', icon: 'none', duration: 2000 });
          } catch (e) {}
        }
      });
    }
  } catch (e) {}
}

function onMove(id, x, y) {
  if (!dragging || scene !== 'play' || swipeDone) return;
  var dx = x - touchDownX;
  if (Math.abs(dx) >= 16) {
    if (world.setLane(world.G.lane + (dx > 0 ? 1 : -1))) {
      try { tt.vibrateShort && tt.vibrateShort({ type: 'light' }); } catch (e) {}
    }
    swipeDone = true;
  }
}

function onUp(id, x, y) {
  if (!dragging) return;
  dragging = false;
  if (scene !== 'play' || swipeDone) return;
  if (Date.now() - touchDownT < 320 && Math.abs(x - touchDownX) < 12) {
    world.setLane(laneFromX(x));
  }
}

try {
  tt.onTouchStart(function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) onDown(t.identifier, t.clientX, t.clientY);
  });
  tt.onTouchMove(function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) onMove(t.identifier, t.clientX, t.clientY);
  });
  tt.onTouchEnd(function (e) {
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (t) onUp(t.identifier, t.clientX, t.clientY);
  });
} catch (e) {}

/* ---------- 流程 ---------- */
function doStart() {
  world.startRun();
  scene = 'play';
  lastT = 0;
  try { tt.vibrateShort && tt.vibrateShort({ type: 'light' }); } catch (e) {}
}

function doOver() {
  if (scene === 'over') return;
  scene = 'over';
  var G = world.G;
  var passed = G.stage - 1;
  if (G.maxNum > best.num) best.num = G.maxNum;
  if (passed > best.stage) best.stage = passed;
  try { tt.setStorageSync('numdoor.best', { num: best.num, stage: best.stage }); } catch (e) {}

  overState.overTitle = passed >= 6 ? '差一点点！' : '门太硬了';
  overState.runNum = G.maxNum;
  overState.runStage = passed;
  overState.bestNum = best.num;

  rank.report(G.maxNum, passed);

  try { tt.vibrateShort && tt.vibrateShort({ type: 'heavy' }); } catch (e) {}
}

/* ---------- 主循环 ---------- */
function loop() {
  try { requestAnimationFrame(loop); } catch (e) {}

  var now = Date.now();
  if (!lastT) lastT = now;
  var dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;

  if (scene === 'play') {
    world.update(dt, true);
    if (world.G.over) doOver();
  } else {
    world.update(dt, false);
  }

  render();

  if (scene === 'play' && Math.random() < 0.004) {
    try { tt.vibrateShort && tt.vibrateShort({ type: 'light' }); } catch (e) {}
  }
}

function render() {
  world.showHUD = (scene === 'play');
  ctx.clearRect(0, 0, W, H);
  world.render(ctx);

  if (scene === 'ready') {
    // 半透明遮罩，让背景透出来
    ctx.fillStyle = 'rgba(7,4,18,0.55)';
    ctx.fillRect(0, 0, W, H);
    startState.bestNum = best.num;
    startState.bestStage = best.stage;
    startState.friendReady = rank.loaded;
    startState.friendError = rank.error || !rank.ready;
    ui.drawStart(ctx, startState, function (c, area) { rank.draw(c, area); });
  } else if (scene === 'over') {
    ui.drawOver(ctx, overState);
  }
}

/* 首次进入：拉一次好友榜 */
if (rank.ready) {
  setTimeout(function () { rank.refresh(); }, 300);
}

try { requestAnimationFrame(loop); } catch (e) {}
