/* 小游戏 UI：开始页 / 结算页 / 好友榜面板（全部 Canvas 绘制） */
var fmt = require('./core.js').fmt;
var rrPath = require('./core.js').rrPath;

var FONT = 'sans-serif';

function createUI(W, H) {
  var ui = { W: W, H: H, hit: {}, scale: Math.min(W / 390, 1.25) };

  function s(v) { return v * ui.scale; }

  ui.layout = function () {
    var W0 = ui.W, H0 = ui.H;
    var btnW = Math.min(W0 * 0.56, s(230)), btnH = s(52);
    ui.hit.start = { x: (W0 - btnW) / 2, y: H0 - s(158), w: btnW, h: btnH };
    ui.hit.retry = { x: (W0 - btnW) / 2, y: H0 - s(176), w: btnW, h: btnH };
    ui.hit.sidebar = { x: (W0 - btnW) / 2, y: H0 - s(92), w: btnW, h: s(32) };
    ui.hit.rank = { x: W0 * 0.1, y: H0 * 0.42, w: W0 * 0.8, h: H0 * 0.34 };
  };

  function inRect(x, y, r) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  ui.hitTest = function (x, y) {
    if (inRect(x, y, ui.hit.start)) return 'start';
    if (inRect(x, y, ui.hit.retry)) return 'retry';
    if (inRect(x, y, ui.hit.sidebar)) return 'sidebar';
    if (inRect(x, y, ui.hit.rank)) return 'rank';
    return null;
  };

  function button(ctx, rect, text, primary) {
    ctx.save();
    if (primary) {
      var g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      g.addColorStop(0, '#a8f4ff');
      g.addColorStop(0.55, '#33d3ff');
      g.addColorStop(1, '#1aa6e6');
      ctx.fillStyle = g;
      rrPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.fill();
      ctx.fillStyle = '#04121c';
    } else {
      ctx.fillStyle = 'rgba(120,190,255,0.10)';
      rrPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      rrPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.stroke();
      ctx.fillStyle = '#bfe6ff';
    }
    ctx.font = '900 ' + s(17).toFixed(1) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + s(1));
    ctx.restore();
  }

  function panel(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,190,255,0.07)';
    rrPath(ctx, x, y, w, h, s(11));
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,190,255,0.16)';
    rrPath(ctx, x, y, w, h, s(11));
    ctx.stroke();
    ctx.restore();
  }

  /* 好友排行榜（主域把 sharedCanvas 贴进这个面板） */
  ui.drawRankPanel = function (ctx, state, drawShared) {
    var W0 = ui.W, H0 = ui.H;
    var pw = Math.min(W0 * 0.86, s(330));
    var ph = s(190);
    var px = (W0 - pw) / 2;
    var py = H0 * 0.40;
    ui.hit.rank = { x: px, y: py, w: pw, h: ph };

    panel(ctx, px, py, pw, ph);

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#5fe3ff';
    ctx.font = '900 ' + s(15).toFixed(1) + 'px ' + FONT;
    ctx.fillText('好友排行', px + s(12), py + s(24));

    ctx.textAlign = 'right';
    ctx.fillStyle = '#6f88a8';
    ctx.font = 'bold ' + s(10).toFixed(1) + 'px ' + FONT;
    ctx.fillText('最高数字 · 关卡', px + pw - s(12), py + s(24));
    ctx.restore();

    var inner = { x: px + s(8), y: py + s(32), w: pw - s(16), h: ph - s(40) };

    if (state.friendReady && drawShared) {
      drawShared(ctx, inner);
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#6f88a8';
      ctx.font = 'bold ' + s(12).toFixed(1) + 'px ' + FONT;
      ctx.fillText(state.friendError ? '好友数据加载失败' : '正在拉取好友排行…', px + pw / 2, py + ph / 2);
      ctx.restore();
    }
  };

  /* 开始页 */
  ui.drawStart = function (ctx, state, drawShared) {
    var W0 = ui.W, H0 = ui.H;
    var cx = W0 / 2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    var ty = H0 * 0.17;
    var tg = ctx.createLinearGradient(0, ty - s(60), 0, ty + s(30));
    tg.addColorStop(0, '#e9fdff');
    tg.addColorStop(0.45, '#4fe0ff');
    tg.addColorStop(1, '#c46bff');
    ctx.fillStyle = tg;
    ctx.font = '900 ' + s(46).toFixed(1) + 'px ' + FONT;
    ctx.fillText('神也过不了', cx, ty);

    var tg2 = ctx.createLinearGradient(0, ty, 0, ty + s(60));
    tg2.addColorStop(0, '#c46bff');
    tg2.addColorStop(1, '#7a4bff');
    ctx.fillStyle = tg2;
    ctx.fillText('第二关', cx, ty + s(52));

    ctx.fillStyle = '#8fa8cc';
    ctx.font = 'bold ' + s(11).toFixed(1) + 'px ' + FONT;
    ctx.fillText('数字门 · 穿过数字门，把数字滚到最大', cx, ty + s(78));
    ctx.restore();

    ui.drawRankPanel(ctx, state, drawShared);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7f96b8';
    ctx.font = 'bold ' + s(11).toFixed(1) + 'px ' + FONT;
    ctx.fillText('我的最高  ' + fmt(state.bestNum) + ' · ' + state.bestStage + ' 关', cx, ui.hit.start.y - s(20));
    ctx.restore();

    button(ctx, ui.hit.start, '开始挑战', true);

    // 侧边栏复访入口（抖音平台必接能力）
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + s(11).toFixed(1) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(95,227,255,0.88)';
    ctx.fillText('＋ 添加到抖音侧边栏，下次一键开玩', cx, ui.hit.sidebar.y + ui.hit.sidebar.h / 2);
    ctx.restore();
  };

  /* 结算页 */
  ui.drawOver = function (ctx, state) {
    var W0 = ui.W, H0 = ui.H;
    var cx = W0 / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(7,4,18,0.72)';
    ctx.fillRect(0, 0, W0, H0);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff9ab6';
    ctx.font = '900 ' + s(30).toFixed(1) + 'px ' + FONT;
    ctx.fillText(state.overTitle || '门太硬了', cx, H0 * 0.30);

    var bw = Math.min(W0 * 0.86, s(330));
    var bx = (W0 - bw) / 2, by = H0 * 0.36, bh = s(66);
    panel(ctx, bx, by, bw, bh);
    var cols = [
      ['最大数字', fmt(state.runNum)],
      ['通过关卡', String(state.runStage)],
      ['最高纪录', fmt(state.bestNum)]
    ];
    var cw = bw / 3;
    for (var i = 0; i < 3; i++) {
      var ccx = bx + cw * i + cw / 2;
      ctx.fillStyle = '#8fa8cc';
      ctx.font = 'bold ' + s(10).toFixed(1) + 'px ' + FONT;
      ctx.fillText(cols[i][0], ccx, by + s(22));
      ctx.fillStyle = '#eafcff';
      ctx.font = '900 ' + s(20).toFixed(1) + 'px ' + FONT;
      ctx.fillText(cols[i][1], ccx, by + s(50));
    }

    if (state.rankPos) {
      ctx.fillStyle = '#8fa8cc';
      ctx.font = 'bold ' + s(12).toFixed(1) + 'px ' + FONT;
      ctx.fillText('本次成绩 好友榜第 ' + state.rankPos + ' 名', cx, by + bh + s(28));
    }
    ctx.restore();

    button(ctx, ui.hit.retry, '再来一次', true);
  };

  ui.layout();
  return ui;
}

module.exports = { createUI: createUI };
