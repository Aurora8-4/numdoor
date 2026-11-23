/* =========================================================
 * 数字门 · 抖音小程序版
 * Canvas 2D 伪 3D 跑酷：切跑道 → 穿过数字门 → 数字变大 → 冲破 BOSS 门
 * 画布双通道：优先 type="2d" 节点（高清），失败自动降级 createCanvasContext
 * ========================================================= */

var LANE_X = [-1.5, 0, 1.5];
var LANE_W = 1.42;
var PLAYER_Z = 5.4;
var NEAR = 3.2;
var FAR = 48;
var GAP = 6.2;
var BOSS_EVERY = 4;
var LANE_DUR = 0.06;   // 切道动画时长（秒）
var FONT = 'sans-serif';

var COL = {
  '+': { c: '#38e3ff', soft: 'rgba(56,227,255,' },
  '×': { c: '#ffd83d', soft: 'rgba(255,216,61,' },
  '-': { c: '#ff5577', soft: 'rgba(255,85,119,' },
  '÷': { c: '#ff8a3d', soft: 'rgba(255,138,61,' },
  'boss': { c: '#c46bff', soft: 'rgba(196,107,255,' }
};

/* ---------------- 工具 ---------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function fmt(n) {
  n = Math.max(0, Math.round(n));
  if (n < 10000) return String(n);
  var U = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (var i = 0; i < U.length; i++) {
    var v = U[i][0];
    if (n >= v) {
      var q = n / v;
      if (q >= 10000) break;
      var s = q >= 100 ? q.toFixed(0) : q.toFixed(1).replace(/\.0$/, '');
      return s + U[i][1];
    }
  }
  var e = Math.floor(Math.log(n) / Math.LN10);
  var m = n / Math.pow(10, e);
  return m.toFixed(1).replace(/\.0$/, '') + 'e' + e;
}

function rrPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

Page({
  data: {
    phase: 'ready',
    rankList: [],
    rankTip: '',
    rankPos: '',
    dbg: '',
    bestNum: '1',
    sNum: '0',
    sStage: '0',
    sBest: '0',
    overTitle: '门太硬了',
    muted: false
  },

  /* ================= 生命周期 ================= */
  dbg: function (m) {
    this.__dbg = (this.__dbg || []).concat(String(m)).slice(-6);
    try { this.setData({ dbg: this.__dbg.join(' | ') }); } catch (e) {}
  },

  onLoad: function () {
    var info = null;
    try {
      info = (tt.getWindowInfo && tt.getWindowInfo()) || tt.getSystemInfoSync();
    } catch (e) { info = null; }
    this.W = (info && info.windowWidth) || 375;
    this.H = (info && info.windowHeight) || 667;
    this.dpr = Math.min((info && info.pixelRatio) || 2, 2);
    this.safeTop = (info && info.safeArea && info.safeArea.top) || (info && info.statusBarHeight) || 20;
    this.padTop = this.safeTop + 8;

    this.best = { num: 1, stage: 0 };
    try {
      var raw = tt.getStorageSync('numdoor.best');
      if (typeof raw === 'string' && raw) raw = JSON.parse(raw);
      if (raw && typeof raw === 'object') {
        if (typeof raw.num === 'number') this.best.num = raw.num;
        if (typeof raw.stage === 'number') this.best.stage = raw.stage;
      }
    } catch (e) {}
    this.setData({ bestNum: fmt(this.best.num) });
    this.loadRank();

    this.mode = 'ready';
    this.paused = false;
    this.stopped = false;
    this.lastT = 0;
    this.ctx = null;
    this.canvas = null;
    this.legacy = false;

    this.layout();
    this.newGame();
  },

  onReady: function () {
    this.initCanvas();
  },

  onHide: function () {
    this.paused = true;
  },

  onShow: function () {
    this.paused = false;
    this.lastT = 0;
  },

  onUnload: function () {
    this.stopped = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  },

  /* ================= 画布初始化 ================= */
  initCanvas: function () {
    var self = this;
    try {
    this.dbg('init start');
    var q = tt.createSelectorQuery();
    q.select('#game').fields({ node: true, size: true }).exec(function (res) {
      var info = res && res[0];
      self.dbg('node=' + (info && info.node ? 'yes' : 'no'));
      if (info && info.node && info.node.getContext) {
        /* —— 高清通道：Canvas 2D 节点 —— */
        var canvas = info.node;
        self.W = info.width || self.W;
        self.H = info.height || self.H;
        canvas.width = Math.round(self.W * self.dpr);
        canvas.height = Math.round(self.H * self.dpr);
        var ctx = canvas.getContext('2d');
        if (ctx.setTransform) ctx.setTransform(self.dpr, 0, 0, self.dpr, 0, 0);
        else if (ctx.scale) ctx.scale(self.dpr, self.dpr);
        self.canvas = canvas;
        self.ctx = ctx;
        self.legacy = false;
        self.layout();
        self.raf = function (cb) {
          if (canvas.requestAnimationFrame) return canvas.requestAnimationFrame(cb);
          return setTimeout(function () { cb(Date.now()); }, 16);
        };
        self.loop = self.loop.bind(self);
        self.dbg('2d ok ' + Math.round(self.W) + 'x' + Math.round(self.H));
        self.raf(self.loop);
      } else {
        /* —— 兼容通道：老版 CanvasContext —— */
        var oldCtx = tt.createCanvasContext('game');
        self.ctx = oldCtx;
        self.legacy = true;
        self.W = (typeof self.W === 'number' && self.W) || 375;
        self.layout();
        self.loop = self.loop.bind(self);
        var prev = 0;
        self.dbg('legacy');
        self.timer = setInterval(function () {
          if (self.stopped) return;
          var now = Date.now();
          if (!prev) prev = now;
          var dt = (now - prev) / 1000;
          prev = now;
          if (self.paused) { prev = 0; return; }
          if (dt > 0.05) dt = 0.05;
          self.update(dt);
          self.render();
        }, 16);
      }
    });
    } catch (e) {
      this.dbg('ERR ' + (e && e.message ? e.message : e));
    }
  },

  /* ================= 透视 / 布局 ================= */
  layout: function () {
    this.horizon = this.H * 0.30;
    this.unit = Math.min(this.W * 0.34, this.H * 0.62);
    this.gradCache = null;
    this.stars = [];
    var n = Math.round(this.W * this.H / 9000);
    for (var i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.W,
        y: Math.random() * this.horizon * 0.95,
        r: Math.random() * 1.5 + 0.4,
        a: Math.random() * 0.55 + 0.15,
        ph: Math.random() * 6.28
      });
    }
  },

  sc: function (z) { return NEAR / Math.max(z, 0.6); },

  groundY: function (z) {
    var q = (1 / z - 1 / FAR) / (1 / NEAR - 1 / FAR);
    return this.horizon + (this.H * 1.06 - this.horizon) * q;
  },

  projX: function (x, z) { return this.W / 2 + x * this.unit * this.sc(z); },

  /* ================= 游戏状态 ================= */
  newGame: function () {
    this.G = {
      num: 1, maxNum: 1, stage: 1,
      lane: 1, px: LANE_X[1], laneFrom: LANE_X[1], laneT: 1,
      worldZ: 0, speed: 12.5,   // 第一关慢慢来
      gates: [], sinceBoss: 0, target: 12, gentleLeft: 0,
      t: 0, shake: 0, flash: 0, pop: 0,
      particles: [], floaters: []
    };
  },

  start: function () {
    this.newGame();
    for (var i = 0; i < 2; i++) {
      this.G.gates.push(this.makeRow(28 + i * 6.4));
      this.G.sinceBoss++;
    }
    this.G.gentleLeft = 0;   // 硬核模式：开局就上负门
    this.mode = 'play';
    this.lastT = 0;
    this.setData({ phase: 'play' });
    this.buzz('light');
  },

  /* ================= 排行榜 ================= */
  loadRank: function (highlight) {
    var board = [];
    try {
      var raw = tt.getStorageSync('numdoor.board');
      if (typeof raw === 'string' && raw) raw = JSON.parse(raw);
      if (Array.isArray(raw)) board = raw;
    } catch (e) { board = []; }

    board = board.filter(function (it) {
      return it && typeof it.num === 'number' && typeof it.stage === 'number';
    }).sort(function (a, b) {
      if (b.num !== a.num) return b.num - a.num;
      return b.stage - a.stage;
    }).slice(0, 6);

    var list = board.map(function (it, i) {
      var name = (it.name || '我') + '';
      return {
        key: 'r' + i + '_' + it.num + '_' + it.stage,
        name: name,
        initial: name.slice(0, 1),
        numText: fmt(it.num),
        stage: it.stage,
        num: it.num
      };
    });

    var tip = board.length ? ('共 ' + board.length + ' 条记录') : '';
    this.setData({ rankList: list, rankTip: tip });

    if (highlight !== undefined) {
      var pos = -1;
      for (var k = 0; k < board.length; k++) {
        if (board[k].id === highlight) { pos = k + 1; break; }
      }
      this.setData({ rankPos: pos > 0 ? String(pos) : '' });
    }
    return list;
  },

  saveRank: function (num, stage) {
    var board = [];
    try {
      var raw = tt.getStorageSync('numdoor.board');
      if (typeof raw === 'string' && raw) raw = JSON.parse(raw);
      if (Array.isArray(raw)) board = raw;
    } catch (e) { board = []; }

    var id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    board.push({ name: '我', num: Math.round(num), stage: stage, ts: Date.now(), id: id });
    board.sort(function (a, b) {
      if (b.num !== a.num) return b.num - a.num;
      return b.stage - a.stage;
    });
    board = board.slice(0, 10);
    try { tt.setStorageSync('numdoor.board', board); } catch (e) {}
    this.loadRank(id);
  },

  onRankTap: function () {
    try {
      tt.showToast({ title: '好友榜需要小游戏版本，当前显示你的历史成绩', icon: 'none', duration: 2000 });
    } catch (e) {}
  },
  onStartTap: function () {
    if (this.mode === 'play') return;
    this.start();
  },

  setLane: function (l) {
    if (this.mode !== 'play' || !this.G) return;
    l = clamp(l | 0, 0, 2);
    if (l !== this.G.lane) {
      this.G.laneFrom = this.G.px;
      this.G.laneT = 0;
      this.G.lane = l;
      this.buzz('light');
    }
  },

  /* ================= 门 / 运算 ================= */
  spawnGate: function () {
    var need = this.G.stage <= 1 ? 6 : BOSS_EVERY;
    if (this.G.sinceBoss >= need) {
      this.G.gates.push({
        z: FAR, boss: true, target: this.G.target, checked: false,
        doors: [{ lane: 0, op: 'boss' }, { lane: 1, op: 'boss' }, { lane: 2, op: 'boss' }]
      });
      this.G.sinceBoss = 0;
      return;
    }
    var gentle = this.G.gentleLeft > 0;
    if (gentle) this.G.gentleLeft--;
    this.G.gates.push(this.makeRow(FAR, gentle));
    this.G.sinceBoss++;
  },

  makeRow: function (z, gentle) {
    var n = this.G.num;
    var behind = n < this.G.target * 0.45;

    // 一行只有一扇好门，另外两扇是坑
    var good;
    if (!gentle && Math.random() < (behind ? 0.22 : 0.30)) good = { op: '\u00d7', val: 2 };
    else good = { op: '+', val: Math.max(3, Math.round(n * (behind ? 0.30 : 0.24)) + 1) };

    var bad1, bad2;
    if (gentle) {
      bad1 = { op: '+', val: Math.max(2, Math.round(n * 0.12) + 1) };
      bad2 = { op: '+', val: Math.max(2, Math.round(n * 0.10) + 1) };
    } else {
      bad1 = { op: '-', val: Math.max(3, Math.round(n * (behind ? 0.28 : 0.38))) };
      bad2 = (n >= 10 && Math.random() < 0.5)
        ? { op: '\u00f7', val: 2 }
        : { op: '-', val: Math.max(3, Math.round(n * (behind ? 0.20 : 0.26))) };
    }

    var ops = [good, bad1, bad2];
    for (var i = ops.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = ops[i]; ops[i] = ops[j]; ops[j] = tmp;
    }

    var lanes = [0, 1, 2];
    if (!gentle && Math.random() < 0.18) {
      // 空门缝：只丢坏门，保证每行至少一扇能涨的门
      var gi = ops.indexOf(good);
      var cand = [0, 1, 2].filter(function (i) { return i !== gi; });
      var dropIdx = cand[(Math.random() * cand.length) | 0];
      ops.splice(dropIdx, 1);
      lanes.splice(dropIdx, 1);
    }
    var doors = lanes.map(function (l, k) {
      return { lane: l, op: ops[k].op, val: ops[k].val };
    });
    return { z: z, boss: false, doors: doors, checked: false };
  },

  resolve: function (gate) {
    if (gate.boss) {
      if (this.G.num >= gate.target) this.bossWin(gate);
      else this.bossFail(gate);
      return;
    }
    var d = null;
    for (var i = 0; i < gate.doors.length; i++) {
      if (gate.doors[i].lane === this.G.lane) { d = gate.doors[i]; break; }
    }
    if (!d) {
      var pc0 = this.playerCenter();
      this.floatText('空门', pc0.x, pc0.y - pc0.r * 1.95, '#8fa8cc', 0.8);
      return;
    }
    this.applyOp(d);
  },

  applyOp: function (d) {
    var G = this.G;
    var before = G.num;
    var good = true;
    if (d.op === '+') G.num = G.num + d.val;
    else if (d.op === '×') G.num = G.num * d.val;
    else if (d.op === '-') G.num = Math.max(0, G.num - d.val);
    else if (d.op === '÷') G.num = Math.floor(G.num / d.val);

    if (G.num < before) good = false;
    if (G.num > G.maxNum) G.maxNum = G.num;

    var col = COL[d.op] || COL['+'];
    var pc = this.playerCenter();
    var sx = pc.x;
    var sy = pc.y - pc.r * 1.95;
    this.floatText(d.op + d.val, sx, sy, good ? col.c : '#ff5577', good ? 1 : 0.85);
    this.burst(sx, sy, good ? 16 : 11, good ? col.c : '#ff5577', good ? 1 : 0.8);

    if (good) {
      G.shake = Math.min(0.5, G.shake + 0.16);
      G.pop = Math.min(1, G.pop + 0.9);
      this.buzz('light');
    } else {
      G.shake = Math.min(1, G.shake + 0.55);
      G.pop = Math.min(1, G.pop + 0.5);
      this.buzz('heavy');
    }
  },

  bossWin: function () {
    var G = this.G;
    G.stage++;
    G.sinceBoss = 0;
    var mult = G.stage === 2 ? 2.75 : 2.15;   // 第二关是新人墙
    G.target = Math.ceil(Math.max(12, G.num * mult));
    G.speed = G.stage <= 1 ? 12.5 : Math.min(26, 20.5 + (G.stage - 2) * 1.0);   // 第二关直接拉起来
    G.flash = 0.85;
    G.shake = 1.1;
    var pcw = this.playerCenter();
    var cx = pcw.x, cy = pcw.y - pcw.r * 1.95;
    this.floatText('第 ' + (G.stage - 1) + ' 关 通过', cx, cy, '#7dffb0', 1.4);
    this.burst(cx, cy, 54, '#7dffb0', 1.5);
    this.buzz('heavy');
  },

  bossFail: function (gate) {
    var G = this.G;
    G.shake = 1.5;
    G.flash = 0.5;
    G.pop = 1;
    var pcf = this.playerCenter();
    var cx = pcf.x, cy = pcf.y - pcf.r * 1.9;
    this.floatText('需要 ' + fmt(gate.target), cx, cy, '#ff5577', 1.3);
    this.burst(cx, cy, 34, '#ff5577', 1.2);
    this.buzz('heavy');
    this.gameOver();
  },

  gameOver: function () {
    if (this.mode === 'over') return;
    var G = this.G;
    this.mode = 'over';
    var passed = G.stage - 1;
    if (G.num > this.best.num) this.best.num = G.num;
    if (passed > this.best.stage) this.best.stage = passed;
    try { tt.setStorageSync('numdoor.best', { num: this.best.num, stage: this.best.stage }); } catch (e) {}

    this.saveRank(G.maxNum, passed);

    var self = this;
    this.setData({
      sNum: fmt(G.maxNum),
      sStage: String(passed),
      sBest: fmt(this.best.num),
      overTitle: passed >= 6 ? '差一点点！' : '门太硬了'
    });
    setTimeout(function () {
      if (self.mode === 'over') self.setData({ phase: 'over' });
    }, 700);
  },

  /* ================= 特效 ================= */
  burst: function (x, y, n, color, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (60 + Math.random() * 300) * (power || 1);
      this.G.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        life: 0.45 + Math.random() * 0.5,
        size: 1.6 + Math.random() * 3.4,
        color: color
      });
    }
  },

  floatText: function (text, x, y, color, size) {
    this.G.floaters.push({ text: text, x: x, y: y, color: color, life: 1, size: size || 1 });
  },

  playerCenter: function () {
    var R = 0.56 * this.unit * this.sc(PLAYER_Z);
    var bob = Math.sin(this.G.t * 11) * R * 0.09;
    return { x: this.projX(this.G.px, PLAYER_Z), y: this.groundY(PLAYER_Z) - R * 1.06 + bob, r: R };
  },

  /* ================= 更新 ================= */
  updateLane: function (dt) {
    var G = this.G;
    if (G.laneT < 1) G.laneT = Math.min(1, G.laneT + dt / LANE_DUR);
    var e = 1 - Math.pow(1 - G.laneT, 3);
    G.px = G.laneFrom + (LANE_X[G.lane] - G.laneFrom) * e;
  },

  update: function (dt) {
    var G = this.G;
    if (!G) return;

    if (this.mode === 'ready') {
      G.worldZ += 3.2 * dt;
      G.t += dt;
      this.updateLane(dt);
    } else if (this.mode === 'play') {
      G.t += dt;
      G.worldZ += G.speed * dt;
      this.updateLane(dt);

      for (var i = 0; i < G.gates.length; i++) {
        var gate = G.gates[i];
        var prevZ = gate.z;
        gate.z -= G.speed * dt;
        if (!gate.checked && prevZ > PLAYER_Z && gate.z <= PLAYER_Z) {
          gate.checked = true;
          this.resolve(gate);
          if (this.mode !== 'play') break;
        }
      }
      if (this.mode === 'play') {
        G.gates = G.gates.filter(function (g) { return g.z > NEAR + 1.0; });
        var last = G.gates[G.gates.length - 1];
        if (!last || last.z < FAR - GAP) this.spawnGate();
      }
    }

    G.shake = Math.max(0, G.shake - dt * 2.4);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.pop = Math.max(0, G.pop - dt * 5.2);

    for (var p = G.particles.length - 1; p >= 0; p--) {
      var pt = G.particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 780 * dt;
      pt.vx *= 0.985;
      pt.life -= dt;
      if (pt.life <= 0) G.particles.splice(p, 1);
    }
    for (var f = G.floaters.length - 1; f >= 0; f--) {
      var ft = G.floaters[f];
      ft.y -= 74 * dt;
      ft.life -= dt * 0.95;
      if (ft.life <= 0) G.floaters.splice(f, 1);
    }
  },

  loop: function (t) {
    if (!this.__f0) { this.__f0 = 1; this.dbg('frame0'); }
    if (this.stopped) return;
    if (this.paused) { this.lastT = 0; this.raf(this.loop); return; }
    if (!this.lastT) this.lastT = t;
    var dt = (t - this.lastT) / 1000;
    this.lastT = t;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    this.update(dt);
    this.render();
    this.raf(this.loop);
  },

  /* ================= 绘制 ================= */
  render: function () {
    var ctx = this.ctx;
    if (!ctx) return;
    var W = this.W, H = this.H, G = this.G;
    ctx.clearRect(0, 0, W, H);

    var shake = G ? G.shake : 0;
    ctx.save();
    if (shake > 0.01) {
      ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
    }

    this.drawBackground();
    this.drawRoad();
    this.drawStripes();

    if (G) {
      var i;
      for (i = G.gates.length - 1; i >= 0; i--) {
        if (G.gates[i].z > PLAYER_Z) this.drawGate(G.gates[i]);
      }
      this.drawPlayer();
      for (i = G.gates.length - 1; i >= 0; i--) {
        if (G.gates[i].z <= PLAYER_Z) this.drawGate(G.gates[i]);
      }
      this.drawEffects();
    }
    ctx.restore();

    if (G) this.drawHUD();

    if (G && G.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.45).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (this.legacy && ctx.draw) ctx.draw();
  },

  /* 渐变对象缓存：静态渐变只在布局变化时重建，减少每帧分配 */
  ensureGradients: function () {
    if (this.legacy) return this.buildGradients();
    if (!this.gradCache) this.gradCache = this.buildGradients();
    return this.gradCache;
  },

  buildGradients: function () {
    var ctx = this.ctx;
    if (!ctx) return null;
    var W = this.W, H = this.H, horizon = this.horizon;
    var out = {};
    var cx = W / 2, cy = horizon - 2, R = Math.min(W * 0.30, H * 0.25);

    var sky = ctx.createLinearGradient(0, 0, 0, horizon + 2);
    sky.addColorStop(0, '#070417');
    sky.addColorStop(0.5, '#1b0a3a');
    sky.addColorStop(1, '#4a1166');
    out.sky = sky;

    var sunGlow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.55);
    sunGlow.addColorStop(0, 'rgba(255,150,230,0.42)');
    sunGlow.addColorStop(0.5, 'rgba(190,60,220,0.16)');
    sunGlow.addColorStop(1, 'rgba(190,60,220,0)');
    out.sunGlow = sunGlow;

    var sun = ctx.createLinearGradient(0, cy - R * 0.6, 0, cy + R * 0.2);
    sun.addColorStop(0, '#ffe9a8');
    sun.addColorStop(0.5, '#ff7ad0');
    sun.addColorStop(1, '#7a1fb0');
    out.sun = sun;

    var hl = ctx.createLinearGradient(0, horizon - 3, 0, horizon + 5);
    hl.addColorStop(0, 'rgba(255,120,230,0)');
    hl.addColorStop(0.5, 'rgba(255,140,240,0.85)');
    hl.addColorStop(1, 'rgba(120,40,180,0)');
    out.horizon = hl;

    var gnd = ctx.createLinearGradient(0, horizon, 0, H);
    gnd.addColorStop(0, '#1a0a30');
    gnd.addColorStop(0.45, '#0c0518');
    gnd.addColorStop(1, '#05030c');
    out.ground = gnd;

    var yN = this.groundY(NEAR), yF = this.groundY(FAR);
    var road = ctx.createLinearGradient(0, yF, 0, yN);
    road.addColorStop(0, '#22103f');
    road.addColorStop(0.35, '#150a29');
    road.addColorStop(1, '#0a0417');
    out.road = road;

    out.sunX = cx;
    out.sunY = cy;
    out.sunR = R;
    return out;
  },

  drawBackground: function () {
    var ctx = this.ctx, W = this.W, H = this.H, horizon = this.horizon;
    var gr = this.ensureGradients();

    ctx.fillStyle = gr.sky;
    ctx.fillRect(0, 0, W, horizon + 2);

    ctx.fillStyle = gr.sunGlow;
    ctx.beginPath();
    ctx.arc(gr.sunX, gr.sunY, gr.sunR * 1.55, 0, 6.284);
    ctx.fill();

    ctx.fillStyle = gr.sun;
    ctx.beginPath();
    ctx.arc(gr.sunX, gr.sunY, gr.sunR * 0.58, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    var t = this.G ? this.G.t : 0;
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      var tw = 0.65 + 0.35 * Math.sin(t * 2 + s.ph);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = '#dff4ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = gr.horizon;
    ctx.fillRect(0, horizon - 3, W, 8);

    ctx.fillStyle = gr.ground;
    ctx.fillRect(0, horizon, W, H - horizon);
  },

  drawRoad: function () {
    var ctx = this.ctx;
    var yN = this.groundY(NEAR), yF = this.groundY(FAR);
    var lN = this.projX(-2.5, NEAR), rN = this.projX(2.5, NEAR);
    var lF = this.projX(-2.5, FAR), rF = this.projX(2.5, FAR);

    ctx.beginPath();
    ctx.moveTo(lN, yN); ctx.lineTo(lF, yF); ctx.lineTo(rF, yF); ctx.lineTo(rN, yN);
    ctx.closePath();
    ctx.fillStyle = this.ensureGradients().road;
    ctx.fill();

    var edges = [[lN, yN, lF, yF], [rN, yN, rF, yF]];
    for (var i = 0; i < 2; i++) {
      var e = edges[i];
      ctx.beginPath();
      ctx.moveTo(e[0], e[1]);
      ctx.lineTo(e[2], e[3]);
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(80,220,255,0.09)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(120,235,255,0.72)';
      ctx.stroke();
    }
  },

  drawStripes: function () {
    var ctx = this.ctx;
    var P = 6, HALF = 2.7;
    var off = (this.G ? this.G.worldZ : 0) % P;
    ctx.fillStyle = 'rgba(120,225,255,0.17)';
    for (var k = 0; k < 14; k++) {
      var z1 = NEAR + k * P - off;
      var z2 = z1 + HALF;
      if (z2 <= NEAR + 0.2 || z1 >= FAR) continue;
      z1 = Math.max(z1, NEAR + 0.2);
      z2 = Math.min(z2, FAR);
      if (z2 <= z1) continue;
      var y1 = this.groundY(z1), y2 = this.groundY(z2);
      for (var li = 0; li < 2; li++) {
        var lx = li === 0 ? -0.76 : 0.76;
        var a = this.projX(lx, z1), b = this.projX(lx, z2);
        var w1 = 0.075 * this.unit * this.sc(z1), w2 = 0.075 * this.unit * this.sc(z2);
        ctx.beginPath();
        ctx.moveTo(a - w1, y1); ctx.lineTo(a + w1, y1);
        ctx.lineTo(b + w2, y2); ctx.lineTo(b - w2, y2);
        ctx.closePath();
        ctx.fill();
      }
    }
  },

  drawGate: function (gate) {
    var ctx = this.ctx, G = this.G;
    var z = gate.z;
    if (z < NEAR + 0.9) return;
    var s = this.sc(z), gy = this.groundY(z);
    var alpha = 1;
    if (z < PLAYER_Z) alpha = clamp((z - (NEAR + 0.9)) / (PLAYER_Z - (NEAR + 0.9)), 0, 1);
    else if (z < PLAYER_Z + 2.8) alpha = 0.26 + 0.74 * (z - PLAYER_Z) / 2.8;
    if (alpha <= 0.03) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (var i = 0; i < gate.doors.length; i++) {
      var d = gate.doors[i];
      var cx = this.projX(LANE_X[d.lane], z);
      var hw = (LANE_W / 2) * this.unit * s;
      var hh = (gate.boss ? 2.6 : 1.95) * this.unit * s;
      var x = cx - hw, y = gy - hh, w = hw * 2, h = hh;

      var key = gate.boss ? 'boss' : d.op;
      var col = COL[key] || COL['+'];
      var ok = gate.boss && G.num >= gate.target;
      var c1 = ok ? '#7dffb0' : col.c;
      var soft = ok ? 'rgba(125,255,176,' : col.soft;

      ctx.lineWidth = Math.max(2, hw * 0.28);
      ctx.strokeStyle = soft + '0.13)';
      rrPath(ctx, x, y, w, h, hw * 0.34);
      ctx.stroke();

      var fg = ctx.createLinearGradient(0, y, 0, y + h);
      fg.addColorStop(0, soft + '0.34)');
      fg.addColorStop(0.62, soft + '0.16)');
      fg.addColorStop(1, soft + '0.03)');
      ctx.fillStyle = fg;
      rrPath(ctx, x, y, w, h, hw * 0.34);
      ctx.fill();

      ctx.lineWidth = Math.max(1.4, hw * 0.10);
      ctx.strokeStyle = soft + '0.92)';
      rrPath(ctx, x, y, w, h, hw * 0.34);
      ctx.stroke();

      ctx.lineWidth = Math.max(1, hw * 0.05);
      ctx.strokeStyle = soft + '0.30)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.16, y + h * 0.14);
      ctx.lineTo(x + w * 0.84, y + h * 0.14);
      ctx.stroke();

      ctx.fillStyle = soft + '0.85)';
      rrPath(ctx, x + w * 0.10, y - h * 0.055, w * 0.80, Math.max(2, h * 0.05), h * 0.03);
      ctx.fill();

      var label;
      if (gate.boss) label = '≥' + fmt(gate.target);
      else label = d.op + d.val;

      var fs = h * 0.40;
      ctx.font = 'bold ' + fs.toFixed(1) + 'px ' + FONT;
      var guard = 0;
      while (ctx.measureText(label).width > w * 0.80 && fs > 7 && guard < 12) {
        fs *= 0.92;
        guard++;
        ctx.font = 'bold ' + fs.toFixed(1) + 'px ' + FONT;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(label, cx, y + h * 0.53 + Math.max(1, fs * 0.06));
      ctx.fillStyle = c1;
      ctx.fillText(label, cx, y + h * 0.52);

      if (gate.boss) {
        var tagFs = Math.max(7, h * 0.11);
        ctx.font = 'bold ' + tagFs.toFixed(1) + 'px ' + FONT;
        ctx.fillStyle = soft + '0.95)';
        ctx.fillText(ok ? '✓ 可击破' : 'BOSS', cx, y + h * 0.86);
      }
    }
    ctx.restore();
  },

  drawPlayer: function () {
    var ctx = this.ctx, G = this.G;
    var pc = this.playerCenter();
    var gy = this.groundY(PLAYER_Z);
    var cx = pc.x, cy = pc.y, R = pc.r * (1 + 0.18 * G.pop);

    /* 影子 */
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#000';
    ctx.translate(cx, gy + R * 0.06);
    ctx.scale(1, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.86, 0, 6.284);
    ctx.fill();
    ctx.restore();

    /* 光晕 */
    var gr = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2);
    gr.addColorStop(0, 'rgba(110,240,255,0.30)');
    gr.addColorStop(1, 'rgba(110,240,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2, 0, 6.284);
    ctx.fill();

    /* 球体 */
    var stretch = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, G.laneT));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(stretch, 2 - stretch);
    var bg = ctx.createRadialGradient(-R * 0.34, -R * 0.44, R * 0.08, 0, 0, R * 1.18);
    bg.addColorStop(0, '#e8feff');
    bg.addColorStop(0.42, '#45d9ff');
    bg.addColorStop(1, '#1358c8');
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 6.284);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = Math.max(1.6, R * 0.085);
    ctx.strokeStyle = 'rgba(225,255,255,0.9)';
    ctx.stroke();

    /* 数字 */
    var txt = fmt(G.num);
    var nf = R * 0.95;
    ctx.font = 'bold ' + nf.toFixed(1) + 'px ' + FONT;
    var guard = 0;
    while (ctx.measureText(txt).width > R * 1.55 && nf > 6 && guard < 14) {
      nf *= 0.9;
      guard++;
      ctx.font = 'bold ' + nf.toFixed(1) + 'px ' + FONT;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#03202e';
    ctx.fillText(txt, 0, R * 0.05);
    ctx.restore();
  },

  drawEffects: function () {
    var ctx = this.ctx, G = this.G;
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = clamp(p.life * 1.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, 6.284);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var f = 0; f < G.floaters.length; f++) {
      var t = G.floaters[f];
      var la = clamp(t.life, 0, 1);
      ctx.globalAlpha = la;
      var fs = 22 * t.size * (0.7 + la * 0.5);
      ctx.font = 'bold ' + fs.toFixed(1) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  },

  drawChip: function (x, y, w, h) {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(14,9,30,0.62)';
    rrPath(ctx, x, y, w, h, 13);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,200,255,0.16)';
    rrPath(ctx, x, y, w, h, 13);
    ctx.stroke();
  },

  drawHUD: function () {
    var ctx = this.ctx, G = this.G;
    var pad = 12;
    var top = this.padTop;
    var big = Math.min(this.W, this.H) < 420;
    var cw = Math.min(148, this.W * 0.44);
    var chh = big ? 54 : 62;

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    this.drawChip(pad, top, cw, chh);
    ctx.textAlign = 'left';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(160,215,255,0.62)';
    ctx.fillText('当前数字', pad + 12, top + (big ? 17 : 19));
    ctx.font = 'bold ' + (big ? 24 : 28) + 'px ' + FONT;
    ctx.fillStyle = '#eafcff';
    ctx.fillText(fmt(G.num), pad + 12, top + chh - (big ? 12 : 14));

    var rx = this.W - pad - cw;
    this.drawChip(rx, top, cw, chh);
    ctx.textAlign = 'right';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(160,215,255,0.62)';
    ctx.fillText('目标 ≥', rx + cw - 12, top + (big ? 17 : 19));
    ctx.font = 'bold ' + (big ? 24 : 28) + 'px ' + FONT;
    ctx.fillStyle = G.num >= G.target ? '#7dffb0' : '#ffb347';
    ctx.fillText(fmt(G.target), rx + cw - 12, top + chh - (big ? 12 : 14));

    var bx = pad, by = top + chh + 7, bw = this.W - pad * 2, bh = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rrPath(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    var ratio = clamp(G.num / Math.max(1, G.target), 0, 1);
    var pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    pg.addColorStop(0, '#38e3ff');
    pg.addColorStop(1, ratio >= 1 ? '#7dffb0' : '#ffd83d');
    ctx.fillStyle = pg;
    rrPath(ctx, bx, by, Math.max(bh, bw * ratio), bh, bh / 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(200,220,255,0.72)';
    ctx.fillText('第 ' + G.stage + ' 关', this.W / 2, top + (big ? 15 : 16));

    ctx.textAlign = 'left';
    ctx.font = 'bold 11px ' + FONT;
    ctx.fillStyle = 'rgba(140,170,205,0.6)';
    ctx.fillText('最高 ' + fmt(this.best.num), pad, this.H - pad - 6);

    ctx.restore();
  },

  /* ================= 交互 ================= */
  onTouchStart: function (e) {
    if (this.mode !== 'play' || !this.G) return;
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    var x = (typeof t.clientX === 'number') ? t.clientX : (typeof t.x === 'number' ? t.x : 0);
    this.anchorX = x;
    this.downX = x;
    this.downT = Date.now();
    this.swipeDone = false;          // 一次手势只允许切一格
  },

  onTouchMove: function (e) {
    if (this.mode !== 'play' || !this.G) return;
    if (this.swipeDone) return;
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    var x = (typeof t.clientX === 'number') ? t.clientX : (typeof t.x === 'number' ? t.x : 0);
    if (typeof this.anchorX !== 'number') { this.anchorX = x; return; }
    var dx = x - this.anchorX;
    if (Math.abs(dx) >= 16) {        // 只切一格，连拖也不会连跳
      this.setLane(this.G.lane + (dx > 0 ? 1 : -1));
      this.swipeDone = true;
    }
  },

  onTouchEnd: function (e) {
    if (this.mode !== 'play' || !this.G || this.swipeDone) return;
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (!t) return;
    var x = (typeof t.clientX === 'number') ? t.clientX : (typeof t.x === 'number' ? t.x : 0);
    // 没滑动 = 轻点，按区域直接跳到对应跑道
    if (Date.now() - (this.downT || 0) < 320 && Math.abs(x - (this.downX || 0)) < 12) {
      var ratio = x / Math.max(1, this.W);
      this.setLane(ratio < 0.36 ? 0 : ratio > 0.64 ? 2 : 1);
    }
  },

  toggleSound: function () {
    var m = !this.data.muted;
    this.setData({ muted: m });
    if (!m) this.buzz('light');
  },

  buzz: function (type) {
    if (this.data.muted) return;
    try {
      if (tt.vibrateShort) tt.vibrateShort({ type: type || 'light' });
      else if (tt.vibrateLong && type === 'heavy') tt.vibrateLong();
    } catch (e) {}
  }
});
