/* =========================================================
 * 数字门 · 小游戏核心（纯 Canvas，无 DOM 依赖）
 * 透视：scale = NEAR / z，地面 Y 与 1/z 线性映射
 * ========================================================= */

var LANE_X = [-1.5, 0, 1.5];
var LANE_W = 1.42;
var PLAYER_Z = 5.4;
var NEAR = 3.2;
var FAR = 48;
var GAP = 6.2;
var BOSS_EVERY = 4;
var LANE_DUR = 0.06;
var FONT = 'sans-serif';

var COL = {
  '+': { c: '#38e3ff', soft: 'rgba(56,227,255,' },
  '×': { c: '#ffd83d', soft: 'rgba(255,216,61,' },
  '-': { c: '#ff5577', soft: 'rgba(255,85,119,' },
  '÷': { c: '#ff8a3d', soft: 'rgba(255,138,61,' },
  'boss': { c: '#c46bff', soft: 'rgba(196,107,255,' }
};

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

/* ---------- 一局世界 ---------- */
function createWorld(W, H) {
  var w = {
    W: W, H: H,
    horizon: 0, unit: 0, stars: [],
    G: null,
    gradCache: null
  };

  w.layout = function () {
    w.horizon = w.H * 0.30;
    w.unit = Math.min(w.W * 0.34, w.H * 0.62);
    w.gradCache = null;
    w.stars = [];
    var n = Math.round(w.W * w.H / 9000);
    for (var i = 0; i < n; i++) {
      w.stars.push({
        x: Math.random() * w.W,
        y: Math.random() * w.horizon * 0.95,
        r: Math.random() * 1.5 + 0.4,
        a: Math.random() * 0.55 + 0.15,
        ph: Math.random() * 6.28
      });
    }
  };

  w.sc = function (z) { return NEAR / Math.max(z, 0.6); };
  w.groundY = function (z) {
    var q = (1 / z - 1 / FAR) / (1 / NEAR - 1 / FAR);
    return w.horizon + (w.H * 1.06 - w.horizon) * q;
  };
  w.projX = function (x, z) { return w.W / 2 + x * w.unit * w.sc(z); };

  w.newGame = function () {
    w.G = {
      num: 1, maxNum: 1, stage: 1,
      lane: 1, px: LANE_X[1], laneFrom: LANE_X[1], laneT: 1,
      worldZ: 0, speed: 12.5,
      gates: [], sinceBoss: 0, target: 12, gentleLeft: 0,
      t: 0, shake: 0, flash: 0, pop: 0,
      particles: [], floaters: [],
      over: false
    };
  };

  w.startRun = function () {
    w.newGame();
    for (var i = 0; i < 2; i++) {
      w.G.gates.push(w.makeRow(28 + i * 6.4, true));
      w.G.sinceBoss++;
    }
    return w.G;
  };

  w.setLane = function (l) {
    var G = w.G;
    if (!G) return false;
    l = clamp(l | 0, 0, 2);
    if (l === G.lane) return false;
    G.laneFrom = G.px;
    G.laneT = 0;
    G.lane = l;
    return true;
  };

  w.updateLane = function (dt) {
    var G = w.G;
    if (G.laneT < 1) G.laneT = Math.min(1, G.laneT + dt / LANE_DUR);
    var e = 1 - Math.pow(1 - G.laneT, 3);
    G.px = G.laneFrom + (LANE_X[G.lane] - G.laneFrom) * e;
  };

  w.spawnGate = function () {
    var G = w.G;
    var need = G.stage <= 1 ? 6 : BOSS_EVERY;
    if (G.sinceBoss >= need) {
      G.gates.push({
        z: FAR, boss: true, target: G.target, checked: false,
        doors: [{ lane: 0, op: 'boss' }, { lane: 1, op: 'boss' }, { lane: 2, op: 'boss' }]
      });
      G.sinceBoss = 0;
      return;
    }
    var gentle = G.gentleLeft > 0;
    if (gentle) G.gentleLeft--;
    G.gates.push(w.makeRow(FAR, gentle));
    G.sinceBoss++;
  };

  w.makeRow = function (z, gentle) {
    var G = w.G;
    var n = G.num;
    var behind = n < G.target * 0.45;

    var good;
    if (!gentle && Math.random() < (behind ? 0.22 : 0.30)) good = { op: '×', val: 2 };
    else good = { op: '+', val: Math.max(3, Math.round(n * (behind ? 0.30 : 0.24)) + 1) };

    var bad1, bad2;
    if (gentle) {
      bad1 = { op: '+', val: Math.max(2, Math.round(n * 0.12) + 1) };
      bad2 = { op: '+', val: Math.max(2, Math.round(n * 0.10) + 1) };
    } else {
      bad1 = { op: '-', val: Math.max(3, Math.round(n * (behind ? 0.28 : 0.38))) };
      bad2 = (n >= 10 && Math.random() < 0.5)
        ? { op: '÷', val: 2 }
        : { op: '-', val: Math.max(3, Math.round(n * (behind ? 0.20 : 0.26))) };
    }

    var ops = [good, bad1, bad2];
    for (var i = ops.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var tmp = ops[i]; ops[i] = ops[j]; ops[j] = tmp;
    }

    var lanes = [0, 1, 2];
    if (!gentle && Math.random() < 0.18) {
      var gi = ops.indexOf(good);
      var cand = [0, 1, 2].filter(function (k) { return k !== gi; });
      var dropIdx = cand[(Math.random() * cand.length) | 0];
      ops.splice(dropIdx, 1);
      lanes.splice(dropIdx, 1);
    }
    var doors = lanes.map(function (l, k) {
      return { lane: l, op: ops[k].op, val: ops[k].val };
    });
    return { z: z, boss: false, doors: doors, checked: false };
  };

  w.resolve = function (gate) {
    var G = w.G;
    if (gate.boss) {
      if (G.num >= gate.target) w.bossWin();
      else { w.bossFail(gate); return 'dead'; }
      return 'boss';
    }
    var d = null;
    for (var i = 0; i < gate.doors.length; i++) {
      if (gate.doors[i].lane === G.lane) { d = gate.doors[i]; break; }
    }
    if (!d) {
      var pc0 = w.playerCenter();
      w.floatText('空门', pc0.x, pc0.y - pc0.r * 1.95, '#8fa8cc', 0.8);
      return 'gap';
    }
    w.applyOp(d);
    return 'door';
  };

  w.applyOp = function (d) {
    var G = w.G;
    var before = G.num;
    if (d.op === '+') G.num = G.num + d.val;
    else if (d.op === '×') G.num = G.num * d.val;
    else if (d.op === '-') G.num = Math.max(0, G.num - d.val);
    else if (d.op === '÷') G.num = Math.floor(G.num / d.val);
    var good = G.num >= before;
    if (G.num > G.maxNum) G.maxNum = G.num;

    var col = COL[d.op] || COL['+'];
    var pc = w.playerCenter();
    w.floatText(d.op + d.val, pc.x, pc.y - pc.r * 1.95, good ? col.c : '#ff5577', good ? 1 : 0.85);
    w.burst(pc.x, pc.y - pc.r * 1.95, good ? 16 : 11, good ? col.c : '#ff5577', good ? 1 : 0.8);
    if (good) { G.shake = Math.min(0.5, G.shake + 0.16); G.pop = Math.min(1, G.pop + 0.9); }
    else { G.shake = Math.min(1, G.shake + 0.55); G.pop = Math.min(1, G.pop + 0.5); }
    return good;
  };

  w.bossWin = function () {
    var G = w.G;
    G.stage++;
    G.sinceBoss = 0;
    var mult = G.stage === 2 ? 2.75 : 2.15;
    G.target = Math.ceil(Math.max(12, G.num * mult));
    G.speed = G.stage <= 1 ? 12.5 : Math.min(26, 20.5 + (G.stage - 2) * 1.0);
    G.flash = 0.85;
    G.shake = 1.1;
    var pc = w.playerCenter();
    w.floatText('第 ' + (G.stage - 1) + ' 关 通过', pc.x, pc.y - pc.r * 1.95, '#7dffb0', 1.4);
    w.burst(pc.x, pc.y - pc.r * 1.95, 54, '#7dffb0', 1.5);
  };

  w.bossFail = function (gate) {
    var G = w.G;
    G.shake = 1.5;
    G.flash = 0.5;
    G.pop = 1;
    var pc = w.playerCenter();
    w.floatText('需要 ' + fmt(gate.target), pc.x, pc.y - pc.r * 1.9, '#ff5577', 1.3);
    w.burst(pc.x, pc.y - pc.r * 1.9, 34, '#ff5577', 1.2);
    G.over = true;
  };

  w.burst = function (x, y, n, color, power) {
    var G = w.G;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (60 + Math.random() * 300) * (power || 1);
      G.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        life: 0.45 + Math.random() * 0.5,
        size: 1.6 + Math.random() * 3.4, color: color
      });
    }
  };

  w.floatText = function (text, x, y, color, size) {
    w.G.floaters.push({ text: text, x: x, y: y, color: color, life: 1, size: size || 1 });
  };

  w.playerCenter = function () {
    var G = w.G;
    var R = 0.56 * w.unit * w.sc(PLAYER_Z);
    var bob = Math.sin(G.t * 11) * R * 0.09;
    return { x: w.projX(G.px, PLAYER_Z), y: w.groundY(PLAYER_Z) - R * 1.06 + bob, r: R };
  };

  w.update = function (dt, playing) {
    var G = w.G;
    if (!G) return;
    G.t += dt;
    if (playing) {
      G.worldZ += G.speed * dt;
      w.updateLane(dt);
      for (var i = 0; i < G.gates.length; i++) {
        var gate = G.gates[i];
        var prevZ = gate.z;
        gate.z -= G.speed * dt;
        if (!gate.checked && prevZ > PLAYER_Z && gate.z <= PLAYER_Z) {
          gate.checked = true;
          w.resolve(gate);
          if (G.over) break;
        }
      }
      if (!G.over) {
        G.gates = G.gates.filter(function (g) { return g.z > NEAR + 1.0; });
        var last = G.gates[G.gates.length - 1];
        if (!last || last.z < FAR - GAP) w.spawnGate();
      }
    } else {
      G.worldZ += 6.0 * dt;
      w.updateLane(dt);
    }

    G.shake = Math.max(0, G.shake - dt * 2.4);
    G.flash = Math.max(0, G.flash - dt * 2.2);
    G.pop = Math.max(0, G.pop - dt * 5.2);

    for (var p = G.particles.length - 1; p >= 0; p--) {
      var pt = G.particles[p];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vy += 780 * dt; pt.vx *= 0.985;
      pt.life -= dt;
      if (pt.life <= 0) G.particles.splice(p, 1);
    }
    for (var f = G.floaters.length - 1; f >= 0; f--) {
      var ft = G.floaters[f];
      ft.y -= 74 * dt;
      ft.life -= dt * 0.95;
      if (ft.life <= 0) G.floaters.splice(f, 1);
    }
  };

  /* ---------- 绘制 ---------- */
  w.gradients = function (ctx) {
    if (w.gradCache) return w.gradCache;
    var W = w.W, H = w.H, hz = w.horizon;
    var cx = W / 2, cy = hz - 2, R = Math.min(W * 0.30, H * 0.25);
    var o = {};

    var sky = ctx.createLinearGradient(0, 0, 0, hz + 2);
    sky.addColorStop(0, '#070417'); sky.addColorStop(0.5, '#1b0a3a'); sky.addColorStop(1, '#4a1166');
    o.sky = sky;

    var sunGlow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.55);
    sunGlow.addColorStop(0, 'rgba(255,150,230,0.42)');
    sunGlow.addColorStop(0.5, 'rgba(190,60,220,0.16)');
    sunGlow.addColorStop(1, 'rgba(190,60,220,0)');
    o.sunGlow = sunGlow;

    var sun = ctx.createLinearGradient(0, cy - R * 0.6, 0, cy + R * 0.2);
    sun.addColorStop(0, '#ffe9a8'); sun.addColorStop(0.5, '#ff7ad0'); sun.addColorStop(1, '#7a1fb0');
    o.sun = sun;

    var hl = ctx.createLinearGradient(0, hz - 3, 0, hz + 5);
    hl.addColorStop(0, 'rgba(255,120,230,0)');
    hl.addColorStop(0.5, 'rgba(255,140,240,0.85)');
    hl.addColorStop(1, 'rgba(120,40,180,0)');
    o.horizon = hl;

    var gnd = ctx.createLinearGradient(0, hz, 0, H);
    gnd.addColorStop(0, '#1a0a30'); gnd.addColorStop(0.45, '#0c0518'); gnd.addColorStop(1, '#05030c');
    o.ground = gnd;

    var yN = w.groundY(NEAR), yF = w.groundY(FAR);
    var road = ctx.createLinearGradient(0, yF, 0, yN);
    road.addColorStop(0, '#22103f'); road.addColorStop(0.35, '#150a29'); road.addColorStop(1, '#0a0417');
    o.road = road;

    o.sunX = cx; o.sunY = cy; o.sunR = R;
    w.gradCache = o;
    return o;
  };

  w.render = function (ctx) {
    var G = w.G, W = w.W, H = w.H;
    ctx.save();
    var sh = G ? G.shake : 0;
    if (sh > 0.01) {
      ctx.translate((Math.random() - 0.5) * sh * 16, (Math.random() - 0.5) * sh * 16);
    }
    w.drawBackground(ctx);
    w.drawRoad(ctx);
    w.drawStripes(ctx);
    if (G) {
      var i;
      for (i = G.gates.length - 1; i >= 0; i--) if (G.gates[i].z > PLAYER_Z) w.drawGate(ctx, G.gates[i]);
      w.drawPlayer(ctx);
      for (i = G.gates.length - 1; i >= 0; i--) if (G.gates[i].z <= PLAYER_Z) w.drawGate(ctx, G.gates[i]);
      w.drawEffects(ctx);
    }
    ctx.restore();
    if (G && w.showHUD !== false) w.drawHUD(ctx);
    if (G && G.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (G.flash * 0.45).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  w.drawBackground = function (ctx) {
    var W = w.W, H = w.H, hz = w.horizon;
    var gr = w.gradients(ctx);
    ctx.fillStyle = gr.sky; ctx.fillRect(0, 0, W, hz + 2);
    ctx.fillStyle = gr.sunGlow;
    ctx.beginPath(); ctx.arc(gr.sunX, gr.sunY, gr.sunR * 1.55, 0, 6.284); ctx.fill();
    ctx.fillStyle = gr.sun;
    ctx.beginPath(); ctx.arc(gr.sunX, gr.sunY, gr.sunR * 0.58, Math.PI, 0); ctx.closePath(); ctx.fill();

    var t = w.G ? w.G.t : 0;
    for (var i = 0; i < w.stars.length; i++) {
      var s = w.stars[i];
      ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * 2 + s.ph));
      ctx.fillStyle = '#dff4ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = gr.horizon; ctx.fillRect(0, hz - 3, W, 8);
    ctx.fillStyle = gr.ground; ctx.fillRect(0, hz, W, H - hz);
  };

  w.drawRoad = function (ctx) {
    var yN = w.groundY(NEAR), yF = w.groundY(FAR);
    var lN = w.projX(-2.5, NEAR), rN = w.projX(2.5, NEAR);
    var lF = w.projX(-2.5, FAR), rF = w.projX(2.5, FAR);
    ctx.beginPath();
    ctx.moveTo(lN, yN); ctx.lineTo(lF, yF); ctx.lineTo(rF, yF); ctx.lineTo(rN, yN);
    ctx.closePath();
    ctx.fillStyle = w.gradients(ctx).road;
    ctx.fill();

    var edges = [[lN, yN, lF, yF], [rN, yN, rF, yF]];
    for (var i = 0; i < 2; i++) {
      var e = edges[i];
      ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]);
      ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(80,220,255,0.09)'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(120,235,255,0.72)'; ctx.stroke();
    }
  };

  w.drawStripes = function (ctx) {
    var P = 6, HALF = 2.7;
    var off = (w.G ? w.G.worldZ : 0) % P;
    ctx.fillStyle = 'rgba(120,225,255,0.17)';
    for (var k = 0; k < 14; k++) {
      var z1 = NEAR + k * P - off, z2 = z1 + HALF;
      if (z2 <= NEAR + 0.2 || z1 >= FAR) continue;
      z1 = Math.max(z1, NEAR + 0.2); z2 = Math.min(z2, FAR);
      if (z2 <= z1) continue;
      var y1 = w.groundY(z1), y2 = w.groundY(z2);
      for (var li = 0; li < 2; li++) {
        var lx = li === 0 ? -0.76 : 0.76;
        var a = w.projX(lx, z1), b = w.projX(lx, z2);
        var w1 = 0.075 * w.unit * w.sc(z1), w2 = 0.075 * w.unit * w.sc(z2);
        ctx.beginPath();
        ctx.moveTo(a - w1, y1); ctx.lineTo(a + w1, y1);
        ctx.lineTo(b + w2, y2); ctx.lineTo(b - w2, y2);
        ctx.closePath(); ctx.fill();
      }
    }
  };

  w.drawGate = function (ctx, gate) {
    var G = w.G;
    var z = gate.z;
    if (z < NEAR + 0.9) return;
    var s = w.sc(z), gy = w.groundY(z);
    var alpha = 1;
    if (z < PLAYER_Z) alpha = clamp((z - (NEAR + 0.9)) / (PLAYER_Z - (NEAR + 0.9)), 0, 1);
    else if (z < PLAYER_Z + 2.8) alpha = 0.26 + 0.74 * (z - PLAYER_Z) / 2.8;
    if (alpha <= 0.03) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (var i = 0; i < gate.doors.length; i++) {
      var d = gate.doors[i];
      var cx = w.projX(LANE_X[d.lane], z);
      var hw = (LANE_W / 2) * w.unit * s;
      var hh = (gate.boss ? 2.6 : 1.95) * w.unit * s;
      var x = cx - hw, y = gy - hh, wd = hw * 2, ht = hh;

      var col = COL[gate.boss ? 'boss' : d.op] || COL['+'];
      var ok = gate.boss && G.num >= gate.target;
      var c1 = ok ? '#7dffb0' : col.c;
      var soft = ok ? 'rgba(125,255,176,' : col.soft;

      ctx.lineWidth = Math.max(2, hw * 0.28);
      ctx.strokeStyle = soft + '0.13)';
      rrPath(ctx, x, y, wd, ht, hw * 0.34); ctx.stroke();

      var fg = ctx.createLinearGradient(0, y, 0, y + ht);
      fg.addColorStop(0, soft + '0.34)');
      fg.addColorStop(0.62, soft + '0.16)');
      fg.addColorStop(1, soft + '0.03)');
      ctx.fillStyle = fg;
      rrPath(ctx, x, y, wd, ht, hw * 0.34); ctx.fill();

      ctx.lineWidth = Math.max(1.4, hw * 0.10);
      ctx.strokeStyle = soft + '0.92)';
      rrPath(ctx, x, y, wd, ht, hw * 0.34); ctx.stroke();

      ctx.lineWidth = Math.max(1, hw * 0.05);
      ctx.strokeStyle = soft + '0.30)';
      ctx.beginPath();
      ctx.moveTo(x + wd * 0.16, y + ht * 0.14);
      ctx.lineTo(x + wd * 0.84, y + ht * 0.14);
      ctx.stroke();

      ctx.fillStyle = soft + '0.85)';
      rrPath(ctx, x + wd * 0.10, y - ht * 0.055, wd * 0.80, Math.max(2, ht * 0.05), ht * 0.03);
      ctx.fill();

      var label = gate.boss ? '≥' + fmt(gate.target) : d.op + d.val;
      var fs = ht * 0.40;
      ctx.font = '900 ' + fs.toFixed(1) + 'px ' + FONT;
      var guard = 0;
      while (ctx.measureText(label).width > wd * 0.80 && fs > 7 && guard < 12) {
        fs *= 0.92; guard++;
        ctx.font = '900 ' + fs.toFixed(1) + 'px ' + FONT;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(label, cx, y + ht * 0.53 + Math.max(1, fs * 0.06));
      ctx.fillStyle = c1;
      ctx.fillText(label, cx, y + ht * 0.52);

      if (gate.boss) {
        var tagFs = Math.max(7, ht * 0.11);
        ctx.font = '900 ' + tagFs.toFixed(1) + 'px ' + FONT;
        ctx.fillStyle = soft + '0.95)';
        ctx.fillText(ok ? '✓ 可击破' : 'BOSS', cx, y + ht * 0.86);
      }
    }
    ctx.restore();
  };

  w.drawPlayer = function (ctx) {
    var G = w.G;
    var pc = w.playerCenter();
    var gy = w.groundY(PLAYER_Z);
    var cx = pc.x, cy = pc.y, R = pc.r * (1 + 0.18 * G.pop);

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#000';
    ctx.translate(cx, gy + R * 0.06);
    ctx.scale(1, 0.3);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, 6.284); ctx.fill();
    ctx.restore();

    var gr = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2);
    gr.addColorStop(0, 'rgba(110,240,255,0.30)');
    gr.addColorStop(1, 'rgba(110,240,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2, 0, 6.284); ctx.fill();

    var stretch = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, G.laneT));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(stretch, 2 - stretch);

    var bg = ctx.createRadialGradient(-R * 0.34, -R * 0.44, R * 0.08, 0, 0, R * 1.18);
    bg.addColorStop(0, '#e8feff');
    bg.addColorStop(0.42, '#45d9ff');
    bg.addColorStop(1, '#1358c8');
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.284);
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = Math.max(1.6, R * 0.085);
    ctx.strokeStyle = 'rgba(225,255,255,0.9)'; ctx.stroke();

    var txt = fmt(G.num);
    var nf = R * 0.95;
    ctx.font = '900 ' + nf.toFixed(1) + 'px ' + FONT;
    var guard = 0;
    while (ctx.measureText(txt).width > R * 1.55 && nf > 6 && guard < 14) {
      nf *= 0.9; guard++;
      ctx.font = '900 ' + nf.toFixed(1) + 'px ' + FONT;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#03202e';
    ctx.fillText(txt, 0, R * 0.05);
    ctx.restore();
  };

  w.drawEffects = function (ctx) {
    var G = w.G;
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = clamp(p.life * 1.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.8), 0, 6.284); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var f = 0; f < G.floaters.length; f++) {
      var t = G.floaters[f];
      var la = clamp(t.life, 0, 1);
      ctx.globalAlpha = la;
      var fs = 22 * t.size * (0.7 + la * 0.5);
      ctx.font = '900 ' + fs.toFixed(1) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, fs * 0.14);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  };

  w.drawHUD = function (ctx) {
    var G = w.G;
    var pad = 12, top = w.safeTop || 12;
    var big = Math.min(w.W, w.H) < 420;
    var cw = Math.min(148, w.W * 0.44), chh = big ? 54 : 62;

    function chip(x, y, ww, hh) {
      ctx.fillStyle = 'rgba(14,9,30,0.62)';
      rrPath(ctx, x, y, ww, hh, 13); ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,200,255,0.16)';
      rrPath(ctx, x, y, ww, hh, 13); ctx.stroke();
    }

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    chip(pad, top, cw, chh);
    ctx.textAlign = 'left';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(160,215,255,0.62)';
    ctx.fillText('当前数字', pad + 12, top + (big ? 17 : 19));
    ctx.font = '900 ' + (big ? 24 : 28) + 'px ' + FONT;
    ctx.fillStyle = '#eafcff';
    ctx.fillText(fmt(G.num), pad + 12, top + chh - (big ? 12 : 14));

    var rx = w.W - pad - cw;
    chip(rx, top, cw, chh);
    ctx.textAlign = 'right';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(160,215,255,0.62)';
    ctx.fillText('目标 ≥', rx + cw - 12, top + (big ? 17 : 19));
    ctx.font = '900 ' + (big ? 24 : 28) + 'px ' + FONT;
    ctx.fillStyle = G.num >= G.target ? '#7dffb0' : '#ffb347';
    ctx.fillText(fmt(G.target), rx + cw - 12, top + chh - (big ? 12 : 14));

    var bx = pad, by = top + chh + 7, bw = w.W - pad * 2, bh = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rrPath(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    var ratio = clamp(G.num / Math.max(1, G.target), 0, 1);
    var pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    pg.addColorStop(0, '#38e3ff');
    pg.addColorStop(1, ratio >= 1 ? '#7dffb0' : '#ffd83d');
    ctx.fillStyle = pg;
    rrPath(ctx, bx, by, Math.max(bh, bw * ratio), bh, bh / 2); ctx.fill();

    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (big ? 10 : 11) + 'px ' + FONT;
    ctx.fillStyle = 'rgba(200,220,255,0.72)';
    ctx.fillText('第 ' + G.stage + ' 关', w.W / 2, top + (big ? 15 : 16));
    ctx.restore();
  };

  return w;
}

module.exports = { createWorld: createWorld, fmt: fmt, clamp: clamp, rrPath: rrPath, LANE_X: LANE_X };
