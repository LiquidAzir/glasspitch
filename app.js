/* ============================================================
   GLASS PITCH — holographic arcade soccer for Meta Ray-Ban Display
   Vanilla JS, single canvas match + DOM menus.

   Controls (swipe + tap only, per device constraints):
     • Swipe ←↑→↓ : steer the active player (auto-run, you only steer)
     • Pinch (Enter/tap): context action — PASS / SHOOT / TACKLE / SWITCH
     • ↑↓↑↓ chord or Esc : pause

   World units are meters. +y is "down" the screen; HOME always attacks
   UP (toward y=0, the top goal). AWAY attacks DOWN (toward y=PL).
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const CFG = {
    // Pitch (meters)
    PW: 68, PL: 105,
    goalHalfW: 3.66, goalDepth: 1.7,
    boxW: 40.3, boxD: 16.5, sixW: 18.32, sixD: 5.5,
    penSpot: 11, centerR: 9.15,
    // Physics (m, s)
    playerAccel: 30, playerMax: 7.2,
    ballDecel: 7.5, ballMax: 26, ballStop: 0.08,
    controlDist: 1.15, captureR: 1.45, tackleR: 2.1, captureSpeed: 19,
    // ball arc (height) — mostly visual; gates capture & "over the bar"
    ballGravity: 12, crossbarH: 2.44, catchH: 2.5,
    // sprint / dash
    dashDur: 0.42, dashCd: 2.4, dashBoost: 1.7,
    // Timing
    steerHold: 0.75,            // s a manual swipe overrides defensive auto-seek
    comboWindow: 700, minComboGap: 45, dashWindow: 300,
    goalCelebrate: 2.0, restartPause: 0.35,
    // HUD
    hudHz: 12,
  };

  // sim-seconds per half (45 sim-min = 2700s) and the real time it takes
  const HALF_SIM = 2700;
  const LENGTHS = { Short: 45, Normal: 90, Long: 150 };           // real seconds / half
  const DIFFS = {
    Easy:   { spd: 0.92, pass: 0.80, shot: 0.78, react: 0.45, press: 0.80, tackle: 0.85, mate: 1.04 },
    Normal: { spd: 1.00, pass: 0.88, shot: 0.86, react: 0.30, press: 1.00, tackle: 1.00, mate: 1.00 },
    Hard:   { spd: 1.06, pass: 0.94, shot: 0.93, react: 0.18, press: 1.18, tackle: 1.12, mate: 0.98 },
  };

  // ============================================================
  // TEAMS — fictional, distinct kits (bright on additive display) + ratings
  // ============================================================
  const TEAMS = [
    { id:'aur', name:'Aurora',       code:'AUR', city:'All-round',  col:'#eaf2ff', col2:'#1aa6a6', gk:'#ffb020', glyph:'A', r:{ATT:79,MID:79,DEF:79,PAC:78,GK:79} },
    { id:'crv', name:'Crimson Vale', code:'CRV', city:'Balanced',   col:'#ff4d5e', col2:'#ffffff', gk:'#2ee6a6', glyph:'C', r:{ATT:78,MID:76,DEF:75,PAC:77,GK:76} },
    { id:'azc', name:'Azure City',   code:'AZC', city:'Possession', col:'#3a8cff', col2:'#0a2a5e', gk:'#ffd23f', glyph:'Z', r:{ATT:74,MID:83,DEF:76,PAC:72,GK:77} },
    { id:'sol', name:'Solaris',      code:'SOL', city:'Pace',       col:'#ffcf2e', col2:'#1a1a1a', gk:'#ff5fae', glyph:'S', r:{ATT:85,MID:74,DEF:67,PAC:87,GK:72} },
    { id:'vrd', name:'Verde',        code:'VRD', city:'Defensive',  col:'#36e07a', col2:'#0c1a12', gk:'#ffb020', glyph:'V', r:{ATT:70,MID:74,DEF:86,PAC:71,GK:81} },
    { id:'fro', name:'Frost United', code:'FRO', city:'Technical',  col:'#5fe0ff', col2:'#ffffff', gk:'#ff7a3a', glyph:'F', r:{ATT:77,MID:81,DEF:74,PAC:75,GK:76} },
    { id:'vio', name:'Violet Star',  code:'VIO', city:'Flair',      col:'#b974ff', col2:'#e6e6f0', gk:'#3ef0c8', glyph:'Y', r:{ATT:81,MID:78,DEF:70,PAC:80,GK:73} },
    { id:'emb', name:'Ember Rovers', code:'EMB', city:'Physical',   col:'#ff8a3a', col2:'#1a1a1a', gk:'#5fe0ff', glyph:'E', r:{ATT:76,MID:72,DEF:81,PAC:74,GK:79} },
  ];
  const teamById = (id) => TEAMS.find(t => t.id === id) || TEAMS[0];

  // Formations in attacking-normalised coords. nx: 0..1 left→right. ny: 0 (own goal) .. 1 (opp goal).
  const FORMATIONS = {
    '4-3-3': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:2,  nx:0.16, ny:0.20 }, { role:'DEF', num:5, nx:0.38, ny:0.15 },
      { role:'DEF', num:6,  nx:0.62, ny:0.15 }, { role:'DEF', num:3, nx:0.84, ny:0.20 },
      { role:'MID', num:8,  nx:0.28, ny:0.42 }, { role:'MID', num:4, nx:0.50, ny:0.38 },
      { role:'MID', num:10, nx:0.72, ny:0.42 },
      { role:'FWD', num:7,  nx:0.22, ny:0.66 }, { role:'FWD', num:9, nx:0.50, ny:0.74 },
      { role:'FWD', num:11, nx:0.78, ny:0.66 },
    ],
    '4-4-2': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:2,  nx:0.16, ny:0.18 }, { role:'DEF', num:5, nx:0.38, ny:0.14 },
      { role:'DEF', num:6,  nx:0.62, ny:0.14 }, { role:'DEF', num:3, nx:0.84, ny:0.18 },
      { role:'MID', num:7,  nx:0.16, ny:0.46 }, { role:'MID', num:4, nx:0.40, ny:0.40 },
      { role:'MID', num:8,  nx:0.60, ny:0.40 }, { role:'MID', num:11, nx:0.84, ny:0.46 },
      { role:'FWD', num:9,  nx:0.40, ny:0.72 }, { role:'FWD', num:10, nx:0.60, ny:0.72 },
    ],
    '4-2-3-1': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:2,  nx:0.16, ny:0.18 }, { role:'DEF', num:5, nx:0.38, ny:0.14 },
      { role:'DEF', num:6,  nx:0.62, ny:0.14 }, { role:'DEF', num:3, nx:0.84, ny:0.18 },
      { role:'MID', num:4,  nx:0.38, ny:0.34 }, { role:'MID', num:8, nx:0.62, ny:0.34 },
      { role:'FWD', num:7,  nx:0.20, ny:0.58 }, { role:'MID', num:10, nx:0.50, ny:0.56 },
      { role:'FWD', num:11, nx:0.80, ny:0.58 }, { role:'FWD', num:9, nx:0.50, ny:0.78 },
    ],
  };
  const FORMATION_KEYS = ['4-3-3', '4-4-2', '4-2-3-1'];

  // ============================================================
  // MATH
  // ============================================================
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const len = (x, y) => Math.hypot(x, y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; };
  function approach(cur, target, maxDelta) {
    const d = target - cur;
    if (Math.abs(d) <= maxDelta) return target;
    return cur + Math.sign(d) * maxDelta;
  }
  // seeded PRNG (mulberry32) for reproducible matches / tests
  let _seed = 1234567;
  function srand() {
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rrange = (a, b) => a + srand() * (b - a);
  const pick = (arr) => arr[Math.floor(srand() * arr.length) % arr.length];

  // ============================================================
  // SOUND — tiny synthesized SFX (WebAudio, no assets). Lazy ctx, gesture-resumed.
  // ============================================================
  const SFX = (function () {
    let ctx = null, master = null, enabled = true;
    function ensure() {
      if (ctx) return ctx;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      } catch (e) { ctx = null; }
      return ctx;
    }
    function tone(freq, dur, type, vol, slideTo) {
      if (!enabled) return; const c = ensure(); if (!c) return;
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, freq, type) {
      if (!enabled) return; const c = ensure(); if (!c) return;
      const t = c.currentTime, n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const g = c.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = src;
      if (freq) { const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7; src.connect(f); node = f; }
      node.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.03);
    }
    return {
      resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
      setEnabled(v) { enabled = v; }, isEnabled() { return enabled; },
      kick()    { tone(160, 0.09, 'sine', 0.32, 70); noise(0.04, 0.10, 1200, 'lowpass'); },
      pass()    { tone(300, 0.06, 'sine', 0.15, 190); },
      tackle()  { noise(0.12, 0.13, 500, 'lowpass'); tone(120, 0.08, 'sine', 0.16, 80); },
      whistle() { tone(2350, 0.16, 'square', 0.14, 2650); noise(0.10, 0.03, 3200); },
      save()    { tone(190, 0.12, 'square', 0.16, 130); noise(0.10, 0.07, 2000); },
      post()    { tone(950, 0.16, 'square', 0.20, 320); },
      goal()    { noise(1.1, 0.20, 950, 'lowpass'); tone(330, 0.5, 'sawtooth', 0.10, 520); tone(440, 0.6, 'triangle', 0.09, 660); },
      cheer()   { noise(0.7, 0.15, 1000, 'lowpass'); },
      dash()    { noise(0.18, 0.07, 1600, 'bandpass'); },
    };
  })();

  // ============================================================
  // STATE
  // ============================================================
  const game = {
    screen: 'title',
    history: [],
    settings: { difficulty: 'Normal', length: 'Normal', formation: '4-3-3', sound: true, touch: false },
    record: { w: 0, d: 0, l: 0 },
    // match
    home: null, away: null, ball: null,
    activeId: null, activeLockT: 0,
    clockSec: 0, half: 1, phase: 'play',
    phaseT: 0, kickoffTeam: 'away',
    lastTouch: 'away', lastKicker: null, lastTouchPlayer: null,
    dashCdUntil: 0, _lastWasShot: false,
    poss: { home: 0, away: 0 },
    stats: null,
    effects: [],
    banner: '', netRipple: { home: 0, away: 0 },
    // input
    keys: {}, tapped: {},
    steer: { x: 0, y: 0 }, lastSteerT: -10,
    comboBuffer: [], lastKeyT: 0,
    guardUntil: 0,
    lastTime: 0, hudT: 0, running: false, rafId: 0,
    // team select
    ts: { step: 0, idx: 0, you: null, opp: null },
  };

  // ============================================================
  // DOM
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const screens = {};
  function collectScreens() {
    document.querySelectorAll('.screen').forEach(s => { if (s.id) screens[s.id] = s; });
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function navigateTo(id, opts) {
    opts = opts || {};
    if (opts.addToHistory !== false && game.screen && game.screen !== id) game.history.push(game.screen);
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    if (!screens[id]) return;
    screens[id].classList.remove('hidden');
    game.screen = id;
    onScreenEnter(id);
    focusFirst(screens[id]);
    // run the game loop only while a match is on screen (battery: no idle loop)
    if (id === 'match') startLoop(); else stopLoop();
  }
  function navigateBack() {
    if (!game.history.length) { navigateTo('title', { addToHistory: false }); return; }
    navigateTo(game.history.pop(), { addToHistory: false });
  }
  function focusFirst(c) {
    const el = c.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) setTimeout(() => el.focus(), 0);
  }
  function moveFocus(dir) {
    const c = screens[game.screen]; if (!c) return;
    const list = Array.from(c.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    if (i === -1) { list[0].focus(); return; }
    const n = (dir === 'up' || dir === 'left') ? (i > 0 ? i-1 : list.length-1) : (i < list.length-1 ? i+1 : 0);
    list[n].focus();
    list[n].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function onScreenEnter(id) {
    if (id === 'title') renderTitle();
    else if (id === 'team-select') renderTeamSelect();
    else if (id === 'settings') renderSettings();
    else if (id === 'pause') {
      $('pause-score').textContent = scoreLine();
      $('sound-toggle-btn').textContent = 'Sound: ' + (game.settings.sound ? 'ON' : 'OFF');
      $('touch-toggle-btn').textContent = 'Touch Controls: ' + (game.settings.touch ? 'ON' : 'OFF');
    }
    else if (id === 'halftime') { $('ht-score').textContent = scoreLine(); renderStatGrid($('ht-stats')); }
    else if (id === 'result') renderResult();
    else if (id === 'cup') renderCup();
    else if (id === 'shootout') { drawPen(); penInstr(); }
    else if (id === 'match') { game.guardUntil = performance.now() + 220; render(); updateHud(true); }
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================
  const LS = 'glasspitch_v1';
  function loadStore() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || '{}');
      if (s.settings) Object.assign(game.settings, s.settings);
      if (s.record) Object.assign(game.record, s.record);
      if (s.lastTeams) { game.ts.you = s.lastTeams.you; game.ts.opp = s.lastTeams.opp; }
      if (s.cup && s.cup.rounds) game.cup = s.cup;
    } catch (e) {}
  }
  function saveStore() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        settings: game.settings, record: game.record,
        lastTeams: { you: game.ts.you, opp: game.ts.opp },
        cup: game.cup || null,
      }));
    } catch (e) {}
  }

  // ============================================================
  // TITLE / SETTINGS / TEAM SELECT UI
  // ============================================================
  function renderTitle() {
    const r = game.record;
    $('title-record').textContent = (r.w + r.d + r.l) ? `Record  ${r.w}W · ${r.d}D · ${r.l}L` : '';
  }
  function renderSettings() {
    $('opt-difficulty').textContent = game.settings.difficulty;
    $('opt-length').textContent = game.settings.length;
    $('opt-formation').textContent = game.settings.formation;
    $('opt-sound').textContent = game.settings.sound ? 'ON' : 'OFF';
    $('opt-touch').textContent = game.settings.touch ? 'ON' : 'OFF';
    const r = game.record;
    $('opt-record').textContent = `${r.w}-${r.d}-${r.l}`;
  }

  function crestStyle(t) {
    return `background:linear-gradient(150deg, ${t.col} 0%, ${shade(t.col,-0.35)} 100%); color:${pickInk(t.col)}; --crest-glow:${hexA(t.col,0.45)};`;
  }
  function renderTeamSelect() {
    const ts = game.ts;
    const cup = ts.mode === 'cup';
    $('ts-title').textContent = cup ? 'Pick Your Team' : (ts.step === 0 ? 'Select Your Team' : 'Select Opponent');
    $('ts-step').textContent = cup ? 'CUP' : ((ts.step + 1) + ' / 2');
    $('ts-confirm').textContent = cup ? 'Enter Cup' : 'Select';
    $('ts-random').classList.toggle('hidden', cup || ts.step === 0);
    const t = TEAMS[ts.idx];
    const crest = $('ts-crest');
    crest.textContent = t.glyph;
    crest.setAttribute('style', crestStyle(t));
    $('ts-name').textContent = t.name;
    $('ts-sub').textContent = `${t.code} · ${t.city}`;
    const rk = t.r;
    $('ts-ratings').innerHTML = ['ATT','MID','DEF','PAC','GK'].map(k => {
      const v = rk[k];
      return `<div class="rt-row"><span class="rt-label">${k}</span>
        <span class="rt-bar"><span class="rt-fill" style="width:${v}%"></span></span>
        <span class="rt-val">${v}</span></div>`;
    }).join('');
    $('ts-dots').innerHTML = TEAMS.map((_, i) => `<span class="ts-dot ${i===ts.idx?'on':''}"></span>`).join('');
  }
  function tsMove(d) {
    game.ts.idx = (game.ts.idx + d + TEAMS.length) % TEAMS.length;
    renderTeamSelect();
  }
  function tsConfirm() {
    const ts = game.ts;
    if (ts.mode === 'cup') { ts.mode = null; startCup(TEAMS[ts.idx].id); return; }
    if (ts.step === 0) {
      ts.you = TEAMS[ts.idx].id;
      ts.step = 1;
      // default opponent highlight = a different team
      ts.idx = (ts.idx + 1) % TEAMS.length;
      renderTeamSelect();
    } else {
      ts.opp = TEAMS[ts.idx].id;
      startMatch(ts.you, ts.opp);
    }
  }
  function tsRandom() {
    let i; do { i = Math.floor(srand() * TEAMS.length); } while (TEAMS[i].id === game.ts.you);
    game.ts.opp = TEAMS[i].id;
    startMatch(game.ts.you, game.ts.opp);
  }

  // ============================================================
  // COLOR HELPERS
  // ============================================================
  function hexToRgb(h) { h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join(''); const n = parseInt(h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
  function lum(h) { const c = hexToRgb(h); return (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255; }
  function pickInk(h) { return lum(h) > 0.6 ? '#0b1410' : '#ffffff'; }
  function shade(h, amt) { const c = hexToRgb(h); const f = (v) => clamp(Math.round(v + 255*amt), 0, 255); return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`; }
  function hexA(h, a) { const c = hexToRgb(h); return `rgba(${c.r},${c.g},${c.b},${a})`; }

  // ============================================================
  // MATCH SETUP
  // ============================================================
  function makeTeam(teamId, side, formKey) {
    const t = teamById(teamId);
    const form = FORMATIONS[formKey] || FORMATIONS['4-3-3'];
    const captainIdx = form.findIndex(f => f.role === 'MID');     // armband on a central mid
    const players = form.map((f, i) => ({
      id: side + i, side, role: f.role, num: f.num, idx: i,
      nx: f.nx, ny: f.ny, isGK: f.role === 'GK', captain: i === captainIdx,
      x: 0, y: 0, vx: 0, vy: 0, heading: side === 'home' ? -Math.PI/2 : Math.PI/2,
      speedR: 0.85 + t.r.PAC/100 * 0.32,
      tackleCd: 0, kickCd: 0, dashT: 0, runPhase: srand()*6.28, aiT: srand()*0.3,
    }));
    return { teamId, side, def: t, score: 0, players, form, formKey };
  }
  // formation home position in WORLD coords for a side
  function homePos(side, f, p) {
    // attacking-normalised → world. HOME attacks up (ny=1 → y=0). AWAY attacks down (ny=1 → y=PL).
    const nx = f.nx, ny = f.ny;
    const x = nx * CFG.PW;
    const y = side === 'home' ? CFG.PL * (1 - ny) : CFG.PL * ny;
    return { x, y };
  }

  function startMatch(homeId, awayId) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x9e3779b9;
    game.home = makeTeam(homeId, 'home', game.settings.formation);
    game.away = makeTeam(awayId, 'away', '4-3-3');
    game.ball = { x: CFG.PW/2, y: CFG.PL/2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, shot: false, trail: [] };
    game.clockSec = 0; game.half = 1; game.phase = 'play';
    game.poss = { home: 1, away: 1 };
    game.stats = { shots:{home:0,away:0}, sot:{home:0,away:0}, fouls:{home:0,away:0} };
    game.effects = []; game.banner = ''; game.netRipple = { home: 0, away: 0 };
    game.kickoffTeam = 'away';
    setupPitchGeom();
    drawStaticPitch();
    paintScoreboard();
    resetPositions(game.kickoffTeam, true);
    saveStore();
    navigateTo('match', { addToHistory: false });
    game.history = ['title'];
    SFX.whistle(); say(`Kick off — ${game.home.def.name} v ${game.away.def.name}.`);
  }

  function teamObj(side) { return side === 'home' ? game.home : game.away; }
  function otherSide(side) { return side === 'home' ? 'away' : 'home'; }
  function allPlayers() { return game.home.players.concat(game.away.players); }
  function playerById(id) { return id == null ? null : allPlayers().find(p => p.id === id); }

  // place everyone at formation home (kickoff / goal / half restart)
  function resetPositions(kickoffTeam, fullKickoff) {
    [game.home, game.away].forEach(team => {
      team.players.forEach((p, i) => {
        const h = homePos(team.side, team.form[i], p);
        p.x = h.x; p.y = h.y; p.vx = 0; p.vy = 0; p.dashT = 0;
        // keep both teams in their own half for the kickoff
        if (fullKickoff) {
          if (team.side === 'home') p.y = Math.max(p.y, CFG.PL/2 + (p.isGK ? 0 : 1.5));
          else p.y = Math.min(p.y, CFG.PL/2 - (p.isGK ? 0 : 1.5));
        }
        p.heading = team.side === 'home' ? -Math.PI/2 : Math.PI/2;
        p.tackleCd = 0; p.kickCd = 0;
      });
    });
    const b = game.ball;
    b.x = CFG.PW/2; b.y = CFG.PL/2; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.shot = false; b.trail.length = 0;
    _prevBall.x = b.x; _prevBall.y = b.y;
    // give the ball to the kickoff team's central midfielder
    const ko = teamObj(kickoffTeam);
    const cm = ko.players[6];
    cm.x = CFG.PW/2; cm.y = CFG.PL/2 + (kickoffTeam === 'home' ? 1.2 : -1.2);
    b.owner = cm.id; game.lastTouch = kickoffTeam; game.lastKicker = null; game.lastTouchPlayer = cm.id;
    // active = your carrier if you kick off, else your nearest to ball
    if (kickoffTeam === 'home') setActive(cm.id, true);
    else setActive(nearestOfSide('home', b).id, true);
  }

  function nearestOfSide(side, pt, excludeGK) {
    const ps = teamObj(side).players;
    let best = null, bd = 1e9;
    for (const p of ps) {
      if (excludeGK && p.isGK) continue;
      const d = dist2(p.x, p.y, pt.x, pt.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function setActive(id, lock) { game.activeId = id; if (lock) game.activeLockT = 1.4; }

  // ============================================================
  // INPUT
  // ============================================================
  function setupInput() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('click', e => {
      SFX.resume();
      const el = e.target.closest('[data-action]');
      if (el) handleAction(el.dataset.action, el);
    });
    setupTouchControls();
  }
  function setupTouchControls() {
    const root = $('touch-controls'); if (!root) return;
    if (game.settings.touch) showTouch(true);
    root.querySelectorAll('[data-touch-key]').forEach(btn => {
      const key = btn.dataset.touchKey;
      const press = (ev) => { ev.preventDefault(); onKeyDown({ key, repeat: false, preventDefault(){} }); };
      const release = (ev) => { ev.preventDefault(); onKeyUp({ key }); };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    });
  }
  function showTouch(on) {
    $('touch-controls').classList.toggle('hidden', !on);
    game.settings.touch = on; saveStore();
    const b = $('touch-toggle-btn'); if (b) b.textContent = 'Touch Controls: ' + (on ? 'ON' : 'OFF');
    const o = $('opt-touch'); if (o) o.textContent = on ? 'ON' : 'OFF';
  }

  const DIRV = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0} };
  function onKeyDown(e) {
    const key = e.key;
    SFX.resume();
    if (e.repeat && DIRV[key]) return;           // kill EMG ghost-repeat

    // penalty shootout has its own input model
    if (game.screen === 'shootout') { if (DIRV[key] || key === 'Enter') { penInput(key); e.preventDefault(); } return; }

    const inMatch = game.screen === 'match' && game.phase !== 'ended';

    if (key === 'Escape') {
      if (inMatch) pauseMatch(); else navigateBack();
      e.preventDefault(); return;
    }

    if (inMatch) {
      if (performance.now() < game.guardUntil) { e.preventDefault(); return; }
      if (DIRV[key]) {
        recordCombo(key);
        if (game.screen !== 'match') { e.preventDefault(); return; } // combo opened pause
        game.keys[key] = true; game.tapped[key] = true; e.preventDefault(); return;
      }
      if (key === 'Enter') { onPinch(); e.preventDefault(); return; }
      return;
    }

    // team-select: arrows change team, Enter confirms
    if (game.screen === 'team-select') {
      if (key === 'ArrowLeft')  { tsMove(-1); e.preventDefault(); return; }
      if (key === 'ArrowRight') { tsMove(+1); e.preventDefault(); return; }
      if (key === 'ArrowUp' || key === 'ArrowDown') { moveFocus(key === 'ArrowUp' ? 'up':'down'); e.preventDefault(); return; }
      if (key === 'Enter') {
        const a = document.activeElement;
        if (a && a.classList.contains('focusable') && a.dataset.action && a.dataset.action !== 'team-confirm') a.click();
        else tsConfirm();
        e.preventDefault(); return;
      }
      return;
    }

    // generic menus
    switch (key) {
      case 'ArrowUp': moveFocus('up'); e.preventDefault(); break;
      case 'ArrowDown': moveFocus('down'); e.preventDefault(); break;
      case 'ArrowLeft': moveFocus('left'); e.preventDefault(); break;
      case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
      case 'Enter':
        if (document.activeElement && document.activeElement.classList.contains('focusable')) document.activeElement.click();
        e.preventDefault(); break;
    }
  }
  function onKeyUp(e) { if (DIRV[e.key]) game.keys[e.key] = false; }

  function recordCombo(key) {
    const now = performance.now();
    const ch = key.replace('Arrow','').toLowerCase();
    if (game.comboBuffer.length === 0 || (now - game.lastKeyT) > CFG.minComboGap) {
      if ((now - game.lastKeyT) > CFG.comboWindow) game.comboBuffer.length = 0;
      const prevT = game.comboBuffer._t || 0;
      game.comboBuffer.push(ch); game.comboBuffer._t = now; game.lastKeyT = now;
      if (game.comboBuffer.length > 4) game.comboBuffer.shift();
      const b = game.comboBuffer;
      // pause chord ↑↓↑↓
      if (b.length === 4 && b[0]==='up' && b[1]==='down' && b[2]==='up' && b[3]==='down') {
        game.comboBuffer.length = 0; pauseMatch(); return;
      }
      // dash: two quick swipes in the SAME direction
      if (b.length >= 2 && b[b.length-1] === b[b.length-2] && (now - prevT) < CFG.dashWindow) tryDash(ch);
    }
  }
  function tryDash(ch) {
    const now = performance.now();
    if (now < game.dashCdUntil) return;
    const p = playerById(game.activeId); if (!p || p.side !== 'home') return;
    const m = DIRV['Arrow' + ch.charAt(0).toUpperCase() + ch.slice(1)];
    if (m) setSteer(m.x, m.y);
    p.dashT = CFG.dashDur; game.dashCdUntil = now + CFG.dashCd * 1000;
    SFX.dash();
  }
  function pauseMatch() { if (game.phase === 'ended') return; navigateTo('pause'); }

  // ============================================================
  // ACTIONS (menu dispatch)
  // ============================================================
  function handleAction(action, el) {
    switch (action) {
      case 'quick-match': {
        const you = game.ts.you || TEAMS[0].id;
        let opp = game.ts.opp; if (!opp || opp === you) { let i; do { i = Math.floor(srand()*TEAMS.length); } while (TEAMS[i].id===you); opp = TEAMS[i].id; }
        game.ts.you = you; game.ts.opp = opp; startMatch(you, opp); break;
      }
      case 'choose-teams': game.ts.mode = null; game.ts.step = 0; game.ts.idx = Math.max(0, TEAMS.findIndex(t=>t.id===game.ts.you)); if (game.ts.idx<0) game.ts.idx=0; navigateTo('team-select'); break;
      case 'goto-cup': if (game.cup) navigateTo('cup'); else startNewCupFlow(); break;
      case 'cup-play': cupPlay(); break;
      case 'cup-new': startNewCupFlow(); break;
      case 'goto-how': navigateTo('how'); break;
      case 'goto-settings': navigateTo('settings'); break;
      case 'back': navigateBack(); break;
      case 'team-prev': tsMove(-1); break;
      case 'team-next': tsMove(+1); break;
      case 'team-confirm': tsConfirm(); break;
      case 'team-random': tsRandom(); break;
      case 'cycle-difficulty': cycle('difficulty', ['Easy','Normal','Hard']); break;
      case 'cycle-length': cycle('length', ['Short','Normal','Long']); break;
      case 'cycle-formation': cycle('formation', FORMATION_KEYS); break;
      case 'toggle-sound': toggleSound(); break;
      case 'menu-touch-toggle': showTouch(!game.settings.touch); break;
      case 'reset-record': game.record = {w:0,d:0,l:0}; saveStore(); renderSettings(); break;
      case 'resume': resumeMatch(); break;
      case 'resume-second': startSecondHalf(); break;
      case 'restart-match': startMatch(game.home.teamId, game.away.teamId); break;
      case 'rematch': startMatch(game.home.teamId, game.away.teamId); break;
      case 'quit-title': game.history = []; navigateTo('title', { addToHistory:false }); break;
    }
  }
  function cycle(key, vals) {
    const i = vals.indexOf(game.settings[key]);
    game.settings[key] = vals[(i+1) % vals.length];
    saveStore(); renderSettings();
  }
  function toggleSound() {
    game.settings.sound = !game.settings.sound;
    SFX.setEnabled(game.settings.sound);
    if (game.settings.sound) SFX.resume();
    saveStore();
    const o = $('opt-sound'); if (o) o.textContent = game.settings.sound ? 'ON' : 'OFF';
    const b = $('sound-toggle-btn'); if (b) b.textContent = 'Sound: ' + (game.settings.sound ? 'ON' : 'OFF');
  }
  function resumeMatch() { game.guardUntil = performance.now() + 200; navigateTo('match', { addToHistory:false }); }
  function startSecondHalf() {
    game.half = 2; game.clockSec = HALF_SIM; game.phase = 'play';
    game.kickoffTeam = 'home';
    resetPositions('home', true);
    resumeMatch();
    SFX.whistle(); say('Second half under way.');
  }

  // ============================================================
  // THE PINCH — context action for the active player
  // ============================================================
  function onPinch() {
    if (game.phase !== 'play') return;
    const p = playerById(game.activeId); if (!p) return;
    const b = game.ball;
    const youHaveBall = b.owner != null && playerById(b.owner) && playerById(b.owner).side === 'home';
    if (youHaveBall && b.owner === p.id) {
      if (inShootRange(p)) doShoot(p); else doPass(p);
    } else if (dist(p, b) < CFG.tackleR) {
      doTackle(p);
    } else {
      // manual switch to the next-best presser
      switchActive();
    }
  }
  function inShootRange(p) {
    // distance to the goal HOME attacks (top, y=0)
    const gy = 0, gx = CFG.PW/2;
    const d = len(p.x - gx, p.y - gy);
    return d < 30 && p.y < CFG.PL * 0.62;
  }
  function switchActive() {
    const cands = game.home.players.filter(p => !p.isGK && p.id !== game.activeId);
    cands.sort((a, b) => timeToBall(a) - timeToBall(b));
    if (cands[0]) setActive(cands[0].id, true);
  }
  function timeToBall(p) {
    const b = game.ball;
    return dist(p, b) / (CFG.playerMax * p.speedR);
  }

  // ============================================================
  // SIMULATION
  // ============================================================
  function update(dt) {
    if (game.phase === 'ended') return;
    if (game.phase === 'goal' || game.phase === 'restart') {
      game.phaseT -= dt;
      tickEffects(dt);
      decayRipples(dt);
      if (game.phaseT <= 0) {
        if (game.phase === 'goal') { resetPositions(game._concede, true); game.phase = 'play'; }
        else game.phase = 'play';
      }
      // clear stale input
      game.keys = {}; game.tapped = {};
      return;
    }

    // clock
    const scale = HALF_SIM / LENGTHS[game.settings.length];
    game.clockSec += dt * scale;
    if (game.half === 1 && game.clockSec >= HALF_SIM) { game.clockSec = HALF_SIM; goHalftime(); return; }
    if (game.half === 2 && game.clockSec >= HALF_SIM * 2) { game.clockSec = HALF_SIM * 2; goFulltime(); return; }

    // possession accounting
    const owner = playerById(game.ball.owner);
    const pside = owner ? owner.side : game.lastTouch;
    game.poss[pside] += dt;

    chooseActive(dt);
    for (const p of allPlayers()) updatePlayer(p, dt);
    tickDispossess(dt);
    updateBall(dt);
    updateKeepers(dt);
    checkBounds();
    tickEffects(dt);
    decayRipples(dt);

    game.tapped = {};               // consume per-frame taps
  }

  function decayRipples(dt) {
    game.netRipple.home = Math.max(0, game.netRipple.home - dt);
    game.netRipple.away = Math.max(0, game.netRipple.away - dt);
  }

  // ----- active player selection (auto-switch with hysteresis) -----
  function chooseActive(dt) {
    game.activeLockT = Math.max(0, game.activeLockT - dt);
    const b = game.ball;
    const owner = playerById(b.owner);
    if (owner && owner.side === 'home') { game.activeId = owner.id; return; } // you have it
    if (game.activeLockT > 0) return;                                          // manual lock
    // pick your outfielder with least time-to-ball, with hysteresis
    let best = null, bt = 1e9;
    for (const p of game.home.players) {
      if (p.isGK) continue;
      const t = timeToBall(p);
      if (t < bt) { bt = t; best = p; }
    }
    const cur = playerById(game.activeId);
    if (!cur || cur.isGK || cur.side !== 'home') { if (best) game.activeId = best.id; return; }
    if (best && best.id !== cur.id && timeToBall(cur) > bt + 0.35) game.activeId = best.id;
  }

  // ----- per-player update -----
  function updatePlayer(p, dt) {
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.dashT = Math.max(0, (p.dashT || 0) - dt);
    if (p.isGK) return; // keepers handled separately

    let mvx = 0, mvy = 0, sprint = 1;
    const b = game.ball;
    const isActive = p.id === game.activeId && p.side === 'home' && !game._allAI;

    if (isActive) {
      const m = activeMove(p);
      mvx = m.x; mvy = m.y; sprint = m.sprint;
    } else {
      const m = aiMove(p, dt);
      mvx = m.x; mvy = m.y; sprint = m.sprint;
    }

    // accelerate toward desired velocity
    const dashMul = p.dashT > 0 ? CFG.dashBoost : 1;
    const maxV = CFG.playerMax * p.speedR * sprint * dashMul * (b.owner === p.id ? 0.93 : 1);
    const dvx = mvx * maxV, dvy = mvy * maxV;
    const acc = CFG.playerAccel * dt;
    p.vx = approach(p.vx, dvx, acc);
    p.vy = approach(p.vy, dvy, acc);
    p.x = clamp(p.x + p.vx * dt, -1.5, CFG.PW + 1.5);
    p.y = clamp(p.y + p.vy * dt, -3, CFG.PL + 3);

    const sp = len(p.vx, p.vy);
    if (sp > 0.4) { p.heading = Math.atan2(p.vy, p.vx); p.runPhase += sp * dt * 1.4; }

    // dribble: glue ball just ahead of the carrier
    if (b.owner === p.id) {
      const tx = p.x + Math.cos(p.heading) * CFG.controlDist;
      const ty = p.y + Math.sin(p.heading) * CFG.controlDist;
      const k = Math.min(1, 16 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
      b.vx = p.vx; b.vy = p.vy;
      // AI carriers decide what to do
      if (!isActive) aiOnBall(p, dt);
    }
  }

  // ----- active player steering -----
  function activeMove(p) {
    const now = performance.now() / 1000;
    // build input vector from held keys + this frame's taps
    let ix = 0, iy = 0;
    if (game.keys.ArrowLeft) ix -= 1; if (game.keys.ArrowRight) ix += 1;
    if (game.keys.ArrowUp) iy -= 1; if (game.keys.ArrowDown) iy += 1;
    let tx = 0, ty = 0;
    for (const k in game.tapped) { if (game.tapped[k] && DIRV[k]) { tx += DIRV[k].x; ty += DIRV[k].y; } }
    if (ix || iy) { setSteer(ix, iy); }
    else if (tx || ty) { setSteer(tx, ty); }

    const b = game.ball;
    const haveBall = b.owner === p.id;
    const steering = (now - game.lastSteerT) < CFG.steerHold;
    let dx, dy;
    if (haveBall) {
      // you fully steer the dribble; default forward (up) if you never steered
      if (game.steer.x || game.steer.y) { dx = game.steer.x; dy = game.steer.y; }
      else { dx = Math.cos(p.heading); dy = Math.sin(p.heading); }   // keep momentum
    } else if (steering) {
      dx = game.steer.x; dy = game.steer.y;
    } else {
      // auto-seek the ball (intercept its near-future position)
      const tgtx = b.x + b.vx * 0.18, tgty = b.y + b.vy * 0.18;
      dx = tgtx - p.x; dy = tgty - p.y;
    }
    const n = len(dx, dy) || 1;
    return { x: dx / n, y: dy / n, sprint: haveBall ? 1 : 1.06 };
  }
  function setSteer(x, y) {
    const n = len(x, y) || 1;
    game.steer.x = x / n; game.steer.y = y / n;
    game.lastSteerT = performance.now() / 1000;
  }

  // ----- AI off-ball + defensive movement -----
  function aiMove(p, dt) {
    const b = game.ball;
    const owner = playerById(b.owner);
    const team = teamObj(p.side);
    const weHaveBall = owner && owner.side === p.side;
    const form = teamObj(p.side).form;

    // formation home, shifted by ball
    const h = homePos(p.side, form[p.idx], p);
    const attackUp = p.side === 'home';
    // lateral shift toward ball, vertical shift by phase
    let tx = lerp(h.x, b.x, 0.28);
    const ballNy = attackUp ? (CFG.PL - b.y) / CFG.PL : b.y / CFG.PL; // 0..1 how advanced the ball is for this team
    let push = weHaveBall ? 0.16 : -0.12;
    if (p.role === 'FWD') push += weHaveBall ? 0.10 : 0.04;
    if (p.role === 'DEF') push -= weHaveBall ? 0.02 : 0.06;
    let ny = clamp(form[p.idx].ny + push + (ballNy - 0.5) * 0.5, 0.05, 0.95);
    let ty = attackUp ? CFG.PL * (1 - ny) : CFG.PL * ny;

    // pressing: only the NEAREST defender pressures the ball; the 2nd contains the lane.
    // Keeps the carrier challenged without the whole team collapsing on them.
    let dx, dy, sprint = 1;
    const closest = teamPressRank(p);
    const gy = attackUp ? CFG.PL : 0;
    if (b.owner == null) {
      // loose ball: nearest of each side chases
      if (closest === 0) { dx = b.x + b.vx*0.2 - p.x; dy = b.y + b.vy*0.2 - p.y; sprint = 1.06; }
      else { dx = tx - p.x; dy = ty - p.y; }
    } else if (!weHaveBall && closest === 0) {
      // primary presser — close in goal-side and actually challenge for the ball
      const ox = owner.x, oy = owner.y;
      dx = ox - p.x; dy = (oy + Math.sign(gy - oy) * 1.1) - p.y; sprint = 1.02;
    } else if (!weHaveBall && closest === 1 && dist(p, b) < 28) {
      // second man — CONTAIN: sit ~5m goal-side, cut the forward lane, don't swarm
      const ox = owner.x, oy = owner.y;
      dx = (ox * 0.45 + tx * 0.55) - p.x; dy = (oy + Math.sign(gy - oy) * 5.0) - p.y; sprint = 0.95;
    } else if (weHaveBall && p.role === 'FWD' && srandHash(p.idx, b) ) {
      // make a forward run into space ahead of the ball (toward the attacking goal)
      dx = tx - p.x; dy = (ty + (attackUp ? -4 : 4)) - p.y;
    } else {
      dx = tx - p.x; dy = ty - p.y;
    }

    // separation from nearby teammates (wider + stronger → defenders spread out, less clumping)
    let sx = 0, sy = 0;
    for (const q of team.players) {
      if (q === p || q.isGK) continue;
      const d2 = dist2(p.x, p.y, q.x, q.y);
      if (d2 < 30 && d2 > 0.001) { const d = Math.sqrt(d2); sx += (p.x - q.x)/d * (5.5 - d); sy += (p.y - q.y)/d * (5.5 - d); }
    }
    dx += sx * 0.7; dy += sy * 0.7;

    const n = len(dx, dy);
    if (n < 0.3) return { x: 0, y: 0, sprint: 0.0 };
    return { x: dx/n, y: dy/n, sprint };
  }
  // tiny stable hash so a given FWD consistently makes runs (not jitter)
  function srandHash(idx, b) { return ((idx * 37 + Math.floor(b.x)) % 5) < 3; }

  // rank of p among its team by distance to ball (0 = closest outfielder)
  function teamPressRank(p) {
    const mates = teamObj(p.side).players.filter(q => !q.isGK);
    const d = dist2(p.x, p.y, game.ball.x, game.ball.y);
    let rank = 0;
    for (const q of mates) { if (q === p) continue; if (dist2(q.x, q.y, game.ball.x, game.ball.y) < d) rank++; }
    return rank;
  }

  // ----- AI decision when holding the ball -----
  function aiOnBall(p, dt) {
    p.aiT -= dt;
    if (p.aiT > 0) return;
    const diff = DIFFS[game.settings.difficulty];
    p.aiT = (p.side === 'away' ? diff.react : 0.28) + rrange(0, 0.12);

    const attackUp = p.side === 'home';
    const gx = CFG.PW/2, gy = attackUp ? 0 : CFG.PL;
    const goalDist = len(p.x - gx, p.y - gy);
    const t = teamObj(p.side).def;

    // shoot? (arcade: shoot readily once in range)
    const inRange = goalDist < 30 && (attackUp ? p.y < CFG.PL*0.58 : p.y > CFG.PL*0.42);
    if (inRange) {
      const pressure = nearestOpponentDist(p);
      const sp = clamp(0.34 + (t.r.ATT/100)*0.4 - goalDist/45 + (pressure < 3 ? 0.18 : 0), 0.12, 0.92);
      if (srand() < sp) { aiShoot(p); return; }
    }
    // pass?
    const best = bestPassTarget(p);
    const pressNow = nearestOpponentDist(p);
    if (best && (best.score > 0.45 || pressNow < 2.6)) {
      aiPass(p, best.mate); return;
    }
    // else dribble toward goal, steering around nearest defender
    const opp = nearestOpponent(p);
    let dx = gx - p.x, dy = gy - p.y; const n = len(dx,dy)||1; dx/=n; dy/=n;
    if (opp && dist(p, opp) < 6) { // veer around
      const ax = p.x - opp.x, ay = p.y - opp.y; const an = len(ax,ay)||1;
      dx += ax/an * 0.8; dy += ay/an * 0.8;
    }
    const nn = len(dx,dy)||1;
    p.heading = Math.atan2(dy/nn, dx/nn);
  }
  function nearestOpponent(p) { return nearestOfSide(otherSide(p.side), p, false); }
  function nearestOpponentDist(p) { const o = nearestOpponent(p); return o ? dist(p, o) : 99; }

  function bestPassTarget(p) {
    const mates = teamObj(p.side).players;
    const attackUp = p.side === 'home';
    let best = null, bs = -1;
    for (const m of mates) {
      if (m === p || m.isGK) continue;
      const d = dist(p, m);
      if (d < 4 || d > 45) continue;
      // forward gain (toward opponent goal)
      const fwd = attackUp ? (p.y - m.y) : (m.y - p.y);
      const open = clamp(nearestOppToPoint(m, p.side) / 8, 0, 1);
      const lane = laneClear(p, m) ? 1 : 0.3;
      const fwdN = clamp(fwd / 30, -0.3, 1);
      const score = fwdN * 0.55 + open * 0.3 + lane * 0.25 - clamp((d-30)/40, 0, 0.3);
      if (score > bs) { bs = score; best = m; }
    }
    return best ? { mate: best, score: bs } : null;
  }
  function nearestOppToPoint(pt, side) {
    const opps = teamObj(otherSide(side)).players;
    let bd = 1e9; for (const o of opps) { const d = dist(o, pt); if (d < bd) bd = d; } return bd;
  }
  function laneClear(from, to) {
    const opps = teamObj(otherSide(from.side)).players;
    const dx = to.x - from.x, dy = to.y - from.y; const L = len(dx,dy) || 1;
    const ux = dx/L, uy = dy/L;
    for (const o of opps) {
      const t = clamp(((o.x-from.x)*ux + (o.y-from.y)*uy), 0, L);
      const px = from.x + ux*t, py = from.y + uy*t;
      if (len(o.x-px, o.y-py) < 1.8) return false;
    }
    return true;
  }

  // ----- kicks -----
  function aiShoot(p) { kickToGoal(p, p.side, 0.0, DIFFS[game.settings.difficulty]); }
  function aiPass(p, mate) {
    const diff = DIFFS[game.settings.difficulty];
    const lead = 0.28;
    const tx = mate.x + mate.vx * lead, ty = mate.y + mate.vy * lead;
    kickTo(p, tx, ty, false, diff.pass);
    if (p.side === 'away') {} // away: control follows ball naturally
  }

  // pass to the best teammate in the direction the player is FACING/steering
  function directionalPassTarget(p, ax, ay) {
    const an = len(ax, ay) || 1; ax /= an; ay /= an;
    const mates = teamObj(p.side).players;
    let best = null, bs = -1e9;
    for (const m of mates) {
      if (m === p || m.isGK) continue;
      const dx = m.x - p.x, dy = m.y - p.y, d = len(dx, dy);
      if (d < 3 || d > 55) continue;
      const align = (dx/d) * ax + (dy/d) * ay;          // -1..1: in the facing direction?
      const open = clamp(nearestOppToPoint(m, p.side) / 8, 0, 1);
      const lane = laneClear(p, m) ? 1 : 0.4;
      const distPen = d > 38 ? (d - 38) / 40 : 0;
      const score = align * 1.5 + open * 0.35 + lane * 0.35 - distPen - (d < 6 ? 0.25 : 0);
      if (score > bs) { bs = score; best = m; }
    }
    return best;
  }
  // aim direction = your active steer if you're steering, else the way you're facing
  function homePassTarget(p) {
    let ax = game.steer.x, ay = game.steer.y;
    if (!ax && !ay) { ax = Math.cos(p.heading); ay = Math.sin(p.heading); }
    return directionalPassTarget(p, ax, ay);
  }
  function doPass(p) {
    const mate = homePassTarget(p) || pickForwardMate(p);
    if (!mate) { doShoot(p); return; }
    const lead = 0.30;
    const tx = mate.x + mate.vx * lead, ty = mate.y + mate.vy * lead;
    kickTo(p, tx, ty, false, 0.97);
    setActive(mate.id, true);
  }
  function pickForwardMate(p) {
    const mates = game.home.players.filter(m => m !== p && !m.isGK);
    mates.sort((a,b) => a.y - b.y); // smallest y = most advanced (home attacks up)
    return mates[0];
  }
  function doShoot(p) {
    kickToGoal(p, p.side, game.steer.x, { shot: 0.99 });
  }
  function kickToGoal(p, side, aimX, acc) {
    game.stats.shots[side]++;
    const attackUp = side === 'home';
    const gy = attackUp ? 0 : CFG.PL;
    const goalDist = len(p.x - CFG.PW/2, p.y - gy);
    // aim toward a post based on steer (player skill); AI aims away from keeper
    let aim = aimX;
    if (side === 'away' || aim === 0) {
      const gk = teamObj(otherSide(side)).players[0];
      aim = clamp((CFG.PW/2 - gk.x) / CFG.goalHalfW, -1, 1) * 0.7 + rrange(-0.25, 0.25);
    }
    const tx = clamp(CFG.PW/2 + aim * (CFG.goalHalfW - 0.4), CFG.PW/2 - CFG.goalHalfW + 0.3, CFG.PW/2 + CFG.goalHalfW - 0.3);
    const ty = gy;
    const skill = (acc && acc.shot) || 0.9;
    const err = (1 - skill) * 6 + clamp(goalDist/30,0,1) * 1.4;
    const ex = tx + rrange(-err, err), ey = ty + rrange(-1, 1);
    if (Math.abs(ex - CFG.PW/2) < CFG.goalHalfW) game.stats.sot[side]++;   // on-frame = on target
    kickRaw(p, ex, ey, CFG.ballMax * (0.78 + (teamObj(side).def.r.ATT/100)*0.22), true);
  }
  function goalAimedOnTarget(tx) { return Math.abs(tx - CFG.PW/2) < CFG.goalHalfW; }
  function kickTo(p, tx, ty, isShot, skill) {
    const d = len(tx - p.x, ty - p.y);
    const err = (1 - skill) * (d * 0.10 + 1.5);
    // speed chosen so ground friction brings the ball ~to the target (v² = 2·decel·d), slight overhit
    const speed = clamp(Math.sqrt(2 * CFG.ballDecel * d) * 1.08, 9, CFG.ballMax);
    kickRaw(p, tx + rrange(-err, err), ty + rrange(-err, err), speed, isShot);
  }
  function kickRaw(p, tx, ty, speed, isShot) {
    const b = game.ball;
    const dx = tx - b.x, dy = ty - b.y; const n = len(dx, dy) || 1;
    b.vx = dx/n * speed; b.vy = dy/n * speed;
    b.z = 0; b.vz = isShot ? rrange(2.4, 4.4) : (speed > 16 ? rrange(0.8, 1.8) : 0);  // arc lift
    b.shot = !!isShot;
    b.owner = null; game.lastTouch = p.side; game.lastKicker = p.id; game.lastTouchPlayer = p.id;
    game._lastWasShot = !!isShot;
    p.kickCd = 0.45; p.heading = Math.atan2(dy, dx);
    if (isShot) { spawnTrail(); SFX.kick(); } else SFX.pass();
  }

  // ----- tackle -----
  function doTackle(p) {
    if (p.tackleCd > 0) return;
    p.tackleCd = 0.6;
    const b = game.ball;
    const carrier = playerById(b.owner);
    spawnEffect('tackle', p.x, p.y);
    SFX.tackle();
    if (dist(p, b) > CFG.tackleR) return;
    const diff = DIFFS[game.settings.difficulty];
    if (carrier && carrier.side !== p.side) {
      const base = 0.45 + (teamObj(p.side).def.r.DEF/100 - 0.6) * 0.6;
      const prob = clamp(base * (p.side === 'home' ? 1 : diff.tackle), 0.15, 0.9);
      if (srand() < prob) {
        b.owner = p.id; b.z = 0; b.vz = 0; b.shot = false; game.lastTouch = p.side; game.lastKicker = null; game.lastTouchPlayer = p.id; game._lastWasShot = false;
        spawnEffect('win', p.x, p.y);
        if (p.side === 'home') { setActive(p.id, true); say(pick(['Won it back!', 'Great tackle!', 'Dispossessed!'])); }
      } else if (srand() < 0.12) {
        // foul → free kick to the carrier's team
        game.stats.fouls[p.side]++;
        SFX.whistle(); say('Foul given.');
        freeKick(carrier.side, p.x, p.y);
      }
    } else if (b.owner == null && dist(p, b) < CFG.captureR + 0.5) {
      b.owner = p.id; b.z = 0; b.vz = 0; b.shot = false; game.lastTouch = p.side; game.lastTouchPlayer = p.id;
      if (p.side==='home') setActive(p.id, true);
    }
  }

  // A close defender wins the ball off the carrier over a moment of pressure
  // (applies to you AND the AI — so you can no longer just hold it forever).
  function tickDispossess(dt) {
    const b = game.ball;
    const carrier = playerById(b.owner);
    if (!carrier || carrier.isGK) return;
    let presser = null, pd = 1e9;
    for (const o of teamObj(otherSide(carrier.side)).players) {
      if (o.isGK || o.tackleCd > 0) continue;
      const d = dist(o, carrier);
      if (d < pd) { pd = d; presser = o; }
    }
    if (!presser || pd > CFG.tackleR) return;
    const diff = DIFFS[game.settings.difficulty];
    const defR = teamObj(presser.side).def.r.DEF / 100;
    const carR = teamObj(carrier.side).def.r.MID / 100;
    let rate = (0.4 + (defR - 0.6) * 2.0) * (1 - pd / CFG.tackleR);   // ramps up the closer they get
    rate *= clamp(1.15 - (carR - 0.6), 0.6, 1.35);                   // skilled carriers shield better
    if (carrier.dashT > 0) rate *= 0.4;                              // a dash buys a moment
    rate *= (carrier.side === 'home') ? diff.tackle : (2 - diff.tackle);  // difficulty scales the human's opponent
    if (srand() < rate * dt) knockLoose(carrier, presser);
  }
  function knockLoose(carrier, presser) {
    const b = game.ball;
    const dx = presser.x - carrier.x, dy = presser.y - carrier.y, n = len(dx, dy) || 1;
    b.owner = null; b.shot = false; b.z = 0; b.vz = 0;
    const sp = rrange(3.5, 6.5);
    b.vx = dx/n * sp + rrange(-2, 2); b.vy = dy/n * sp + rrange(-2, 2);
    game.lastTouch = presser.side; game.lastTouchPlayer = presser.id;
    game.lastKicker = carrier.id; carrier.kickCd = 0.4;   // carrier can't instantly re-grab the loose ball
    presser.tackleCd = 0.5;
    spawnEffect('tackle', carrier.x, carrier.y); SFX.tackle();
    if (carrier.side === 'home') say(pick(['Dispossessed!', 'Robbed of it!', 'Lost the ball!']));
    else if (presser.side === 'home') say(pick(['Won it back!', 'Great challenge!', 'Nicked the ball!']));
  }

  // ============================================================
  // BALL
  // ============================================================
  function updateBall(dt) {
    const b = game.ball;
    if (b.owner != null) { b.z = 0; b.vz = 0; pushTrail(); return; }
    // integrate + ground friction (less drag while airborne)
    const sp = len(b.vx, b.vy);
    if (sp > 0) {
      const dec = CFG.ballDecel * (b.z > 0.3 ? 0.25 : 1) * dt;
      const ns = Math.max(0, sp - dec);
      b.vx = b.vx / sp * ns; b.vy = b.vy / sp * ns;
      if (ns < CFG.ballStop && b.z <= 0) { b.vx = 0; b.vy = 0; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // height / arc
    if (b.z > 0 || b.vz !== 0) {
      b.z += b.vz * dt; b.vz -= CFG.ballGravity * dt;
      if (b.z <= 0) { b.z = 0; b.vz = (Math.abs(b.vz) > 3 ? -b.vz * 0.32 : 0); }  // small bounce
    }
    pushTrail();
    // capture by a nearby player (interceptions emerge here)
    captureCheck();
  }
  function pushTrail() {
    const b = game.ball;
    b.trail.push(b.x, b.y);
    if (b.trail.length > 16) b.trail.splice(0, b.trail.length - 16);
  }
  function spawnTrail() { game.ball.trail.length = 0; }

  function captureCheck() {
    const b = game.ball;
    if (b.z > 1.7) return;                                  // flying over their heads
    if (b.shot && len(b.vx, b.vy) > 13) return;             // a live shot blows past field players → only the keeper stops it
    let best = null, bd = CFG.captureR * CFG.captureR;
    for (const p of allPlayers()) {
      if (p.id === game.lastKicker && p.kickCd > 0) continue;
      if (p.isGK) continue; // keepers capture in their own logic
      const d2 = dist2(p.x, p.y, b.x, b.y);
      if (d2 < bd) { bd = d2; best = p; }
    }
    if (best) {
      b.owner = best.id; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.shot = false;
      game.lastTouch = best.side; game.lastKicker = null; game.lastTouchPlayer = best.id; game._lastWasShot = false;
      if (best.side === 'home' && best.id !== game.activeId) setActive(best.id, false);
    }
  }

  // ============================================================
  // GOALKEEPERS
  // ============================================================
  function updateKeepers(dt) {
    keeperLogic(game.home.players[0], 'home', dt);
    keeperLogic(game.away.players[0], 'away', dt);
  }
  function keeperLogic(gk, side, dt) {
    const b = game.ball;
    const lineY = side === 'home' ? CFG.PL - 0.6 : 0.6;     // own goal line
    const ownGoalUp = side === 'away';                       // away defends top (y=0)
    // track ball x, clamped to the goal mouth (+a little)
    let tx = clamp(b.x, CFG.PW/2 - CFG.goalHalfW - 1.5, CFG.PW/2 + CFG.goalHalfW + 1.5);
    let ty = lineY;
    // come off the line a touch if the ball is close & in the box
    const inBox = (side === 'home') ? b.y > CFG.PL - CFG.boxD : b.y < CFG.boxD;
    if (inBox) ty = side === 'home' ? CFG.PL - 2.2 : 2.2;
    const maxV = CFG.playerMax * 0.95;
    const latMax = CFG.playerMax * 0.6;   // limited lateral reach — well-placed corner shots beat the keeper
    gk.vx = approach(gk.vx, clamp((tx - gk.x) * 4, -latMax, latMax), CFG.playerAccel * dt);
    gk.vy = approach(gk.vy, clamp((ty - gk.y) * 4, -maxV*0.7, maxV*0.7), CFG.playerAccel * dt);
    gk.x += gk.vx * dt; gk.y += gk.vy * dt;
    if (len(gk.vx, gk.vy) > 0.3) gk.heading = Math.atan2(gk.vy, gk.vx);

    // grab / save balls near the goal (height-gated so high shots beat the keeper)
    if (b.owner == null && b.z <= CFG.catchH) {
      const inArea = (side === 'home') ? (b.y > CFG.PL - 9) : (b.y < 9);   // claim only near the goal
      const reach = 1.9 + (teamObj(side).def.r.GK/100 - 0.7) * 2.4;   // better keepers dive further
      if (inArea && dist(gk, b) < reach && !(game.lastKicker === gk.id && gk.kickCd > 0)) {
        const wasShot = game._lastWasShot && len(b.vx, b.vy) > 9;
        b.owner = gk.id; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.shot = false;
        game.lastTouch = side; game.lastTouchPlayer = gk.id; game._lastWasShot = false; gk.kickCd = 0;
        if (wasShot) { SFX.save(); spawnEffect('win', gk.x, gk.y); say(pick(['What a save!', 'The keeper denies them!', 'Brilliant stop!', 'Saved!'])); }
        keeperDistribute(gk, side);
      }
    }
    // dribble/hold then distribute
    if (b.owner === gk.id) {
      const tgx = gk.x, tgy = gk.y + (side === 'home' ? -0.8 : 0.8);
      b.x = tgx; b.y = tgy; b.vx = 0; b.vy = 0;
      gk._holdT = (gk._holdT || 0) + dt;
      if (gk._holdT > 0.5) { gk._holdT = 0; keeperDistribute(gk, side); }
    } else { gk._holdT = 0; }
  }
  function keeperDistribute(gk, side) {
    // throw/pass to the most open near teammate up-field
    const mates = teamObj(side).players.filter(m => !m.isGK);
    let best = null, bs = -1;
    for (const m of mates) {
      const open = nearestOppToPoint(m, side);
      const adv = side === 'home' ? (CFG.PL - m.y) : m.y;
      const s = open * 0.6 + adv * 0.2 - dist(gk, m) * 0.1;
      if (s > bs) { bs = s; best = m; }
    }
    if (best) kickTo(gk, best.x, best.y, false, 0.9);
  }

  // ============================================================
  // RULES — goals, out of bounds, restarts
  // ============================================================
  let _prevBall = { x: CFG.PW/2, y: CFG.PL/2 };
  function checkBounds() {
    const b = game.ball;
    // Note: we check the BALL against the lines even when it is owned — a player
    // can dribble it out of play (throw-in/goal-kick) or dribble it into the net.

    // GOAL LINES (top y=0 → HOME scores; bottom y=PL → AWAY scores)
    const withinPosts = Math.abs(b.x - CFG.PW/2) < CFG.goalHalfW;
    if (_prevBall.y > 0 && b.y <= 0) {
      if (withinPosts) {
        if (b.z > CFG.crossbarH) { overBar('home'); return; }
        if (nearPost(b.x)) { postBounce(true); return; }
        return scoreGoal('home');
      }
      if (game._lastWasShot && game.lastTouch === 'home') { say(pick(['Just wide!', 'Inches away!', 'So close!'])); game._lastWasShot = false; }
      if (game.lastTouch === 'home') goalKick('away'); else cornerKick('home', b.x < CFG.PW/2 ? 'L' : 'R', true);
      return;
    }
    if (_prevBall.y < CFG.PL && b.y >= CFG.PL) {
      if (withinPosts) {
        if (b.z > CFG.crossbarH) { overBar('away'); return; }
        if (nearPost(b.x)) { postBounce(false); return; }
        return scoreGoal('away');
      }
      if (game._lastWasShot && game.lastTouch === 'away') { say(pick(['Just wide!', 'Inches away!', 'So close!'])); game._lastWasShot = false; }
      if (game.lastTouch === 'away') goalKick('home'); else cornerKick('away', b.x < CFG.PW/2 ? 'L' : 'R', false);
      return;
    }
    // SIDELINES → throw-in to the team that didn't touch it last
    if (b.x <= 0 || b.x >= CFG.PW) {
      const toSide = otherSide(game.lastTouch);
      throwIn(toSide, clamp(b.y, 4, CFG.PL - 4), b.x <= 0 ? 0.4 : CFG.PW - 0.4);
      return;
    }
    _prevBall.x = b.x; _prevBall.y = b.y;
  }

  function nearPost(x) {
    // only genuinely post-bound shots rebound (aimed shots land ~0.4m inside the post)
    return Math.abs(x - (CFG.PW/2 - CFG.goalHalfW)) < 0.18 || Math.abs(x - (CFG.PW/2 + CFG.goalHalfW)) < 0.18;
  }
  function overBar(shooter) {
    SFX.post(); say(pick(['Over the bar!', 'Too high!', 'Off the woodwork and over!']));
    game._lastWasShot = false;
    goalKick(otherSide(shooter));
  }
  function postBounce(top) {
    const b = game.ball;
    SFX.post(); say(pick(['Off the post!', 'Rattles the woodwork!', 'Hits the upright!']));
    b.y = top ? 1.2 : CFG.PL - 1.2;
    b.vy = -b.vy * 0.55; b.vx *= 0.6; b.z = 0; b.vz = 0;
    b.x += (b.x < CFG.PW/2 ? 1 : -1) * 0.6;     // nudge back infield
    b.owner = null; game._lastWasShot = false;
    _prevBall.x = b.x; _prevBall.y = b.y;
  }

  function scoreGoal(side) {
    teamObj(side).score++;
    game._concede = otherSide(side);
    game.phase = 'goal'; game.phaseT = CFG.goalCelebrate;
    game.netRipple[otherSide(side)] = 1.0; // the conceding net ripples
    const scorer = playerById(game.lastTouchPlayer);
    const ownGoal = scorer && scorer.side !== side;
    showBanner(ownGoal ? 'OWN GOAL' : 'GOAL!');
    goalCommentary(side, scorer, ownGoal);
    SFX.goal(); pitchPunch();
    spawnGoalBurst(side);
    paintScoreboard();
    const b = game.ball; b.owner = null; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0;
    _prevBall.x = b.x; _prevBall.y = b.y;
    game._lastWasShot = false;
    if (game.cup) game.cup.dirty = true;
  }
  function goalCommentary(side, scorer, ownGoal) {
    const hs = game.home.score, as = game.away.score;
    let state;
    if (hs === as) state = `level at ${hs}–${as}`;
    else { const ld = hs > as ? game.home.def : game.away.def; state = `${ld.name} lead ${Math.max(hs,as)}–${Math.min(hs,as)}`; }
    const who = scorer ? `#${scorer.num} ${teamObj(scorer.side).def.code}` : '';
    say((ownGoal ? 'Own goal! ' : 'GOAL! ') + (who ? who + ' — ' : '') + state + '.');
  }
  function pitchPunch() { const el = $('pitch'); if (!el) return; el.classList.remove('punch'); void el.offsetWidth; el.classList.add('punch'); }

  function restartAt(toSide, x, y, label, pushBack) {
    const b = game.ball;
    b.x = clamp(x, 0.5, CFG.PW-0.5); b.y = clamp(y, 0.5, CFG.PL-0.5);
    b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.owner = null; b.shot = false; game._lastWasShot = false;
    _prevBall.x = b.x; _prevBall.y = b.y;
    const taker = nearestOfSide(toSide, b, true) || teamObj(toSide).players[0];
    taker.x = b.x; taker.y = b.y + (toSide === 'home' ? 0.8 : -0.8);
    taker.vx = 0; taker.vy = 0;
    b.owner = taker.id; game.lastTouch = toSide; game.lastKicker = null; game.lastTouchPlayer = taker.id;
    if (toSide === 'home') setActive(taker.id, true);
    if (pushBack) {
      for (const o of teamObj(otherSide(toSide)).players) {
        if (o.isGK) continue;
        if (dist(o, b) < 5) { const dx=o.x-b.x, dy=o.y-b.y, n=len(dx,dy)||1; o.x=b.x+dx/n*5; o.y=b.y+dy/n*5; }
      }
    }
    game.phase = 'restart'; game.phaseT = CFG.restartPause;
    showToast(label);
  }
  function throwIn(toSide, y, x) { restartAt(toSide, x, y, 'Throw-in', false); }
  function goalKick(toSide) {
    const y = toSide === 'home' ? CFG.PL - CFG.sixD : CFG.sixD;
    restartAt(toSide, CFG.PW/2 + rrange(-6,6), y, 'Goal kick', true);
  }
  function cornerKick(toSide, lr, topGoal) {
    const x = lr === 'L' ? 1 : CFG.PW - 1;
    const y = topGoal ? 1 : CFG.PL - 1;
    restartAt(toSide, x, y, 'Corner', true);
  }
  function freeKick(toSide, x, y) { restartAt(toSide, x, y, 'Free kick', true); }

  // ============================================================
  // HALF / FULL TIME
  // ============================================================
  function goHalftime() { game.phase = 'play'; SFX.whistle(); navigateTo('halftime'); }
  function goFulltime() {
    game.phase = 'ended';
    SFX.whistle();
    const hs = game.home.score, as = game.away.score;
    if (game.cup) { onCupMatchEnd(); return; }
    if (hs > as) game.record.w++; else if (hs < as) game.record.l++; else game.record.d++;
    saveStore();
    navigateTo('result');
  }

  // ============================================================
  // CUP — single-elimination tournament (8 teams) + penalty shootouts
  // ============================================================
  function shuffle(a) { for (let i = a.length-1; i > 0; i--) { const j = Math.floor(srand()*(i+1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function strengthOf(id) { const r = teamById(id).r; return r.ATT*0.3 + r.MID*0.25 + r.DEF*0.25 + r.PAC*0.1 + r.GK*0.1; }
  function poisson(lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= srand(); } while (p > L); return k - 1; }
  function simWinner(aId, bId) {
    const sa = strengthOf(aId), sb = strengthOf(bId);
    const pa = 1 / (1 + Math.pow(10, (sb - sa) / 12));
    let ga = poisson(0.8 + pa*1.6), gb = poisson(0.8 + (1-pa)*1.6);
    if (ga === gb) { if (srand() < pa) ga++; else gb++; }   // knockout — no draws
    return { winner: ga > gb ? aId : bId, score: [ga, gb] };
  }
  function roundName(n) { return n >= 8 ? 'Quarter-finals' : n === 4 ? 'Semi-finals' : n === 2 ? 'Final' : 'Champion'; }

  function startNewCupFlow() {
    game.ts.mode = 'cup'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startCup(youId) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x51ed2701;
    const others = shuffle(TEAMS.map(t => t.id).filter(id => id !== youId)).slice(0, 7);
    const eight = shuffle([youId].concat(others));
    game.cup = { you: youId, rounds: [eight], scores: [new Array(4).fill(null)], round: 0, alive: true, champion: null };
    game.ts.you = youId; saveStore();
    navigateTo('cup', { addToHistory: false }); game.history = ['title'];
    renderCup('Quarter-finals — good luck!');
  }
  function cupOpponent() {
    const c = game.cup, teams = c.rounds[c.round], yi = teams.indexOf(c.you);
    if (yi < 0) return null;
    return teams[yi % 2 === 0 ? yi + 1 : yi - 1];
  }
  function cupPlay() {
    const c = game.cup; if (!c || !c.alive || c.champion) return;
    const opp = cupOpponent(); if (!opp) return;
    startMatch(c.you, opp);
    game.history = ['cup'];
  }
  function onCupMatchEnd() {
    const hs = game.home.score, as = game.away.score;
    const youId = game.home.teamId, oppId = game.away.teamId;
    if (hs === as) { startShootout(youId, oppId); return; }
    finishCupMatch(hs > as ? youId : oppId);
  }
  function resolveCup(yourWinnerId) {
    const c = game.cup, teams = c.rounds[c.round], n = teams.length;
    const yi = teams.indexOf(c.you), yourPair = yi >= 0 ? (yi >> 1) : -1;
    const winners = [], scoreRow = [];
    for (let i = 0; i < n/2; i++) {
      if (i === yourPair) { winners.push(yourWinnerId); scoreRow.push([game.home.score, game.away.score]); }
      else { const r = simWinner(teams[2*i], teams[2*i+1]); winners.push(r.winner); scoreRow.push(r.score); }
    }
    c.scores[c.round] = scoreRow;
    if (yourPair >= 0 && yourWinnerId !== c.you) c.alive = false;
    if (winners.length === 1) c.champion = winners[0];
    else { c.rounds.push(winners); c.scores.push(new Array(winners.length/2).fill(null)); c.round++; }
  }
  function autoCompleteCup() {
    const c = game.cup; let guard = 0;
    while (!c.champion && guard++ < 8) {
      const teams = c.rounds[c.round], winners = [], scoreRow = [];
      for (let i = 0; i < teams.length/2; i++) { const r = simWinner(teams[2*i], teams[2*i+1]); winners.push(r.winner); scoreRow.push(r.score); }
      c.scores[c.round] = scoreRow;
      if (winners.length === 1) c.champion = winners[0];
      else { c.rounds.push(winners); c.scores.push(new Array(winners.length/2).fill(null)); c.round++; }
    }
  }
  function finishCupMatch(winnerId) {
    const c = game.cup;
    const youWon = winnerId === c.you;
    resolveCup(winnerId);
    if (!c.alive && !c.champion) autoCompleteCup();
    saveStore();
    let msg;
    if (c.champion === c.you) msg = '🏆 You won the Cup! Champions!';
    else if (c.champion) msg = `${teamById(c.champion).name} won the Cup.`;
    else if (!c.alive) msg = 'Knocked out. Better luck next time.';
    else msg = youWon ? `Through to the ${roundName(c.rounds[c.round].length)}!` : '';
    navigateTo('cup', { addToHistory: false }); game.history = ['title'];
    renderCup(msg);
  }

  function renderCup(status) {
    const c = game.cup; if (!c) return;
    $('cup-round').textContent = c.champion ? 'Complete' : roundName(c.rounds[c.round].length);
    const host = $('cup-bracket');
    const titles = { 8: 'QF', 4: 'SF', 2: 'F' };
    let html = '';
    for (let r = 0; r < c.rounds.length; r++) {
      const teams = c.rounds[r], next = c.rounds[r+1], sc = c.scores[r] || [];
      html += `<div class="cup-col"><div class="cup-col-title">${titles[teams.length] || ''}</div>`;
      for (let i = 0; i < teams.length/2; i++) {
        const a = teams[2*i], b = teams[2*i+1], played = sc[i];
        const winner = next ? next[i] : (c.champion && r === c.rounds.length-1 ? c.champion : null);
        const isYour = (a === c.you || b === c.you);
        const playable = isYour && c.alive && !played && !c.champion;
        html += `<div class="cup-match${isYour ? ' you' : ''}${playable ? ' next' : ''}">`;
        [[a, played ? played[0] : ''], [b, played ? played[1] : '']].forEach(([id, gl]) => {
          const lose = winner && winner !== id ? ' lose' : '';
          const you = id === c.you ? ' you-row' : '';
          html += `<div class="cup-team${lose}${you}"><span class="ct-id"><span class="ct-dot" style="background:${teamById(id).col};color:${teamById(id).col}"></span><span class="ct-code">${teamById(id).code}</span></span><span>${gl}</span></div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }
    if (c.champion) html += `<div class="cup-col"><div class="cup-col-title">CUP</div><div class="cup-champion"><div class="trophy">🏆</div><span class="champ-code" style="color:${teamById(c.champion).col}">${teamById(c.champion).code}</span></div></div>`;
    host.innerHTML = html;
    if (status != null) $('cup-status').textContent = status;
    const cp = $('cup-play');
    if (c.champion || !c.alive) cp.classList.add('hidden');
    else { cp.classList.remove('hidden'); cp.textContent = `Play Your Match · ${teamById(c.you).code} v ${teamById(cupOpponent()).code}`; }
  }

  // ----- penalty shootout -----
  const PEN_ZONES = 3;
  function startShootout(youId, oppId) {
    game.penalty = { you: youId, opp: oppId, hs: 0, as: 0, hk: 0, ak: 0, turn: 'home', phase: 'aim', aim: 1, result: null, winner: null, histH: [], histA: [] };
    navigateTo('shootout', { addToHistory: false });
    SFX.whistle();
    drawPen(); penInstr();
  }
  function aiKeeperDive() { const r = srand(); return r < 0.4 ? 0 : r < 0.8 ? 2 : 1; }
  function aiShooterAim() { const r = srand(); return r < 0.4 ? 0 : r < 0.8 ? 2 : 1; }
  function penInput(key) {
    const c = game.penalty; if (!c || c.phase !== 'aim') return;
    if (key === 'ArrowLeft') c.aim = 0;
    else if (key === 'ArrowRight') c.aim = 2;
    else if (key === 'ArrowUp' || key === 'ArrowDown') c.aim = 1;
    else if (key === 'Enter') { penCommit(); return; }
    drawPen(); penInstr();
  }
  function penCommit() {
    const c = game.penalty; if (!c || c.phase !== 'aim') return;
    SFX.kick();
    const miss = srand() < 0.07;
    if (c.turn === 'home') {
      const aim = c.aim, dive = aiKeeperDive(), scored = !miss && dive !== aim;
      c.result = { aim, dive, scored, miss }; c.histH.push(scored);
      if (scored) { c.hs++; SFX.cheer(); } else SFX.save();
      c.hk++;
    } else {
      const dive = c.aim, aim = aiShooterAim(), scored = !miss && dive !== aim;
      c.result = { aim, dive, scored, miss }; c.histA.push(scored);
      if (scored) c.as++; else SFX.save();
      c.ak++;
    }
    c.phase = 'result'; drawPen(); penInstr();
    if (game._penFast) advancePen(); else setTimeout(advancePen, 1150);
  }
  function penDecided() {
    const c = game.penalty;
    const hRem = Math.max(0, 5 - c.hk), aRem = Math.max(0, 5 - c.ak);
    if (c.hk <= 5 && c.ak <= 5) {
      if (c.hs > c.as + aRem) return 'home';
      if (c.as > c.hs + hRem) return 'away';
      if (c.hk >= 5 && c.ak >= 5 && c.hs !== c.as) return c.hs > c.as ? 'home' : 'away';
      return null;
    }
    if (c.hk === c.ak && c.hs !== c.as) return c.hs > c.as ? 'home' : 'away';
    return null;
  }
  function advancePen() {
    const c = game.penalty; if (!c) return;
    const dec = penDecided();
    if (dec) { penFinish(dec); return; }
    c.turn = c.turn === 'home' ? 'away' : 'home';
    c.phase = 'aim'; c.aim = 1; c.result = null;
    drawPen(); penInstr();
  }
  function penFinish(side) {
    const c = game.penalty; c.phase = 'done'; c.winner = side;
    drawPen(); penInstr();
    SFX.whistle(); if (side === 'home') SFX.goal();
    const winnerId = side === 'home' ? c.you : c.opp;
    if (game._penFast) finishCupMatch(winnerId); else setTimeout(() => { finishCupMatch(winnerId); }, 1700);
  }
  function penInstr() {
    const c = game.penalty; if (!c) return;
    $('pen-top').textContent = `Penalties  ${teamById(c.you).code} ${c.hs} – ${c.as} ${teamById(c.opp).code}`;
    let t;
    if (c.phase === 'done') t = c.winner === 'home' ? 'You win the shootout!' : 'You lost the shootout.';
    else if (c.phase === 'result') t = c.result.scored ? 'GOAL!' : (c.result.miss ? 'Missed!' : 'Saved!');
    else t = c.turn === 'home' ? 'Swipe to aim · pinch to shoot' : 'Swipe to dive · pinch to commit';
    const el = $('pen-instr'); el.textContent = t; el.classList.add('show');
    const ch = $('pen-chip-tx'); if (ch) ch.textContent = c.turn === 'home' ? 'SHOOT' : 'DIVE';
  }
  let _penCtx = null;
  function drawPen() {
    const cnv = $('pen-canvas'); if (!cnv) return;
    const x = _penCtx || (_penCtx = cnv.getContext('2d'));
    const c = game.penalty;
    x.clearRect(0, 0, 600, 600);
    const gx0 = 150, gx1 = 450, gtop = 130, gbot = 270, zw = (gx1 - gx0) / 3;
    const zoneCenter = [gx0 + zw*0.5, 300, gx1 - zw*0.5];
    // zone highlight
    if (c && c.phase === 'aim') {
      x.fillStyle = c.turn === 'home' ? 'rgba(88,214,255,0.22)' : 'rgba(255,95,110,0.20)';
      x.fillRect(gx0 + c.aim*zw, gtop, zw, gbot - gtop);
    }
    // net
    x.strokeStyle = 'rgba(200,235,255,0.22)'; x.lineWidth = 1;
    for (let i = 0; i <= 12; i++) { const xx = lerp(gx0, gx1, i/12); x.beginPath(); x.moveTo(xx, gtop); x.lineTo(xx, gbot); x.stroke(); }
    for (let j = 0; j <= 6; j++) { const yy = lerp(gtop, gbot, j/6); x.beginPath(); x.moveTo(gx0, yy); x.lineTo(gx1, yy); x.stroke(); }
    // posts + bar
    x.strokeStyle = '#fff'; x.lineWidth = 4; x.shadowColor = 'rgba(150,230,255,0.8)'; x.shadowBlur = 8;
    x.beginPath(); x.moveTo(gx0, gbot); x.lineTo(gx0, gtop); x.lineTo(gx1, gtop); x.lineTo(gx1, gbot); x.stroke(); x.shadowBlur = 0;
    // ground
    x.strokeStyle = 'rgba(120,255,190,0.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(60, gbot); x.lineTo(540, gbot); x.stroke();
    if (!c) return;
    const youT = teamById(c.you), oppT = teamById(c.opp);
    // keeper
    const keeperCol = c.turn === 'home' ? oppT.gk : youT.gk;
    const kx = (c.phase !== 'aim' && c.result) ? zoneCenter[c.result.dive] : 300;
    penFig(x, kx, gbot - 4, keeperCol, true);
    // ball
    let bx = 300, by = 420;
    if (c.phase !== 'aim' && c.result) {
      if (c.result.miss) { bx = c.result.aim === 0 ? gx0 - 24 : c.result.aim === 2 ? gx1 + 24 : 300; by = gtop - 18; }
      else { bx = zoneCenter[c.result.aim]; by = c.result.scored ? gbot - 24 : gbot - 6; }
    }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, 9, 0, 6.2832); x.fill();
    x.fillStyle = 'rgba(20,30,24,0.9)'; x.beginPath(); x.arc(bx, by, 3, 0, 6.2832); x.fill();
    // kicker
    if (c.phase === 'aim') penFig(x, 300, 488, c.turn === 'home' ? youT.col : oppT.col, false);
    // score dots
    penDots(x, c);
    // big text
    if (c.phase === 'result' || c.phase === 'done') {
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '800 38px system-ui, sans-serif';
      x.fillText(c.phase === 'done' ? (c.winner === 'home' ? 'YOU WIN!' : 'YOU LOSE') : (c.result.scored ? 'GOAL!' : (c.result.miss ? 'MISS' : 'SAVED!')), 300, 365);
    }
  }
  function penFig(x, cx, cy, col, keeper) {
    x.save();
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(cx, cy + 2, 16, 6, 0, 0, 6.2832); x.fill();
    x.fillStyle = col;
    x.beginPath(); x.ellipse(cx, cy - 22, 11, 22, 0, 0, 6.2832); x.fill();      // body
    if (keeper) { x.strokeStyle = col; x.lineWidth = 5; x.beginPath(); x.moveTo(cx-22, cy-30); x.lineTo(cx+22, cy-30); x.stroke(); } // arms out
    x.fillStyle = '#e9c39b'; x.beginPath(); x.arc(cx, cy - 48, 8, 0, 6.2832); x.fill();   // head
    x.restore();
  }
  function penDots(x, c) {
    const row = (hist, cy) => {
      const n = Math.max(5, hist.length);
      for (let i = 0; i < n; i++) {
        const cx = 300 - (n-1)*10 + i*20;
        x.fillStyle = i < hist.length ? (hist[i] ? '#3ef08f' : '#ff5f6e') : '#22332a';
        x.beginPath(); x.arc(cx, cy, 6, 0, 6.2832); x.fill();
      }
      return n;
    };
    x.textAlign = 'right'; x.font = '700 13px system-ui, sans-serif'; x.textBaseline = 'middle';
    x.fillStyle = '#a9c6b6'; x.fillText(teamById(c.you).code, 300 - Math.max(5, c.histH.length)*10 - 12, 92);
    row(c.histH, 92);
    x.fillStyle = '#a9c6b6'; x.fillText(teamById(c.opp).code, 300 - Math.max(5, c.histA.length)*10 - 12, 112);
    row(c.histA, 112);
    x.textBaseline = 'alphabetic';
  }

  // ============================================================
  // EFFECTS
  // ============================================================
  function spawnEffect(type, x, y) { game.effects.push({ type, x, y, t: 0, life: type === 'tackle' ? 0.4 : 0.6 }); }
  function spawnGoalBurst(side) {
    const gx = CFG.PW/2, gy = side === 'home' ? 0 : CFG.PL;
    for (let i = 0; i < 36; i++) {
      const a = srand() * 6.28, s = rrange(6, 22);
      game.effects.push({ type: 'spark', x: gx + rrange(-3,3), y: gy + (side==='home'?1:-1)*rrange(0,2),
        vx: Math.cos(a)*s, vy: Math.sin(a)*s - 6, t: 0, life: rrange(0.7, 1.6), col: teamObj(side).def.col });
    }
    game.effects.push({ type: 'flash', x: gx, y: gy, t: 0, life: 0.5 });
  }
  function tickEffects(dt) {
    const e = game.effects;
    for (let i = e.length - 1; i >= 0; i--) {
      const f = e[i]; f.t += dt;
      if (f.type === 'spark') { f.x += f.vx*dt; f.y += f.vy*dt; f.vy += 24*dt; }
      if (f.t >= f.life) e.splice(i, 1);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  let cv, ctx, pitchCv, pitchCtx, geom;
  function setupRender() {
    cv = $('pitch'); ctx = cv.getContext('2d');
    pitchCv = document.createElement('canvas'); pitchCv.width = 600; pitchCv.height = 600;
    pitchCtx = pitchCv.getContext('2d');
  }
  function setupPitchGeom() {
    const W = 600, H = 600;
    const top = 60, bot = 58;   // reserve room so the scoreboard / action chip never cover the goals + nets
    const availH = H - top - bot;
    const ratio = CFG.PW / CFG.PL;
    let ph = availH, pw = ph * ratio;
    if (pw > W - 24) { pw = W - 24; ph = pw / ratio; }
    const ox = (W - pw) / 2, oy = top + (availH - ph) / 2;
    const s = pw / CFG.PW;
    geom = { ox, oy, pw, ph, s };
  }
  function wx(x) { return geom.ox + x * geom.s; }
  function wy(y) { return geom.oy + y * geom.s; }

  function drawStaticPitch() {
    const g = geom, p = pitchCtx;
    p.clearRect(0, 0, 600, 600);
    // surrounding floodlit darkness + faint stands
    const grad = p.createRadialGradient(300, 300, 80, 300, 300, 360);
    grad.addColorStop(0, 'rgba(20,40,30,0.22)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = grad; p.fillRect(0, 0, 600, 600);

    // pitch base + mowed stripes (along the length)
    const stripes = 10, sh = g.ph / stripes;
    for (let i = 0; i < stripes; i++) {
      p.fillStyle = i % 2 === 0 ? '#0c2c1b' : '#0a2416';
      p.fillRect(g.ox, g.oy + i * sh, g.pw, sh + 0.6);
    }
    // subtle vignette over pitch
    const vg = p.createLinearGradient(0, g.oy, 0, g.oy + g.ph);
    vg.addColorStop(0, 'rgba(0,0,0,0.18)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)');
    p.fillStyle = vg; p.fillRect(g.ox, g.oy, g.pw, g.ph);

    // glowing lines
    p.strokeStyle = 'rgba(225,255,238,0.92)';
    p.lineWidth = 2;
    p.shadowColor = 'rgba(120,255,190,0.55)'; p.shadowBlur = 6;
    const L = (x1,y1,x2,y2)=>{ p.beginPath(); p.moveTo(wx(x1),wy(y1)); p.lineTo(wx(x2),wy(y2)); p.stroke(); };
    const RECT = (x,y,w,h)=>{ p.beginPath(); p.rect(wx(x),wy(y),w*g.s,h*g.s); p.stroke(); };
    // boundary
    RECT(0, 0, CFG.PW, CFG.PL);
    // halfway
    L(0, CFG.PL/2, CFG.PW, CFG.PL/2);
    // center circle + spot
    p.beginPath(); p.arc(wx(CFG.PW/2), wy(CFG.PL/2), CFG.centerR * g.s, 0, 6.2832); p.stroke();
    dot(p, CFG.PW/2, CFG.PL/2, 2.2);
    // boxes both ends
    drawBoxes(p, true); drawBoxes(p, false);
    p.shadowBlur = 0;
    // goals + nets
    drawGoal(p, true); drawGoal(p, false);
  }
  function dot(p, x, y, r) { p.save(); p.fillStyle = 'rgba(225,255,238,0.95)'; p.beginPath(); p.arc(wx(x), wy(y), r, 0, 6.2832); p.fill(); p.restore(); }
  function drawBoxes(p, top) {
    const g = geom;
    const bx = (CFG.PW - CFG.boxW)/2, sx = (CFG.PW - CFG.sixW)/2;
    const by = top ? 0 : CFG.PL - CFG.boxD, sy = top ? 0 : CFG.PL - CFG.sixD;
    p.beginPath(); p.rect(wx(bx), wy(by), CFG.boxW*g.s, CFG.boxD*g.s); p.stroke();
    p.beginPath(); p.rect(wx(sx), wy(sy), CFG.sixW*g.s, CFG.sixD*g.s); p.stroke();
    const py = top ? CFG.penSpot : CFG.PL - CFG.penSpot;
    dot(p, CFG.PW/2, py, 2);
    // penalty arc
    p.beginPath();
    const a0 = top ? 0.32 : Math.PI + 0.32, a1 = top ? Math.PI - 0.32 : 6.2832 - 0.32;
    p.arc(wx(CFG.PW/2), wy(py), CFG.centerR*g.s, a0, a1); p.stroke();
  }
  function drawGoal(p, top) {
    const g = geom;
    const gx0 = CFG.PW/2 - CFG.goalHalfW, gx1 = CFG.PW/2 + CFG.goalHalfW;
    const gy = top ? 0 : CFG.PL;
    const depth = (top ? -1 : 1) * CFG.goalDepth;
    const back = gy + depth;
    // net mesh (trapezoid behind the line)
    p.save();
    p.strokeStyle = 'rgba(200,235,255,0.30)'; p.lineWidth = 1; p.shadowBlur = 0;
    const nx0 = wx(gx0), nx1 = wx(gx1), ny0 = wy(gy), ny1 = wy(back);
    const inset = 6 * (top ? 1 : 1);
    const bnx0 = nx0 + inset, bnx1 = nx1 - inset;
    // verticals
    for (let i = 0; i <= 7; i++) {
      const fx = i/7;
      const xF = lerp(nx0, nx1, fx), xB = lerp(bnx0, bnx1, fx);
      p.beginPath(); p.moveTo(xF, ny0); p.lineTo(xB, ny1); p.stroke();
    }
    // horizontals
    for (let j = 0; j <= 4; j++) {
      const fy = j/4;
      const yy = lerp(ny0, ny1, fy);
      const xL = lerp(nx0, bnx0, fy), xR = lerp(nx1, bnx1, fy);
      p.beginPath(); p.moveTo(xL, yy); p.lineTo(xR, yy); p.stroke();
    }
    p.restore();
    // posts + crossbar (bright)
    p.save();
    p.strokeStyle = 'rgba(255,255,255,0.98)'; p.lineWidth = 3.2;
    p.shadowColor = 'rgba(150,230,255,0.8)'; p.shadowBlur = 8;
    p.beginPath();
    p.moveTo(nx0, ny0); p.lineTo(nx0, ny1);
    p.moveTo(nx1, ny0); p.lineTo(nx1, ny1);
    p.moveTo(nx0, ny0); p.lineTo(nx1, ny0);
    p.stroke();
    p.restore();
  }

  function render() {
    if (!ctx || !geom) return;
    ctx.clearRect(0, 0, 600, 600);
    ctx.drawImage(pitchCv, 0, 0);
    drawNetRipples();
    drawAimHints();
    drawPlayers();
    drawBall();
    drawFx();
  }

  function drawNetRipples() {
    const draw = (side) => {
      const r = game.netRipple[side]; if (r <= 0) return;
      const top = side === 'away'; // away net is at top (y=0)
      const gx0 = CFG.PW/2 - CFG.goalHalfW, gx1 = CFG.PW/2 + CFG.goalHalfW;
      const gy = top ? 0 : CFG.PL, back = gy + (top ? -1 : 1) * CFG.goalDepth;
      ctx.save();
      ctx.strokeStyle = hexA(teamObj(otherSide(side)).def.col, 0.5 * r + 0.2);
      ctx.lineWidth = 1.4;
      for (let i = 1; i < 7; i++) {
        const fx = i/7; const x = lerp(wx(gx0), wx(gx1), fx);
        const bx = lerp(wx(gx0)+6, wx(gx1)-6, fx);
        const wob = Math.sin(i*1.5 + (1-r)*10) * 4 * r;
        ctx.beginPath(); ctx.moveTo(x, wy(gy)); ctx.lineTo(bx + wob, wy(back)); ctx.stroke();
      }
      ctx.restore();
    };
    draw('home'); draw('away');
  }

  function drawAimHints() {
    if (game.phase !== 'play') return;
    const p = playerById(game.activeId); if (!p || p.side !== 'home') return;
    const b = game.ball;
    const have = b.owner === p.id;
    if (have) {
      if (inShootRange(p)) {
        // shoot reticle on the goal + aim line
        const aim = game.steer.x;
        const tx = clamp(CFG.PW/2 + aim*(CFG.goalHalfW-0.4), CFG.PW/2-CFG.goalHalfW+0.3, CFG.PW/2+CFG.goalHalfW-0.3);
        ctx.save();
        ctx.strokeStyle = 'rgba(88,214,255,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([5,5]);
        ctx.beginPath(); ctx.moveTo(wx(p.x), wy(p.y)); ctx.lineTo(wx(tx), wy(0)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(88,214,255,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx(tx), wy(0), 7, 0, 6.2832); ctx.stroke();
        ctx.restore();
      } else {
        const m = homePassTarget(p);          // preview matches the facing-aware pass
        if (m) {
          ctx.save();
          ctx.strokeStyle = 'rgba(62,240,143,0.6)'; ctx.lineWidth = 1.6; ctx.setLineDash([4,5]);
          ctx.beginPath(); ctx.moveTo(wx(p.x), wy(p.y)); ctx.lineTo(wx(m.x), wy(m.y)); ctx.stroke();
          ctx.setLineDash([]);
          // chevron on receiver
          ctx.fillStyle = 'rgba(62,240,143,0.9)';
          ctx.beginPath(); ctx.arc(wx(m.x), wy(m.y) - 16, 4, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
      }
    } else if (dist(p, b) < CFG.tackleR + 1.5) {
      const c = playerById(b.owner);
      if (c) { ctx.save(); ctx.strokeStyle = 'rgba(255,95,110,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx(c.x), wy(c.y), 12, 0, 6.2832); ctx.stroke(); ctx.restore(); }
    }
  }

  function drawPlayers() {
    // sort by y so lower players draw on top (depth)
    const list = allPlayers().slice().sort((a,b) => a.y - b.y);
    for (const p of list) drawPlayer(p);
  }
  function drawPlayer(p) {
    const s = geom.s;
    const sx = wx(p.x), sy = wy(p.y);
    const t = teamObj(p.side).def;
    const col = p.isGK ? t.gk : t.col;
    const isActive = p.id === game.activeId && p.side === 'home' && !game._allAI;
    const hasBall = game.ball.owner === p.id;
    const r = p.isGK ? 3.3 : 3.0;
    let bodyR = Math.max(8, r * s * 0.55 + 5);
    if (isActive) bodyR *= 1.12;                     // the player you control is drawn a touch larger

    // dash trail
    if (isActive && p.dashT > 0) {
      for (let i = 1; i <= 3; i++) {
        const tx = sx - Math.cos(p.heading) * bodyR * 0.9 * i, ty = sy - Math.sin(p.heading) * bodyR * 0.9 * i;
        ctx.fillStyle = `rgba(88,214,255,${0.16 * (1 - i/4)})`;
        ctx.beginPath(); ctx.ellipse(tx, ty, bodyR*0.7, bodyR*0.82, 0, 0, 6.2832); ctx.fill();
      }
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.6, bodyR*0.95, bodyR*0.42, 0, 0, 6.2832); ctx.fill();

    // possession / active ring (glow) — instantly shows who has the ball and who you control
    if (isActive || hasBall) {
      ctx.save();
      const ringC = isActive ? '#58d6ff' : (p.side === 'home' ? '#3ef08f' : '#ff8a3a');
      ctx.strokeStyle = ringC; ctx.lineWidth = isActive ? 3 : 2.6;
      ctx.shadowColor = ringC; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.55, bodyR*1.25, bodyR*0.66, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    // running legs
    const swing = Math.sin(p.runPhase) * (len(p.vx,p.vy) > 0.5 ? bodyR*0.5 : 0);
    ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(2.5, bodyR*0.30); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - bodyR*0.3, sy + bodyR*0.25); ctx.lineTo(sx - bodyR*0.3, sy + bodyR*0.85 + swing);
    ctx.moveTo(sx + bodyR*0.3, sy + bodyR*0.25); ctx.lineTo(sx + bodyR*0.3, sy + bodyR*0.85 - swing);
    ctx.stroke(); ctx.lineCap = 'butt';

    // torso (kit) with sheen + a bright rim so it reads on the see-through display
    const grad = ctx.createLinearGradient(sx, sy - bodyR, sx, sy + bodyR);
    grad.addColorStop(0, shade(col, 0.2)); grad.addColorStop(1, shade(col, -0.2));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(sx, sy, bodyR*0.82, bodyR*0.96, 0, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = shade(col, 0.4); ctx.stroke();

    // shorts (secondary kit colour)
    ctx.fillStyle = t.col2;
    ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.55, bodyR*0.6, bodyR*0.34, 0, 0, 6.2832); ctx.fill();
    // captain's armband
    if (p.captain) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(sx - bodyR*0.66, sy - bodyR*0.22, bodyR*0.24, bodyR*0.36); }

    // head (leads in facing direction)
    const hx = sx + Math.cos(p.heading) * bodyR*0.5;
    const hy = sy + Math.sin(p.heading) * bodyR*0.5 - bodyR*0.18;
    ctx.fillStyle = '#f0c79e';
    ctx.beginPath(); ctx.arc(hx, hy, bodyR*0.44, 0, 6.2832); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.stroke();

    // number
    ctx.fillStyle = pickInk(col); ctx.font = `800 ${Math.round(bodyR*0.85)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num), sx, sy + bodyR*0.04);

    // active facing chevron
    if (isActive) {
      const cx = sx + Math.cos(p.heading) * bodyR*1.95;
      const cy = sy + Math.sin(p.heading) * bodyR*1.95;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(p.heading);
      ctx.fillStyle = '#58d6ff'; ctx.shadowColor = '#58d6ff'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(-4,-5); ctx.lineTo(-4,5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawBall() {
    const b = game.ball;
    const z = b.z || 0;
    // trail (ground)
    if (b.trail.length > 4) {
      for (let i = 0; i < b.trail.length - 2; i += 2) {
        const a = (i / b.trail.length) * 0.4;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(wx(b.trail[i]), wy(b.trail[i+1]), 2, 0, 6.2832); ctx.fill();
      }
    }
    const sx = wx(b.x), sy = wy(b.y);
    const zPix = z * geom.s * 2.2;               // exaggerated so the arc reads on a small pitch
    const R = Math.max(7, geom.s * 1.05) * (1 + z * 0.09);   // big & bright so it's easy to track
    // ground shadow (shrinks & fades as the ball rises)
    const sh = clamp(1 - z * 0.14, 0.3, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * sh})`;
    ctx.beginPath(); ctx.ellipse(sx, sy + R*0.5, R*0.95*sh, R*0.42*sh, 0, 0, 6.2832); ctx.fill();
    // lifted ball with a soft glow halo so you never lose it
    const by = sy - zPix;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 13;
    const g = ctx.createRadialGradient(sx - R*0.3, by - R*0.3, R*0.2, sx, by, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.72, '#eef5f0'); g.addColorStop(1, '#b3c6bb');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, by, R, 0, 6.2832); ctx.fill();
    ctx.restore();
    // pentagon hint
    ctx.fillStyle = 'rgba(22,32,26,0.85)';
    ctx.beginPath(); ctx.arc(sx, by, R*0.3, 0, 6.2832); ctx.fill();
  }

  function drawFx() {
    for (const f of game.effects) {
      const k = 1 - f.t / f.life;
      if (f.type === 'spark') {
        ctx.fillStyle = hexA(f.col || '#ffffff', k);
        ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), 2.4, 0, 6.2832); ctx.fill();
      } else if (f.type === 'flash') {
        const R = (1-k) * 90 + 10;
        const g = ctx.createRadialGradient(wx(f.x), wy(f.y), 2, wx(f.x), wy(f.y), R);
        g.addColorStop(0, `rgba(255,255,255,${k*0.7})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), R, 0, 6.2832); ctx.fill();
      } else if (f.type === 'tackle' || f.type === 'win') {
        ctx.strokeStyle = f.type === 'win' ? `rgba(62,240,143,${k})` : `rgba(255,210,120,${k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx(f.x), wy(f.y), (1-k)*16 + 4, 0, 6.2832); ctx.stroke();
      }
    }
  }

  // ============================================================
  // HUD
  // ============================================================
  function paintScoreboard() {
    const h = game.home.def, a = game.away.def;
    $('sb-home-code').textContent = h.code; $('sb-away-code').textContent = a.code;
    $('sb-home-dot').style.color = h.col; $('sb-away-dot').style.color = a.col;
    $('sb-home-dot').style.background = h.col; $('sb-away-dot').style.background = a.col;
    document.documentElement.style.setProperty('--home-col', h.col);
    document.documentElement.style.setProperty('--away-col', a.col);
    $('sb-home-score').textContent = game.home.score;
    $('sb-away-score').textContent = game.away.score;
  }
  function updateHud(force) {
    $('sb-home-score').textContent = game.home.score;
    $('sb-away-score').textContent = game.away.score;
    const min = Math.min(90, Math.floor(game.clockSec / 60));
    $('sb-clock').textContent = min + "'";
    $('sb-half').textContent = game.half === 1 ? '1st' : '2nd';
    const tot = game.poss.home + game.poss.away || 1;
    $('possession-fill').style.width = (game.poss.home / tot * 100).toFixed(0) + '%';
    const pip = $('dash-pip'); if (pip) pip.classList.toggle('cooling', performance.now() < game.dashCdUntil);
    setActionChip();
  }
  function setActionChip() {
    const chip = $('action-chip'), ic = $('action-ic'), tx = $('action-tx');
    const p = playerById(game.activeId);
    const b = game.ball;
    let mode = 'pass', icon = '▸', label = 'PASS';
    if (p && p.side === 'home') {
      const have = b.owner === p.id;
      const attackingPhase = (b.owner != null && playerById(b.owner) && playerById(b.owner).side === 'home');
      if (have && inShootRange(p)) { mode = 'shoot'; icon = '◎'; label = 'SHOOT'; }
      else if (have || attackingPhase) { mode = 'pass'; icon = '▸'; label = 'PASS'; }
      else if (dist(p, b) < CFG.tackleR) { mode = 'tackle'; icon = '✕'; label = 'TACKLE'; }
      else { mode = 'switch'; icon = '⟳'; label = 'SWITCH'; }
    }
    chip.className = 'action-chip ' + (mode === 'pass' ? '' : mode);
    ic.textContent = icon; tx.textContent = label;
  }
  function scoreLine() {
    return `${game.home.def.code} ${game.home.score} – ${game.away.score} ${game.away.def.code}`;
  }
  function showBanner(text) {
    const el = $('match-banner'); el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  let toastT = 0;
  function showToast(text) {
    const el = $('match-toast'); el.textContent = text; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1600);
  }
  let sayT = 0;
  function say(line) {
    const el = $('commentary'); if (!el) return;
    el.textContent = line; el.classList.add('show');
    clearTimeout(sayT); sayT = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function renderStatGrid(host) {
    const s = game.stats; const tot = game.poss.home + game.poss.away || 1;
    const possH = Math.round(game.poss.home / tot * 100);
    const rows = [
      ['POSSESSION', possH, 100 - possH, '%'],
      ['SHOTS', s.shots.home, s.shots.away, ''],
      ['ON TARGET', s.sot.home, s.sot.away, ''],
      ['FOULS', s.fouls.home, s.fouls.away, ''],
    ];
    host.innerHTML = rows.map(([name, hv, av, suf]) => {
      const t = (hv + av) || 1;
      return `<div class="stat-line">
        <span class="stat-num h">${hv}${suf}</span>
        <span class="stat-bar"><span class="stat-h" style="width:${hv/t*100}%"></span><span class="stat-a" style="width:${av/t*100}%"></span></span>
        <span class="stat-num a">${av}${suf}</span>
      </div><div class="stat-name">${name}</div>`;
    }).join('');
  }
  function renderResult() {
    const hs = game.home.score, as = game.away.score;
    $('result-title').textContent = hs === as ? 'Full Time' : (hs > as ? `${game.home.def.name} win!` : `${game.away.def.name} win!`);
    $('result-score').textContent = scoreLine();
    renderStatGrid($('result-stats'));
  }

  // ============================================================
  // LOOP
  // ============================================================
  function frame(now) {
    let dt = (now - (game.lastTime || now)) / 1000;
    game.lastTime = now;
    dt = Math.min(0.05, dt);
    if (game.screen === 'match') {
      update(dt);
      render();
      if ((game.hudT += dt) > 1 / CFG.hudHz) { game.hudT = 0; updateHud(); }
    }
    if (game.running) game.rafId = requestAnimationFrame(frame);
  }
  function startLoop() { if (!game.running) { game.running = true; game.lastTime = 0; game.rafId = requestAnimationFrame(frame); } }
  function stopLoop() { game.running = false; if (game.rafId) cancelAnimationFrame(game.rafId); }

  // ============================================================
  // TEST HOOKS — rAF is throttled in the preview, so drive it directly
  // ============================================================
  function exposeHooks() {
    window.__pitch = {
      game, CFG, TEAMS,
      start: (h, a) => startMatch(h || TEAMS[0].id, a || TEAMS[3].id),
      step: (dt) => { update(dt || 1/60); render(); updateHud(); },
      simulate: (sec, dt) => { dt = dt || 1/60; const n = Math.round((sec||1)/dt); for (let i=0;i<n;i++) update(dt); render(); updateHud(); },
      tap: () => onPinch(),
      steer: (dir) => { const m = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir]; if (m) setSteer(m[0], m[1]); },
      key: (k) => onKeyDown({ key: k, repeat:false, preventDefault(){} }),
      dash: (dir) => { game.dashCdUntil = 0; tryDash(dir || 'up'); },
      allAI: (v) => { game._allAI = !!v; },
      nav: (id) => navigateTo(id),
      score: () => scoreLine(),
      startCup: (you) => startCup(you || TEAMS[0].id),
      cupPlay: () => cupPlay(),
      cup: () => game.cup,
      pen: () => game.penalty,
      penFast: (v) => { game._penFast = !!v; },
      penKick: (dir) => { penInput(dir || 'ArrowUp'); penInput('Enter'); },
      render,
    };
  }

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    collectScreens();
    loadStore();
    SFX.setEnabled(game.settings.sound !== false);
    setupRender();
    setupInput();
    exposeHooks();
    navigateTo('title', { addToHistory: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
