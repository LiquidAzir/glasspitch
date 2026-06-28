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
    // Pitch (meters) — wider than a real pitch so the 22 players spread across
    // more of the screen (less crowded) instead of a narrow central column.
    PW: 88, PL: 105,
    goalHalfW: 3.66, goalDepth: 1.7,
    boxW: 40.3, boxD: 16.5, sixW: 18.32, sixD: 5.5,
    penSpot: 11, centerR: 9.15,
    // Physics (m, s)
    playerAccel: 30, playerMax: 7.2,
    ballDecel: 7.5, ballMax: 26, ballStop: 0.08,
    controlDist: 1.15, captureR: 1.45, tackleR: 2.1, captureSpeed: 19,
    // ball arc (height) — mostly visual; gates capture & "over the bar"
    ballGravity: 12, crossbarH: 2.44, catchH: 2.5,
    // sprint — contextual auto-sprint governed by a stamina meter (no gesture).
    // Your controlled player surges in the moments you'd obviously want to: racing a
    // loose ball, breaking into space with it, or recovering as the last man back.
    sprintMul: 1.36,            // sustained sprint speed multiplier (vs normal running)
    sprintDrain: 0.36,         // sprint energy spent per second while sprinting (~2.8s from full)
    sprintRegen: 0.21,         // sprint energy recovered per second when not sprinting (~4.8s to full)
    sprintMin: 0.24,           // need this much energy to kick off a fresh sprint → meatier bursts, no on/off stutter when chasing continuously
    // dash burst — short instant boost the AI uses for 50-50s / recovery runs
    dashDur: 0.42, dashBoost: 1.7,
    // Timing
    steerHold: 0.75,            // s a manual swipe overrides defensive auto-seek
    switchHyst: 6,              // m the nearest challenger must be closer to the ball before idle control hands over (anti-flicker)
    comboWindow: 700, minComboGap: 45,
    goalCelebrate: 2.0, restartPause: 0.35,
    // HUD
    hudHz: 12,
  };

  // sim-seconds per half (45 sim-min = 2700s) and the real time it takes
  const HALF_SIM = 2700;
  const LENGTHS = { Short: 90, Normal: 165, Long: 300 };          // real seconds / half (≈3 / 5.5 / 10 min matches)
  // spd = opponent move speed, react = opponent decision delay (lower = sharper),
  // pass/shot = opponent accuracy, press = opponent pressing intensity, tackle = opponent
  // tackle/dispossess strength, mate = YOUR AI team-mates' competence (higher = better helpers).
  // Normal is the neutral baseline (all multipliers ~1) so its balance is unchanged.
  const DIFFS = {
    Easy:   { spd: 0.93, pass: 0.78, shot: 0.74, react: 0.52, press: 0.78, tackle: 0.82, mate: 1.10 },
    Normal: { spd: 1.00, pass: 0.88, shot: 0.86, react: 0.30, press: 1.00, tackle: 1.00, mate: 1.00 },
    Hard:   { spd: 1.06, pass: 0.94, shot: 0.93, react: 0.16, press: 1.22, tackle: 1.14, mate: 0.93 },
    Pro:    { spd: 1.11, pass: 0.975, shot: 0.97, react: 0.08, press: 1.42, tackle: 1.24, mate: 0.86 },
  };
  const DIFF_KEYS = ['Easy', 'Normal', 'Hard', 'Pro'];
  // team mentality (your coaching choice) — shifts how high the whole side plays
  const MENTALITY = { Defensive: -0.12, Balanced: 0, Attacking: 0.14 };
  const MENTALITY_KEYS = ['Defensive', 'Balanced', 'Attacking'];
  // substitutions / stamina / cards
  const SUBS_MAX = 5, BENCH_SIZE = 5;
  const BENCH_ROLES = ['DEF', 'MID', 'MID', 'FWD', 'FWD'];   // bench cover
  const TIRE_THRESH = 0.60;                                   // auto-sub a starter below this if a fresher option exists

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
    '4-1-4-1': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:2,  nx:0.16, ny:0.18 }, { role:'DEF', num:5, nx:0.38, ny:0.14 },
      { role:'DEF', num:6,  nx:0.62, ny:0.14 }, { role:'DEF', num:3, nx:0.84, ny:0.18 },
      { role:'MID', num:4,  nx:0.50, ny:0.30 },
      { role:'MID', num:7,  nx:0.16, ny:0.48 }, { role:'MID', num:8, nx:0.40, ny:0.44 },
      { role:'MID', num:10, nx:0.60, ny:0.44 }, { role:'MID', num:11, nx:0.84, ny:0.48 },
      { role:'FWD', num:9,  nx:0.50, ny:0.74 },
    ],
    '4-5-1': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:2,  nx:0.16, ny:0.18 }, { role:'DEF', num:5, nx:0.38, ny:0.14 },
      { role:'DEF', num:6,  nx:0.62, ny:0.14 }, { role:'DEF', num:3, nx:0.84, ny:0.18 },
      { role:'MID', num:7,  nx:0.12, ny:0.46 }, { role:'MID', num:8, nx:0.34, ny:0.42 },
      { role:'MID', num:4,  nx:0.50, ny:0.52 }, { role:'MID', num:10, nx:0.66, ny:0.42 },
      { role:'MID', num:11, nx:0.88, ny:0.46 },
      { role:'FWD', num:9,  nx:0.50, ny:0.74 },
    ],
    '3-5-2': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:5,  nx:0.28, ny:0.15 }, { role:'DEF', num:4, nx:0.50, ny:0.12 },
      { role:'DEF', num:6,  nx:0.72, ny:0.15 },
      { role:'MID', num:3,  nx:0.10, ny:0.40 }, { role:'MID', num:8, nx:0.34, ny:0.44 },
      { role:'MID', num:10, nx:0.50, ny:0.50 }, { role:'MID', num:7, nx:0.66, ny:0.44 },
      { role:'MID', num:2,  nx:0.90, ny:0.40 },
      { role:'FWD', num:9,  nx:0.40, ny:0.74 }, { role:'FWD', num:11, nx:0.60, ny:0.74 },
    ],
    '5-3-2': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:3,  nx:0.10, ny:0.24 }, { role:'DEF', num:5, nx:0.30, ny:0.15 },
      { role:'DEF', num:4,  nx:0.50, ny:0.12 }, { role:'DEF', num:6, nx:0.70, ny:0.15 },
      { role:'DEF', num:2,  nx:0.90, ny:0.24 },
      { role:'MID', num:8,  nx:0.28, ny:0.44 }, { role:'MID', num:10, nx:0.50, ny:0.42 },
      { role:'MID', num:7,  nx:0.72, ny:0.44 },
      { role:'FWD', num:9,  nx:0.40, ny:0.72 }, { role:'FWD', num:11, nx:0.60, ny:0.72 },
    ],
    '3-4-3': [
      { role:'GK',  num:1,  nx:0.50, ny:0.04 },
      { role:'DEF', num:5,  nx:0.28, ny:0.16 }, { role:'DEF', num:4, nx:0.50, ny:0.13 },
      { role:'DEF', num:6,  nx:0.72, ny:0.16 },
      { role:'MID', num:3,  nx:0.14, ny:0.44 }, { role:'MID', num:8, nx:0.40, ny:0.40 },
      { role:'MID', num:10, nx:0.60, ny:0.40 }, { role:'MID', num:2, nx:0.86, ny:0.44 },
      { role:'FWD', num:7,  nx:0.22, ny:0.66 }, { role:'FWD', num:9, nx:0.50, ny:0.74 },
      { role:'FWD', num:11, nx:0.78, ny:0.66 },
    ],
  };
  const FORMATION_KEYS = ['4-3-3', '4-4-2', '4-2-3-1', '4-1-4-1', '4-5-1', '3-5-2', '5-3-2', '3-4-3'];

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
  function angleApproach(cur, target, maxDelta) {
    let d = target - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
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
    // continuous procedural crowd-ambience bed + roars; level driven by match momentum
    let crowdSrc = null, crowdGain = null, crowdLP = null;
    function crowdStart() {
      if (!enabled) return; const c = ensure(); if (!c || crowdSrc) return;
      const n = Math.floor(c.sampleRate * 2);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = last * 0.965 + w * 0.035; d[i] = last * 7; }  // smoothed → soft murmur
      crowdSrc = c.createBufferSource(); crowdSrc.buffer = buf; crowdSrc.loop = true;
      crowdLP = c.createBiquadFilter(); crowdLP.type = 'lowpass'; crowdLP.frequency.value = 560; crowdLP.Q.value = 0.5;
      crowdGain = c.createGain(); crowdGain.gain.value = 0.04;
      crowdSrc.connect(crowdLP); crowdLP.connect(crowdGain); crowdGain.connect(master);
      try { crowdSrc.start(); } catch (e) {}
    }
    function crowdStop() { if (crowdSrc) { try { crowdSrc.stop(); } catch (e) {} } crowdSrc = null; crowdGain = null; crowdLP = null; }
    function crowdLevel(x) {   // 0..1 ambient intensity
      if (!crowdGain || !ctx) return; const t = ctx.currentTime;
      crowdGain.gain.setTargetAtTime(clamp(0.03 + x * 0.10, 0.02, 0.16), t, 0.7);
      crowdLP.frequency.setTargetAtTime(440 + x * 380, t, 0.9);
    }
    function crowdRoar(intensity) {   // goal / big chance swell
      if (!enabled) return; const c = ensure(); if (!c) return; if (!crowdGain) crowdStart(); if (!crowdGain) return;
      const t = ctx.currentTime, peak = clamp(0.16 + intensity * 0.20, 0.16, 0.42);
      crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(Math.max(0.001, crowdGain.gain.value), t);
      crowdGain.gain.linearRampToValueAtTime(peak, t + 0.12); crowdGain.gain.setTargetAtTime(0.05, t + 0.45, 1.1);
      crowdLP.frequency.cancelScheduledValues(t); crowdLP.frequency.setValueAtTime(crowdLP.frequency.value, t);
      crowdLP.frequency.linearRampToValueAtTime(1500, t + 0.18); crowdLP.frequency.setTargetAtTime(560, t + 0.5, 1.0);
      noise(0.7, 0.10 + intensity * 0.06, 1100, 'lowpass');
    }
    return {
      resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
      setEnabled(v) { enabled = v; if (!v) crowdStop(); }, isEnabled() { return enabled; },
      crowdStart, crowdStop, crowdLevel, crowdRoar,
      // ball strike — punchy "thock": pitch-dropping body thump + sub + a short leathery contact snap
      kick()    { tone(200, 0.11, 'triangle', 0.34, 52); tone(110, 0.17, 'sine', 0.26, 40); noise(0.05, 0.18, 2300, 'bandpass'); noise(0.02, 0.10, 600, 'lowpass'); },
      // a lighter, crisper "tok" for a pass
      pass()    { tone(280, 0.05, 'triangle', 0.16, 150); noise(0.022, 0.07, 1700, 'bandpass'); },
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
    settings: { difficulty: 'Normal', length: 'Normal', formation: '4-3-3', mentality: 'Balanced', autoSub: true, setPieces: true, offside: true, gfx: '3D', cam: 'Side', chase: 'Off', weather: 'Auto', sound: true, touch: false },
    mom: 0,                                          // match momentum: -1 (all away) .. +1 (all home)
    weather: 'clear', _ballDecelMul: 1,             // rain → less friction (faster/skiddy ball)
    record: { w: 0, d: 0, l: 0 },
    // match
    home: null, away: null, ball: null,
    activeId: null, activeLockT: 0,
    clockSec: 0, half: 1, phase: 'play',
    phaseT: 0, kickoffTeam: 'away',
    lastTouch: 'away', lastKicker: null, lastTouchPlayer: null,
    _lastWasShot: false,
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
    if (id === 'title') { SFX.crowdStop(); renderTitle(); }
    else if (id === 'team-select') renderTeamSelect();
    else if (id === 'settings') renderSettings();
    else if (id === 'pause') {
      $('pause-score').textContent = scoreLine();
      const sb = $('sound-toggle-btn'); if (sb) sb.textContent = 'Sound: ' + (game.settings.sound ? 'ON' : 'OFF');
      const tb = $('touch-toggle-btn'); if (tb) tb.textContent = 'Touch Controls: ' + (game.settings.touch ? 'ON' : 'OFF');
      const wb = $('pause-watch-btn'); if (wb) wb.textContent = game.watching ? '🎮 Take Control' : '👁 Watch (AI plays)';
      renderPauseTactics();
    }
    else if (id === 'subs') { game._subOff = null; renderSubs(); }
    else if (id === 'halftime') { $('ht-score').textContent = scoreLine(); renderStatGrid($('ht-stats')); }
    else if (id === 'result') renderResult();
    else if (id === 'cup') renderCup();
    else if (id === 'league') renderLeague();
    else if (id === 'career') renderCareer();
    else if (id === 'worldcup') renderWorldCup();
    else if (id === 'career-news') renderCareerNews();
    else if (id === 'career-transfers') renderTransfers();
    else if (id === 'shootout') { drawPen(); penInstr(); }
    else if (id === 'setpiece') { drawSetPiece(); spInstr(); }
    else if (id === 'lineups') renderLineups();
    else if (id === 'match') {
      game.guardUntil = performance.now() + 220;
      // clear transient FX so re-showing the match screen doesn't replay the last
      // goal banner / pitch punch (CSS keyframe animations restart on display)
      const mb = $('match-banner'); if (mb) { mb.classList.remove('show'); mb.textContent = ''; }
      // clear any lingering replay overlay (e.g. if paused during a replay)
      if (!game._replay) {
        const rt = $('replay-tag'); if (rt) rt.classList.remove('show');
        const rv = $('replay-vignette'); if (rv) rv.classList.remove('show');
      }
      const pc = $('pitch'); if (pc) pc.classList.remove('punch');
      const p3 = $('pitch3d'); if (p3) p3.classList.remove('punch');
      if (game.settings.sound) SFX.crowdStart();   // stadium ambience for the duration of the match
      applyWeatherClass();
      game.keys = {}; game.tapped = {}; game.steer = { x: 0, y: 0 }; game.lastSteerT = -10;   // drop any stuck swipe on (re)entering the match (pause/resume, halftime)
      updateHudLayout(); render(); updateHud(true);
    }
    updateTouchVisibility();          // the phone d-pad bar shows only during a match
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================
  const LS = 'glasspitch_v1';
  const LS_MATCH = 'glasspitch_match_v1';   // live match snapshot (resume after exit)
  function loadStore() {
    try {
      const s = JSON.parse(localStorage.getItem(LS) || '{}');
      if (s.settings) Object.assign(game.settings, s.settings);
      if (s.record) Object.assign(game.record, s.record);
      if (s.lastTeams) { game.ts.you = s.lastTeams.you; game.ts.opp = s.lastTeams.opp; }
      if (s.cup && s.cup.rounds) game.cup = s.cup;
      if (s.league && s.league.fixtures) { game.league = s.league; migrateLeague(game.league); }
      if (s.career && s.career.cur) { game.career = s.career; migrateCareer(game.career); }
      if (s.worldcup && s.worldcup.groups) game.worldcup = s.worldcup;
    } catch (e) {}
  }
  // backfill fields added in the seasons-expansion so pre-update saves don't crash
  function migrateLeague(lg) {
    if (!lg) return;
    if (!lg.scorers) lg.scorers = {};
    if (!lg.rosters) { const r = {}; TEAMS.forEach(t => r[t.id] = genRoster(t.id)); lg.rosters = r; }
    if (!lg.tab) lg.tab = 'table';
    if (!lg.objective && lg.teams) lg.objective = seasonObjective(lg.you, lg.teams);
    if (!lg.cup && lg.teams) lg.cup = buildSeasonCup(lg.teams, lg.you);
    if (lg.outcome === undefined) lg.outcome = null;
  }
  function migrateCareer(c) {
    if (!c) return;
    if (!c.boosts) c.boosts = { ATT:0, MID:0, DEF:0, PAC:0, GK:0 };
    if (!c.tenure) c.tenure = 1;
    if (!c.awards) c.awards = [];
    if (c.news === undefined) c.news = null;
    if (!c.seasonScorers) c.seasonScorers = {};
    if (c.cur) {
      if (!c.cur.cup && c.cur.teams) c.cur.cup = buildSeasonCup(c.cur.teams, c.team);
      if (!c.objective && c.cur.teams) c.objective = seasonObjective(c.team, c.cur.teams);
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        settings: game.settings, record: game.record,
        lastTeams: { you: game.ts.you, opp: game.ts.opp },
        cup: game.cup || null,
        league: game.league || null,
        career: game.career || null,
        worldcup: game.worldcup || null,
      }));
    } catch (e) {}
  }

  // ----- live match snapshot: lets you exit mid-match and continue later -----
  function serializeMatch() {
    if (!game.home || !game.away || !game.ball || !game.stats) return null;
    if (game.matchMode === 'tutorial' || game.phase === 'ended') return null;
    const serTeam = (t) => ({ teamId: t.teamId, side: t.side, score: t.score, formKey: t.formKey, mentality: t.mentality,
      subsLeft: t.subsLeft, bench: (t.bench || []).map(p => ({ ...p })),
      players: t.players.map(p => ({ ...p })) });             // players are all primitives → plain copy
    return {
      v: 3,
      home: serTeam(game.home), away: serTeam(game.away),
      ball: { ...game.ball, trail: game.ball.trail ? game.ball.trail.slice() : [] },
      clockSec: game.clockSec, half: game.half, phase: game.phase, phaseT: game.phaseT || 0,
      matchMode: game.matchMode || 'friendly', kickoffTeam: game.kickoffTeam,
      activeId: game.activeId, activeLockT: game.activeLockT || 0,
      lastTouch: game.lastTouch, lastKicker: game.lastKicker, lastTouchPlayer: game.lastTouchPlayer,
      concede: game._concede || null, lastWasShot: !!game._lastWasShot,
      watching: !!game.watching, allAI: !!game._allAI, mom: game.mom || 0, weather: game.weather || 'clear',
      poss: { home: game.poss.home, away: game.poss.away },
      stats: { shots: { ...game.stats.shots }, sot: { ...game.stats.sot }, fouls: { ...game.stats.fouls } },
    };
  }
  function restoreMatch(snap) {
    try {
      if (!snap || snap.v !== 3 || !snap.home || !snap.away) return false;
      const rebuild = (sd) => ({
        teamId: sd.teamId, side: sd.side, def: teamById(sd.teamId), score: sd.score || 0,
        formKey: sd.formKey, form: FORMATIONS[sd.formKey] || FORMATIONS['4-3-3'],
        mentality: sd.mentality || 'Balanced',
        subsLeft: sd.subsLeft != null ? sd.subsLeft : SUBS_MAX,
        bench: (sd.bench || []).map(p => ({ ...p })),
        players: sd.players.map(p => ({ ...p })),
      });
      game.home = rebuild(snap.home);
      game.away = rebuild(snap.away);
      assignKitColors();
      if (R3D && R3D.ready) refresh3DKits();
      game.ball = { x: CFG.PW/2, y: CFG.PL/2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, shot: false, trail: [], ...snap.ball };
      if (!Array.isArray(game.ball.trail)) game.ball.trail = [];
      game.clockSec = snap.clockSec || 0; game.half = snap.half || 1;
      game.phase = (snap.phase === 'goal' || snap.phase === 'restart') ? 'play' : (snap.phase || 'play');
      game.phaseT = 0;
      game.matchMode = snap.matchMode || 'friendly'; game.kickoffTeam = snap.kickoffTeam || 'away';
      applyCareerBoostsToMatch();                    // re-apply transfer boosts to a resumed career match
      if (snap.watching || snap.allAI || snap.matchMode === 'watch') enterWatch();   // resume a saved spectator match as a spectator
      else { game.watching = false; game._allAI = false; }
      game.activeId = snap.activeId; game.activeLockT = snap.activeLockT || 0;
      game.lastTouch = snap.lastTouch || 'away'; game.lastKicker = snap.lastKicker || null; game.lastTouchPlayer = snap.lastTouchPlayer || null;
      game._concede = snap.concede || null; game._lastWasShot = !!snap.lastWasShot; game.mom = snap.mom || 0;
      game.weather = snap.weather || 'clear'; game._ballDecelMul = game.weather === 'rain' ? 0.62 : 1;
      game.poss = (snap.poss && typeof snap.poss.home === 'number') ? { home: snap.poss.home, away: snap.poss.away } : { home: 1, away: 1 };
      game.stats = snap.stats || { shots: { home: 0, away: 0 }, sot: { home: 0, away: 0 }, fouls: { home: 0, away: 0 } };
      resetMatchStats();
      game.effects = []; game.banner = ''; game.netRipple = { home: 0, away: 0 };
      game.steer = { x: 0, y: 0 }; game.lastSteerT = -10; game.keys = {}; game.tapped = {};
      game.tutorial = null; game.ticker = null;
      setupPitchGeom(); drawStaticPitch(); paintScoreboard();
      _prevBall.x = game.ball.x; _prevBall.y = game.ball.y;
      game.history = [snap.matchMode === 'cup' ? 'cup' : (snap.matchMode === 'league' || snap.matchMode === 'leagueCup') ? 'league' : (snap.matchMode === 'career' || snap.matchMode === 'careerCup') ? 'career' : (snap.matchMode === 'worldcup' || snap.matchMode === 'worldcupKO') ? 'worldcup' : 'title'];
      return true;
    } catch (e) { return false; }
  }
  function saveMatch() { try { const s = serializeMatch(); if (s) localStorage.setItem(LS_MATCH, JSON.stringify(s)); } catch (e) {} }
  function clearMatch() { try { localStorage.removeItem(LS_MATCH); } catch (e) {} }
  function loadMatchSnap() { try { const s = localStorage.getItem(LS_MATCH); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function hasSavedMatch() { const s = loadMatchSnap(); return !!(s && s.v === 3 && s.home && s.away); }

  // ============================================================
  // TITLE / SETTINGS / TEAM SELECT UI
  // ============================================================
  function renderTitle() {
    const r = game.record;
    $('title-record').textContent = (r.w + r.d + r.l) ? `Record  ${r.w}W · ${r.d}D · ${r.l}L` : '';
    // show a Continue button only when there's a saved in-progress match
    const cont = $('title-continue');
    if (cont) {
      const snap = loadMatchSnap();
      const has = !!(snap && snap.v === 3 && snap.home && snap.away);
      cont.classList.toggle('hidden', !has);
      if (has) {
        const hc = teamById(snap.home.teamId).code, ac = teamById(snap.away.teamId).code;
        const mins = Math.min(90, Math.floor((snap.clockSec || 0) / 60));
        const modeLabel = { league:'League', career:'Career', cup:'Cup', leagueCup:'League Cup', careerCup:'Cup', worldcup:'World Cup', worldcupKO:'World Cup', watch:'Watch' }[snap.matchMode] || '';
        const tag = modeLabel ? modeLabel + ' · ' : '';
        cont.textContent = `▶ Continue · ${tag}${hc} ${snap.home.score}–${snap.away.score} ${ac}  ${mins}'`;
      }
    }
  }
  function renderSettings() {
    $('opt-difficulty').textContent = game.settings.difficulty;
    $('opt-length').textContent = game.settings.length;
    $('opt-formation').textContent = game.settings.formation;
    const oa = $('opt-autosub'); if (oa) oa.textContent = game.settings.autoSub ? 'ON' : 'OFF';
    const os = $('opt-setpieces'); if (os) os.textContent = game.settings.setPieces ? 'ON' : 'OFF';
    const oo = $('opt-offside'); if (oo) oo.textContent = game.settings.offside ? 'ON' : 'OFF';
    const og = $('opt-gfx'); if (og) og.textContent = game.settings.gfx || '2D';
    const oc = $('opt-cam'); if (oc) oc.textContent = game.settings.cam || 'Side';
    const och = $('opt-chase'); if (och) och.textContent = game.settings.chase || 'Off';
    const ow = $('opt-weather'); if (ow) ow.textContent = game.settings.weather || 'Auto';
    $('opt-sound').textContent = game.settings.sound ? 'ON' : 'OFF';
    $('opt-touch').textContent = game.settings.touch ? 'ON' : 'OFF';
    const r = game.record;
    $('opt-record').textContent = `${r.w}-${r.d}-${r.l}`;
  }
  // in-match coach panel (shown on the pause screen)
  function renderPauseTactics() {
    const watching = !!game.watching;
    if (!watching) game._coachSide = 'home';                 // you only coach your own side in a normal match
    const side = game._coachSide || 'home';
    const team = teamObj(side);
    const head = $('tactics-head'); if (head) head.textContent = watching ? 'Coach both teams' : "Tactics — you're the coach";
    const trow = $('coach-team-row'); if (trow) trow.classList.toggle('hidden', !watching);   // team picker only when spectating
    const tv = $('coach-team'); if (tv && team) tv.textContent = `${team.def.code} · ${side === 'home' ? 'Home' : 'Away'}`;
    const srow = $('pause-subs-row'); if (srow) srow.classList.toggle('hidden', watching);     // manual subs are home-only; auto handles both while watching
    const f = $('pause-formation'); if (f) f.textContent = (team && team.formKey) || game.settings.formation;
    const m = $('pause-mentality'); if (m) m.textContent = (team && team.mentality) || 'Balanced';
  }
  // ----- substitutions screen -----
  function fitBar(p) {
    const pct = Math.round((p.stam != null ? p.stam : 1) * 100);
    const col = pct > 60 ? 'var(--grn)' : pct > 35 ? 'var(--gold)' : 'var(--red)';
    return `<span class="fit-bar"><span class="fit-fill" style="width:${pct}%;background:${col}"></span></span><span class="fit-pct">${pct}</span>`;
  }
  function renderSubs() {
    const t = game.home; if (!t) return;
    $('subs-meta').textContent = `${t.subsLeft} sub${t.subsLeft === 1 ? '' : 's'} left`;
    const ab = $('subs-auto'); if (ab) ab.textContent = game.settings.autoSub ? 'ON' : 'OFF';
    const host = $('subs-list');
    const card = (p) => p.cards >= 2 ? `<span class="sub-card">🟥</span>` : p.cards === 1 ? `<span class="sub-card">🟨</span>` : '';
    if (t.subsLeft <= 0 && !game._subOff) {
      $('subs-title').textContent = 'On-pitch';
      host.innerHTML = `<p class="cr-empty">No substitutions left.</p>` +
        t.players.filter(p => !p.isGK).map(p => `<div class="sub-row static"><span class="sub-num">#${p.num}</span><span class="sub-role">${p.role}</span>${fitBar(p)}${card(p)}</div>`).join('');
    } else if (!game._subOff) {
      $('subs-title').textContent = 'Tap a player to take off';
      const out = t.players.filter(p => !p.isGK).slice().sort((a, b) => (a.stam || 1) - (b.stam || 1));
      host.innerHTML = out.map(p => `<button class="sub-row focusable" data-action="sub-off:${p.id}"><span class="sub-num">#${p.num}</span><span class="sub-role">${p.role}</span>${fitBar(p)}${card(p)}</button>`).join('');
    } else {
      const offP = t.players.find(p => p.id === game._subOff);
      $('subs-title').textContent = `Bring on for #${offP ? offP.num : ''}`;
      host.innerHTML = t.bench.slice().sort((a, b) => (b.stam || 1) - (a.stam || 1))
        .map(p => `<button class="sub-row focusable" data-action="sub-on:${p.id}"><span class="sub-num">#${p.num}</span><span class="sub-role">${p.role}</span>${fitBar(p)}</button>`).join('')
        + `<button class="sub-row sub-cancel focusable" data-action="sub-cancel">✕ Cancel</button>`;
    }
    focusFirst(screens['subs']);
  }

  function crestStyle(t) {
    return `background:linear-gradient(150deg, ${t.col} 0%, ${shade(t.col,-0.35)} 100%); color:${pickInk(t.col)}; --crest-glow:${hexA(t.col,0.45)};`;
  }
  function renderTeamSelect() {
    const ts = game.ts;
    const tour = ts.mode === 'cup' || ts.mode === 'league' || ts.mode === 'career' || ts.mode === 'rehire' || ts.mode === 'worldcup';
    const watch = ts.mode === 'watch';
    const shoot = ts.mode === 'shootout';
    $('ts-title').textContent = shoot ? (ts.step === 0 ? 'Shootout — Your Team' : 'Shootout — Opponent') : watch ? (ts.step === 0 ? 'Watch — Home Team' : 'Watch — Away Team') : ts.mode === 'rehire' ? 'Take a New Job' : ts.mode === 'worldcup' ? 'Pick Your Nation' : tour ? 'Pick Your Club' : (ts.step === 0 ? 'Select Your Team' : 'Select Opponent');
    $('ts-step').textContent = ts.mode === 'cup' ? 'CUP' : ts.mode === 'league' ? 'LEAGUE' : ts.mode === 'career' ? 'CAREER' : ts.mode === 'worldcup' ? 'WORLD CUP' : ts.mode === 'rehire' ? 'NEW JOB' : watch ? 'WATCH' : shoot ? 'SHOOTOUT' : ((ts.step + 1) + ' / 2');
    $('ts-confirm').textContent = ts.mode === 'cup' ? 'Enter Cup' : ts.mode === 'league' ? 'Start Season' : ts.mode === 'career' ? 'Start Career' : ts.mode === 'worldcup' ? 'Enter World Cup' : ts.mode === 'rehire' ? 'Take the Job' : watch ? (ts.step === 0 ? 'Next' : 'Watch Match') : shoot ? (ts.step === 0 ? 'Next' : 'Start Shootout') : 'Select';
    $('ts-random').classList.toggle('hidden', tour || watch || shoot || ts.step === 0);
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
    const dEl = $('ts-diff'); if (dEl) { dEl.classList.toggle('hidden', watch || shoot); dEl.textContent = `Difficulty · ${game.settings.difficulty}`; }
  }
  function tsMove(d) {
    game.ts.idx = (game.ts.idx + d + TEAMS.length) % TEAMS.length;
    renderTeamSelect();
  }
  function tsConfirm() {
    const ts = game.ts;
    if (ts.mode === 'cup') { ts.mode = null; startCup(TEAMS[ts.idx].id); return; }
    if (ts.mode === 'worldcup') { ts.mode = null; startWorldCup(TEAMS[ts.idx].id); return; }
    if (ts.mode === 'league') { ts.mode = null; startLeague(TEAMS[ts.idx].id); return; }
    if (ts.mode === 'career') { ts.mode = null; startCareer(TEAMS[ts.idx].id); return; }
    if (ts.mode === 'rehire') { ts.mode = null; careerRehire(TEAMS[ts.idx].id); return; }
    if (ts.mode === 'watch') {
      if (ts.step === 0) { ts.you = TEAMS[ts.idx].id; ts.step = 1; ts.idx = (ts.idx + 1) % TEAMS.length; renderTeamSelect(); }
      else { ts.mode = null; startWatchMatch(ts.you, TEAMS[ts.idx].id); }
      return;
    }
    if (ts.mode === 'shootout') {
      if (ts.step === 0) { ts.you = TEAMS[ts.idx].id; ts.step = 1; ts.idx = (ts.idx + 1) % TEAMS.length; renderTeamSelect(); }
      else { ts.mode = null; startShootout(ts.you, TEAMS[ts.idx].id, true); }
      return;
    }
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
  function startWatchFlow() {
    game.ts.mode = 'watch'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startShootoutFlow() {
    game.ts.mode = 'shootout'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startWatchMatch(aId, bId) {
    if (!bId || bId === aId) { let i; do { i = Math.floor(srand()*TEAMS.length); } while (TEAMS[i].id === aId); bId = TEAMS[i].id; }
    startMatch(aId, bId, 'watch');
    enterWatch();
  }
  function tsRandom() {
    let i; do { i = Math.floor(srand() * TEAMS.length); } while (TEAMS[i].id === game.ts.you);
    game.ts.opp = TEAMS[i].id;
    startMatch(game.ts.you, game.ts.opp);
  }

  // ============================================================
  // COLOR HELPERS
  // ============================================================
  // memoized — colours are drawn from a tiny fixed palette but these run per-player per-frame
  const _rgbCache = {}, _shadeCache = {};
  function hexToRgb(h) { let v = _rgbCache[h]; if (v) return v; let s = h.replace('#',''); if (s.length===3) s = s.split('').map(c=>c+c).join(''); const n = parseInt(s,16); return (_rgbCache[h] = { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }); }
  function lum(h) { const c = hexToRgb(h); return (0.299*c.r + 0.587*c.g + 0.114*c.b) / 255; }
  function pickInk(h) { return lum(h) > 0.6 ? '#0b1410' : '#ffffff'; }
  function shade(h, amt) { const k = h + '|' + amt; let v = _shadeCache[k]; if (v) return v; const c = hexToRgb(h); const f = (x) => clamp(Math.round(x + 255*amt), 0, 255); return (_shadeCache[k] = `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`); }
  function hexA(h, a) { const c = hexToRgb(h); return `rgba(${c.r},${c.g},${c.b},${a})`; }
  // perceptual-ish colour distance (0..~765) for detecting kit clashes
  function colorDist(a, b) {
    const x = hexToRgb(a), y = hexToRgb(b);
    const dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
    return Math.sqrt(2*dr*dr + 4*dg*dg + 3*db*db);
  }
  const KIT_BEACONS = ['#ff4d5e','#3a8cff','#ffd23f','#36e07a','#5fe0ff','#b974ff','#ff8a3a','#ffffff','#ff5fae'];
  // the home side keeps its colour; the away side switches to a contrasting "change strip"
  // whenever its colour is too close to home's — so the two teams are always easy to tell apart.
  function assignKitColors() {
    game.home.kitCol = game.home.def.col;
    let away = game.away.def.col;
    if (colorDist(game.home.kitCol, away) < 200) {
      let best = away, bestD = -1;
      for (const c of KIT_BEACONS) { const d = colorDist(c, game.home.kitCol); if (d > bestD) { bestD = d; best = c; } }
      away = best;
    }
    game.away.kitCol = away;
  }
  function teamRenderCol(side) { const tm = teamObj(side); return (tm && (tm.kitCol || (tm.def && tm.def.col))) || '#ffffff'; }   // null-safe: 3D may build before a match exists
  // player names — deterministic per team (so a club always fields the same XI), cached
  const _rosterCache = {};
  function roster(teamId) { return _rosterCache[teamId] || (_rosterCache[teamId] = genRoster(teamId)); }
  function playerName(teamId, num) { return roster(teamId)[num] || ('#' + num); }

  // ============================================================
  // MATCH SETUP
  // ============================================================
  // per-player attributes — deterministic spread (by team+number) around the team's ratings, so the
  // squad AVERAGE stays ≈ the team rating (balance preserved) while individuals differ: a quick winger,
  // a clinical striker, a rock at the back. pace→speed, shoot→shot accuracy, def→tackling.
  function playerAttrs(t, role, num) {
    let s = (t.code.charCodeAt(0) * 131 + t.code.charCodeAt(1) * 17 + num * 977) | 0;
    const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const sp = a => Math.round((rnd() - 0.5) * 2 * a);
    const rb = ({ GK:{p:-2,s:-32,d:16}, DEF:{p:-3,s:-15,d:13}, MID:{p:1,s:-2,d:0}, FWD:{p:6,s:11,d:-15} })[role] || { p:0,s:0,d:0 };
    const pace  = clamp(t.r.PAC + rb.p + sp(7), 40, 99);
    const shoot = clamp(t.r.ATT + rb.s + sp(7), 28, 99);
    const def   = clamp(t.r.DEF + rb.d + sp(7), 32, 99);
    const ovr = role === 'GK'  ? Math.round(t.r.GK * 0.72 + def * 0.28)
              : role === 'DEF' ? Math.round(def * 0.5 + pace * 0.2 + t.r.MID * 0.2 + shoot * 0.1)
              : role === 'FWD' ? Math.round(shoot * 0.5 + pace * 0.25 + t.r.MID * 0.15 + def * 0.1)
              :                  Math.round(t.r.MID * 0.4 + pace * 0.2 + shoot * 0.2 + def * 0.2);
    return { pace, shoot, def, ovr };
  }
  function makeTeam(teamId, side, formKey) {
    const t = teamById(teamId);
    const form = FORMATIONS[formKey] || FORMATIONS['4-3-3'];
    const captainIdx = form.findIndex(f => f.role === 'MID');     // armband on a central mid
    const mk = (over) => ({
      side, x: 0, y: 0, vx: 0, vy: 0, heading: atkUp(side) ? -Math.PI/2 : Math.PI/2,
      speedR: 0.85 + t.r.PAC/100 * 0.32,
      tackleCd: 0, kickCd: 0, dashT: 0, runPhase: srand()*6.28, aiT: srand()*0.3,
      stam: 1, sprintE: 1, cards: 0,
      mGoals: 0, mTk: 0, mSv: 0, mSh: 0,           // per-match stats (for Man of the Match)
      ...over,
    });
    const withAttrs = (role, num, over) => { const a = playerAttrs(t, role, num); return mk({ ...over, role, num, pace: a.pace, shoot: a.shoot, def: a.def, ovr: a.ovr, speedR: 0.85 + a.pace/100 * 0.32 }); };
    const players = form.map((f, i) => withAttrs(f.role, f.num, {
      id: side + i, idx: i, name: playerName(teamId, f.num),
      nx: f.nx, ny: f.ny, isGK: f.role === 'GK', captain: i === captainIdx,
    }));
    const bench = [];
    for (let j = 0; j < BENCH_SIZE; j++) bench.push(withAttrs(BENCH_ROLES[j] || 'MID', 12 + j, {
      id: side + 'b' + j, idx: -1, name: playerName(teamId, 12 + j),
      nx: 0.5, ny: 0.5, isGK: false, captain: false, onBench: true,
    }));
    return { teamId, side, def: t, score: 0, players, form, formKey, mentality: 'Balanced', bench, subsLeft: SUBS_MAX };
  }
  // swap a team's shape live (coach changes formation mid-match). Players keep their
  // numbers/identity; only their role + formation target move, so they drift into the new shape.
  function setTeamFormation(team, formKey) {
    const form = FORMATIONS[formKey]; if (!form || !team) return;
    team.formKey = formKey; team.form = form;
    team.players.forEach(pl => { const f = form[pl.idx]; if (!f) return; pl.role = f.role; pl.nx = f.nx; pl.ny = f.ny; });   // index by stored idx (AI reads form[p.idx]); robust after a red card
  }
  // ----- substitutions / cards / injuries -----
  function doSub(team, outId, inId) {
    if (!team || team.subsLeft <= 0) return false;
    const oi = team.players.findIndex(p => p.id === outId);
    const bi = team.bench.findIndex(p => p.id === inId);
    if (oi < 0 || bi < 0) return false;
    const out = team.players[oi], inP = team.bench[bi];
    if (out.isGK) return false;                              // keep it simple: no GK subs
    // the sub inherits the outgoing player's slot, role and spot on the pitch
    inP.idx = out.idx; inP.role = out.role; inP.nx = out.nx; inP.ny = out.ny;
    inP.isGK = out.isGK; inP.captain = out.captain;
    inP.x = out.x; inP.y = out.y; inP.vx = 0; inP.vy = 0; inP.heading = out.heading; inP._velAng = out.heading;
    inP.tackleCd = 0; inP.kickCd = 0; inP.dashT = 0; inP.aiT = 0; inP.onBench = false; out.onBench = true;
    team.players[oi] = inP; team.bench[bi] = out;
    team.subsLeft--;
    // hand over any references the outgoing player held
    if (game.ball.owner === out.id) game.ball.owner = inP.id;
    if (game.activeId === out.id) game.activeId = inP.id;
    if (game.lastTouchPlayer === out.id) game.lastTouchPlayer = inP.id;
    if (game.lastKicker === out.id) game.lastKicker = inP.id;
    const code = team.def.code;
    showToast(`${code} sub · #${out.num} ⟶ #${inP.num}`);
    if (team.side === 'home') say(`Substitution — #${inP.num} comes on for #${out.num}.`);
    return true;
  }
  function autoSubPlayer(team, outP) {                        // bring on the freshest suitable bench player
    if (!team || team.subsLeft <= 0 || !team.bench.length) return false;
    const same = team.bench.filter(b => b.role === outP.role);
    const pool = same.length ? same : team.bench;
    let best = null; for (const b of pool) if (!best || b.stam > best.stam) best = b;
    return best ? doSub(team, outP.id, best.id) : false;
  }
  function autoSubTick() {                                    // only fires at stoppages so it never disrupts play
    [game.home, game.away].forEach(team => {
      const auto = team.side === 'away' ? true : game.settings.autoSub;   // opponent always self-manages
      if (!auto || team.subsLeft <= 0) return;
      if (team._subCd && performance.now() < team._subCd) return;
      let worst = null;
      for (const p of team.players) { if (p.isGK) continue; if ((p.stam || 1) < TIRE_THRESH && (!worst || p.stam < worst.stam)) worst = p; }
      if (!worst) return;
      const fresh = team.bench.reduce((a, b) => (!a || b.stam > a.stam) ? b : a, null);
      if (fresh && fresh.stam > worst.stam + 0.15) { autoSubPlayer(team, worst); team._subCd = performance.now() + 1500; }
    });
  }
  function sendOff(p) {
    const team = teamObj(p.side);
    const oi = team.players.findIndex(q => q.id === p.id);
    if (oi < 0) return;
    team.players.splice(oi, 1);                               // down to ten — no replacement
    p.sentOff = true;
    if (game.ball.owner === p.id) game.ball.owner = null;
    if (game.activeId === p.id) game.activeId = null;
    spawnEffect('tackle', p.x, p.y); SFX.whistle();
    showToast(`🟥 RED · ${team.def.code} #${p.num}`);
    say(`Red card! ${team.def.code} #${p.num} is off — down to ${team.players.length}.`);
  }
  function injurePlayer(p) {
    const team = teamObj(p.side);
    if (p.injured) return; p.injured = true;
    if (!p.isGK && team.subsLeft > 0 && autoSubPlayer(team, p)) { say(`${team.def.code} #${p.num} hurt — forced change.`); }
    else { p.stam = Math.min(p.stam, 0.4); say(`${team.def.code} #${p.num} is hurt but plays on.`); }   // GK / empty bench → nerf instead of a silently-failed sub
  }
  function commitFoul(fouler, victim, x, y) {
    if (!fouler || !victim) return;
    game.stats.fouls[fouler.side]++;
    SFX.whistle();
    const code = teamObj(fouler.side).def.code;
    const r = srand();
    if (r < 0.04) { fouler.cards = 3; sendOff(fouler); }                       // straight red (rare)
    else if (r < 0.28) {                                                        // booking
      fouler.cards = (fouler.cards || 0) + 1;
      if (fouler.cards >= 2) { say(`Second yellow! ${code} #${fouler.num} sent off.`); sendOff(fouler); }
      else { showToast(`🟨 ${code} #${fouler.num}`); say(`Yellow card — ${code} #${fouler.num}.`); }
    } else {
      say(fouler.side === 'home' ? 'Foul given against you.' : 'Free kick — good challenge won the whistle.');
    }
    if (!fouler.sentOff && srand() < 0.05) injurePlayer(victim);                // occasional injury
    freeKick(victim.side, x, y);
  }

  // formation home position in WORLD coords for a side
  function homePos(side, f, p) {
    // attacking-normalised → world. HOME attacks up (ny=1 → y=0). AWAY attacks down (ny=1 → y=PL).
    const nx = f.nx, ny = f.ny;
    const x = nx * CFG.PW;
    const y = atkUp(side) ? CFG.PL * (1 - ny) : CFG.PL * ny;
    return { x, y };
  }

  // career transfers: a boosted COPY of your club's ratings (never mutate the shared TEAMS constant)
  function boostedDef(t, b) {
    if (!b) return t;
    return { ...t, r: { ATT: clamp(t.r.ATT+(b.ATT||0),1,99), MID: clamp(t.r.MID+(b.MID||0),1,99), DEF: clamp(t.r.DEF+(b.DEF||0),1,99), PAC: clamp(t.r.PAC+(b.PAC||0),1,99), GK: clamp(t.r.GK+(b.GK||0),1,99) } };
  }
  function applyCareerBoostsToMatch() {
    if (game.matchMode !== 'career' && game.matchMode !== 'careerCup') return;
    const c = game.career; if (!c || !c.boosts) return;
    ['home','away'].forEach(s => {
      const tm = game[s]; if (!tm || tm.teamId !== c.team) return;
      tm.def = boostedDef(tm.def, c.boosts);
      const bp = c.boosts.PAC || 0, bs = c.boosts.ATT || 0, bd = c.boosts.DEF || 0;   // investment lifts every player's attributes
      const bump = p => { p.pace = clamp((p.pace||tm.def.r.PAC) + bp, 40, 99); p.shoot = clamp((p.shoot||tm.def.r.ATT) + bs, 28, 99); p.def = clamp((p.def||tm.def.r.DEF) + bd, 32, 99); p.speedR = 0.85 + p.pace/100 * 0.32; };
      tm.players.forEach(bump); tm.bench.forEach(bump);
    });
  }
  function startMatch(homeId, awayId, mode) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x9e3779b9;
    game.matchMode = mode || 'friendly';   // set up-front so the first auto-save records the right mode starting
    game.home = makeTeam(homeId, 'home', game.settings.formation);
    game.away = makeTeam(awayId, 'away', '4-3-3');
    game.home.mentality = game.settings.mentality || 'Balanced';   // your coaching choice carries in
    applyCareerBoostsToMatch();                     // your transfer-market investment strengthens your XI
    assignKitColors();                              // away gets a change strip if the colours clash
    if (R3D && R3D.ready) refresh3DKits();          // recolour 3D models for the new teams
    game.ball = { x: CFG.PW/2, y: CFG.PL/2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, shot: false, trail: [] };
    game.clockSec = 0; game.half = 1; game.phase = 'play'; game.mom = 0; game._comT = rrange(20, 40);
    setWeather();
    game.poss = { home: 1, away: 1 };
    game.stats = { shots:{home:0,away:0}, sot:{home:0,away:0}, fouls:{home:0,away:0} };
    resetMatchStats();
    game.effects = []; game.banner = ''; game.netRipple = { home: 0, away: 0 };
    game.kickoffTeam = 'away';
    setupPitchGeom();
    drawStaticPitch();
    paintScoreboard();
    resetPositions(game.kickoffTeam, true);
    game.motm = null; game.ticker = null;
    saveStore();
    game.history = ['title'];
    saveMatch();                                   // make the fresh match resumable straight away
    navigateTo('lineups', { addToHistory: false });   // team-sheet intro, then pinch to kick off
  }
  function kickoffGo() {
    navigateTo('match', { addToHistory: false });
    SFX.whistle();
    if (game.weather === 'rain') say(pick(["Kick off — and it's pouring down. Tricky underfoot.", 'Kick off in the rain — the ball will fly today.', 'Wet night for it — kick off!']));
    else say(`Kick off — ${game.home.def.name} v ${game.away.def.name}.`);
  }

  function teamObj(side) { return side === 'home' ? game.home : game.away; }
  function otherSide(side) { return side === 'home' ? 'away' : 'home'; }
  // Attacking direction. Teams switch ends at half time, so in the 2nd half each
  // side attacks the opposite goal. atkUp(side)===true => attacking the y=0 (top) goal.
  function atkUp(side) { return (side === 'home') !== (game.half === 2); }
  function goalY(side) { return atkUp(side) ? 0 : CFG.PL; }       // the goal this side shoots at
  function ownGoalY(side) { return atkUp(side) ? CFG.PL : 0; }    // the goal this side defends
  // ----- momentum / morale -----
  function momFor(side) { return side === 'home' ? game.mom : -game.mom; }   // this side's momentum, -1..1
  function bumpMom(side, amt) { game.mom = clamp(game.mom + (side === 'home' ? 1 : -1) * amt, -1, 1); }
  function momentumTick(dt) {
    const owner = playerById(game.ball.owner);
    const poss = owner ? (owner.side === 'home' ? 1 : -1) : 0;
    game.mom += (poss * 0.45 - game.mom) * dt * 0.25;   // ease toward a possession-based baseline; goal/shot impulses ride on top
    game.mom = clamp(game.mom, -1, 1);
  }
  // ----- weather -----
  function setWeather() {   // choose per match from the setting (Auto = random)
    const s = game.settings.weather || 'Auto';
    game.weather = s === 'Rain' ? 'rain' : s === 'Clear' ? 'clear' : (srand() < 0.32 ? 'rain' : 'clear');
    game._ballDecelMul = game.weather === 'rain' ? 0.62 : 1;   // wet pitch → ball slides faster/further
    applyWeatherClass();
  }
  function applyWeatherClass() { const m = $('match'); if (m) m.classList.toggle('weather-rain', game.weather === 'rain'); }
  function allPlayers() { return game.home.players.concat(game.away.players); }
  // O(1)-ish, allocation-free (ids are unique across both rosters) — called many times per frame
  function playerById(id) {
    if (id == null || !game.home || !game.away) return null;
    return game.home.players.find(p => p.id === id) || game.away.players.find(p => p.id === id);
  }

  // place everyone at formation home (kickoff / goal / half restart)
  function resetPositions(kickoffTeam, fullKickoff) {
    // clear stale input so a swipe held before the goal/half doesn't drive the kickoff carrier
    game.steer.x = 0; game.steer.y = 0; game.lastSteerT = -10; game.keys = {}; game.tapped = {};
    [game.home, game.away].forEach(team => {
      team.players.forEach((p) => {
        const slot = team.form[p.idx] || { nx: p.nx, ny: p.ny };   // robust if the side is a man down
        const h = homePos(team.side, slot, p);
        p.x = h.x; p.y = h.y; p.vx = 0; p.vy = 0; p.dashT = 0;
        // keep both teams in their own half for the kickoff
        if (fullKickoff) {
          if (atkUp(team.side)) p.y = Math.max(p.y, CFG.PL/2 + (p.isGK ? 0 : 1.5));   // own half = the end you defend
          else p.y = Math.min(p.y, CFG.PL/2 - (p.isGK ? 0 : 1.5));
        }
        p.heading = atkUp(team.side) ? -Math.PI/2 : Math.PI/2;
        p.tackleCd = 0; p.kickCd = 0;
      });
    });
    const b = game.ball;
    b.x = CFG.PW/2; b.y = CFG.PL/2; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.shot = false; b.trail.length = 0;
    _prevBall.x = b.x; _prevBall.y = b.y;
    // give the ball to a central midfielder of the kickoff team (robust to red cards)
    const ko = teamObj(kickoffTeam);
    const cm = ko.players.find(pl => pl.role === 'MID' && !pl.isGK) || ko.players.find(pl => !pl.isGK) || ko.players[0];
    cm.x = CFG.PW/2; cm.y = CFG.PL/2 + (atkUp(kickoffTeam) ? 1.2 : -1.2);
    b.owner = cm.id; game.lastTouch = kickoffTeam; game.lastKicker = null; game.lastTouchPlayer = cm.id;
    // active = your carrier if you kick off, else your nearest to ball
    if (kickoffTeam === 'home') setActive(cm.id, true);
    else { const n = nearestOfSide('home', b); if (n) setActive(n.id, true); }
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
    setupAdaptiveControls();
    setupGamepad();
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    window.addEventListener('orientationchange', fitToScreen);
    window.addEventListener('load', fitToScreen);                          // catch late layout (mobile address bar)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToScreen);
  }
  // scale the fixed 600x600 app to fit PC / phone screens; glasses (600x600) snap to 1:1 (untouched)
  function fitToScreen() {
    const app = $('app'); if (!app) return;
    let s = Math.min(window.innerWidth / 600, window.innerHeight / 600);
    if (s > 0.93 && s < 1.07) s = 1;                 // ~square viewport (glasses) → exact 1:1
    app.style.transform = 'scale(' + (s || 1) + ')';
    document.body.classList.toggle('is-phone', isPhone());   // top-align + show the bottom control bar on phones
    updateTouchVisibility();
  }
  function isPhone() {
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const glasses = Math.abs(window.innerWidth - 600) < 60 && Math.abs(window.innerHeight - 600) < 60;
    return touch && !glasses;   // any touchscreen that isn't the ~600x600 glasses (phones, tablets)
  }
  // Touch: drag on the pitch to steer, tap to act. Mouse (PC): click the pitch to act.
  // Match steering sets game.keys DIRECTLY (not via onKeyDown) so a wandering drag can't
  // accidentally trigger the ↑↓↑↓ menu / double-swipe dash; the on-screen d-pad covers those.
  function setupAdaptiveControls() {
    const app = $('app') || document.body;
    const isControl = (t) => t && t.closest && t.closest('button, #touch-controls, [data-action], a, input, .opt-row, .ts-arrow');
    const inMatch = () => game.screen === 'match';
    const inMini = () => game.screen === 'shootout' || game.screen === 'setpiece';
    const gameplay = () => inMatch() || inMini();
    const DIR4 = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const setDir = (dir) => DIR4.forEach(k => { game.keys[k] = (k === dir); });
    const clearDirs = () => DIR4.forEach(k => { game.keys[k] = false; });
    const dirOf = (dx, dy) => { if (dx * dx + dy * dy < 196) return null; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'); };   // 14px deadzone
    const sendKey = (key) => { onKeyDown({ key, repeat: false, preventDefault() {} }); onKeyUp({ key }); };
    const act = () => { if (inMatch()) onPinch(); else sendKey('Enter'); };
    let start = null, moved = false, lastTouch = 0;
    app.addEventListener('touchstart', (e) => {
      lastTouch = performance.now();
      if (!gameplay() || isControl(e.target)) { start = null; return; }
      const t = e.touches[0]; start = { x: t.clientX, y: t.clientY }; moved = false; e.preventDefault();
    }, { passive: false });
    app.addEventListener('touchmove', (e) => {
      lastTouch = performance.now();
      if (!start) return;
      const t = e.touches[0]; const dir = dirOf(t.clientX - start.x, t.clientY - start.y);
      if (dir) {
        moved = true;
        if (inMatch()) setDir(dir); else sendKey(dir);    // steer (held) / aim (momentary)
        start = { x: t.clientX, y: t.clientY };            // re-anchor so a continued drag tracks the latest direction
      }
      e.preventDefault();
    }, { passive: false });
    app.addEventListener('touchend', (e) => {
      lastTouch = performance.now();
      if (!start) return; start = null;
      if (inMatch()) clearDirs();
      if (!moved) act();                                   // tap → action / switch
      e.preventDefault();
    }, { passive: false });
    app.addEventListener('touchcancel', () => { if (inMatch()) clearDirs(); start = null; }, { passive: false });
    app.addEventListener('mousedown', (e) => {
      if (performance.now() - lastTouch < 700) return;     // ignore the synthetic mouse event a touch fires
      if (gameplay() && !isControl(e.target)) act();
    });
  }
  // Bluetooth / USB gamepad support (Gamepad API) for PC + mobile browsers.
  // Left stick / D-pad = steer (routed through game.keys so the side-view rotation applies),
  // A = pass/shoot/tackle/switch, RB/RT = dash, Start = pause; full menu navigation too.
  let _padKeys = {}, _padPrev = {}, _padRAF = 0;
  function setupGamepad() {
    if (!navigator.getGamepads) return;
    const kick = () => { if (!_padRAF) _padRAF = requestAnimationFrame(gamepadLoop); };
    window.addEventListener('gamepadconnected', kick);
    kick();   // some browsers expose an already-paired pad without firing the event
  }
  function gamepadLoop() { _padRAF = 0; try { pollGamepad(); } catch (e) {} _padRAF = requestAnimationFrame(gamepadLoop); }
  function releasePadKeys() { for (const k in _padKeys) { if (_padKeys[k]) { game.keys[k] = false; _padKeys[k] = false; } } }
  function padSend(key) { onKeyDown({ key, repeat: false, preventDefault() {} }); onKeyUp({ key }); }
  function pollGamepad() {
    const pads = navigator.getGamepads(); if (!pads) return;
    let gp = null; for (let i = 0; i < pads.length; i++) { if (pads[i] && pads[i].connected) { gp = pads[i]; break; } }
    if (!gp) { releasePadKeys(); return; }
    const B = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), AX = (i) => gp.axes[i] || 0;
    const dz = 0.35;
    let mx = 0, my = 0;
    if (Math.abs(AX(0)) > dz) mx = AX(0);
    if (Math.abs(AX(1)) > dz) my = AX(1);
    if (B(14)) mx = -1; else if (B(15)) mx = 1;     // d-pad L/R
    if (B(12)) my = -1; else if (B(13)) my = 1;     // d-pad U/D
    const edge = (key, now) => { const was = !!_padPrev[key]; _padPrev[key] = now; return now && !was; };
    const inMatch = game.screen === 'match' && game.phase !== 'ended';
    if (inMatch) {
      const want = { ArrowUp: my < -dz, ArrowDown: my > dz, ArrowLeft: mx < -dz, ArrowRight: mx > dz };
      for (const k in want) { if (want[k]) { game.keys[k] = true; _padKeys[k] = true; } else if (_padKeys[k]) { game.keys[k] = false; _padKeys[k] = false; } }
      if (edge('A', B(0))) { SFX.resume(); onPinch(); }                         // pass / shoot / tackle / switch
      if (edge('start', B(9)) || edge('select', B(8))) pauseMatch();
      // sprint is contextual now — no manual dash button
    } else {
      releasePadKeys();
      const dir = (mx * mx + my * my) < dz * dz ? null : (Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'ArrowRight' : 'ArrowLeft') : (my > 0 ? 'ArrowDown' : 'ArrowUp'));
      if (dir && dir !== _padPrev._navdir) { _padPrev._navdir = dir; padSend(dir); }
      else if (!dir) _padPrev._navdir = null;
      if (edge('A', B(0))) { SFX.resume(); padSend('Enter'); }
      if (edge('start', B(9))) padSend('Enter');
      if (edge('B', B(1))) padSend('Escape');
    }
  }
  function setupTouchControls() {
    const root = $('touch-controls'); if (!root) return;
    document.body.classList.toggle('is-phone', isPhone());
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
    updateTouchVisibility();
  }
  // the d-pad bar shows on phones (or if Touch Controls is on) only during a live match
  function updateTouchVisibility() {
    const el = $('touch-controls'); if (!el) return;
    el.classList.toggle('hidden', !((isPhone() || game.settings.touch) && game.screen === 'match'));
  }
  function showTouch(on) {
    game.settings.touch = on; saveStore(); updateTouchVisibility();
    const b = $('touch-toggle-btn'); if (b) b.textContent = 'Touch Controls: ' + (on ? 'ON' : 'OFF');
    const o = $('opt-touch'); if (o) o.textContent = on ? 'ON' : 'OFF';
  }

  const DIRV = { ArrowUp:{x:0,y:-1}, ArrowDown:{x:0,y:1}, ArrowLeft:{x:-1,y:0}, ArrowRight:{x:1,y:0} };
  // PC aliases: WASD steer, Space = pinch/action
  const KEY_ALIAS = { w:'ArrowUp', a:'ArrowLeft', s:'ArrowDown', d:'ArrowRight', W:'ArrowUp', A:'ArrowLeft', S:'ArrowDown', D:'ArrowRight', ' ':'Enter', Spacebar:'Enter' };
  function onKeyDown(e) {
    const key = KEY_ALIAS[e.key] || e.key;
    SFX.resume();
    if (e.repeat && DIRV[key]) return;           // kill EMG ghost-repeat

    // penalty shootout has its own input model
    if (game.screen === 'shootout') { if (DIRV[key] || key === 'Enter') { if (performance.now() >= game.guardUntil) penInput(key); e.preventDefault(); } return; }
    if (game.screen === 'setpiece') { if (DIRV[key] || key === 'Enter') { if (performance.now() >= game.guardUntil) spInput(key); e.preventDefault(); } return; }

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
        if (game.tutorial) game.tutorial.steerCount++;
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
  function onKeyUp(e) { const k = KEY_ALIAS[e.key] || e.key; if (DIRV[k]) game.keys[k] = false; }

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
      // (sprint is contextual + stamina-based now — no double-swipe trigger, so a
      //  same-direction re-swipe just steers and never fires an accidental sprint)
    }
  }
  // ----- contextual sprint for the player you control -----
  // Your active player surges automatically in the moments you'd obviously want pace,
  // limited by a stamina meter (the ⚡ pip). It only ever boosts speed in the direction
  // you're already steering — it never redirects you.
  function shouldAutoSprint(p) {
    const b = game.ball, owner = playerById(b.owner);
    if (owner == null) { const d = dist(p, b); return d > 3 && d < 20; }        // racing a loose ball (incl. running onto a pass)
    if (owner.id === p.id) return spaceAhead(p) > 9;                            // carrying into open space → break away
    if (owner.side !== p.side) {                                               // opponent has it → recover if they've broken past you
      const attackUp = atkUp(p.side);
      const ballGoalSide = attackUp ? (b.y > p.y + 1) : (b.y < p.y - 1);        // ball is between you and your own goal
      return ballGoalSide && dist(p, b) < 26;
    }
    return false;
  }
  function updateActiveSprint(p, dt) {
    if (p.sprintE == null) p.sprintE = 1;
    const moving = len(p.vx, p.vy) > 1.5;
    const ctx = moving && shouldAutoSprint(p);
    const minE = p._sprinting ? 0.02 : CFG.sprintMin;     // start needs a reserve; once going, run until nearly empty (no flicker)
    const was = p._sprinting;
    p._sprinting = ctx && p.sprintE > minE;
    if (p._sprinting) p.sprintE = clamp(p.sprintE - CFG.sprintDrain * dt, 0, 1);
    else              p.sprintE = clamp(p.sprintE + CFG.sprintRegen * dt, 0, 1);
    if (p._sprinting && !was) SFX.dash();                  // a little whoosh as the burst kicks in
  }
  function pauseMatch() { if (game.tutorial) { finishTutorial(); return; } if (game.phase === 'ended') return; saveMatch(); navigateTo('pause'); }

  // ============================================================
  // ACTIONS (menu dispatch)
  // ============================================================
  function handleAction(action, el) {
    // substitution picks carry the player id in the action string
    if (action.indexOf('sub-off:') === 0) { game._subOff = action.slice(8); renderSubs(); return; }
    if (action.indexOf('sub-on:') === 0) { if (game._subOff) { doSub(game.home, game._subOff, action.slice(7)); game._subOff = null; renderSubs(); } return; }
    if (action.indexOf('ct-buy:') === 0) { careerBuy(action.slice(7)); return; }
    switch (action) {
      case 'resume-saved': { const snap = loadMatchSnap(); if (snap && restoreMatch(snap)) navigateTo('match', { addToHistory:false }); else { clearMatch(); renderTitle(); } break; }
      case 'quick-match': {
        const you = game.ts.you || TEAMS[0].id;
        let opp = game.ts.opp; if (!opp || opp === you) { let i; do { i = Math.floor(srand()*TEAMS.length); } while (TEAMS[i].id===you); opp = TEAMS[i].id; }
        game.ts.you = you; game.ts.opp = opp; startMatch(you, opp); break;
      }
      case 'choose-teams': game.ts.mode = null; game.ts.step = 0; game.ts.idx = Math.max(0, TEAMS.findIndex(t=>t.id===game.ts.you)); if (game.ts.idx<0) game.ts.idx=0; navigateTo('team-select'); break;
      case 'goto-tournaments': navigateTo('tournaments'); break;
      case 'goto-cup': if (game.cup) navigateTo('cup'); else startNewCupFlow(); break;
      case 'cup-play': cupPlay(); break;
      case 'cup-new': startNewCupFlow(); break;
      case 'goto-worldcup': if (game.worldcup) navigateTo('worldcup'); else startNewWorldCupFlow(); break;
      case 'worldcup-advance': if (game.worldcup.stage === 'group') worldcupPlay(); else worldcupKOPlay(); break;
      case 'worldcup-watch': if (game.worldcup.stage === 'group') worldcupPlay(); else worldcupKOPlay(); enterWatch(); break;
      case 'worldcup-tab-groups': game.worldcup.tab = 'groups'; renderWorldCup(); break;
      case 'worldcup-tab-bracket': game.worldcup.tab = 'bracket'; renderWorldCup(); break;
      case 'worldcup-new': startNewWorldCupFlow(); break;
      case 'goto-league': if (game.league) navigateTo('league'); else startNewLeagueFlow(); break;
      case 'league-play': leaguePlay(); break;
      case 'league-cup-play': leagueCupPlay(); break;
      case 'league-tab-table': game.league.tab = 'table'; renderLeague(); break;
      case 'league-tab-fixtures': game.league.tab = 'fixtures'; renderLeague(); break;
      case 'league-tab-cup': game.league.tab = 'cup'; renderLeague(); break;
      case 'league-new': startNewLeagueFlow(); break;
      case 'goto-career': if (game.career) navigateTo('career'); else startNewCareerFlow(); break;
      case 'career-play': careerAdvance(); break;
      case 'career-cup-play': careerCupPlay(); break;
      case 'career-new': startNewCareerFlow(); break;
      case 'career-tab-table': game.career.tab = 'table'; renderCareer(); break;
      case 'career-tab-fixtures': game.career.tab = 'fixtures'; renderCareer(); break;
      case 'career-tab-cup': game.career.tab = 'cup'; renderCareer(); break;
      case 'career-tab-scorers': game.career.tab = 'scorers'; renderCareer(); break;
      case 'career-tab-history': game.career.tab = 'history'; renderCareer(); break;
      case 'cn-continue': careerNewsContinue(); break;
      case 'cn-accept-poach': careerAcceptPoach(); break;
      case 'cn-decline-poach': careerDeclinePoach(); break;
      case 'cn-rehire': startRehireFlow(); break;
      case 'cn-retire': careerRetire(); break;
      case 'ct-begin': beginNextSeason(); break;
      case 'goto-watch': startWatchFlow(); break;
      case 'goto-shootout': startShootoutFlow(); break;
      case 'watch-toggle':                                         // menu toggle: hand off to the AI, or take control back
        if (game.watching) { exitWatch(true); } else enterWatch();
        resumeMatch(); break;
      case 'cup-watch': cupPlay(); enterWatch(); break;
      case 'league-watch': leaguePlay(); enterWatch(); break;
      case 'career-watch': if (game.career && !game.career.cur.done) { careerPlay(); enterWatch(); } break;
      case 'goto-how': navigateTo('how'); break;
      case 'start-tutorial': startTutorial(); break;
      case 'goto-settings': navigateTo('settings'); break;
      case 'back': navigateBack(); break;
      case 'team-prev': tsMove(-1); break;
      case 'team-next': tsMove(+1); break;
      case 'team-confirm': tsConfirm(); break;
      case 'team-random': tsRandom(); break;
      case 'ts-cycle-difficulty': cycle('difficulty', DIFF_KEYS); renderTeamSelect(); break;
      case 'cycle-difficulty': cycle('difficulty', DIFF_KEYS); break;
      case 'cycle-length': cycle('length', ['Short','Normal','Long']); break;
      case 'cycle-formation': cycle('formation', FORMATION_KEYS); break;
      case 'toggle-sound': toggleSound(); break;
      case 'menu-touch-toggle': showTouch(!game.settings.touch); break;
      case 'reset-record': game.record = {w:0,d:0,l:0}; saveStore(); renderSettings(); break;
      case 'kickoff-go': kickoffGo(); break;
      case 'resume': resumeMatch(); break;
      case 'coach-side-toggle': game._coachSide = (game._coachSide === 'away') ? 'home' : 'away'; renderPauseTactics(); break;
      case 'pause-cycle-formation': {
        const team = teamObj(game._coachSide || 'home'); if (!team) break;
        const i = FORMATION_KEYS.indexOf(team.formKey);
        const next = FORMATION_KEYS[(i + 1) % FORMATION_KEYS.length];
        setTeamFormation(team, next);
        if (team.side === 'home' && !game.watching) { game.settings.formation = next; saveStore(); }   // only your own pick is remembered
        saveMatch(); renderPauseTactics();
        break;
      }
      case 'pause-cycle-mentality': {
        const team = teamObj(game._coachSide || 'home'); if (!team) break;
        const i = MENTALITY_KEYS.indexOf(team.mentality || 'Balanced');
        const next = MENTALITY_KEYS[(i + 1) % MENTALITY_KEYS.length];
        team.mentality = next;
        if (team.side === 'home' && !game.watching) { game.settings.mentality = next; saveStore(); }
        saveMatch(); renderPauseTactics();
        break;
      }
      case 'goto-subs': game._subOff = null; navigateTo('subs'); break;
      case 'sub-cancel': game._subOff = null; renderSubs(); break;
      case 'subs-auto': game.settings.autoSub = !game.settings.autoSub; saveStore(); renderSubs(); break;
      case 'toggle-autosub': game.settings.autoSub = !game.settings.autoSub; saveStore(); renderSettings(); break;
      case 'toggle-setpieces': game.settings.setPieces = !game.settings.setPieces; saveStore(); renderSettings(); break;
      case 'toggle-offside': game.settings.offside = !game.settings.offside; saveStore(); renderSettings(); break;
      case 'toggle-gfx': toggleGfx(); break;
      case 'toggle-cam': toggleCam(); break;
      case 'toggle-chase': toggleChase(); break;
      case 'cycle-weather': cycleWeather(); break;
      case 'resume-second': startSecondHalf(); break;
      case 'restart-match': { const m = game.matchMode; startMatch(game.home.teamId, game.away.teamId, m); if (m === 'cup') game.history = ['cup']; else if (m === 'league' || m === 'leagueCup') game.history = ['league']; else if (m === 'career' || m === 'careerCup') game.history = ['career']; else if (m === 'worldcup' || m === 'worldcupKO') game.history = ['worldcup']; break; }
      case 'rematch': startMatch(game.home.teamId, game.away.teamId); break;
      case 'quit-title': exitWatch(false); saveMatch(); game.history = []; navigateTo('title', { addToHistory:false }); break;
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
    if (game.settings.sound) { SFX.resume(); if (game.screen === 'match') SFX.crowdStart(); }
    saveStore();
    const o = $('opt-sound'); if (o) o.textContent = game.settings.sound ? 'ON' : 'OFF';
    const b = $('sound-toggle-btn'); if (b) b.textContent = 'Sound: ' + (game.settings.sound ? 'ON' : 'OFF');
  }
  function resumeMatch() { game.guardUntil = performance.now() + 200; navigateTo('match', { addToHistory:false }); }
  // ----- spectator / watch mode: the AI plays both sides; any input hands control back -----
  function enterWatch() { game.watching = true; game._allAI = true; }
  function exitWatch(announce) { if (!game.watching && !game._allAI) return; game.watching = false; game._allAI = false; if (announce) say('You have control.'); }
  function startSecondHalf() {
    game.half = 2; game.clockSec = HALF_SIM; game.phase = 'play';
    game.kickoffTeam = 'home';
    // the break tops players' legs back up a bit
    [game.home, game.away].forEach(tm => {
      tm.players.forEach(p => p.stam = clamp((p.stam || 1) + 0.14, 0, 1));
      tm.bench.forEach(p => p.stam = clamp((p.stam || 1) + 0.25, 0, 1));
    });
    resetPositions('home', true);
    saveMatch();
    resumeMatch();
    SFX.whistle(); say('Second half under way.');
  }

  // ============================================================
  // THE PINCH — context action for the active player
  // ============================================================
  function onPinch() {
    if (game._replay) { endGoalReplay(); return; }                   // tap to skip the goal replay
    if (game._replayDelay != null) { game._replayDelay = null; return; }  // tap during delay skips to kick-off
    if (game.tutorial && game.tutorial.step === TUT_STEPS.length - 1) { finishTutorial(); return; }
    if (game.watching) return;                                       // ignore pinch while spectating (use ↑↓↑↓ menu to take control)
    if (game.phase !== 'play') return;
    const p = playerById(game.activeId); if (!p) return;
    const b = game.ball;
    const youHaveBall = b.owner != null && playerById(b.owner) && playerById(b.owner).side === 'home';
    if (youHaveBall && b.owner === p.id) {
      if (inShootRange(p)) doShoot(p); else doPass(p);              // on the ball → attack
    } else if (youHaveBall) {
      setActive(b.owner, true);                                     // a teammate has it → take control of the carrier
    } else if (game.tutorial) {
      if (dist(p, b) < CFG.tackleR) doTackle(p);                    // tutorial keeps its guided tackle step
    } else {
      switchActive();                                               // DEFENCE → switch to the player nearest the ball-carrier (steal by running into them)
    }
  }
  function inShootRange(p) {
    const up = atkUp(p.side);
    const gy = up ? 0 : CFG.PL, gx = CFG.PW/2;        // distance to the goal this side attacks
    const d = len(p.x - gx, p.y - gy);
    return d < 30 && (up ? p.y < CFG.PL * 0.62 : p.y > CFG.PL * 0.38);
  }
  function switchActive() {   // hand control to the outfielder nearest the ball-carrier (defence)
    const b = game.ball;
    const cands = game.home.players.filter(p => !p.isGK && p.id !== game.activeId);
    cands.sort((a, c) => dist2(a.x, a.y, b.x, b.y) - dist2(c.x, c.y, b.x, b.y));
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
      if (game._replay) { advanceReplay(dt); tickEffects(dt); decayRipples(dt); game.keys = {}; game.tapped = {}; return; }   // play the goal replay first
      // replay delay: let the GOAL banner fade, then transition to replay
      if (game._replayDelay != null && game._replayDelay > 0) {
        game._replayDelay -= dt;
        if (game._replayDelay <= 0) {
          game._replayDelay = null;
          if (startGoalReplay()) { tickEffects(dt); decayRipples(dt); game.keys = {}; game.tapped = {}; return; }
        }
      }
      if (!game._replayDelay) game.phaseT -= dt;           // freeze phaseT while waiting to start replay
      tickEffects(dt);
      decayRipples(dt);
      if (game.matchMode !== 'tutorial') autoSubTick();     // make subs only at stoppages, never mid-flow
      if (game.phaseT <= 0) {
        if (game.phase === 'goal') { resetPositions(game._concede, true); game.phase = 'play'; }
        else game.phase = 'play';
      }
      // clear stale input
      game.keys = {}; game.tapped = {};
      return;
    }

    if (game.matchMode === 'tutorial') {
      tickTutorial(dt);                            // guided steps; no clock / no half-time
      game._simDt = 0;
    } else {
      // clock
      const scale = HALF_SIM / LENGTHS[game.settings.length];
      game._simDt = dt * scale;                    // sim-seconds elapsed (so stamina drains per match-minute, not real-time)
      game.clockSec += dt * scale;
      if (game.half === 1 && game.clockSec >= HALF_SIM) { game.clockSec = HALF_SIM; goHalftime(); return; }
      if (game.half === 2 && game.clockSec >= HALF_SIM * 2) { game.clockSec = HALF_SIM * 2; goFulltime(); return; }
    }

    // possession accounting
    const owner = playerById(game.ball.owner);
    const pside = owner ? owner.side : game.lastTouch;
    game.poss[pside] += dt;
    if (game.ticker) tickTicker();        // reveal other matches' goals as they "happen"
    momentumTick(dt); commentaryTick(dt);

    chooseActive(dt);
    // alternate which side updates first each frame so neither gets a systematic
    // first-mover edge in 50/50s (keeps AI-vs-AI fair and end-to-end)
    const order = (game._updTick = (game._updTick || 0) + 1) % 2
      ? game.home.players.concat(game.away.players)
      : game.away.players.concat(game.home.players);
    computePressRanks();                          // O(n log n) once per side per frame instead of O(n^2) in aiMove
    for (const p of order) updatePlayer(p, dt);
    tickDispossess(dt);
    if (game.screen !== 'match') return;   // a foul/turnover may have triggered a set-piece mid-tick — bail before more physics
    updateBall(dt);
    updateKeepers(dt);
    resolveCollisions();
    // re-glue the dribbled ball to the carrier (collision may have nudged them)
    const carrier = playerById(game.ball.owner);
    if (carrier && !carrier.isGK) {
      game.ball.x = carrier.x + Math.cos(carrier.heading) * CFG.controlDist;
      game.ball.y = carrier.y + Math.sin(carrier.heading) * CFG.controlDist;
    }
    checkBounds();
    tickEffects(dt);
    decayRipples(dt);
    recordReplayFrame();            // rolling buffer for the goal replay

    game.tapped = {};               // consume per-frame taps
  }

  function decayRipples(dt) {
    game.netRipple.home = Math.max(0, game.netRipple.home - dt);
    game.netRipple.away = Math.max(0, game.netRipple.away - dt);
  }

  // ----- active player selection (TAP-driven, not automatic) -----
  // Switching is manual (tap → onPinch → switchActive). While your team doesn't have
  // the ball, control STAYS on your player so a silent auto-switch never hijacks your
  // swipes / changes the player's direction under you. We only re-pick automatically
  // when your team gains possession (control the carrier) or the current pick is
  // invalid (none / GK / subbed off / sent off).
  function bestChallenger() {                                                    // home outfielder best placed to win the ball
    let best = null, bt = 1e9;
    for (const p of game.home.players) { if (p.isGK) continue; const t = timeToBall(p); if (t < bt) { bt = t; best = p; } }
    return best;
  }
  function chooseActive(dt) {
    game.activeLockT = Math.max(0, game.activeLockT - dt);
    const b = game.ball;
    const owner = playerById(b.owner);
    if (owner && owner.side === 'home') { game.activeId = owner.id; return; }   // your team has it → control the carrier
    const cur = playerById(game.activeId);
    const curValid = cur && !cur.isGK && cur.side === 'home';
    const best = bestChallenger();
    if (!curValid) { if (best) game.activeId = best.id; return; }               // no valid player → must re-pick
    const now = performance.now() / 1000;
    const steering = (now - game.lastSteerT) < CFG.steerHold;
    // POSSESSION LOST: the opponent now has the ball (e.g. a pass was intercepted, or a
    // tackle won it). Abandon a stale pass-follow / manual-switch lock so control returns
    // to the best-placed defender instead of being stranded on a far-away player. An
    // ACTIVE steer is always respected (we never yank a player out from under your swipe).
    if (owner && owner.side === 'away' && !steering && best && cur &&
        best.id !== game.activeId && dist(cur, b) > dist(best, b) + CFG.switchHyst) {
      game._recvUntil = 0; game.activeLockT = 0; game.activeId = best.id; return;
    }
    // NEVER pull control off the player you're actively steering, just manually switched to,
    // or receiving a pass with — so a swipe is never hijacked mid-move.
    if (steering || game.activeLockT > 0 || (game._recvUntil && now < game._recvUntil)) return;
    // Idle on defence / loose ball → keep the marker on the action: hand control to a clearly
    // better-placed challenger so your player is never stranded far from the ball (hysteresis stops flicker).
    if (best && best.id !== game.activeId && dist(cur, b) > dist(best, b) + CFG.switchHyst) game.activeId = best.id;
  }

  // ----- per-player update -----
  function updatePlayer(p, dt) {
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.dashT = Math.max(0, (p.dashT || 0) - dt);
    if (p.isGK) return; // keepers handled separately
    // stamina drains with effort (per match-minute via _simDt); a dash costs extra
    if (game._simDt) {
      const speedFrac = len(p.vx, p.vy) / CFG.playerMax;
      p.stam = clamp((p.stam != null ? p.stam : 1) - game._simDt * (0.00005 + 0.00010 * speedFrac) - (p.dashT > 0 ? game._simDt * 0.0002 : 0) - (p._sprinting ? game._simDt * 0.00012 : 0), 0, 1);
    }

    let mvx = 0, mvy = 0, sprint = 1;
    const b = game.ball;
    const isActive = p.id === game.activeId && p.side === 'home' && !game._allAI;

    if (isActive) {
      const m = activeMove(p);
      mvx = m.x; mvy = m.y; sprint = m.sprint;
      updateActiveSprint(p, dt);                  // contextual sprint + stamina for your player
    } else {
      const m = aiMove(p, dt);
      mvx = m.x; mvy = m.y; sprint = m.sprint;
      if (p._sprinting) p._sprinting = false;     // only the controlled player uses the meter; AI uses dashT bursts
    }
    // tutorial: the tackle-target opponent stands still holding the ball (clear, easy lesson)
    if (game.tutorial && game.tutorial.dribbleOppId === p.id) { mvx = 0; mvy = 0; }

    // Prevent carriers from dribbling toward their own goal (own-goals feel awful).
    // Respect explicit user steering — only clamp auto-momentum / AI movement.
    if (b.owner === p.id) {
      const attackUp = atkUp(p.side);
      const backward = attackUp ? mvy > 0.05 : mvy < -0.05;
      const userSteering = isActive && (performance.now() / 1000 - game.lastSteerT) < CFG.steerHold;
      if (backward && !userSteering) {
        mvy = 0;
        if (Math.abs(mvx) < 0.1) mvy = attackUp ? -0.3 : 0.3;  // nudge forward
      }
    }

    // Momentum-aware steering: rotate the velocity toward the desired direction
    // (curved turns) and ease the speed — feels fluid instead of snapping.
    const dashMul = p.dashT > 0 ? CFG.dashBoost : 1;               // AI instant burst
    const sprintMul = p._sprinting ? CFG.sprintMul : 1;            // your sustained contextual sprint
    const diffSpd = (p.side === 'away' && !game._allAI) ? DIFFS[game.settings.difficulty].spd : 1;   // harder = quicker opponents (fair in spectator mode)
    const stamMul = 0.80 + 0.20 * (p.stam != null ? p.stam : 1);   // tired legs are slower
    const maxV = CFG.playerMax * p.speedR * sprint * dashMul * sprintMul * diffSpd * stamMul * (b.owner === p.id ? 0.95 : 1);
    const moveLen = len(mvx, mvy);
    let curSpeed = len(p.vx, p.vy);
    if (moveLen > 0.01) {
      const desAng = Math.atan2(mvy, mvx);
      let velAng = curSpeed > 0.4 ? Math.atan2(p.vy, p.vx) : (p._velAng != null ? p._velAng : desAng);
      const turnRate = lerp(13, 6, clamp(curSpeed / CFG.playerMax, 0, 1)); // pivot when slow, arc at speed
      velAng = angleApproach(velAng, desAng, turnRate * dt);
      p._velAng = velAng;
      const ns = approach(curSpeed, maxV * Math.min(1, moveLen), CFG.playerAccel * dt);
      p.vx = Math.cos(velAng) * ns; p.vy = Math.sin(velAng) * ns;
    } else {
      const ns = approach(curSpeed, 0, CFG.playerAccel * 1.5 * dt);
      if (curSpeed > 1e-4) { p.vx = p.vx / curSpeed * ns; p.vy = p.vy / curSpeed * ns; } else { p.vx = 0; p.vy = 0; }
    }
    p.x = clamp(p.x + p.vx * dt, -1.5, CFG.PW + 1.5);
    p.y = clamp(p.y + p.vy * dt, -3, CFG.PL + 3);

    const sp = len(p.vx, p.vy);
    if (sp > 0.4) {
      p.heading = angleApproach(p.heading, Math.atan2(p.vy, p.vx), 14 * dt);  // smooth body turn
      p.runPhase += sp * dt * 1.4;
    }

    // dribble: glue ball just ahead of the carrier
    if (b.owner === p.id) {
      const tx = p.x + Math.cos(p.heading) * CFG.controlDist;
      const ty = p.y + Math.sin(p.heading) * CFG.controlDist;
      const k = Math.min(1, 16 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
      b.vx = p.vx; b.vy = p.vy;
      // AI carriers decide what to do (tutorial's tackle-target opponent just holds it)
      if (!isActive && !(game.tutorial && game.tutorial.dribbleOppId === p.id)) aiOnBall(p, dt);
    }
  }

  // ----- player-vs-player collision: stop everyone occupying the same spot -----
  function resolveCollisions() {
    const ps = allPlayers(), owner = game.ball.owner;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const c = ps[j];
        // let a challenger get right up against the carrier (so tackling/pressure still works)
        const minD = (a.id === owner || c.id === owner) ? 1.0 : 2.4;
        let dx = c.x - a.x, dy = c.y - a.y, d2 = dx*dx + dy*dy;
        if (d2 >= minD*minD) continue;
        let d = Math.sqrt(d2), ux, uy;
        if (d < 1e-3) { const ang = i*1.7 + j*0.9; ux = Math.cos(ang); uy = Math.sin(ang); d = 0.001; }
        else { ux = dx/d; uy = dy/d; }
        const overlap = (minD - d) * 0.7;                 // soft — separate over a couple frames
        // keepers stay planted; otherwise split the push
        const aMove = a.isGK ? 0 : (c.isGK ? 1 : 0.5);
        const cMove = c.isGK ? 0 : (a.isGK ? 1 : 0.5);
        a.x -= ux * overlap * aMove; a.y -= uy * overlap * aMove;
        c.x += ux * overlap * cMove; c.y += uy * overlap * cMove;
      }
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
      else {
        dx = Math.cos(p.heading); dy = Math.sin(p.heading);
        // Prevent momentum from carrying the dribble toward own goal
        const attackUp = atkUp(p.side);
        if ((attackUp && dy > 0) || (!attackUp && dy < 0)) {
          dy = 0;
          if (Math.abs(dx) < 0.1) { dx = 0; dy = attackUp ? -1 : 1; } // default forward
        }
      }
    } else if (steering) {
      dx = game.steer.x; dy = game.steer.y;
    } else if (game.settings.chase === 'On' || (game._recvUntil && now < game._recvUntil)) {
      // auto-seek the ball (auto-chase on, OR you just received a pass → run onto it)
      const tgtx = b.x + b.vx * 0.18, tgty = b.y + b.vy * 0.18;
      dx = tgtx - p.x; dy = tgty - p.y;
    } else {
      return { x: 0, y: 0, sprint: 0 };   // hold position — your player moves only when you steer
    }
    const n = len(dx, dy) || 1;
    return { x: dx / n, y: dy / n, sprint: haveBall ? 1 : 1.06 };
  }
  function setSteer(x, y) {
    // The 3D Side camera views the pitch from the touchline, so the swipe axes are
    // rotated 90° vs the top-down sim. Map swipes to the SCREEN (measured projection):
    //   up → far touchline (sim x+ / screen-up), down → toward camera (sim x- / "closer to me"),
    //   left → left goal (sim y-), right → right goal (sim y+).  (x,y) -> (-y, x).
    if (game.settings.gfx === '3D' && game.settings.cam === 'Side' && R3D && R3D.ready) { const t = x; x = -y; y = t; }   // only when the side view is actually on screen (matches render()'s 3D guard)
    const n = len(x, y) || 1;
    game.steer.x = x / n; game.steer.y = y / n;
    game.lastSteerT = performance.now() / 1000;
  }

  // ----- AI off-ball + defensive movement -----
  // pass-and-move: after passing, the passer sprints forward into space for ~1.8s
  function triggerPassAndMove(p) {
    if (p.role === 'GK' || p.role === 'DEF') return;                       // only MID/FWD make runs after passing
    p._pnm = 1.8 + rrange(0, 0.6);                                        // seconds of forward run
    p._pnmDir = rrange(-0.3, 0.3);                                        // slight lateral variation
  }
  // overlap: fullback sprints past the winger when their wing-mate has the ball
  function wantsOverlap(p, owner) {
    if (p.role !== 'DEF' || !owner || owner.side !== p.side) return false;
    if (owner.role !== 'FWD' && owner.role !== 'MID') return false;
    const attackUp = atkUp(p.side);
    const wide = p.x < CFG.PW * 0.25 || p.x > CFG.PW * 0.75;             // fullback is on a flank
    const ownerWide = owner.x < CFG.PW * 0.35 || owner.x > CFG.PW * 0.65;
    const sameSide = (p.x < CFG.PW/2) === (owner.x < CFG.PW/2);
    const ownerAdv = attackUp ? (owner.y < CFG.PL * 0.6) : (owner.y > CFG.PL * 0.4);
    return wide && ownerWide && sameSide && ownerAdv;
  }

  // ---- game state awareness ----
  // returns a tactical context object describing the scoreline / time urgency
  function gameContext(side) {
    const us = teamObj(side).score, them = teamObj(otherSide(side)).score;
    const min = Math.floor(game.clockSec / 60);
    const late = min >= 75;                                 // final 15 minutes
    const veryLate = min >= 85;
    const winning = us > them, losing = us < them, drawing = us === them;
    const gap = Math.abs(us - them);
    return { winning, losing, drawing, gap, late, veryLate, min };
  }

  // ---- defensive line helpers ----
  // compute the average y of the team's back line so defenders hold a coherent line
  function defLineY(side) {
    const players = teamObj(side).players;
    let sum = 0, count = 0;
    for (const p of players) {
      if (p.isGK || p.onBench) continue;
      if (p.role === 'DEF') { sum += p.y; count++; }
    }
    return count > 0 ? sum / count : (atkUp(side) ? CFG.PL * 0.75 : CFG.PL * 0.25);
  }

  // find the opponent forward nearest to this defender for man-marking
  function nearestAttacker(p) {
    const opps = teamObj(otherSide(p.side)).players;
    let best = null, bd = 1e9;
    for (const o of opps) {
      if (o.isGK || o.onBench) continue;
      if (o.role !== 'FWD' && o.role !== 'MID') continue;
      const d = dist(p, o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // AI dash: give AI players a speed burst when chasing down a counter or making a key run
  function aiTryDash(p) {
    if (p.dashT > 0) return;                                // already dashing
    if ((p.stam || 1) < 0.45) return;                       // too tired
    p.dashT = CFG.dashDur * 0.8;                            // slightly shorter than human dash
  }

  function aiMove(p, dt) {
    const b = game.ball;
    const owner = playerById(b.owner);
    const team = teamObj(p.side);
    const diff = DIFFS[game.settings.difficulty];
    const pressMul = (p.side === 'away' && !game._allAI) ? diff.press : 1;
    const weHaveBall = owner && owner.side === p.side;
    const form = teamObj(p.side).form;
    const ctx = gameContext(p.side);

    // pass-and-move timer ticks down
    if (p._pnm != null) p._pnm -= dt;

    // formation home, shifted by ball
    const h = homePos(p.side, form[p.idx], p);
    const attackUp = atkUp(p.side);
    let tx = lerp(h.x, b.x, 0.28);
    const ballNy = attackUp ? (CFG.PL - b.y) / CFG.PL : b.y / CFG.PL;
    let push = weHaveBall ? 0.16 : -0.12;
    if (p.role === 'FWD') push += weHaveBall ? 0.10 : 0.04;
    if (p.role === 'DEF') push -= weHaveBall ? 0.02 : 0.06;
    push += (MENTALITY[team.mentality] || 0);
    if (game._allAI) {
      const deficit = teamObj(otherSide(p.side)).score - team.score;
      push += clamp(deficit * 0.07, -0.06, 0.18);
    }
    // game-state push: losing late → everyone forward; winning late → sit deep
    if (ctx.losing && ctx.late) push += 0.08 + (ctx.veryLate ? 0.06 : 0);
    else if (ctx.winning && ctx.late) push -= 0.06;
    push += clamp(momFor(p.side) * 0.085, -0.10, 0.10);
    let ny = clamp(form[p.idx].ny + push + (ballNy - 0.5) * 0.5, 0.05, 0.95);
    let ty = attackUp ? CFG.PL * (1 - ny) : CFG.PL * ny;

    let dx, dy, sprint = 1;
    const closest = (game.tutorial && game.tutorial.passiveOpp && p.side === 'away') ? 99 : teamPressRank(p);
    const gy = attackUp ? CFG.PL : 0;       // own goal y
    const agy = attackUp ? 0 : CFG.PL;      // attacking goal y

    // ---- DEFENSIVE PHASE ----
    if (b.owner == null) {
      // LOOSE BALL — chase or intercept
      const ballSpeed = len(b.vx, b.vy);
      if (closest === 0) {
        // primary chaser — predict where the ball will be
        dx = b.x + b.vx*0.25 - p.x; dy = b.y + b.vy*0.25 - p.y; sprint = 1.06;
        if (dist(p, b) < 10) aiTryDash(p);                 // burst to win the 50-50
      } else if (closest === 1 && dist(p, b) < 18) {
        dx = b.x + b.vx*0.1 - p.x; dy = b.y + b.vy*0.1 - p.y; sprint = 1.02;
      } else if (!b.shot && ballSpeed > 4 && closest <= 5) {
        // INTERCEPTION: predict where the ball will be in ~0.4s and cut toward it
        const fx = b.x + b.vx * 0.4, fy2 = b.y + b.vy * 0.4;
        const intDist = len(fx - p.x, fy2 - p.y);
        if (intDist < 10 && intDist < dist(p, b)) {
          dx = fx - p.x; dy = fy2 - p.y; sprint = 1.05;
        } else { dx = tx - p.x; dy = ty - p.y; }
      } else { dx = tx - p.x; dy = ty - p.y; }

    } else if (!weHaveBall) {
      // OPPONENT HAS THE BALL — defensive duties
      const ox = owner.x, oy = owner.y;

      if (closest === 0) {
        // PRIMARY PRESSER — aggressive challenge
        const gsx = (CFG.PW/2 - ox) * 0.08;
        dx = (ox + gsx) - p.x; dy = (oy + Math.sign(gy - oy) * 1.1) - p.y;
        sprint = 1.02 * pressMul * (1 + clamp(momFor(p.side), 0, 1) * 0.10);
        // late-game urgency: press harder when losing
        if (ctx.losing && ctx.late) { sprint *= 1.06; if (dist(p, owner) < 8) aiTryDash(p); }
      } else if (closest === 1 && dist(p, b) < 28 * pressMul) {
        // SECOND MAN — contain, cut the forward lane
        dx = (ox * 0.45 + tx * 0.55) - p.x; dy = (oy + Math.sign(gy - oy) * 5.0) - p.y; sprint = 0.95 * pressMul;
      } else if (closest === 2 && dist(p, b) < 20 * pressMul) {
        // THIRD DEFENDER — cover the far side
        const mirX = ox < CFG.PW/2 ? CFG.PW * 0.65 : CFG.PW * 0.35;
        dx = (mirX * 0.4 + tx * 0.6) - p.x; dy = (oy + Math.sign(gy - oy) * 8.0) - p.y; sprint = 0.92;

      } else if (p.role === 'DEF') {
        // DEFENSIVE LINE: hold a coherent back line + track runners
        const lineAvg = defLineY(p.side);
        const attacker = nearestAttacker(p);
        // track an attacker making a dangerous run into our zone
        if (attacker && dist(p, attacker) < 15 && !attacker.isGK) {
          const atkAdv = attackUp ? (attacker.y - lineAvg) : (lineAvg - attacker.y);   // positive = behind our line (dangerous)
          if (atkAdv > 2) {
            // TRACK THE RUN: stay goal-side of the attacker
            dx = attacker.x - p.x;
            dy = (attacker.y + Math.sign(gy - attacker.y) * 2.0) - p.y;
            sprint = 1.04;
          } else {
            // hold the line
            dx = tx - p.x; dy = lineAvg - p.y;
          }
        } else {
          // no immediate threat — hold the line
          dx = tx - p.x; dy = lerp(ty, lineAvg, 0.6) - p.y;
        }
        // RECOVERY RUN: if the ball is past our line toward our goal, sprint back
        const ballPastLine = attackUp ? (b.y > lineAvg + 5) : (b.y < lineAvg - 5);
        if (ballPastLine && dist(p, b) < 30) {
          dx = b.x * 0.3 + CFG.PW/2 * 0.7 - p.x;          // recover toward the center-back position
          dy = gy * 0.15 + b.y * 0.85 - p.y;
          sprint = 1.08;
          aiTryDash(p);                                      // desperate sprint back
        }

      } else if (p.role === 'MID' && !weHaveBall) {
        // MIDFIELD RECOVERY: drop into shape when opponent attacks
        const ballDeep = attackUp ? (b.y > CFG.PL * 0.6) : (b.y < CFG.PL * 0.4);
        if (ballDeep && dist(p, b) < 35) {
          // track back toward the ball, stay goal-side
          dx = lerp(tx, b.x, 0.3) - p.x;
          dy = (b.y + Math.sign(gy - b.y) * 6) - p.y;
          sprint = 1.02;
        } else {
          dx = tx - p.x; dy = ty - p.y;
        }

      } else {
        // FWD on defence: stay high for the counter unless losing late
        if (ctx.losing && ctx.late) {
          // drop back to help defend
          dx = lerp(tx, b.x, 0.25) - p.x; dy = lerp(ty, b.y, 0.15) - p.y;
        } else {
          dx = tx - p.x; dy = ty - p.y;
        }
      }


    // ---- ATTACKING PHASE ----
    } else if (weHaveBall && p._pnm > 0 && owner && owner.id !== p.id) {
      // PASS-AND-MOVE: sprint forward after passing
      const fy = attackUp ? -1 : 1;
      const runX = clamp(p.x + p._pnmDir * 15, 4, CFG.PW - 4);
      const runY = clamp(p.y + fy * 12, 2, CFG.PL - 2);
      dx = runX - p.x; dy = runY - p.y; sprint = 1.08;
    } else if (weHaveBall && wantsOverlap(p, owner)) {
      // OVERLAP RUN
      const fy = attackUp ? -1 : 1;
      const wideX = p.x < CFG.PW/2 ? Math.max(2, owner.x - 6) : Math.min(CFG.PW - 2, owner.x + 6);
      dx = wideX - p.x; dy = (owner.y + fy * 10) - p.y; sprint = 1.05;
    } else if (weHaveBall && p.role === 'FWD') {
      // FORWARD RUNS
      const fy = attackUp ? -1 : 1;
      const runSlot = srandHash(p.idx, b);
      // game state: winning comfortably → hold position; losing → make aggressive runs
      const urgency = ctx.losing ? 1.3 : (ctx.winning && ctx.gap >= 2 ? 0.6 : 1.0);
      if (runSlot) {
        // diagonal run behind the defensive line
        const runBias = ((p.idx * 17) % 3 - 1) * 8;
        const targetX = clamp(b.x + runBias, 6, CFG.PW - 6);
        const targetY = clamp(b.y + fy * (12 * urgency), 2, CFG.PL - 2);
        dx = targetX - p.x; dy = targetY - p.y; sprint = 1.04;
      } else {
        // check-to-the-ball: come short for a safe outlet
        const safeX = lerp(p.x, b.x, 0.35);
        const safeY = lerp(p.y, b.y, 0.25);
        dx = safeX - p.x; dy = safeY - p.y;
      }
      // winger near the byline → hold width and sprint to the corner flag for a cross
      const onWing = p.x < CFG.PW * 0.2 || p.x > CFG.PW * 0.8;
      const nearByline = attackUp ? (p.y < CFG.PL * 0.12) : (p.y > CFG.PL * 0.88);
      if (onWing && nearByline && owner && owner.id !== p.id) {
        const byX = p.x < CFG.PW/2 ? 3 : CFG.PW - 3;
        const byY = attackUp ? 4 : CFG.PL - 4;
        dx = byX - p.x; dy = byY - p.y; sprint = 1.05;
      }
    } else if (weHaveBall && p.role === 'MID') {
      // MIDFIELD SUPPORT
      const distToBall = dist(p, b);
      if (distToBall > 22 && owner && owner.role !== 'GK') {
        dx = lerp(tx, b.x, 0.35) - p.x; dy = lerp(ty, b.y, 0.25) - p.y; sprint = 1.02;
      } else {
        // find space between the lines
        let bestGapX = tx, bestGapY = ty, bestGapD = 0;
        const opps = teamObj(otherSide(p.side)).players;
        for (let c = 0; c < 3; c++) {
          const cx = clamp(tx + (c - 1) * 10, 5, CFG.PW - 5);
          const cy = ty;
          let minOpp = 99;
          for (const o of opps) { const dd = dist2(cx, cy, o.x, o.y); if (dd < minOpp * minOpp) minOpp = Math.sqrt(dd); }
          if (minOpp > bestGapD) { bestGapD = minOpp; bestGapX = cx; bestGapY = cy; }
        }
        dx = bestGapX - p.x; dy = bestGapY - p.y;
      }
    } else if (weHaveBall && p.role === 'DEF') {
      // DEFENDERS ON THE BALL SIDE: push up when we have possession, hold width
      // winning late → hold position; losing → be bolder
      if (ctx.winning && ctx.late) {
        dx = tx - p.x; dy = ty - p.y;                       // stay home, protect the lead
      } else {
        // push up as a unit to compress the pitch
        const pushY = attackUp ? ty - 4 : ty + 4;
        dx = tx - p.x; dy = pushY - p.y;
      }
    } else {
      dx = tx - p.x; dy = ty - p.y;
    }

    // separation from nearby teammates
    let sx = 0, sy = 0;
    for (const q of team.players) {
      if (q === p || q.isGK) continue;
      const d2 = dist2(p.x, p.y, q.x, q.y);
      if (d2 < 81 && d2 > 0.001) { const d = Math.sqrt(d2); sx += (p.x - q.x)/d * (9 - d); sy += (p.y - q.y)/d * (9 - d); }
    }
    dx += sx * 0.95; dy += sy * 0.95;

    const n = len(dx, dy);
    if (n < 0.3) return { x: 0, y: 0, sprint: 0.0 };
    return { x: dx/n, y: dy/n, sprint };
  }
  // tiny stable hash so a given FWD consistently makes runs (not jitter)
  function srandHash(idx, b) { return ((idx * 37 + Math.floor(b.x)) % 5) < 3; }

  // rank each outfielder by distance to the ball (0 = closest) — computed once per side per frame
  function computePressRanks() {
    const bx = game.ball.x, by = game.ball.y;
    const buf = game._pressBuf || (game._pressBuf = []);
    for (const team of [game.home, game.away]) {
      buf.length = 0;
      for (const q of team.players) { if (q.isGK) continue; q._bd2 = dist2(q.x, q.y, bx, by); buf.push(q); }
      buf.sort((a, c) => a._bd2 - c._bd2);
      for (let i = 0; i < buf.length; i++) buf[i]._pressRank = i;
    }
  }
  function teamPressRank(p) {
    if (p._pressRank != null) return p._pressRank;
    const d = dist2(p.x, p.y, game.ball.x, game.ball.y); let rank = 0;   // fallback (e.g. just-subbed mid-frame)
    for (const q of teamObj(p.side).players) { if (q.isGK || q === p) continue; if (dist2(q.x, q.y, game.ball.x, game.ball.y) < d) rank++; }
    return rank;
  }

  // ----- AI decision when holding the ball -----
  // how much open space (m) ahead of the carrier toward the attacking goal
  function spaceAhead(p) {
    const attackUp = atkUp(p.side);
    const fy = attackUp ? -1 : 1;
    const opps = teamObj(otherSide(p.side)).players;
    let closest = 99;
    for (const o of opps) {
      // only consider opponents roughly ahead (within ±18m lateral, in the forward half-cone)
      const dfy = (o.y - p.y) * fy;
      if (dfy < 0) continue;                               // opponent is behind us, ignore
      const dx = Math.abs(o.x - p.x);
      if (dx > 18) continue;                                // too far laterally
      const d = len(o.x - p.x, o.y - p.y);
      if (d < closest) closest = d;
    }
    return closest;
  }

  // which zone of the pitch is the carrier in? (for their attacking direction)
  function pitchZone(p) {
    const attackUp = atkUp(p.side);
    const normY = attackUp ? (CFG.PL - p.y) / CFG.PL : p.y / CFG.PL;   // 0 = own goal, 1 = attacking goal
    if (normY < 0.33) return 'own';
    if (normY < 0.63) return 'mid';
    return 'final';
  }

  // is the team in a counter-attack situation? (just won possession with space ahead)
  function isCounterAttack(p) {
    const sa = spaceAhead(p);
    const zone = pitchZone(p);
    return sa > 14 && zone !== 'final';                     // lots of space and not already in the box
  }

  function aiOnBall(p, dt) {
    p.aiT -= dt;
    if (p.aiT > 0) return;
    const diff = DIFFS[game.settings.difficulty];
    p.aiT = (game._allAI ? diff.react : (p.side === 'away' ? diff.react : 0.28 * (2 - diff.mate))) + rrange(0, 0.12);

    const attackUp = atkUp(p.side);
    const gx = CFG.PW/2, gy = attackUp ? 0 : CFG.PL;
    const goalDist = len(p.x - gx, p.y - gy);
    const t = teamObj(p.side).def;
    const pressNow = nearestOpponentDist(p);
    const zone = pitchZone(p);
    const space = spaceAhead(p);
    const counter = isCounterAttack(p);
    const playerSkill = (p.pace || 50) + ((p.shoot || 50) * 0.3);
    const ctx = gameContext(p.side);

    // ========================
    // 0. ONE-TOUCH PLAY: pass first-time under extreme pressure in a good position
    // ========================
    if (pressNow < 2.2 && zone !== 'own' && p.kickCd <= 0) {
      const quickTarget = bestPassTarget(p);
      if (quickTarget && quickTarget.score > 0.40) {
        // first-time pass — no reaction delay
        if (!laneClear(p, quickTarget.mate) && dist(p, quickTarget.mate) > 7) {
          aiLob(p, quickTarget.mate);
        } else {
          aiPass(p, quickTarget.mate);
        }
        triggerPassAndMove(p);
        return;
      }
    }

    // ========================
    // 1. UNDER HEAVY PRESSURE IN OWN THIRD → CLEAR
    // ========================
    if (zone === 'own' && !p.isGK && pressNow < 6.0) {
      if (playerSkill > 90 && pressNow > 3) {
        const safe = bestPassTarget(p);
        if (safe && safe.score > 0.55) { aiPass(p, safe.mate); triggerPassAndMove(p); return; }
      }
      const tx = clamp(p.x + rrange(-14, 14), 5, CFG.PW - 5);
      const ty = attackUp ? CFG.PL * 0.40 : CFG.PL * 0.60;
      kickTo(p, tx, ty, false, 0.7);
      return;
    }

    // ========================
    // 1b. WINNING LATE — TIME MANAGEMENT: hold possession, play safe
    // ========================
    if (ctx.winning && ctx.late && zone !== 'final') {
      // keep the ball: prefer short safe passes, rarely shoot, don't risk through-balls
      const safe = bestPassTarget(p);
      if (safe && safe.score > 0.35 && pressNow < 4) {
        aiPass(p, safe.mate);
        return;                                            // no pass-and-move: stay compact
      }
      // if no safe pass, hold the ball and shield
      if (pressNow > 3) {
        p.aiT = 0.40 + rrange(0, 0.2);
        aiDribbleSkill(p);
        return;
      }
    }

    // ========================
    // 2. COUNTER-ATTACK: RUN WITH THE BALL IF SPACE IS OPEN
    // ========================
    if (counter && (p.role === 'FWD' || p.role === 'MID') && pressNow > 3.5) {
      p.aiT = 0.30 + rrange(0, 0.15);
      aiDribbleForward(p);
      aiTryDash(p);                                        // speed burst on the counter
      return;
    }

    // ========================
    // 3. SHOOT
    // ========================
    const inRange = goalDist < 30 && (attackUp ? p.y < CFG.PL*0.58 : p.y > CFG.PL*0.42);
    if (inRange) {
      let sp = 0.22 + (t.r.ATT/100)*0.35 - goalDist/50;
      if (pressNow < 3) sp += 0.22;
      if (pressNow > 8) sp -= 0.12;
      if (zone === 'final' && goalDist < 16) sp += 0.18;
      if (p.shoot && p.shoot > 70) sp += 0.10;
      if (ctx.losing && ctx.veryLate) sp += 0.15;         // desperate: shoot more when losing late
      sp = clamp(sp, 0.08, 0.88);
      if (srand() < sp) { aiShoot(p); return; }
    }

    // ========================
    // 3b. CROSS FROM THE WING: winger near the byline delivers into the box
    // ========================
    const onWing = p.x < CFG.PW * 0.22 || p.x > CFG.PW * 0.78;
    const nearByline = attackUp ? (p.y < CFG.PL * 0.15) : (p.y > CFG.PL * 0.85);
    if (onWing && nearByline && (p.role === 'FWD' || p.role === 'MID')) {
      // find a teammate in the box to cross to
      const crossTarget = findCrossTarget(p);
      if (crossTarget) {
        aiCross(p, crossTarget);
        return;
      }
    }

    // ========================
    // 4. HOLD & DRIBBLE
    // ========================
    if (space > 8 && pressNow > 3.5 && p.role !== 'DEF') {
      let dribChance = clamp(0.25 + (playerSkill - 60) / 200 + (space - 8) / 60, 0.10, 0.70);
      if (ctx.losing && ctx.late) dribChance += 0.12;      // more urgency → take more risks
      if (srand() < dribChance) {
        p.aiT = 0.35 + rrange(0, 0.20);
        aiDribbleForward(p);
        return;
      }
    }

    // ========================
    // 5. THROUGH BALL
    // ========================
    if (!(ctx.winning && ctx.late)) {                      // don't play risky through-balls when protecting a lead
      const throughTarget = aiFindThroughBall(p);
      if (throughTarget) {
        aiThroughBall(p, throughTarget);
        triggerPassAndMove(p);
        return;
      }
    }

    // ========================
    // 6. PASS
    // ========================
    const best = bestPassTarget(p);
    if (best) {
      let threshold = 0.45;
      if (zone === 'own') threshold = 0.30;
      if (zone === 'final') threshold = 0.55;
      if (pressNow < 2.6) threshold = -1;
      // losing late → be more aggressive with forward passes
      if (ctx.losing && ctx.late) threshold -= 0.10;

      if (best.score > threshold) {
        if (!laneClear(p, best.mate) && dist(p, best.mate) > 7) {
          aiLob(p, best.mate);
        } else {
          aiPass(p, best.mate);
        }
        triggerPassAndMove(p);
        return;
      }
    }

    // ========================
    // 7. DRIBBLE: no good pass, carry with intent
    // ========================
    aiDribbleSkill(p);
  }

  // find a teammate in the box for a cross delivery
  function findCrossTarget(p) {
    const attackUp = atkUp(p.side);
    const mates = teamObj(p.side).players;
    let best = null, bs = -1;
    for (const m of mates) {
      if (m === p || m.isGK) continue;
      // must be in or near the box (central, advanced)
      const inBox = Math.abs(m.x - CFG.PW/2) < CFG.boxW/2;
      const advanced = attackUp ? (m.y < CFG.PL * 0.18) : (m.y > CFG.PL * 0.82);
      if (!inBox || !advanced) continue;
      const open = clamp(nearestOppToPoint(m, p.side) / 6, 0, 1);
      const d = dist(p, m);
      if (d < 8 || d > 40) continue;
      const score = open * 0.6 + (m.role === 'FWD' ? 0.3 : 0.1) + (m.shoot ? m.shoot / 300 : 0);
      if (score > bs) { bs = score; best = m; }
    }
    return (best && bs > 0.35) ? best : null;
  }

  // deliver a cross into the box (lofted ball toward the target)
  function aiCross(p, target) {
    const diff = DIFFS[game.settings.difficulty];
    const skill = (game._allAI || p.side === 'away') ? diff.pass * 0.95 : clamp(0.85 * diff.mate, 0.55, 0.97);
    const fy = atkUp(p.side) ? -1 : 1;
    // aim slightly ahead of the target into the box
    const tx = lerp(target.x, CFG.PW/2, 0.15);             // pull toward center of goal
    const ty = target.y + fy * 2 + target.vy * 0.3;
    kickLob(p, tx, ty, skill);
    say(pick(['Swings it in!', 'Cross into the box!', 'Delivery from the wing!', 'Whips it in!']));
  }

  // intelligent dribbling toward the attacking goal with defender avoidance
  function aiDribbleForward(p) {
    const attackUp = atkUp(p.side);
    const gx = CFG.PW/2, gy = attackUp ? 0 : CFG.PL;
    const fy = attackUp ? -1 : 1;
    // run toward goal but bias toward the nearer flank (using sideline space)
    let dx = (gx - p.x) * 0.4;                             // gentle pull toward center
    let dy = fy * 8;                                        // strong forward drive
    // avoid nearest defender
    const opp = nearestOpponent(p);
    if (opp && dist(p, opp) < 7) {
      const ax = p.x - opp.x, ay = p.y - opp.y; const an = len(ax,ay)||1;
      // cut to the side of the defender, not away from them
      dx += (ay/an) * 3.5;                                 // perpendicular dodge (left/right of defender)
      dy += Math.abs(ax/an) * 2;
    }
    const nn = len(dx,dy)||1;
    p.heading = Math.atan2(dy/nn, dx/nn);
  }

  // skillful dribbling: feint, cut inside/outside, shield the ball
  function aiDribbleSkill(p) {
    const attackUp = atkUp(p.side);
    const gx = CFG.PW/2, gy = attackUp ? 0 : CFG.PL;
    const opp = nearestOpponent(p);
    let dx = gx - p.x, dy = gy - p.y; const n = len(dx,dy)||1; dx/=n; dy/=n;

    if (opp) {
      const dOpp = dist(p, opp);
      if (dOpp < 4) {
        // very close → sharp cut: perpendicular to the opponent's approach angle
        const ax = opp.x - p.x, ay = opp.y - p.y; const an = len(ax,ay)||1;
        // choose cut direction away from the sideline
        const cutDir = p.x < CFG.PW/2 ? 1 : -1;
        dx = (-ay/an) * cutDir * 1.2 + dx * 0.3;
        dy = (ax/an) * cutDir * 1.2 + dy * 0.3;
      } else if (dOpp < 8) {
        // moderate distance → veer around
        const ax = p.x - opp.x, ay = p.y - opp.y; const an = len(ax,ay)||1;
        dx += ax/an * 0.7; dy += ay/an * 0.7;
      }
      // else far away — run straight at goal
    }
    const nn = len(dx,dy)||1;
    p.heading = Math.atan2(dy/nn, dx/nn);
  }

  // find a teammate making a run behind the defense for a through-ball
  function aiFindThroughBall(p) {
    const attackUp = atkUp(p.side);
    const fy = attackUp ? -1 : 1;
    const mates = teamObj(p.side).players;
    const opps = teamObj(otherSide(p.side)).players;
    let best = null, bs = -1;
    for (const m of mates) {
      if (m === p || m.isGK) continue;
      const d = dist(p, m);
      if (d < 8 || d > 42) continue;
      // is the mate ahead and moving forward? (through-balls need a runner)
      const mateAdv = attackUp ? (p.y - m.y) : (m.y - p.y);
      if (mateAdv < 3) continue;                            // mate must be ahead of passer
      const mateFwdV = attackUp ? -m.vy : m.vy;             // positive = running toward attacking goal
      if (mateFwdV < 1.5) continue;                         // must be actively running forward

      // is there space behind the defense for the through-ball?
      const aheadPt = { x: m.x, y: clamp(m.y + fy * 7, 1, CFG.PL - 1) };
      const spaceForRun = nearestOppToPoint(aheadPt, p.side);
      if (spaceForRun < 5) continue;                        // no space behind the line

      // is the lane at least partially clear?
      const lane = laneClear(p, m) ? 1 : 0.3;
      const score = mateAdv / 20 * 0.4 + spaceForRun / 15 * 0.4 + lane * 0.2;
      if (score > bs) { bs = score; best = m; }
    }
    return (best && bs > 0.42) ? best : null;
  }

  function aiThroughBall(p, mate) {
    const attackUp = atkUp(p.side);
    const fy = attackUp ? -1 : 1;
    const diff = DIFFS[game.settings.difficulty];
    const skill = (game._allAI || p.side === 'away') ? diff.pass * 1.02 : clamp(0.88 * diff.mate, 0.6, 0.99);
    const lead = 7 + clamp(nearestOppToPoint({ x: mate.x, y: mate.y + fy * 7 }, p.side), 0, 12) * 0.5;
    kickTo(p, mate.x + mate.vx * 0.4, clamp(mate.y + fy * lead, 1, CFG.PL - 1), false, skill, { drive: true });
    if (p.side === 'home') say(pick(['Great through ball from your side!', 'Played in behind!', 'What a pass!']));
    else say(pick(['Through ball!', 'Slipped in behind the defence!', 'Dangerous pass into space!']));
  }

  function aiLob(p, mate) {
    const diff = DIFFS[game.settings.difficulty];
    const skill = (game._allAI || p.side === 'away') ? diff.pass : clamp(0.84 * diff.mate, 0.6, 0.99);
    kickLob(p, mate.x + mate.vx * 0.25, mate.y + mate.vy * 0.25, skill);
    say(pick(['Clips it over the top!', 'Lovely lofted ball!', 'Floated into space!']));
  }
  function nearestOpponent(p) { return nearestOfSide(otherSide(p.side), p, false); }
  function nearestOpponentDist(p) { const o = nearestOpponent(p); return o ? dist(p, o) : 99; }

  function bestPassTarget(p) {
    const mates = teamObj(p.side).players;
    const attackUp = atkUp(p.side);
    const zone = pitchZone(p);
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
      // runner bonus: mates actively running forward score higher
      const fy = attackUp ? -1 : 1;
      const mateSpeed = len(m.vx, m.vy);
      const runBonus = mateSpeed > 2 && (m.vy * fy < -1) ? 0.12 : 0;      // running toward goal
      // zone awareness: in own third, prefer safe backward passes; in final third, prefer forward
      let zoneMod = 0;
      if (zone === 'own' && fwd < 0) zoneMod = 0.10;       // back-pass to recycle in own third = good
      if (zone === 'final' && fwd > 5) zoneMod = 0.08;     // forward pass in final third = good
      // switch play bonus: long lateral passes to the opposite flank (switches create space)
      const lateral = Math.abs(m.x - p.x);
      const switchBonus = (lateral > 25 && open > 0.5 && lane > 0.5) ? 0.10 : 0;
      const score = fwdN * 0.50 + open * 0.28 + lane * 0.22 + runBonus + zoneMod + switchBonus - clamp((d-30)/40, 0, 0.3);
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
  function aiShoot(p) {
    const diff = DIFFS[game.settings.difficulty];
    const shot = (game._allAI || p.side === 'away') ? diff.shot : clamp(diff.shot * diff.mate, 0.6, 0.99);
    kickToGoal(p, p.side, 0.0, { shot });
  }
  function aiPass(p, mate) {
    const diff = DIFFS[game.settings.difficulty];
    // lead the pass into the teammate's run (faster mates get more lead)
    const mateSpeed = len(mate.vx, mate.vy);
    const lead = mateSpeed > 2 ? 0.38 : 0.24;              // more lead for runners, less for stationary
    const tx = mate.x + mate.vx * lead, ty = mate.y + mate.vy * lead;
    const skill = (game._allAI || p.side === 'away') ? diff.pass : clamp(0.86 * diff.mate, 0.6, 0.99);
    kickTo(p, tx, ty, false, skill);
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
  // cheaper variant for the aim PREVIEW (drawn every frame): recompute the target choice
  // ~12x/s, but track the chosen mate's live position each frame. (doPass still uses the fresh one.)
  let _aimT = { t: -1e9, owner: null, mate: null };
  function previewPassTarget(p) {
    const now = performance.now();
    const m = _aimT.mate;
    const stale = m && (m.onBench || m.isGK || m.side !== p.side);
    if (stale || _aimT.owner !== p.id || now - _aimT.t > 85) {
      _aimT.mate = homePassTarget(p); _aimT.t = now; _aimT.owner = p.id;
    }
    return _aimT.mate;
  }
  function doPass(p) {
    const mate = homePassTarget(p) || pickForwardMate(p);
    if (!mate) { doShoot(p); return; }
    // contextual pass type (no extra gesture): through-ball into space behind, chip over a blocked lane, else ground
    const up = atkUp(p.side), fy = up ? -1 : 1;
    const aheadPt = { x: mate.x, y: clamp(mate.y + fy * 6, 1, CFG.PL - 1) };
    const mateAhead = up ? (mate.y < p.y - 3) : (mate.y > p.y + 3);
    const gapAhead = nearestOppToPoint(aheadPt, p.side);
    const d = len(mate.x - p.x, mate.y - p.y);
    let type = 'ground';
    if (mateAhead && gapAhead > 6 && d > 11) type = 'through';
    else if (!laneClear(p, mate) && d > 7) type = 'lofted';
    if (type === 'through') {
      const lead = 7 + Math.min(gapAhead, 12) * 0.5;              // play it into the gap ahead of the runner
      kickTo(p, mate.x + mate.vx * 0.4, clamp(mate.y + fy * lead, 1, CFG.PL - 1), false, 0.95, { drive: true });
      if (p.side === 'home') say(pick(['Through ball!', 'Slips it in behind!', 'Played in!']));
    } else if (type === 'lofted') {
      kickLob(p, mate.x + mate.vx * 0.25, mate.y + mate.vy * 0.25, 0.94);  // chip over the blocked lane
      if (p.side === 'home') say(pick(['Lofted over the top!', 'Chips it in!', 'Floated pass!']));
    } else {
      kickTo(p, mate.x + mate.vx * 0.30, mate.y + mate.vy * 0.30, false, 0.97);
    }
    // Follow the receiver via the soft receive-window — NOT a hard lock. A hard lock
    // would strand control on the intended receiver for ~1.4s even when the pass is
    // intercepted or never reaches them; the receive-window yields the moment the
    // opponent wins it (see chooseActive), so control snaps back to a real defender.
    setActive(mate.id);
    game._recvUntil = performance.now() / 1000 + 1.5;   // the receiver runs onto the pass (so it connects + control stays on them)
    if (game.tutorial) game.tutorial.passed = true;
  }
  function kickLob(p, tx, ty, skill) {
    recordPassAttempt(p.side); markOffside(p.side);
    const b = game.ball, d = len(tx - p.x, ty - p.y), err = (1 - skill) * (d * 0.12 + 1.6);
    const ex = tx + rrange(-err, err), ey = ty + rrange(-err, err);
    const dx = ex - b.x, dy = ey - b.y, n = len(dx, dy) || 1;
    const speed = clamp(Math.sqrt(2 * CFG.ballDecel * d) * 0.9, 8, CFG.ballMax);   // a touch under-hit (flies further through the air)
    b.vx = dx/n * speed; b.vy = dy/n * speed;
    b.z = 0; b.vz = clamp(2.4 + d * 0.06, 2.6, 5.2); b.shot = false; b.trail.length = 0;
    b.owner = null; game.lastTouch = p.side; game.lastKicker = p.id; game.lastTouchPlayer = p.id; game._lastWasShot = false;
    p.kickCd = 0.45; p.heading = Math.atan2(dy, dx); SFX.pass();
  }
  function pickForwardMate(p) {
    const mates = game.home.players.filter(m => m !== p && !m.isGK);
    const up = atkUp('home');
    mates.sort((a,b) => up ? a.y - b.y : b.y - a.y); // most advanced toward the attacking goal
    return mates[0];
  }
  function doShoot(p) {
    kickToGoal(p, p.side, game.steer.x, { shot: 0.99 });
    if (game.tutorial) game.tutorial.shot = true;
  }
  function kickToGoal(p, side, aimX, acc) {
    game.stats.shots[side]++;
    bumpMom(side, 0.10);                              // taking a shot builds momentum
    const attackUp = atkUp(side);
    const gy = attackUp ? 0 : CFG.PL;
    const goalDist = len(p.x - CFG.PW/2, p.y - gy);
    // aim toward a post based on steer (player skill); AI aims away from keeper
    let aim = aimX;
    if (side === 'away' || aim === 0) {
      const opp = teamObj(otherSide(side)).players;
      const gk = opp.find(q => q.isGK) || opp[0];
      aim = clamp((CFG.PW/2 - gk.x) / CFG.goalHalfW, -1, 1) * 0.7 + rrange(-0.25, 0.25);
    }
    const tx = clamp(CFG.PW/2 + aim * (CFG.goalHalfW - 0.4), CFG.PW/2 - CFG.goalHalfW + 0.3, CFG.PW/2 + CFG.goalHalfW - 0.3);
    const ty = gy;
    const sh = p.shoot || teamObj(side).def.r.ATT;                     // a clinical finisher is more accurate
    const skill = clamp(((acc && acc.shot) || 0.9) * (0.82 + sh/100 * 0.24), 0.5, 0.99);
    const err = (1 - skill) * 6 + clamp(goalDist/30,0,1) * 1.4;
    const ex = tx + rrange(-err, err), ey = ty + rrange(-1, 1);
    const onT = Math.abs(ex - CFG.PW/2) < CFG.goalHalfW;
    if (onT) { game.stats.sot[side]++; p.mSh = (p.mSh || 0) + 1; bumpMom(side, 0.06); SFX.crowdRoar(0.45); }   // on-frame = on target → crowd swells
    recordShot(p, side, onT); game._passSide = null;   // log for the shot map; a shot isn't a pass
    kickRaw(p, ex, ey, CFG.ballMax * (0.78 + (teamObj(side).def.r.ATT/100)*0.22), true);
  }
  function goalAimedOnTarget(tx) { return Math.abs(tx - CFG.PW/2) < CFG.goalHalfW; }
  function kickTo(p, tx, ty, isShot, skill, opt) {
    if (!isShot) { recordPassAttempt(p.side); markOffside(p.side); }
    const d = len(tx - p.x, ty - p.y);
    const err = (1 - skill) * (d * 0.10 + 1.5);
    // speed chosen so ground friction brings the ball ~to the target (v² = 2·decel·d), slight overhit
    let speed = clamp(Math.sqrt(2 * CFG.ballDecel * d) * 1.08, 9, CFG.ballMax);
    if (opt && opt.drive) speed = clamp(speed * 1.28, 9, CFG.ballMax);   // driven through-ball: more pace into space
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
      const prob = game.tutorial ? 1 : clamp(base * (p.side === 'home' ? 1 : diff.tackle), 0.15, 0.9);
      if (srand() < prob) {
        b.owner = p.id; b.z = 0; b.vz = 0; b.shot = false; b.trail.length = 0;
        p.mTk = (p.mTk || 0) + 1;
        _prevBall.x = b.x; _prevBall.y = b.y;
        game.lastTouch = p.side; game.lastKicker = null; game.lastTouchPlayer = p.id; game._lastWasShot = false;
        spawnEffect('win', p.x, p.y);
        if (p.side === 'home') { setActive(p.id, true); say(pick(['Won it back!', 'Great tackle!', 'Dispossessed!'])); }
      } else if (srand() < 0.18) {
        commitFoul(p, carrier, p.x, p.y);          // mistimed tackle → free kick, maybe a card
      }
    } else if (b.owner == null && dist(p, b) < CFG.captureR + 0.5) {
      b.owner = p.id; b.z = 0; b.vz = 0; b.shot = false; b.trail.length = 0;
      _prevBall.x = b.x; _prevBall.y = b.y;
      game.lastTouch = p.side; game.lastTouchPlayer = p.id;
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
    const defR = (presser.def || teamObj(presser.side).def.r.DEF) / 100;   // a strong tackler wins it more often
    const carR = teamObj(carrier.side).def.r.MID / 100;
    let rate = (0.4 + (defR - 0.6) * 2.0) * (1 - pd / CFG.tackleR);   // ramps up the closer they get
    rate *= clamp(1.15 - (carR - 0.6), 0.6, 1.35);                   // skilled carriers shield better
    rate *= clamp(1.3 - (carrier.stam != null ? carrier.stam : 1) * 0.3, 0.9, 1.3);   // tired carriers get robbed more
    if (carrier.dashT > 0) rate *= 0.4;                              // a dash buys a moment
    if (game._allAI) rate *= 0.6;                                    // spectator: fewer turnovers → settled, end-to-end play
    else rate *= (carrier.side === 'home') ? diff.tackle : (2 - diff.tackle);  // difficulty scales the human's opponent
    if (srand() < rate * dt) {
      if (srand() < 0.14) commitFoul(presser, carrier, carrier.x, carrier.y);   // some challenges are fouls → free kick / cards
      else knockLoose(carrier, presser);
    }
  }
  function knockLoose(carrier, presser) {
    const b = game.ball;
    presser.mTk = (presser.mTk || 0) + 1;          // Man of the Match: ball won
    const dx = presser.x - carrier.x, dy = presser.y - carrier.y, n = len(dx, dy) || 1;
    b.owner = null; b.shot = false; b.z = 0; b.vz = 0; b.trail.length = 0;
    const sp = rrange(3.5, 6.5);
    b.vx = dx/n * sp + rrange(-2, 2); b.vy = dy/n * sp + rrange(-2, 2);
    _prevBall.x = b.x; _prevBall.y = b.y;
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
      const dec = CFG.ballDecel * (game._ballDecelMul || 1) * (b.z > 0.3 ? 0.25 : 1) * dt;   // wet pitch reduces friction
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
      if (best._off && game.settings.offside) { offsideCalled(best); return; }   // an offside player got to the ball → free kick
      b.owner = best.id; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.shot = false;
      b.trail.length = 0;
      clearOffside();
      game.lastTouch = best.side; game.lastKicker = null; game.lastTouchPlayer = best.id; game._lastWasShot = false;
      if (game._passSide) { if (best.side === game._passSide && game.passStat) game.passStat[best.side].comp++; game._passSide = null; }   // pass completion
      _prevBall.x = b.x; _prevBall.y = b.y;
      if (best.side === 'home' && best.id !== game.activeId) setActive(best.id, false);
    }
  }

  // ============================================================
  // GOALKEEPERS
  // ============================================================
  function updateKeepers(dt) {
    const hg = game.home.players.find(p => p.isGK), ag = game.away.players.find(p => p.isGK);
    if (hg) keeperLogic(hg, 'home', dt);
    if (ag) keeperLogic(ag, 'away', dt);
  }
  function keeperLogic(gk, side, dt) {
    const b = game.ball;
    const lineY = atkUp(side) ? CFG.PL - 0.6 : 0.6;        // own goal line (defends the far end)
    const ownGoalUp = !atkUp(side);                          // true => defends the top (y=0) goal
    // track ball x, clamped to the goal mouth (+a little)
    let tx = clamp(b.x, CFG.PW/2 - CFG.goalHalfW - 1.5, CFG.PW/2 + CFG.goalHalfW + 1.5);
    let ty = lineY;
    // come off the line a touch if the ball is close & in the box
    const inBox = atkUp(side) ? b.y > CFG.PL - CFG.boxD : b.y < CFG.boxD;
    if (inBox) ty = atkUp(side) ? CFG.PL - 2.2 : 2.2;
    const maxV = CFG.playerMax * 0.95;
    const latMax = CFG.playerMax * 0.6;   // limited lateral reach — well-placed corner shots beat the keeper
    gk.vx = approach(gk.vx, clamp((tx - gk.x) * 4, -latMax, latMax), CFG.playerAccel * dt);
    gk.vy = approach(gk.vy, clamp((ty - gk.y) * 4, -maxV*0.7, maxV*0.7), CFG.playerAccel * dt);
    gk.x += gk.vx * dt; gk.y += gk.vy * dt;
    if (len(gk.vx, gk.vy) > 0.3) gk.heading = Math.atan2(gk.vy, gk.vx);

    // grab / save balls near the goal (height-gated so high shots beat the keeper)
    if (b.owner == null && b.z <= CFG.catchH) {
      const inArea = atkUp(side) ? (b.y > CFG.PL - 9) : (b.y < 9);   // claim only near the goal
      const reach = 1.9 + (teamObj(side).def.r.GK/100 - 0.7) * 2.4;   // better keepers dive further
      if (inArea && dist(gk, b) < reach && !(game.lastKicker === gk.id && gk.kickCd > 0)) {
        const wasShot = game._lastWasShot && len(b.vx, b.vy) > 9;
        b.owner = gk.id; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.shot = false; b.trail.length = 0;
        _prevBall.x = b.x; _prevBall.y = b.y;
        game.lastTouch = side; game.lastTouchPlayer = gk.id; game._lastWasShot = false; gk.kickCd = 0;
        if (wasShot) {
          gk.mSv = (gk.mSv || 0) + 1;
          SFX.save(); spawnEffect('win', gk.x, gk.y);
          say(side === 'home'
            ? pick(['Great save by your keeper!', 'Tipped away!', 'Brilliant stop!', 'Saved! Keeps you in it.'])
            : pick(['What a save!', 'The keeper denies you!', 'Denied!', 'Good save, that was well struck.']));
        }
        keeperDistribute(gk, side);
      }
    }
    // dribble/hold then distribute
    if (b.owner === gk.id) {
      const tgx = gk.x, tgy = gk.y + (atkUp(side) ? -0.8 : 0.8);
      b.x = tgx; b.y = tgy; b.vx = 0; b.vy = 0;
      gk._holdT = (gk._holdT || 0) + dt;
      if (gk._holdT > 0.5) { gk._holdT = 0; keeperDistribute(gk, side); }
    } else { gk._holdT = 0; }
  }
  function keeperDistribute(gk, side) {
    const mates = teamObj(side).players.filter(m => !m.isGK);
    const attackUp = atkUp(side);
    // decide: play short to build, or go long to a forward?
    // if opponents are pressing high, go long; if they're sitting deep, play short
    const oppAvgY = teamObj(otherSide(side)).players.reduce((s, p) => s + p.y, 0) / 11;
    const oppPressHigh = attackUp ? (oppAvgY > CFG.PL * 0.55) : (oppAvgY < CFG.PL * 0.45);
    const goLong = oppPressHigh && srand() < 0.55;          // beat the press with a long ball

    let best = null, bs = -1;
    for (const m of mates) {
      const open = nearestOppToPoint(m, side);
      const adv = attackUp ? (CFG.PL - m.y) / CFG.PL : m.y / CFG.PL;  // 0..1 how advanced
      const d = dist(gk, m);
      let s;
      if (goLong) {
        // prefer advanced, open players for long distribution
        s = adv * 0.5 + open * 0.4 - (d > 50 ? 0.15 : 0);
      } else {
        // prefer close defenders for short buildup
        s = open * 0.5 - d * 0.015 + (m.role === 'DEF' ? 0.15 : 0) + adv * 0.1;
      }
      if (s > bs) { bs = s; best = m; }
    }
    if (best) {
      if (goLong && dist(gk, best) > 25) {
        kickTo(gk, best.x, best.y, false, 0.82);           // long kick: less accurate but gets it forward
      } else {
        kickTo(gk, best.x + best.vx * 0.2, best.y + best.vy * 0.2, false, 0.92);
      }
    }
  }

  // ============================================================
  // RULES — goals, out of bounds, restarts
  // ============================================================
  let _prevBall = { x: CFG.PW/2, y: CFG.PL/2 };
  function checkBounds() {
    const b = game.ball;
    // Note: we check the BALL against the lines even when it is owned — a player
    // can dribble it out of play (throw-in/goal-kick) or dribble it into the net.

    // GOAL LINES — teams switch ends at half time, so which side attacks each goal
    // flips. upTeam = the side currently attacking the top (y=0) goal.
    const withinPosts = Math.abs(b.x - CFG.PW/2) < CFG.goalHalfW;
    const upTeam = atkUp('home') ? 'home' : 'away';
    const downTeam = otherSide(upTeam);
    if (_prevBall.y > 0 && b.y <= 0) {                       // ball at the top (y=0) goal
      if (withinPosts) {
        if (b.z > CFG.crossbarH) { overBar(upTeam); return; }
        if (nearPost(b.x)) { postBounce(true); return; }
        return scoreGoal(upTeam);
      }
      if (game._lastWasShot && game.lastTouch === upTeam) { say(pick(['Just wide!', 'Inches away!', 'So close!'])); game._lastWasShot = false; }
      if (game.lastTouch === upTeam) goalKick(downTeam); else cornerKick(upTeam, b.x < CFG.PW/2 ? 'L' : 'R', true);
      return;
    }
    if (_prevBall.y < CFG.PL && b.y >= CFG.PL) {             // ball at the bottom (y=PL) goal
      if (withinPosts) {
        if (b.z > CFG.crossbarH) { overBar(downTeam); return; }
        if (nearPost(b.x)) { postBounce(false); return; }
        return scoreGoal(downTeam);
      }
      if (game._lastWasShot && game.lastTouch === downTeam) { say(pick(['Just wide!', 'Inches away!', 'So close!'])); game._lastWasShot = false; }
      if (game.lastTouch === downTeam) goalKick(upTeam); else cornerKick(downTeam, b.x < CFG.PW/2 ? 'L' : 'R', false);
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

  // ============================================================
  // GOAL REPLAYS + MATCH STATS
  // ============================================================
  const REPLAY_FRAMES = 230;                          // ~3.8s of build-up buffered at 60fps
  function recordReplayFrame() {
    if (game.phase !== 'play') return;
    const b = game.ball, snap = ps => ps.map(p => [p.x, p.y, p.heading, p.vx, p.vy, p.runPhase || 0]);
    const buf = game._rbuf || (game._rbuf = []);
    buf.push({ b: [b.x, b.y, b.z || 0], h: snap(game.home.players), a: snap(game.away.players) });
    if (buf.length > REPLAY_FRAMES) buf.shift();
  }
  function startGoalReplay() {                         // returns true if a replay is now playing
    if (game.matchMode === 'tutorial' || !game._rbuf || game._rbuf.length < 50) return false;
    game._replay = { frames: game._rbuf, i: 0 };
    game._rbuf = [];                                   // fresh buffer for the next move
    // clear the GOAL! banner so the replay tag is the only overlay
    const mb = $('match-banner'); if (mb) { mb.classList.remove('show'); mb.textContent = ''; }
    // show the replay bar + vignette
    const rt = $('replay-tag'); if (rt) rt.classList.add('show');
    const rv = $('replay-vignette'); if (rv) rv.classList.add('show');
    return true;
  }
  function applyReplayFrame(f) {
    const b = game.ball; b.x = f.b[0]; b.y = f.b[1]; b.z = f.b[2];
    const set = (arr, ps) => { for (let i = 0; i < ps.length && i < arr.length; i++) { const p = ps[i], s = arr[i]; p.x = s[0]; p.y = s[1]; p.heading = s[2]; p.vx = s[3]; p.vy = s[4]; p.runPhase = s[5]; } };
    set(f.h, game.home.players); set(f.a, game.away.players);
  }
  function advanceReplay(dt) {
    const R = game._replay;
    R.i += dt * 60 * 0.72;                             // gentle slow-mo
    if (R.i >= R.frames.length - 1) { endGoalReplay(); return; }
    applyReplayFrame(R.frames[Math.floor(R.i)]);
  }
  function endGoalReplay() {
    game._replay = null; game.phaseT = 0.9;            // brief pause, then kick off
    const rt = $('replay-tag'); if (rt) rt.classList.remove('show');
    const rv = $('replay-vignette'); if (rv) rv.classList.remove('show');
  }
  function resetMatchStats() {
    game.shotLog = []; game.passStat = { home: { att: 0, comp: 0 }, away: { att: 0, comp: 0 } };
    game._passSide = null; game._rbuf = []; game._replay = null; game._replayDelay = null;
    const rt = $('replay-tag'); if (rt) rt.classList.remove('show');
    const rv = $('replay-vignette'); if (rv) rv.classList.remove('show');
  }
  function recordShot(p, side, onTarget) {
    const up = atkUp(side), sx = up ? p.x : CFG.PW - p.x, sy = up ? p.y : CFG.PL - p.y;   // orient so the attacked goal is at the top
    (game.shotLog || (game.shotLog = [])).push({ nx: clamp(sx / CFG.PW, 0, 1), ny: clamp(sy / CFG.PL, 0, 1), side, on: onTarget, goal: false });
  }
  function shotMapHTML() {
    const log = game.shotLog || [];
    if (!log.length) return '';
    const dots = log.map(s => `<span class="sm-dot ${s.side === 'home' ? 'sm-h' : 'sm-a'}${s.goal ? ' sm-goal' : s.on ? ' sm-on' : ''}" style="left:${(s.nx*100).toFixed(1)}%;top:${(s.ny*100).toFixed(1)}%"></span>`).join('');
    return `<div class="shotmap-title">Shot map <span class="sm-leg"><span class="sm-dot sm-h"></span>${game.home.def.code}</span><span class="sm-leg"><span class="sm-dot sm-a"></span>${game.away.def.code}</span><span class="sm-leg"><span class="sm-dot sm-goal"></span>goal</span></div>`
      + `<div class="shotmap"><span class="sm-goalline"></span>${dots}</div>`;
  }
  function recordPassAttempt(side) { if (game.passStat) { game.passStat[side].att++; game._passSide = side; } }

  // ----- offside -----
  function clearOffside() { if (game.home) for (const p of game.home.players) p._off = false; if (game.away) for (const p of game.away.players) p._off = false; }
  function offsideLineY(defSide) {                    // the 2nd-rearmost defender = the offside line
    const up = atkUp(otherSide(defSide));             // the attackers attack the goal this side defends
    const ys = teamObj(defSide).players.map(p => p.y).sort((a, b) => up ? a - b : b - a);   // nearest own goal first
    return ys.length >= 2 ? ys[1] : (ys[0] != null ? ys[0] : (up ? 0 : CFG.PL));
  }
  function markOffside(side) {                        // flag the passing side's players who are in an offside position
    clearOffside();
    if (!game.settings.offside || game.matchMode === 'tutorial') return;
    const up = atkUp(side), b = game.ball, lineY = offsideLineY(otherSide(side)), TOL = 1.6;
    for (const p of teamObj(side).players) {
      if (p.isGK) continue;
      p._off = up ? (p.y < lineY - TOL && p.y < b.y - TOL && p.y < CFG.PL/2)
                  : (p.y > lineY + TOL && p.y > b.y + TOL && p.y > CFG.PL/2);
    }
  }
  function offsideCalled(p) {                          // an offside player received the ball → free kick the other way
    clearOffside();
    game._offsideCount = (game._offsideCount || 0) + 1;
    showToast('Offside!');
    if (p.side === 'home') say(pick(['Offside — the flag is up.', 'Caught offside!', "Flag's up. Offside."]));
    else say(pick(['Offside against them — good defending.', 'They strayed offside.']));
    freeKick(otherSide(p.side), clamp(p.x, 2, CFG.PW - 2), clamp(p.y, 2, CFG.PL - 2));
  }

  function scoreGoal(side) {
    if (game.matchMode === 'tutorial') {              // celebrate but don't freeze/reset the guided flow
      showBanner('GOAL!'); SFX.goal(); pitchPunch();
      const b = game.ball; b.owner = null; b.vx = 0; b.vy = 0; b.z = 0; _prevBall.x = b.x; _prevBall.y = b.y;
      return;
    }
    teamObj(side).score++;
    game._concede = otherSide(side);
    game.phase = 'goal'; game.phaseT = CFG.goalCelebrate;
    game.netRipple[otherSide(side)] = 1.0; // the conceding net ripples
    const scorer = playerById(game.lastTouchPlayer);
    const ownGoal = scorer && scorer.side !== side;
    if (scorer && !ownGoal) scorer.mGoals = (scorer.mGoals || 0) + 1;   // Man of the Match
    const seasonMap = (game.matchMode === 'career' && game.career) ? game.career.seasonScorers
                    : (game.matchMode === 'league' && game.league) ? game.league.scorers : null;
    if (seasonMap && scorer && !ownGoal) {
      const tid = side === 'home' ? game.home.teamId : game.away.teamId;
      const key = tid + '#' + scorer.num;
      seasonMap[key] = (seasonMap[key] || 0) + 1;
    }
    showBanner(ownGoal ? 'OWN GOAL' : 'GOAL!');
    goalCommentary(side, scorer, ownGoal);
    SFX.goal(); SFX.crowdRoar(1); pitchPunch();
    bumpMom(side, 0.55);                              // a goal swings the momentum hard to the scorer
    spawnGoalBurst(side);
    paintScoreboard();
    if (game._lastWasShot && game.shotLog) {           // tag the shot that scored on the shot map
      for (let i = game.shotLog.length - 1; i >= 0; i--) if (game.shotLog[i].side === side) { game.shotLog[i].goal = true; break; }
    }
    const b = game.ball; b.owner = null; b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0;
    _prevBall.x = b.x; _prevBall.y = b.y;
    game._lastWasShot = false;
    if (game.cup) game.cup.dirty = true;
    // schedule the replay to start after the GOAL banner fades (~1.4s)
    game._replayDelay = 1.4;
  }
  function goalCommentary(side, scorer, ownGoal) {
    const hs = game.home.score, as = game.away.score;
    let state;
    if (hs === as) state = `level at ${hs}–${as}`;
    else { const ld = hs > as ? game.home.def : game.away.def; state = `${ld.name} lead ${Math.max(hs,as)}–${Math.min(hs,as)}`; }
    const who = scorer ? `${scorer.name || ('#' + scorer.num)} (${teamObj(scorer.side).def.code})` : '';
    // late drama
    const min = Math.floor(game.clockSec / 60);
    const late = min >= 80;
    let prefix = ownGoal ? 'Own goal! ' : 'GOAL! ';
    if (late && !ownGoal) prefix = pick(['LATE GOAL! ', 'DRAMA! ']);
    let extra = '';
    if (!ownGoal && momFor(side) < -0.35) extra = pick([' Against the run of play!', ' Out of nowhere!', ' A smash and grab!']);
    else if (!ownGoal && momFor(side) > 0.5) extra = pick([' Thoroughly deserved.', ' The pressure finally told.', ' That had been coming.']);
    say(prefix + (who ? who + ' — ' : '') + state + '.' + extra);
  }
  // ----- dynamic colour commentary: occasional context-aware lines during open play -----
  function commentaryTick(dt) {
    if (game.matchMode === 'tutorial') return;
    game._comT = (game._comT || 0) - dt;
    if (game._comT > 0 || game.phase !== 'play') return;
    game._comT = rrange(26, 46);                 // next colour line in ~26-46 sim-seconds
    const line = pickColorLine(); if (line) say(line);
  }
  function pickColorLine() {
    const hs = game.home.score, as = game.away.score, min = Math.floor(game.clockSec / 60), m = game.mom;
    const onTop = m > 0.45 ? game.home.def : (m < -0.45 ? game.away.def : null);
    const under = onTop ? (onTop === game.home.def ? game.away.def : game.home.def) : null;
    const lead = hs === as ? null : (hs > as ? game.home.def : game.away.def);
    const trail = lead ? (lead === game.home.def ? game.away.def : game.home.def) : null;
    const gap = Math.abs(hs - as), bank = [];
    if (onTop) bank.push(`${onTop.name} are turning the screw.`, `All ${onTop.name} at the moment.`, `${under.name} can't get out of their half.`, `${onTop.name} pouring forward.`, `${under.name} pinned right back.`);
    else bank.push(`End-to-end stuff, this.`, `A real contest brewing here.`, `Neither side giving an inch.`, `The tempo is high out there.`, `Both teams going for it.`);
    if (lead && gap >= 2) bank.push(`${lead.name} look comfortable.`, `${trail.name} need something special now.`, `${lead.name} cruising.`);
    else if (lead && gap === 1) bank.push(`${trail.name} pushing for the equaliser.`, `Just one goal in it — anyone's game.`, `${lead.name} guarding a slender lead.`);
    else if (hs === as && hs + as > 0) bank.push(`All square — and you sense a winner coming.`, `Level, end to end.`);
    else bank.push(`Still goalless, but plenty of intent.`, `No breakthrough yet.`);
    if (min >= 80) bank.push(`Into the final stretch — tension rising.`, `Squeaky-bum time, this.`, trail ? `The clock is the enemy for ${trail.name}.` : `Big finish brewing.`);
    else if (min <= 8) bank.push(`Bright start to this one.`, `Sides feeling each other out early.`);
    // tactical awareness commentary
    if (lead && gap === 1 && min >= 75) bank.push(`${lead.name} sitting deeper now, protecting the lead.`, `${trail.name} throwing everything forward.`, `You can feel the urgency from ${trail.name}.`);
    if (lead && gap >= 2 && min >= 60) bank.push(`${lead.name} keeping the ball well — running down the clock.`, `${trail.name} chasing shadows at this point.`);
    if (!lead && min >= 85) bank.push(`We're heading for a draw unless someone produces something.`, `A point each — is anyone going to snatch it?`);
    return pick(bank);
  }
  function pitchPunch() { const el = (game.settings.gfx === '3D' && R3D && R3D.ready) ? $('pitch3d') : $('pitch'); if (!el) return; el.classList.remove('punch'); void el.offsetWidth; el.classList.add('punch'); }

  function restartAt(toSide, x, y, label, pushBack) {
    clearOffside();
    const b = game.ball;
    b.x = clamp(x, 0.5, CFG.PW-0.5); b.y = clamp(y, 0.5, CFG.PL-0.5);
    b.vx = 0; b.vy = 0; b.z = 0; b.vz = 0; b.owner = null; b.shot = false; game._lastWasShot = false;
    _prevBall.x = b.x; _prevBall.y = b.y;
    const taker = nearestOfSide(toSide, b, true) || teamObj(toSide).players[0];
    taker.x = b.x; taker.y = b.y + (atkUp(toSide) ? 0.8 : -0.8);
    taker.vx = 0; taker.vy = 0;
    b.owner = taker.id; game.lastTouch = toSide; game.lastKicker = null; game.lastTouchPlayer = taker.id;
    if (toSide === 'home') setActive(taker.id, true);
    if (pushBack) {
      for (const o of teamObj(otherSide(toSide)).players) {
        if (o.isGK) continue;
        if (dist(o, b) < 7.5) { const dx=o.x-b.x, dy=o.y-b.y, n=len(dx,dy)||1; o.x=b.x+dx/n*7.5; o.y=b.y+dy/n*7.5; }   // give the taker room to play out
      }
    }
    game.phase = 'restart'; game.phaseT = CFG.restartPause;
    showToast(label);
  }
  function throwIn(toSide, y, x) { restartAt(toSide, x, y, 'Throw-in', false); }
  function goalKick(toSide) {
    const y = atkUp(toSide) ? CFG.PL - CFG.sixD : CFG.sixD;
    restartAt(toSide, CFG.PW/2 + rrange(-6,6), y, 'Goal kick', true);
  }
  function cornerKick(toSide, lr, topGoal) {
    if (canSetPiece(toSide)) { triggerSetPiece('corner', lr); return; }   // your corner → mini-game (either end)
    const x = lr === 'L' ? 1 : CFG.PW - 1;
    const y = topGoal ? 1 : CFG.PL - 1;
    restartAt(toSide, x, y, 'Corner', true);
    say(toSide === 'home' ? pick(['Corner for you — chance here.', 'Swinging it in from the corner.']) : pick(['Corner to the opposition.', 'Defending a corner now.']));
  }
  function freeKick(toSide, x, y) {
    if (canSetPiece(toSide) && isShootingFK(x, y)) { triggerSetPiece('fk', x, y); return; }   // shootable free kick → mini-game
    restartAt(toSide, x, y, 'Free kick', true);
  }

  // ============================================================
  // HALF / FULL TIME
  // ============================================================
  // Man of the Match — weight goals heaviest, then saves/tackles/shots; nudge toward the winners
  function computeMOTM() {
    if (!game.home || !game.away) return null;
    const hs = game.home.score, as = game.away.score;
    const winSide = hs > as ? 'home' : as > hs ? 'away' : null;
    const all = game.home.players.concat(game.home.bench || [], game.away.players, game.away.bench || []);
    let best = null, bestScore = 0;
    for (const p of all) {
      let s = (p.mGoals || 0) * 3 + (p.mSv || 0) * 1.2 + (p.mTk || 0) * 0.4 + (p.mSh || 0) * 0.5;
      if (winSide && p.side === winSide) s += 0.6;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    if (!best) return null;
    let note;
    if (best.mGoals >= 2) note = best.mGoals + ' goals';
    else if (best.mGoals === 1) note = '1 goal' + (best.mTk >= 2 ? `, ${best.mTk} won` : '');
    else if (best.isGK && best.mSv >= 2) note = best.mSv + ' saves';
    else if (best.mTk >= 3) note = best.mTk + ' tackles';
    else note = 'all-round display';
    return { name: best.name || ('#' + best.num), code: teamObj(best.side).def.code, note };
  }
  function motmLine() { return game.motm ? `★ MOTM: ${game.motm.name} (${game.motm.code})` : ''; }
  function goHalftime() { game.phase = 'play'; SFX.whistle(); navigateTo('halftime'); }
  function goFulltime() {
    game.phase = 'ended';
    SFX.crowdRoar(0.8); SFX.crowdStop();           // final whistle
    clearMatch();                                  // match over — no longer resumable
    const wasWatch = game.matchMode === 'watch';
    game.watching = false; game._allAI = false;    // leave spectator mode at the whistle
    game.motm = computeMOTM();
    SFX.whistle();
    if (game.matchMode === 'cup') { onCupMatchEnd(); return; }
    if (game.matchMode === 'leagueCup' || game.matchMode === 'careerCup') { onSeasonCupMatchEnd(); return; }
    if (game.matchMode === 'worldcup') { onWorldCupMatchEnd(); return; }
    if (game.matchMode === 'worldcupKO') { onWorldCupKOMatchEnd(); return; }
    if (game.matchMode === 'league') { onLeagueMatchEnd(); return; }
    if (game.matchMode === 'career') { onCareerMatchEnd(); return; }
    if (!wasWatch) {                               // a spectated friendly doesn't touch your record
      const hs = game.home.score, as = game.away.score;
      if (hs > as) game.record.w++; else if (hs < as) game.record.l++; else game.record.d++;
      saveStore();
    }
    navigateTo('result');
  }

  // ============================================================
  // CUP — single-elimination tournament (8 teams) + penalty shootouts
  // ============================================================
  function shuffle(a) { for (let i = a.length-1; i > 0; i--) { const j = Math.floor(srand()*(i+1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function strengthOf(id) { const r = teamById(id).r; return r.ATT*0.3 + r.MID*0.25 + r.DEF*0.25 + r.PAC*0.1 + r.GK*0.1; }
  function poisson(lam) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= srand(); } while (p > L); return k - 1; }
  function simWinner(aId, bId) {
    // knockout — no draws allowed
    const sa = strengthOf(aId), sb = strengthOf(bId);
    const pa = 1 / (1 + Math.pow(10, (sb - sa) / 12));
    let ga = poisson(0.8 + pa*1.6), gb = poisson(0.8 + (1-pa)*1.6);
    if (ga === gb) { if (srand() < pa) ga++; else gb++; }
    return { winner: ga > gb ? aId : bId, score: [ga, gb] };
  }
  function simMatch(aId, bId) {
    // league / career — draws are allowed (realistic table results)
    const sa = strengthOf(aId), sb = strengthOf(bId);
    const pa = 1 / (1 + Math.pow(10, (sb - sa) / 12));
    const ga = poisson(0.8 + pa*1.6), gb = poisson(0.8 + (1-pa)*1.6);
    return { score: [ga, gb] };
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
  function cupOpponentC(c) {
    const teams = c.rounds[c.round], yi = teams.indexOf(c.you);
    if (yi < 0) return null;
    return teams[yi % 2 === 0 ? yi + 1 : yi - 1];
  }
  function cupOpponent() { return cupOpponentC(game.cup); }
  // a parallel knockout for a season: same 8 clubs as the league, drawn fresh
  function buildSeasonCup(teamIds, youId) {
    return { you: youId, rounds: [shuffle(teamIds.slice())], scores: [new Array(teamIds.length/2).fill(null)], round: 0, alive: true, champion: null };
  }
  function cupPlay() {
    const c = game.cup; if (!c || !c.alive || c.champion) return;
    const opp = cupOpponent(); if (!opp) return;
    startMatch(c.you, opp, 'cup');
    game.history = ['cup'];
  }
  function onCupMatchEnd() {
    const hs = game.home.score, as = game.away.score;
    const youId = game.home.teamId, oppId = game.away.teamId;
    if (hs === as) { startShootout(youId, oppId); return; }
    finishCupMatch(hs > as ? youId : oppId);
  }
  function resolveCupC(c, yourWinnerId, yourScore) {
    const teams = c.rounds[c.round], n = teams.length;
    const yi = teams.indexOf(c.you), yourPair = yi >= 0 ? (yi >> 1) : -1;
    const winners = [], scoreRow = [];
    for (let i = 0; i < n/2; i++) {
      if (i === yourPair) { winners.push(yourWinnerId); scoreRow.push(yourScore || [game.home.score, game.away.score]); }
      else { const r = simWinner(teams[2*i], teams[2*i+1]); winners.push(r.winner); scoreRow.push(r.score); }
    }
    c.scores[c.round] = scoreRow;
    if (yourPair >= 0 && yourWinnerId !== c.you) c.alive = false;
    if (winners.length === 1) c.champion = winners[0];
    else { c.rounds.push(winners); c.scores.push(new Array(winners.length/2).fill(null)); c.round++; }
  }
  function resolveCup(w) { resolveCupC(game.cup, w); }
  function autoCompleteCupC(c) {
    let guard = 0;
    while (!c.champion && guard++ < 8) {
      const teams = c.rounds[c.round], winners = [], scoreRow = [];
      for (let i = 0; i < teams.length/2; i++) { const r = simWinner(teams[2*i], teams[2*i+1]); winners.push(r.winner); scoreRow.push(r.score); }
      c.scores[c.round] = scoreRow;
      if (winners.length === 1) c.champion = winners[0];
      else { c.rounds.push(winners); c.scores.push(new Array(winners.length/2).fill(null)); c.round++; }
    }
  }
  function autoCompleteCup() { autoCompleteCupC(game.cup); }
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

  function cupBracketHTML(c) {
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
    return html;
  }
  function renderCup(status) {
    const c = game.cup; if (!c) return;
    $('cup-round').textContent = c.champion ? 'Complete' : roundName(c.rounds[c.round].length);
    $('cup-bracket').innerHTML = cupBracketHTML(c);
    if (status != null) $('cup-status').textContent = status;
    const cp = $('cup-play'), cw = $('cup-watch');
    const done = c.champion || !c.alive;
    if (done) cp.classList.add('hidden');
    else { cp.classList.remove('hidden'); cp.textContent = `Play Your Match · ${teamById(c.you).code} v ${teamById(cupOpponent()).code}`; }
    if (cw) cw.classList.toggle('hidden', done);
  }

  // ============================================================
  // WORLD CUP — 2 groups of 4 → group stage → semis → final
  // ============================================================
  function startNewWorldCupFlow() {
    game.ts.mode = 'worldcup'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startWorldCup(youId) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x3c0ffee1;
    const others = shuffle(TEAMS.map(t => t.id).filter(id => id !== youId));
    const groups = [shuffle([youId, others[0], others[1], others[2]]), shuffle([others[3], others[4], others[5], others[6]])];
    const fixtures = groups.map(g => roundRobin(g));                         // each group: 3 matchdays of 2 matches
    const results = fixtures.map(f => f.map(rd => rd.map(() => null)));
    game.worldcup = { you: youId, groups, fixtures, results, round: 0, stage: 'group', cup: null, champion: null, tab: 'groups' };
    game.ts.you = youId; saveStore();
    navigateTo('worldcup', { addToHistory: false }); game.history = ['title'];
    renderWorldCup('Group stage — the top 2 of each group reach the semi-finals.');
  }
  function wcMyGroup() { const w = game.worldcup; return w.groups[0].includes(w.you) ? 0 : 1; }
  function wcMyFixture() {
    const w = game.worldcup, gi = wcMyGroup(), rd = w.fixtures[gi][w.round];
    for (let i = 0; i < rd.length; i++) if (rd[i][0] === w.you || rd[i][1] === w.you) return { gi, idx: i, pair: rd[i] };
    return null;
  }
  function worldcupPlay() {
    const w = game.worldcup; if (!w || w.stage !== 'group') return;
    const f = wcMyFixture(); if (!f || w.results[f.gi][w.round][f.idx]) return;
    const opp = f.pair[0] === w.you ? f.pair[1] : f.pair[0];
    startMatch(w.you, opp, 'worldcup'); game.history = ['worldcup'];
    startRoundTicker(w.fixtures[f.gi][w.round], f.idx);
  }
  function onWorldCupMatchEnd() {
    const w = game.worldcup, f = wcMyFixture(), ys = game.home.score, os = game.away.score;
    w.results[f.gi][w.round][f.idx] = f.pair[0] === w.you ? [ys, os] : [os, ys];
    const fin = game.ticker && game.ticker.finals;
    [0, 1].forEach(gi => {                                                   // sim the rest of this matchday in both groups
      const rd = w.fixtures[gi][w.round];
      for (let i = 0; i < rd.length; i++) {
        if (w.results[gi][w.round][i] || (gi === f.gi && i === f.idx)) continue;
        w.results[gi][w.round][i] = (gi === f.gi && fin && fin[i]) || simMatch(rd[i][0], rd[i][1]).score;
      }
    });
    game.ticker = null;
    let msg;
    if (w.round >= w.fixtures[0].length - 1) { startWorldCupKnockout(); msg = w._koMsg; }
    else { w.round++; msg = (ys > os ? 'Win! ' : ys === os ? 'Draw. ' : 'Lost. ') + `Group matchday ${w.round + 1}.`; }
    saveStore();
    navigateTo('worldcup', { addToHistory: false }); game.history = ['title'];
    renderWorldCup(msg + (game.motm ? '  ' + motmLine() : ''));
  }
  function startWorldCupKnockout() {
    const w = game.worldcup;
    const tA = computeTable({ teams: w.groups[0], fixtures: w.fixtures[0], results: w.results[0] });
    const tB = computeTable({ teams: w.groups[1], fixtures: w.fixtures[1], results: w.results[1] });
    const A1 = tA[0].id, A2 = tA[1].id, B1 = tB[0].id, B2 = tB[1].id;
    w.cup = { you: w.you, rounds: [[A1, B2, B1, A2]], scores: [new Array(2).fill(null)], round: 0, alive: true, champion: null };  // SF: A1vB2, B1vA2
    w.stage = 'knockout'; w.tab = 'bracket';
    if (![A1, A2, B1, B2].includes(w.you)) {                                  // you didn't qualify → sim it out
      w.cup.alive = false; autoCompleteCupC(w.cup); w.champion = w.cup.champion; w.stage = 'done';
      w._koMsg = `Group stage over — you didn't qualify. ${teamById(w.champion).code} lifted the trophy.`;
    } else { w._koMsg = 'Top of the group business done — through to the SEMI-FINALS! 🌍'; }
  }
  function worldcupKOPlay() {
    const w = game.worldcup, c = w && w.cup; if (!c || !c.alive || c.champion) return;
    const opp = cupOpponentC(c); if (!opp) return;
    startMatch(w.you, opp, 'worldcupKO'); game.history = ['worldcup'];
  }
  function onWorldCupKOMatchEnd() {
    const w = game.worldcup, hs = game.home.score, as = game.away.score, youId = game.home.teamId, oppId = game.away.teamId;
    if (hs === as) { startShootout(youId, oppId, 'worldcupKO'); return; }
    finishWorldCupKO(hs > as ? youId : oppId);
  }
  function finishWorldCupKO(winnerId) {
    const w = game.worldcup, c = w.cup, youWon = winnerId === c.you;
    resolveCupC(c, winnerId);
    if (!c.alive && !c.champion) autoCompleteCupC(c);
    if (c.champion) { w.champion = c.champion; w.stage = 'done'; }
    saveStore();
    let msg;
    if (c.champion === c.you) msg = '🏆 🌍 WORLD CUP CHAMPIONS! You did it!';
    else if (c.champion) msg = `${teamById(c.champion).code} are World Cup winners.`;
    else if (!c.alive) msg = 'Knocked out of the World Cup.';
    else msg = youWon ? `Into the ${roundName(c.rounds[c.round].length)}!` : '';
    navigateTo('worldcup', { addToHistory: false }); game.history = ['title'];
    w.tab = 'bracket'; renderWorldCup(msg);
  }
  function wcGroupTableHTML(so, youId) {
    const table = computeTable(so);
    let h = `<div class="lg-row lg-head"><span class="lg-pos">#</span><span class="lg-team">Team</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span class="lg-pts">Pts</span></div>`;
    table.forEach((t, i) => {
      const you = t.id === youId ? ' you-row' : '', qual = i < 2 ? ' wc-qual' : '';
      h += `<div class="lg-row${you}${qual}"><span class="lg-pos">${i+1}</span><span class="lg-team"><span class="ct-dot" style="background:${teamById(t.id).col}"></span>${teamById(t.id).code}</span><span>${t.P}</span><span>${t.W}</span><span>${t.D}</span><span>${t.L}</span><span>${t.GD>0?'+':''}${t.GD}</span><span class="lg-pts">${t.Pts}</span></div>`;
    });
    return h;
  }
  function renderWorldCup(status) {
    const w = game.worldcup; if (!w) return;
    w.tab = w.tab || 'groups';
    $('wc-stage').textContent = w.stage === 'group' ? `Group stage · MD ${w.round+1}/3` : w.stage === 'done' ? 'Complete' : 'Knockouts';
    ['groups','bracket'].forEach(t => { const el = document.querySelector(`[data-action="worldcup-tab-${t}"]`); if (el) el.classList.toggle('on', t === w.tab); });
    const host = $('wc-content'), gi = wcMyGroup();
    if (w.tab === 'bracket') host.innerHTML = w.cup ? `<div class="cup-bracket">${cupBracketHTML(w.cup)}</div>` : `<p class="cr-empty">The knockout bracket is drawn once the group stage ends.</p>`;
    else host.innerHTML = [0,1].map(gx => {
      const so = { teams: w.groups[gx], fixtures: w.fixtures[gx], results: w.results[gx] };
      return `<div class="wc-group-head">Group ${gx===0?'A':'B'}${gx===gi?' · your group':''}</div><div class="league-table wc-group">${wcGroupTableHTML(so, w.you)}</div>`;
    }).join('');
    if (status != null) $('wc-status').textContent = status;
    const pl = $('worldcup-play'), wt = $('worldcup-watch');
    if (w.stage === 'done') { pl.classList.add('hidden'); if (wt) wt.classList.add('hidden'); return; }
    if (w.stage === 'group') {
      const f = wcMyFixture(), opp = f ? (f.pair[0] === w.you ? f.pair[1] : f.pair[0]) : null;
      pl.classList.remove('hidden'); pl.textContent = opp ? `Play · ${teamById(w.you).code} v ${teamById(opp).code}` : 'Play Match';
      if (wt) wt.classList.remove('hidden');
    } else {
      const c = w.cup, on = c && c.alive && !c.champion;
      pl.classList.toggle('hidden', !on);
      if (on) pl.textContent = `Play · ${roundName(c.rounds[c.round].length)} v ${teamById(cupOpponentC(c)).code}`;
      if (wt) wt.classList.toggle('hidden', !on);
    }
  }

  // ----- penalty shootout -----
  const PEN_ZONES = 3;
  function startShootout(youId, oppId, ctx) {
    // ctx: true/'standalone' = menu shootout, 'leagueCup'/'careerCup' = season cup tie, else the standalone Cup
    const c2 = (ctx === true || ctx === 'standalone') ? 'standalone' : (ctx === 'leagueCup' || ctx === 'careerCup' || ctx === 'worldcupKO') ? ctx : 'cup';
    game.penalty = { you: youId, opp: oppId, hs: 0, as: 0, hk: 0, ak: 0, turn: 'home', phase: 'aim', aim: 1, result: null, winner: null, histH: [], histA: [], _standalone: c2 === 'standalone', _ctx: c2 };
    navigateTo('shootout', { addToHistory: false });
    game.guardUntil = performance.now() + 220;   // swallow a stray in-flight tap so it doesn't auto-advance the aim
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
    const ctx = c._ctx || (c._standalone ? 'standalone' : 'cup');
    if (ctx === 'standalone') { if (game._penFast) navigateTo('title'); else setTimeout(() => navigateTo('title'), 1900); return; }   // menu shootout → back to title
    const winnerId = side === 'home' ? c.you : c.opp;
    let fn;
    if (ctx === 'leagueCup') fn = () => finishSeasonCupMatch(game.league.cup, winnerId, true);
    else if (ctx === 'careerCup') fn = () => finishSeasonCupMatch(game.career.cur.cup, winnerId, false);
    else if (ctx === 'worldcupKO') fn = () => finishWorldCupKO(winnerId);
    else fn = () => finishCupMatch(winnerId);
    if (game._penFast) fn(); else setTimeout(fn, 1700);
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
  // SET PIECES — free kicks & corners as quick aim-and-tap mini-games.
  // Only YOUR attacking set pieces become a mini-game; everything else
  // auto-restarts so the flow of play isn't broken.
  // ============================================================
  function canSetPiece(side) {
    return side === 'home' && game.settings.setPieces && !game._allAI && !game.watching && game.matchMode !== 'tutorial';
  }
  function isShootingFK(x, y) {            // close & central to the goal HOME currently attacks
    const up = atkUp('home');
    return (up ? y < 30 : y > CFG.PL - 30) && Math.abs(x - CFG.PW/2) < 24;
  }
  function triggerSetPiece(type, a, b) {
    const taker = game.home.players.filter(p => !p.isGK).slice().sort((u, v) => (v.stam || 1) - (u.stam || 1))[0] || game.home.players[0];
    game.sp = { type, taker: taker.id, phase: 'aim', aim: (type === 'fk' ? 2 : 1), power: 0, powerDir: 1, result: null, lr: (type === 'corner' ? a : 'L') };
    navigateTo('setpiece', { addToHistory: false });
    game.guardUntil = performance.now() + 220;   // swallow a stray in-flight tap so it doesn't skip the aim phase
    SFX.whistle();
    drawSetPiece(); spInstr();
  }
  let _spRaf = 0;
  function startSpLoop() { if (!_spRaf) _spRaf = requestAnimationFrame(spLoop); }
  function stopSpLoop() { if (_spRaf) cancelAnimationFrame(_spRaf); _spRaf = 0; }
  function spLoop() {
    _spRaf = 0;
    const c = game.sp;
    if (!c || game.screen !== 'setpiece') return;
    if (c.phase === 'power' || c.phase === 'timing') {
      c.power += c.powerDir * 0.024;
      if (c.power >= 1) { c.power = 1; c.powerDir = -1; } else if (c.power <= 0) { c.power = 0; c.powerDir = 1; }
      drawSetPiece();
      _spRaf = requestAnimationFrame(spLoop);
    }
  }
  function spInput(key) {
    const c = game.sp; if (!c) return;
    if (c.phase === 'aim') {
      const maxAim = c.type === 'fk' ? 4 : 2;
      if (key === 'ArrowLeft') c.aim = Math.max(0, c.aim - 1);
      else if (key === 'ArrowRight') c.aim = Math.min(maxAim, c.aim + 1);
      else if (key === 'Enter') { c.phase = (c.type === 'fk') ? 'power' : 'timing'; c.power = 0; c.powerDir = 1; startSpLoop(); spInstr(); return; }
      drawSetPiece(); spInstr();
    } else if (c.phase === 'power' || c.phase === 'timing') {
      if (key === 'Enter') { stopSpLoop(); spCommit(); }
    }
  }
  function spCommit() {
    const c = game.sp; if (!c) return;
    SFX.kick();
    const att = teamObj('home').def.r.ATT / 100;
    if (c.type === 'fk') {
      const aimThird = c.aim <= 1 ? 0 : c.aim === 2 ? 1 : 2;     // map 5 aim spots to keeper thirds
      const keeperZone = aiKeeperDive();
      const acc = clamp(1 - Math.abs(c.power - 0.72) * 2.4, 0, 1) * (0.65 + att * 0.5);
      let outcome;
      if (c.aim === 2 && c.power < 0.85) outcome = 'WALL';        // central low → blocked
      else if (c.power > 0.94) outcome = 'OVER';
      else if (c.power < 0.38) outcome = 'SAVED';
      else if (aimThird === keeperZone) outcome = (srand() < acc * 0.4) ? 'GOAL' : 'SAVED';
      else outcome = (srand() < acc) ? 'GOAL' : (srand() < 0.5 ? 'WIDE' : 'SAVED');
      c.result = { outcome, scored: outcome === 'GOAL', keeperZone };
    } else {
      const def = teamObj('away').def.r.DEF / 100;
      const cleared = srand() < clamp(0.32 + (def - 0.7) * 0.5 - (att - 0.7) * 0.4, 0.12, 0.58);
      const headAcc = clamp(1 - Math.abs(c.power - 0.70) * 2.4, 0, 1) * (0.7 + att * 0.4);
      let outcome;
      if (cleared) outcome = 'CLEARED';
      else if (headAcc < 0.3) outcome = 'OVER';
      else outcome = (srand() < headAcc * 0.85) ? 'GOAL' : 'SAVED';
      c.result = { outcome, scored: outcome === 'GOAL' };
    }
    c.phase = 'result';
    if (c.result.scored) SFX.cheer(); else SFX.save();
    drawSetPiece(); spInstr();
    setTimeout(() => resolveSetPiece(c.result.scored, c.taker), 1300);
  }
  function resolveSetPiece(scored, takerId) {
    game.sp = null; stopSpLoop();
    navigateTo('match', { addToHistory: false });
    if (scored) {
      game.lastTouch = 'home'; game.lastKicker = null; game.lastTouchPlayer = takerId; game._lastWasShot = false;
      const b = game.ball; b.owner = null; b.x = CFG.PW/2; b.y = 1; b.z = 0; b.vx = 0; b.vy = 0; b.trail.length = 0;
      scoreGoal('home');
    } else {
      goalKick('away');     // missed / saved / cleared → opponent restarts, play resumes
    }
  }
  let _spCtx = null;
  function spMeter(x, val, sweet) {
    const mx = 130, mw = 340, my = 478, mh = 26;
    x.fillStyle = 'rgba(10,19,14,0.92)'; x.fillRect(mx, my, mw, mh);
    x.strokeStyle = 'rgba(120,255,190,0.4)'; x.lineWidth = 1.5; x.strokeRect(mx, my, mw, mh);
    x.fillStyle = 'rgba(62,240,143,0.4)'; x.fillRect(mx + (sweet - 0.12) * mw, my, 0.24 * mw, mh);   // sweet zone
    x.fillStyle = '#ffd23f'; x.fillRect(mx + clamp(val, 0, 1) * mw - 3, my - 5, 6, mh + 10);          // marker
    x.fillStyle = '#eafcf1'; x.font = '700 14px system-ui, sans-serif'; x.textAlign = 'center';
    x.fillText('pinch in the green', 300, my - 12);
  }
  function drawSetPiece() {
    const cnv = $('sp-canvas'); if (!cnv) return;
    const x = _spCtx || (_spCtx = cnv.getContext('2d'));
    const c = game.sp;
    x.clearRect(0, 0, 600, 600);
    const gx0 = 150, gx1 = 450, gtop = 116, gbot = 246;
    // net + posts + ground
    x.strokeStyle = 'rgba(200,235,255,0.22)'; x.lineWidth = 1;
    for (let i = 0; i <= 12; i++) { const xx = lerp(gx0, gx1, i/12); x.beginPath(); x.moveTo(xx, gtop); x.lineTo(xx, gbot); x.stroke(); }
    for (let j = 0; j <= 6; j++) { const yy = lerp(gtop, gbot, j/6); x.beginPath(); x.moveTo(gx0, yy); x.lineTo(gx1, yy); x.stroke(); }
    x.strokeStyle = '#fff'; x.lineWidth = 4; x.shadowColor = 'rgba(150,230,255,0.8)'; x.shadowBlur = 8;
    x.beginPath(); x.moveTo(gx0, gbot); x.lineTo(gx0, gtop); x.lineTo(gx1, gtop); x.lineTo(gx1, gbot); x.stroke(); x.shadowBlur = 0;
    x.strokeStyle = 'rgba(120,255,190,0.45)'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, gbot); x.lineTo(560, gbot); x.stroke();
    if (!c) return;
    const youCol = teamRenderCol('home'), oppCol = teamRenderCol('away'), gkCol = teamObj('away').def.gk;
    if (c.type === 'fk') {
      const zw = (gx1 - gx0) / 5, zoneX = (i) => gx0 + zw * (i + 0.5);
      if (c.phase !== 'result') {
        x.save(); x.strokeStyle = 'rgba(88,214,255,0.9)'; x.lineWidth = 2.5; x.shadowColor = '#58d6ff'; x.shadowBlur = 8;
        const rx = zoneX(c.aim);
        x.beginPath(); x.arc(rx, gtop + 24, 14, 0, 6.2832); x.stroke();
        x.beginPath(); x.moveTo(rx - 20, gtop + 24); x.lineTo(rx + 20, gtop + 24); x.moveTo(rx, gtop + 4); x.lineTo(rx, gtop + 44); x.stroke(); x.restore();
      }
      const kThird = (c.phase === 'result') ? c.result.keeperZone : 1;
      penFig(x, [gx0 + (gx1 - gx0) * 0.22, 300, gx1 - (gx1 - gx0) * 0.22][kThird], gbot - 4, gkCol, true);
      for (let i = -1; i <= 1; i++) penFig(x, 300 + i * 30, gbot + 118, '#cfd8e3', false);   // wall
      let bx = 300, by = gbot + 208;
      if (c.phase === 'result') {
        const o = c.result.outcome;
        bx = o === 'WALL' ? 300 : o === 'WIDE' ? (c.aim < 2 ? gx0 - 30 : gx1 + 30) : zoneX(c.aim);
        by = o === 'OVER' ? gtop - 22 : o === 'WALL' ? gbot + 95 : c.result.scored ? gbot - 30 : gbot - 6;
      } else penFig(x, 300, gbot + 244, youCol, false);   // taker
      x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, 9, 0, 6.2832); x.fill();
      x.fillStyle = 'rgba(20,30,24,0.9)'; x.beginPath(); x.arc(bx, by, 3, 0, 6.2832); x.fill();
      if (c.phase === 'power') spMeter(x, c.power, 0.72);
    } else {
      const tx = [gx0 + 42, 300, gx1 - 42];
      if (c.phase !== 'result') { x.save(); x.strokeStyle = 'rgba(88,214,255,0.9)'; x.lineWidth = 2.5; x.shadowColor = '#58d6ff'; x.shadowBlur = 8; x.beginPath(); x.arc(tx[c.aim], gbot + 30, 16, 0, 6.2832); x.stroke(); x.restore(); }
      penFig(x, 300, gbot - 4, gkCol, true);
      penFig(x, tx[0] + 12, gbot + 38, youCol, false); penFig(x, tx[2] - 12, gbot + 42, youCol, false);
      penFig(x, 300, gbot + 28, oppCol, false); penFig(x, tx[1] + 26, gbot + 46, oppCol, false);
      let bx = c.lr === 'L' ? 70 : 530, by = gtop - 28;
      if (c.phase === 'result') { const o = c.result.outcome; bx = o === 'CLEARED' ? 300 : tx[c.aim]; by = o === 'OVER' ? gtop - 22 : o === 'CLEARED' ? gbot + 72 : c.result.scored ? gbot - 24 : gbot - 6; }
      x.fillStyle = '#fff'; x.beginPath(); x.arc(bx, by, 8, 0, 6.2832); x.fill();
      if (c.phase === 'timing') spMeter(x, c.power, 0.70);
    }
    if (c.phase === 'result') {
      x.fillStyle = c.result.scored ? '#3ef08f' : '#ff5f6e'; x.textAlign = 'center'; x.font = '800 42px system-ui, sans-serif';
      x.fillText(c.result.scored ? 'GOAL!' : c.result.outcome, 300, 360);
    }
  }
  function spInstr() {
    const c = game.sp; if (!c) return;
    const top = $('sp-top'); if (top) top.textContent = (c.type === 'fk' ? 'Free Kick' : 'Corner') + ' · ' + teamObj('home').def.code;
    let t;
    if (c.phase === 'aim') t = c.type === 'fk' ? 'Swipe ← → to aim · pinch to set power' : 'Swipe ← → to pick the cross · pinch to deliver';
    else if (c.phase === 'power') t = 'Pinch when the bar hits the green';
    else if (c.phase === 'timing') t = 'Pinch to time your header — hit the green';
    else t = c.result ? (c.result.scored ? 'GOAL!' : c.result.outcome) : '';
    const el = $('sp-instr'); if (el) { el.textContent = t; el.classList.add('show'); }
    const ch = $('sp-chip-tx'); if (ch) ch.textContent = c.phase === 'aim' ? (c.type === 'fk' ? 'AIM' : 'CROSS') : (c.type === 'corner' && c.phase === 'timing' ? 'HEAD' : 'SHOOT');
  }

  // ============================================================
  // LEAGUE — round-robin season (8 teams, 7 matchdays)
  // ============================================================
  function roundRobin(ids) {
    const arr = ids.slice(), n = arr.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n/2; i++) pairs.push([arr[i], arr[n-1-i]]);
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());   // rotate, keep arr[0] fixed
    }
    return rounds;
  }
  // home-and-away: each pair meets twice — the second leg swaps home/away (pairs are [home, away])
  function doubleRoundRobin(ids) {
    const first = roundRobin(ids);
    const second = first.map(rd => rd.map(pair => [pair[1], pair[0]]));
    return first.concat(second);
  }
  // ----- board expectations + form (manager depth, shared by League + Career) -----
  // a club's pre-season target, set by where its strength ranks in the field
  function seasonObjective(youId, teamIds) {
    const ranked = teamIds.slice().sort((a, b) => strengthOf(b) - strengthOf(a));
    const r = ranked.indexOf(youId), N = teamIds.length;
    if (r === 0)      return { kind:'win',      label:'Win the league',            targetPos:1 };
    if (r <= 2)       return { kind:'top3',     label:'Finish in the top 3',       targetPos:3 };
    if (r < N/2)      return { kind:'tophalf',  label:'Finish in the top half',    targetPos:Math.floor(N/2) };
    if (r >= N-2)     return { kind:'survive',  label:'Stay out of the bottom two', targetPos:N-2 };
    return              { kind:'midtable', label:'Reach mid-table or better', targetPos:Math.ceil(N*0.55) };
  }
  // grade a finishing position against the objective → tier: exceeded | met | missed | failed
  function objectiveVerdict(obj, pos, N) {
    if (!obj) return { met:true, tier:'met' };
    const delta = obj.targetPos - pos;                 // > 0 = better than the target
    if (pos === 1 && obj.kind !== 'win') return { met:true, tier:'exceeded' };
    if (delta >= 2) return { met:true, tier:'exceeded' };
    if (delta >= 0) return { met:true, tier:'met' };
    if (delta === -1) return { met:false, tier:'missed' };
    if (delta === -2 && pos < N) return { met:false, tier:'missed' };
    return { met:false, tier:'failed' };               // 3+ short, or dead last
  }
  const VERDICT_TEXT = { exceeded:'Expectations smashed!', met:'Objective met.', missed:'Fell just short.', failed:'A season to forget.' };
  // your last-N league results as 'W'/'D'/'L', oldest → newest
  function seasonForm(fixtures, results, youId, lastN) {
    const out = [];
    for (let r = 0; r < fixtures.length; r++) {
      const rd = fixtures[r];
      for (let i = 0; i < rd.length; i++) {
        if (rd[i][0] !== youId && rd[i][1] !== youId) continue;
        const sc = results[r] && results[r][i]; if (!sc) continue;
        const meHome = rd[i][0] === youId, mine = meHome ? sc[0] : sc[1], theirs = meHome ? sc[1] : sc[0];
        out.push(mine > theirs ? 'W' : mine < theirs ? 'L' : 'D');
      }
    }
    return lastN ? out.slice(-lastN) : out;
  }
  function formHTML(form) {
    if (!form.length) return '<span class="form-chip form-none">—</span>';
    return form.map(r => `<span class="form-chip form-${r}">${r}</span>`).join('');
  }
  // a season's full schedule for YOUR club (matchday list with H/A + result)
  function fixturesHTML(fixtures, results, youId, curRound) {
    let h = '';
    for (let r = 0; r < fixtures.length; r++) {
      const rd = fixtures[r];
      let f = -1; for (let i = 0; i < rd.length; i++) if (rd[i][0] === youId || rd[i][1] === youId) { f = i; break; }
      if (f < 0) continue;
      const meHome = rd[f][0] === youId, oppId = meHome ? rd[f][1] : rd[f][0];
      const sc = results[r] && results[r][f];
      const next = (r === curRound) ? ' fx-next' : '';
      let res = '<span class="fx-res fx-up">–</span>';
      if (sc) {
        const mine = meHome ? sc[0] : sc[1], theirs = meHome ? sc[1] : sc[0];
        const o = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
        res = `<span class="fx-res form-${o}">${mine}–${theirs}</span>`;
      }
      h += `<div class="fx-row${next}"><span class="fx-md">MD${r+1}</span><span class="fx-ha">${meHome?'H':'A'}</span>`
        + `<span class="fx-opp"><span class="ct-dot" style="background:${teamById(oppId).col}"></span>${teamById(oppId).code}</span>${res}</div>`;
    }
    return h;
  }
  // season scorer maps: 'teamId#num' -> goals. Used for the Golden Boot + your top scorer.
  function topScorers(map, n) {
    const arr = [];
    for (const key in map) { const p = key.split('#'); arr.push({ teamId:p[0], num:+p[1], goals:map[key] }); }
    arr.sort((a, b) => b.goals - a.goals || (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : a.num - b.num));
    return n ? arr.slice(0, n) : arr;
  }
  function startNewLeagueFlow() {
    game.ts.mode = 'league'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startLeague(youId) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x2545f491;
    const ids = shuffle(TEAMS.map(t => t.id));
    const fixtures = doubleRoundRobin(ids);                       // home & away — face every club twice
    const rosters = {}; TEAMS.forEach(t => rosters[t.id] = genRoster(t.id));
    game.league = { you: youId, teams: ids, fixtures, results: fixtures.map(rd => rd.map(() => null)), round: 0, done: false, champion: null,
      scorers: {}, rosters, cup: buildSeasonCup(ids, youId), objective: seasonObjective(youId, ids), tab: 'table', outcome: null };
    game.ts.you = youId; saveStore();
    navigateTo('league', { addToHistory: false }); game.history = ['title'];
    renderLeague(`Matchday 1 — the board want you to ${game.league.objective.label.toLowerCase()}.`);
  }
  function leagueFixtureForYou() {
    const lg = game.league, rd = lg.fixtures[lg.round];
    for (let i = 0; i < rd.length; i++) if (rd[i][0] === lg.you || rd[i][1] === lg.you) return { idx: i, pair: rd[i] };
    return null;
  }
  function leaguePlay() {
    const lg = game.league; if (!lg || lg.done) return;
    const f = leagueFixtureForYou(); if (!f || lg.results[lg.round][f.idx]) return;
    const opp = f.pair[0] === lg.you ? f.pair[1] : f.pair[0];
    startMatch(lg.you, opp, 'league');
    game.history = ['league'];
    startRoundTicker(lg.fixtures[lg.round], f.idx);
  }
  function onLeagueMatchEnd() {
    const lg = game.league, f = leagueFixtureForYou();
    const youScore = game.home.score, oppScore = game.away.score;
    lg.results[lg.round][f.idx] = f.pair[0] === lg.you ? [youScore, oppScore] : [oppScore, youScore];
    const rd = lg.fixtures[lg.round], fin = game.ticker && game.ticker.finals;
    for (let i = 0; i < rd.length; i++) {
      if (i === f.idx || lg.results[lg.round][i]) continue;
      const sc = (fin && fin[i]) || simMatch(rd[i][0], rd[i][1]).score;   // use the scores the ticker showed
      lg.results[lg.round][i] = sc;
      distributeGoals(rd[i][0], sc[0], lg.scorers); distributeGoals(rd[i][1], sc[1], lg.scorers);
    }
    game.ticker = null;
    let msg;
    if (lg.round >= lg.fixtures.length - 1) {
      finishLeagueSeason(); msg = lg.outcome.msg;
    } else {
      lg.round++;
      const w = youScore > oppScore, d = youScore === oppScore;
      msg = (w ? 'Win! ' : d ? 'Draw. ' : 'Lost. ') + `On to Matchday ${lg.round + 1}.`;
    }
    saveStore();
    navigateTo('league', { addToHistory: false }); game.history = ['title'];
    renderLeague(msg + (game.motm ? '  ' + motmLine() : ''));
  }
  function finishLeagueSeason() {
    const lg = game.league; lg.done = true;
    const table = leagueTable(); lg.champion = table[0].id;
    if (lg.cup && lg.cup.alive && !lg.cup.champion) autoCompleteCupC(lg.cup);   // wrap up any unplayed cup ties
    const pos = table.findIndex(t => t.id === lg.you) + 1;
    const verdict = objectiveVerdict(lg.objective, pos, lg.teams.length);
    const boot = topScorers(lg.scorers, 1)[0] || null;
    lg.outcome = { pos, verdict, champion: lg.champion, cupChampion: lg.cup ? lg.cup.champion : null, boot };
    let msg = lg.champion === lg.you ? '🏆 Champions — you won the League!' : `Season over · ${teamById(lg.champion).code} took the title.`;
    if (lg.cup && lg.cup.champion === lg.you) msg += (lg.champion === lg.you ? '  And the Cup — a DOUBLE! 🏆🏆' : '  But you lifted the Cup! 🏆');
    lg.outcome.msg = `${msg}  You finished ${ordinal(pos)} — ${VERDICT_TEXT[verdict.tier]}`;
  }
  // ----- parallel season cup (League "double" + Career cup) -----
  function leagueCupPlay() {
    const lg = game.league, c = lg && lg.cup; if (!c || !c.alive || c.champion) return;
    const opp = cupOpponentC(c); if (!opp) return;
    startMatch(lg.you, opp, 'leagueCup'); game.history = ['league'];
  }
  function careerCupPlay() {
    const cr = game.career, c = cr && cr.cur && cr.cur.cup; if (!c || !c.alive || c.champion) return;
    const opp = cupOpponentC(c); if (!opp) return;
    startMatch(cr.team, opp, 'careerCup'); game.history = ['career'];
  }
  function onSeasonCupMatchEnd() {
    const isLeague = game.matchMode === 'leagueCup';
    const c = isLeague ? game.league.cup : game.career.cur.cup;
    const hs = game.home.score, as = game.away.score;
    const youId = game.home.teamId, oppId = game.away.teamId;
    if (hs === as) { startShootout(youId, oppId, game.matchMode); return; }   // level tie → shootout
    finishSeasonCupMatch(c, hs > as ? youId : oppId, isLeague);
  }
  function finishSeasonCupMatch(c, winnerId, isLeague) {
    const youWon = winnerId === c.you;
    resolveCupC(c, winnerId);
    if (!c.alive && !c.champion) autoCompleteCupC(c);
    if (!isLeague && c.champion === c.you && game.career) {     // a cup win is a trophy in Career
      if (!game.career.trophies.some(t => t.season === game.career.season && t.title === 'Cup'))
        game.career.trophies.push({ season: game.career.season, title: 'Cup' });
    }
    saveStore();
    let msg;
    if (c.champion === c.you) msg = '🏆 You won the Cup!';
    else if (c.champion) msg = `${teamById(c.champion).code} won the Cup.`;
    else if (!c.alive) msg = 'Knocked out of the Cup. The league is your focus now.';
    else msg = youWon ? `Into the ${roundName(c.rounds[c.round].length)} of the Cup!` : '';
    navigateTo(isLeague ? 'league' : 'career', { addToHistory: false }); game.history = ['title'];
    if (isLeague) { game.league.tab = 'cup'; renderLeague(msg); } else { game.career.tab = 'cup'; renderCareer(msg); }
  }
  function computeTable(lg) {
    const row = {};
    lg.teams.forEach(id => row[id] = { id, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 });
    lg.fixtures.forEach((rd, r) => rd.forEach((pair, i) => {
      const sc = lg.results[r] && lg.results[r][i]; if (!sc) return;
      const A = row[pair[0]], B = row[pair[1]], ga = sc[0], gb = sc[1];
      A.P++; B.P++; A.GF += ga; A.GA += gb; B.GF += gb; B.GA += ga;
      if (ga > gb) { A.W++; B.L++; A.Pts += 3; }
      else if (gb > ga) { B.W++; A.L++; B.Pts += 3; }
      else { A.D++; B.D++; A.Pts++; B.Pts++; }
    }));
    const arr = lg.teams.map(id => row[id]);
    arr.forEach(t => t.GD = t.GF - t.GA);
    arr.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || (x.id < y.id ? -1 : 1));
    return arr;
  }
  function leagueTable() { return computeTable(game.league); }
  function standingsHTML(seasonObj, youId, done) {
    const table = computeTable(seasonObj);
    let html = `<div class="lg-row lg-head"><span class="lg-pos">#</span><span class="lg-team">Team</span><span>P</span><span>W</span><span>D</span><span>L</span><span>GD</span><span class="lg-pts">Pts</span></div>`;
    table.forEach((t, i) => {
      const you = t.id === youId ? ' you-row' : '';
      const champ = done && i === 0 ? ' lg-champ' : '';
      html += `<div class="lg-row${you}${champ}"><span class="lg-pos">${i+1}</span><span class="lg-team"><span class="ct-dot" style="background:${teamById(t.id).col};color:${teamById(t.id).col}"></span>${teamById(t.id).code}</span><span>${t.P}</span><span>${t.W}</span><span>${t.D}</span><span>${t.L}</span><span>${t.GD>0?'+':''}${t.GD}</span><span class="lg-pts">${t.Pts}</span></div>`;
    });
    return html;
  }
  function rosterName(rosters, teamId, num) { return (rosters && rosters[teamId] && rosters[teamId][num]) || ('#' + num); }
  function scorersListHTML(scorers, rosters, youId, n, head) {
    const boot = topScorers(scorers || {}, n || 8);
    if (!boot.length) return `<p class="cr-empty">No goals yet — play on to start the Golden Boot race.</p>`;
    let h = `<div class="cr-boot-head">${head || '🥇 Top scorers'}</div>`;
    boot.forEach((b, i) => {
      const you = b.teamId === youId ? ' you-row' : '';
      h += `<div class="cr-boot-row${you}"><span class="cr-rank">${i+1}</span><span class="cr-name">${rosterName(rosters, b.teamId, b.num)}</span><span class="cr-club"><span class="ct-dot" style="background:${teamById(b.teamId).col}"></span>${teamById(b.teamId).code}</span><span class="cr-goals">${b.goals}</span></div>`;
    });
    return h;
  }
  function renderLeague(status) {
    const lg = game.league; if (!lg) return;
    lg.tab = lg.tab || 'table';
    $('league-round').textContent = lg.done ? 'Season complete' : `Matchday ${lg.round + 1} / ${lg.fixtures.length}`;
    const oEl = $('league-obj'); if (oEl) oEl.innerHTML = lg.objective ? `🎯 ${lg.objective.label}` : '';
    const fEl = $('league-form'); if (fEl) fEl.innerHTML = formHTML(seasonForm(lg.fixtures, lg.results, lg.you, 5));
    ['table','fixtures','cup'].forEach(t => { const el = document.querySelector(`[data-action="league-tab-${t}"]`); if (el) el.classList.toggle('on', t === lg.tab); });
    const host = $('league-content');
    if (lg.tab === 'fixtures') host.innerHTML = `<div class="fx-list">${fixturesHTML(lg.fixtures, lg.results, lg.you, lg.round)}</div>`;
    else if (lg.tab === 'cup') host.innerHTML = lg.cup ? `<div class="cup-bracket">${cupBracketHTML(lg.cup)}</div>` : '';
    else host.innerHTML = `<div class="league-table">${standingsHTML(lg, lg.you, lg.done)}</div>` + `<div class="lg-scorers">${scorersListHTML(lg.scorers, lg.rosters, lg.you, 5)}</div>`;
    if (status != null) $('league-status').textContent = status;
    const cp = $('league-play'), lw = $('league-watch'), cpu = $('league-cup-play');
    if (lg.done) { cp.classList.add('hidden'); if (lw) lw.classList.add('hidden'); if (cpu) cpu.classList.add('hidden'); return; }
    const f = leagueFixtureForYou();
    const opp = f ? (f.pair[0] === lg.you ? f.pair[1] : f.pair[0]) : null;
    cp.classList.remove('hidden');
    cp.textContent = opp ? `Play · ${teamById(lg.you).code} v ${teamById(opp).code}` : 'Play Match';
    if (lw) lw.classList.remove('hidden');
    const cup = lg.cup, cupOn = cup && cup.alive && !cup.champion;
    if (cpu) { cpu.classList.toggle('hidden', !cupOn); if (cupOn) cpu.textContent = `🏆 ${roundName(cup.rounds[cup.round].length)} · v ${teamById(cupOpponentC(cup)).code}`; }
  }

  // ============================================================
  // TUTORIAL — guided first match (steer / pass / shoot / tackle)
  // ============================================================
  const TUT_STEPS = [
    'Swipe  ← ↑ → ↓  to steer your player. They run on their own — you just point them where to go.',
    'You have the ball. Pinch (tap) to PASS it to your teammate up ahead.',
    'Now carry it at the goal. When the chip turns to SHOOT, pinch to score!',
    'Defend! Pinch switches to your nearest player — then steer them into the opponent to win the ball back.',
    "That's everything — you're ready. Pinch to start playing.",
  ];
  function startTutorial() {
    _seed = 0x7a17c0de;
    const youId = game.ts.you || TEAMS[0].id;
    game.home = makeTeam(youId, 'home', game.settings.formation);
    game.away = makeTeam(TEAMS.find(t => t.id !== youId).id, 'away', '4-3-3');
    assignKitColors();
    game.ball = { x: CFG.PW/2, y: CFG.PL/2, z:0, vx:0, vy:0, vz:0, owner:null, shot:false, trail:[] };
    game.clockSec = 0; game.half = 1; game.phase = 'play';
    game.poss = { home:1, away:1 };
    game.stats = { shots:{home:0,away:0}, sot:{home:0,away:0}, fouls:{home:0,away:0} };
    resetMatchStats();
    game.effects = []; game.netRipple = { home:0, away:0 };
    game.matchMode = 'tutorial';
    game.tutorial = { step:0, stepT:0, steerCount:0, passiveOpp:true, passed:false, shot:false };
    setupPitchGeom(); drawStaticPitch(); paintScoreboard();
    resetPositions('home', true);
    setupTutStep(0);
    navigateTo('match', { addToHistory:false }); game.history = ['title'];
    SFX.whistle();
  }
  function placeCarrier(p, x, y) {
    const b = game.ball;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.heading = -Math.PI/2; p._velAng = -Math.PI/2;
    b.x = x; b.y = y - 1; b.z = 0; b.vx = 0; b.vy = 0; b.owner = p.id; b.shot = false;
    game.lastTouch = 'home'; game.lastTouchPlayer = p.id;
  }
  function setupTutStep(n) {
    const tut = game.tutorial, b = game.ball;
    tut.step = n; tut.stepT = 0; tut.steerCount = 0; tut.passed = false; tut.shot = false; tut.dribbleOppId = null;
    game.steer.x = 0; game.steer.y = 0; game.lastSteerT = -10;
    const mid = game.home.players[6], fwd = game.home.players[9];
    if (n === 0) { tut.passiveOpp = true; placeCarrier(mid, CFG.PW/2, CFG.PL*0.62); setActive(mid.id, true); }
    else if (n === 1) {
      tut.passiveOpp = true; placeCarrier(mid, CFG.PW/2, CFG.PL*0.58);
      fwd.x = CFG.PW*0.30; fwd.y = CFG.PL*0.34; fwd.vx = 0; fwd.vy = 0; setActive(mid.id, true);
    }
    else if (n === 2) { tut.passiveOpp = true; placeCarrier(fwd, CFG.PW/2, CFG.PL*0.22); setActive(fwd.id, true); }
    else if (n === 3) {
      tut.passiveOpp = false;
      const opp = game.away.players[6];
      opp.x = CFG.PW/2; opp.y = CFG.PL*0.50; opp.vx = 0; opp.vy = 0;
      b.x = opp.x; b.y = opp.y + 0.8; b.z = 0; b.vx = 0; b.vy = 0; b.owner = opp.id; b.shot = false;
      game.lastTouch = 'away'; game.lastTouchPlayer = opp.id;
      const chaser = game.home.players[7]; chaser.x = CFG.PW/2; chaser.y = CFG.PL*0.62; chaser.vx = 0; chaser.vy = 0;
      setActive(chaser.id, true);
      tut.dribbleOppId = opp.id;          // this opponent just holds the ball (no passing) — a clean tackle target
    }
    else if (n === 4) { tut.passiveOpp = true; }
    const el = $('tutorial-prompt');
    el.innerHTML = `<span class="tut-step">Step ${Math.min(n+1,4)} of 4</span>${TUT_STEPS[n]}<span class="tut-skip">pause (↑↓↑↓ or Esc) to skip</span>`;
    el.classList.remove('hidden');
  }
  function tickTutorial(dt) {
    const tut = game.tutorial; if (!tut) return;
    tut.stepT += dt;
    const o = playerById(game.ball.owner);
    if (tut.step === 0) { if (tut.steerCount >= 3 && tut.stepT > 1.0) advanceTut(); }
    else if (tut.step === 1) { if (tut.passed) advanceTut(); }
    else if (tut.step === 2) { if (tut.shot) advanceTut(); }
    else if (tut.step === 3) { if (o && o.side === 'home') advanceTut(); }
  }
  function advanceTut() {
    const tut = game.tutorial; if (!tut) return;
    if (tut.step >= TUT_STEPS.length - 1) return;   // final step waits for a pinch
    SFX.whistle();
    setupTutStep(tut.step + 1);
  }
  function finishTutorial() {
    game.tutorial = null; game.matchMode = 'friendly';
    $('tutorial-prompt').classList.add('hidden');
    game.history = []; navigateTo('title', { addToHistory:false });
  }

  // ============================================================
  // CAREER — multiple seasons, trophy cabinet, Golden Boot race
  // ============================================================
  const FIRST_INITIALS = ['A','B','C','D','E','F','G','H','J','K','L','M','N','O','P','R','S','T','V','W'];
  const SURNAMES = ['Marsh','Okafor','Bianchi','Sato','Kovac','Reyes','Nilsson','Haas','Costa','Park','Vela','Lund','Mensah','Rossi','Dubois','Aguilar','Petrov','Stein','Walsh','Ferreira','Becker','Nakamura','Sorin','Lindqvist','Adeyemi','Castro','Novak','Olsen','Tan','Vega','Hassan','Berg','Cruz','Mahler','Ito','Schmidt','Hale','Roca','Diallo','Quinn'];
  function genRoster(teamId) {
    let s = 0; for (let i=0;i<teamId.length;i++) s = (s*31 + teamId.charCodeAt(i)) | 0;
    const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const sur = SURNAMES.slice();
    for (let i = sur.length-1; i > 0; i--) { const j = Math.floor(rnd()*(i+1)); const t = sur[i]; sur[i] = sur[j]; sur[j] = t; }
    const roster = {};
    for (let num = 1; num <= 16; num++) roster[num] = FIRST_INITIALS[Math.floor(rnd()*FIRST_INITIALS.length)] + '. ' + sur[num % sur.length];
    return roster;
  }
  function ordinal(n) { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }
  function scorerName(teamId, num) { const c = game.career; return (c.rosters[teamId] && c.rosters[teamId][num]) || ('#'+num); }

  function startNewCareerFlow() {
    game.ts.mode = 'career'; game.ts.step = 0;
    game.ts.idx = Math.max(0, TEAMS.findIndex(t => t.id === game.ts.you));
    navigateTo('team-select');
  }
  function startCareer(youId) {
    _seed = (Date.now() & 0x7fffffff) ^ 0x13371337;
    const rosters = {}; TEAMS.forEach(t => rosters[t.id] = genRoster(t.id));
    game.career = { team: youId, season: 1, tab: 'table', trophies: [], history: [], bootHistory: [], rosters, cur: null, seasonScorers: {},
      boosts: { ATT:0, MID:0, DEF:0, PAC:0, GK:0 }, tenure: 1, awards: [], news: null, objective: null };
    newCareerSeason();
    game.ts.you = youId; saveStore();
    navigateTo('career', { addToHistory: false }); game.history = ['title'];
    renderCareer(`Season 1 at ${teamById(youId).name} — the board want you to ${game.career.objective.label.toLowerCase()}.`);
  }
  function newCareerSeason() {
    const c = game.career;
    const ids = shuffle(TEAMS.map(t => t.id));
    const fixtures = doubleRoundRobin(ids);                       // home & away
    c.cur = { teams: ids, fixtures, results: fixtures.map(rd => rd.map(() => null)), round: 0, done: false, cup: buildSeasonCup(ids, c.team) };
    c.seasonScorers = {};
    c.objective = seasonObjective(c.team, ids);
    c.news = null;
  }
  function careerFixtureForYou() {
    const cur = game.career.cur, rd = cur.fixtures[cur.round];
    for (let i = 0; i < rd.length; i++) if (rd[i][0] === game.career.team || rd[i][1] === game.career.team) return { idx: i, pair: rd[i] };
    return null;
  }
  function careerPlay() {
    const c = game.career; if (!c || c.cur.done) return;
    const f = careerFixtureForYou(); if (!f || c.cur.results[c.cur.round][f.idx]) return;
    const opp = f.pair[0] === c.team ? f.pair[1] : f.pair[0];
    startMatch(c.team, opp, 'career');
    game.history = ['career'];
    startRoundTicker(c.cur.fixtures[c.cur.round], f.idx);
  }
  function careerAdvance() {
    const c = game.career; if (!c) return;
    if (!c.cur.done) { careerPlay(); return; }
    if (c.news) { navigateTo('career-news'); renderCareerNews(); return; }   // season finished → review/board verdict
    beginNextSeason();
  }
  function pickScorerNum() {
    const W = { 9:5, 7:3, 11:3, 10:3, 8:2, 4:1, 2:1, 3:1, 5:1, 6:1 };
    let tot = 0; for (const k in W) tot += W[k];
    let r = srand() * tot;
    for (const k in W) { r -= W[k]; if (r <= 0) return +k; }
    return 9;
  }
  function distributeGoals(teamId, n, map) {
    if (!map) return;
    for (let k = 0; k < n; k++) { const key = teamId + '#' + pickScorerNum(); map[key] = (map[key] || 0) + 1; }
  }
  function bootTable() { return topScorers(game.career.seasonScorers); }
  function onCareerMatchEnd() {
    const c = game.career, cur = c.cur, f = careerFixtureForYou();
    const ys = game.home.score, os = game.away.score;
    cur.results[cur.round][f.idx] = f.pair[0] === c.team ? [ys, os] : [os, ys];
    const rd = cur.fixtures[cur.round], fin = game.ticker && game.ticker.finals;
    for (let i = 0; i < rd.length; i++) {
      if (i === f.idx || cur.results[cur.round][i]) continue;
      const sc = (fin && fin[i]) || simMatch(rd[i][0], rd[i][1]).score;   // use the scores the ticker showed
      cur.results[cur.round][i] = sc;
      distributeGoals(rd[i][0], sc[0], c.seasonScorers); distributeGoals(rd[i][1], sc[1], c.seasonScorers);
    }
    game.ticker = null;
    if (cur.round >= cur.fixtures.length - 1) { onCareerSeasonEnd(); return; }
    cur.round++; saveStore();
    const w = ys > os, d = ys === os;
    navigateTo('career', { addToHistory: false }); game.history = ['title'];
    renderCareer((w ? 'Win! ' : d ? 'Draw. ' : 'Lost. ') + `Matchday ${cur.round + 1}.` + (game.motm ? '  ' + motmLine() : ''));
  }
  function onCareerSeasonEnd() {
    const c = game.career, N = c.cur.teams.length;
    if (c.cur.cup && c.cur.cup.alive && !c.cur.cup.champion) autoCompleteCupC(c.cur.cup);   // wrap up the cup
    const table = computeTable(c.cur);
    c.cur.done = true;
    const pos = table.findIndex(t => t.id === c.team) + 1, me = table[pos-1];
    c.history.push({ season: c.season, pos, Pts: me.Pts, W: me.W, D: me.D, L: me.L, champion: table[0].id });
    if (pos === 1 && !c.trophies.some(t => t.season === c.season && t.title === 'League')) c.trophies.push({ season: c.season, title: 'League' });
    if (c.cur.cup && c.cur.cup.champion === c.team && !c.trophies.some(t => t.season === c.season && t.title === 'Cup')) c.trophies.push({ season: c.season, title: 'Cup' });   // also bank a cup won by end-of-season auto-completion
    const boot = bootTable()[0];
    if (boot) c.bootHistory.push({ season: c.season, teamId: boot.teamId, num: boot.num, name: scorerName(boot.teamId, boot.num), goals: boot.goals });
    const verdict = objectiveVerdict(c.objective, pos, N);
    c.awards.push({ season: c.season, champion: table[0].id, cup: c.cur.cup ? c.cur.cup.champion : null,
      boot: boot ? { name: scorerName(boot.teamId, boot.num), teamId: boot.teamId, goals: boot.goals } : null,
      manager: (verdict.tier === 'exceeded' || pos === 1) ? c.team : table[0].id });
    c.news = decideCareerNews(c, pos, N, verdict);
    saveStore();
    navigateTo('career-news', { addToHistory: false }); game.history = ['title'];
    renderCareerNews();
  }
  function transferBudget(verdict) { return verdict.tier === 'exceeded' ? 4 : verdict.tier === 'met' ? 3 : verdict.tier === 'missed' ? 2 : 1; }
  function decideCareerNews(c, pos, N, verdict) {
    const obj = c.objective;
    const stronger = TEAMS.map(x => x.id).filter(id => id !== c.team && strengthOf(id) > strengthOf(c.team) + 1)
      .sort((a, b) => strengthOf(b) - strengthOf(a));
    // sacked: badly failed the brief (3+ short of target, or finished dead last)
    if (verdict.tier === 'failed') return { kind:'sacked', pos, verdict };
    // poached: smashed expectations at a smaller club — a bigger side comes calling
    if ((verdict.tier === 'exceeded' || (pos === 1 && obj.kind !== 'win')) && stronger.length) {
      return { kind:'poach', pos, verdict, suitor: stronger[0], budget: transferBudget(verdict) };
    }
    return { kind:'stay', pos, verdict, budget: transferBudget(verdict) };
  }
  function beginNextSeason() {
    const c = game.career; c.season++; c.tenure = (c.tenure || 1) + 1; newCareerSeason(); saveStore();
    navigateTo('career', { addToHistory: false }); game.history = ['title'];
    renderCareer(`Season ${c.season} — a fresh campaign. The board want you to ${c.objective.label.toLowerCase()}.`);
  }
  function careerAcceptPoach() {
    const c = game.career, suitor = c.news.suitor;
    c.team = suitor; c.boosts = { ATT:0, MID:0, DEF:0, PAC:0, GK:0 }; c.tenure = 1; c.news = null;
    game.ts.you = suitor; c.season++; newCareerSeason(); saveStore();
    navigateTo('career', { addToHistory: false }); game.history = ['title'];
    renderCareer(`A new chapter at ${teamById(suitor).name}. The board want you to ${c.objective.label.toLowerCase()}.`);
  }
  function careerDeclinePoach() {
    const c = game.career; if (!c.news) return;
    c.news.kind = 'stay'; c.news.budget = (c.news.budget || transferBudget(c.news.verdict)) + 1;   // loyalty bonus
    c.news.loyal = true; saveStore(); renderCareerNews();
  }
  function careerRehire(youId) {
    const c = game.career;
    c.team = youId; c.boosts = { ATT:0, MID:0, DEF:0, PAC:0, GK:0 }; c.tenure = 1; c.news = null;
    game.ts.you = youId; c.season++; newCareerSeason(); saveStore();
    navigateTo('career', { addToHistory: false }); game.history = ['title'];
    renderCareer(`A fresh start at ${teamById(youId).name}. Prove them wrong — ${c.objective.label.toLowerCase()}.`);
  }
  function careerRetire() { game.career = null; saveStore(); game.history = []; navigateTo('title', { addToHistory: false }); }
  function careerBuy(stat) {
    const c = game.career, n = c.news; if (!n || !n.budget || n.budget <= 0) return;
    c.boosts[stat] = (c.boosts[stat] || 0) + 1; n.budget--;
    saveStore(); renderTransfers();
  }

  function careerTableHTML() { const c = game.career; return `<div class="league-table">${standingsHTML(c.cur, c.team, c.cur.done)}</div>`; }
  function careerScorersHTML() {
    const c = game.career, boot = bootTable().slice(0, 10);
    if (!boot.length) return `<p class="cr-empty">No goals yet — play a match to start the Golden Boot race.</p>`;
    let h = `<div class="cr-boot-head">🥇 Golden Boot — Season ${c.season}</div>`;
    boot.forEach((b, i) => {
      const you = b.teamId === c.team ? ' you-row' : '';
      h += `<div class="cr-boot-row${you}"><span class="cr-rank">${i+1}</span><span class="cr-name">${scorerName(b.teamId, b.num)}</span><span class="cr-club"><span class="ct-dot" style="background:${teamById(b.teamId).col}"></span>${teamById(b.teamId).code}</span><span class="cr-goals">${b.goals}</span></div>`;
    });
    return h;
  }
  function careerHistoryHTML() {
    const c = game.career;
    const leagueT = c.trophies.filter(t => t.title === 'League').length, cupT = c.trophies.filter(t => t.title === 'Cup').length;
    let h = `<div class="cr-cabinet"><span class="cr-trophy">🏆</span><div><div class="cr-trophy-n">${leagueT} League · ${cupT} Cup</div><div class="cr-trophy-sub">${teamById(c.team).name} · ${c.tenure||1} season${(c.tenure||1)===1?'':'s'} in charge</div></div></div>`;
    const inv = ['ATT','MID','DEF','PAC','GK'].filter(k => (c.boosts && c.boosts[k])).map(k => `${k}+${c.boosts[k]}`).join('  ');
    if (inv) h += `<div class="cr-hist-head">Squad investment</div><div class="cr-invest">${inv}</div>`;
    if (!c.history.length) { h += `<p class="cr-empty">Finish a season to fill your cabinet.</p>`; return h; }
    h += `<div class="cr-hist-head">Past seasons</div>`;
    c.history.slice().reverse().forEach(s => {
      const won = s.pos === 1;
      h += `<div class="cr-hist-row"><span class="cr-hist-s">S${s.season}</span><span class="cr-hist-pos${won?' won':''}">${ordinal(s.pos)}${won?' 🏆':''}</span><span class="cr-hist-pts">${s.Pts} pts</span><span class="cr-hist-champ"><span class="ct-dot" style="background:${teamById(s.champion).col}"></span>${teamById(s.champion).code}</span></div>`;
    });
    if (c.bootHistory.length) {
      h += `<div class="cr-hist-head">Golden Boots</div>`;
      c.bootHistory.slice().reverse().forEach(b => { h += `<div class="cr-hist-row"><span class="cr-hist-s">S${b.season}</span><span class="cr-name">${b.name}</span><span class="cr-club">${teamById(b.teamId).code}</span><span class="cr-goals">${b.goals}</span></div>`; });
    }
    return h;
  }
  function renderCareer(status) {
    const c = game.career; if (!c) return;
    c.tab = c.tab || 'table';
    $('career-title').textContent = teamById(c.team).name;
    $('career-meta').textContent = c.cur.done ? `Season ${c.season} · done` : `Season ${c.season} · MD ${c.cur.round+1}/${c.cur.fixtures.length}`;
    const oEl = $('career-obj'); if (oEl) oEl.innerHTML = c.objective ? `🎯 ${c.objective.label}` : '';
    const fEl = $('career-form'); if (fEl) fEl.innerHTML = formHTML(seasonForm(c.cur.fixtures, c.cur.results, c.team, 5));
    ['table','fixtures','cup','scorers','history'].forEach(t => { const el = document.querySelector(`[data-action="career-tab-${t}"]`); if (el) el.classList.toggle('on', t === c.tab); });
    $('career-content').innerHTML =
        c.tab === 'fixtures' ? `<div class="fx-list">${fixturesHTML(c.cur.fixtures, c.cur.results, c.team, c.cur.round)}</div>`
      : c.tab === 'cup'      ? (c.cur.cup ? `<div class="cup-bracket">${cupBracketHTML(c.cur.cup)}</div>` : '')
      : c.tab === 'scorers'  ? careerScorersHTML()
      : c.tab === 'history'  ? careerHistoryHTML()
      :                        careerTableHTML();
    if (status != null) $('career-status').textContent = status;
    const cp = $('career-play'), cw = $('career-watch'), cpu = $('career-cup-play');
    if (c.cur.done) {
      cp.textContent = c.news ? 'Season Review ▸' : `Start Season ${c.season + 1}`;
      if (cw) cw.classList.add('hidden'); if (cpu) cpu.classList.add('hidden');
    } else {
      const f = careerFixtureForYou(); const opp = f ? (f.pair[0] === c.team ? f.pair[1] : f.pair[0]) : null;
      cp.textContent = opp ? `Play · ${teamById(c.team).code} v ${teamById(opp).code}` : 'Play Match';
      if (cw) cw.classList.remove('hidden');
      const cup = c.cur.cup, cupOn = cup && cup.alive && !cup.champion;
      if (cpu) { cpu.classList.toggle('hidden', !cupOn); if (cupOn) cpu.textContent = `🏆 ${roundName(cup.rounds[cup.round].length)} · v ${teamById(cupOpponentC(cup)).code}`; }
    }
  }
  function careerNewsContinue() {
    const c = game.career, n = c.news;
    if (n && n.kind === 'stay' && n.budget > 0) { navigateTo('career-transfers'); renderTransfers(); }
    else beginNextSeason();
  }
  function renderCareerNews() {
    const c = game.career, n = c.news; if (!n) { navigateTo('career'); renderCareer(); return; }
    const N = c.cur.teams.length, a = c.awards[c.awards.length - 1] || {};
    $('cn-title').textContent = `Season ${c.season} Review`;
    $('cn-verdict').innerHTML = `<div class="cn-finish">${teamById(c.team).code} finished <b>${ordinal(n.pos)}</b> of ${N}</div>`
      + `<div class="cn-obj">Objective: ${c.objective.label} — <span class="cn-${n.verdict.met?'met':'miss'}">${VERDICT_TEXT[n.verdict.tier]}</span></div>`;
    let aw = `<div class="cn-award"><span>🏆 League Champions</span><span><span class="ct-dot" style="background:${teamById(a.champion).col}"></span>${teamById(a.champion).code}</span></div>`;
    if (a.cup) aw += `<div class="cn-award"><span>🏆 Cup Winners</span><span><span class="ct-dot" style="background:${teamById(a.cup).col}"></span>${teamById(a.cup).code}</span></div>`;
    if (a.boot) aw += `<div class="cn-award"><span>🥇 Golden Boot</span><span>${a.boot.name} · ${a.boot.goals}</span></div>`;
    if (a.manager) aw += `<div class="cn-award"><span>🎖 Manager of the Season</span><span>${teamById(a.manager).code}${a.manager===c.team?' — YOU!':''}</span></div>`;
    $('cn-awards').innerHTML = aw;
    let oText, btns;
    if (n.kind === 'sacked') {
      oText = `The board have seen enough — you've been <b>sacked</b> by ${teamById(c.team).name}.`;
      btns = `<button class="ts-confirm focusable" data-action="cn-rehire">Find a new club</button>`
           + `<button class="title-btn focusable" data-action="cn-retire">Retire</button>`;
    } else if (n.kind === 'poach') {
      oText = `<b>${teamById(n.suitor).name}</b> — a bigger club — want you as their manager.`;
      btns = `<button class="ts-confirm focusable" data-action="cn-accept-poach">Join ${teamById(n.suitor).code}</button>`
           + `<button class="title-btn focusable" data-action="cn-decline-poach">Stay loyal</button>`;
    } else {
      oText = n.loyal ? `You stay loyal to ${teamById(c.team).name}, and the board reward it with extra funds.`
                      : (n.verdict.met ? `The board are delighted. Your job is safe.` : `The board keep faith — for now.`);
      btns = `<button class="ts-confirm focusable" data-action="cn-continue">${n.budget>0?`Transfer Window · ${n.budget} pts`:`Start Season ${c.season+1}`} ▸</button>`;
    }
    $('cn-offer').innerHTML = oText;
    $('cn-actions').innerHTML = btns;
    focusFirst(screens['career-news']);
  }
  function renderTransfers() {
    const c = game.career, n = c.news; if (!n) { navigateTo('career'); renderCareer(); return; }
    const t = teamById(c.team);
    $('ct-title').textContent = `${t.name} · Transfers`;
    $('ct-budget').textContent = n.budget > 0 ? `${n.budget} transfer point${n.budget===1?'':'s'} to spend` : 'Budget spent';
    $('ct-ratings').innerHTML = ['ATT','MID','DEF','PAC','GK'].map(k => {
      const base = t.r[k], boost = (c.boosts && c.boosts[k]) || 0, val = clamp(base + boost, 1, 99), can = n.budget > 0 && val < 99;
      return `<div class="ct-row"><span class="ct-stat">${k}</span>`
        + `<span class="rt-bar"><span class="rt-fill" style="width:${val}%"></span></span>`
        + `<span class="ct-val">${val}${boost?` <span class="ct-boost">+${boost}</span>`:''}</span>`
        + `<button class="ct-buy focusable" data-action="ct-buy:${k}"${can?'':' disabled'}>+</button></div>`;
    }).join('');
    focusFirst(screens['career-transfers']);
  }
  function startRehireFlow() { game.ts.mode = 'rehire'; game.ts.step = 0; game.ts.idx = 0; navigateTo('team-select'); }

  // ============================================================
  // EFFECTS
  // ============================================================
  function spawnEffect(type, x, y) { game.effects.push({ type, x, y, t: 0, life: type === 'tackle' ? 0.4 : 0.6 }); }
  function spawnGoalBurst(side) {
    const gx = CFG.PW/2, gy = goalY(side);               // the goal this side attacks (flips at half time)
    for (let i = 0; i < 36; i++) {
      const a = srand() * 6.28, s = rrange(6, 22);
      game.effects.push({ type: 'spark', x: gx + rrange(-3,3), y: gy + (gy === 0 ? 1 : -1)*rrange(0,2),
        vx: Math.cos(a)*s, vy: Math.sin(a)*s - 6, t: 0, life: rrange(0.7, 1.6), col: teamRenderCol(side) });
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
  let cv3d = null, R3D = null, _threeLoading = false, _webglOK = null;
  const P3D_SCALE = 1.26;   // 3D player size multiplier — a touch bigger so the action reads clearly on the glasses
  function setupRender() {
    cv = $('pitch'); ctx = cv.getContext('2d');
    pitchCv = document.createElement('canvas'); pitchCv.width = 600; pitchCv.height = 600;
    pitchCtx = pitchCv.getContext('2d');
    cv3d = $('pitch3d');
    if (game.settings.gfx === '3D') ensure3D();   // lazy-build now if the toggle was left on
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
  // shared figure radius (smaller, less arcade-inflated → the pitch feels less crowded
  // and passing lanes open up). The active player you control is drawn a touch bigger.
  function playerBodyR(p) {
    const s = geom.s;
    const r = p.isGK ? 3.1 : 2.9;
    let bodyR = Math.max(6.2, r * s * 0.43 + 3.1);
    const isActive = p.id === game.activeId && p.side === 'home' && !game._allAI;
    if (isActive) bodyR *= 1.18;
    return bodyR;
  }

  function drawStaticPitch() {
    const g = geom, p = pitchCtx;
    p.clearRect(0, 0, 600, 600);
    // stadium glow behind the pitch
    const sgrad = p.createRadialGradient(g.ox+g.pw/2, g.oy+g.ph*0.45, 50, g.ox+g.pw/2, g.oy+g.ph*0.45, 430);
    sgrad.addColorStop(0, 'rgba(20,48,34,0.22)'); sgrad.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = sgrad; p.fillRect(0, 0, 600, 600);

    // grass base + mowed stripes with a subtle turf sheen (vertical gradient per stripe)
    p.fillStyle = '#0a2014'; p.fillRect(g.ox, g.oy, g.pw, g.ph);
    const stripes = 12, sh = g.ph / stripes;
    for (let i = 0; i < stripes; i++) {
      const y = g.oy + i * sh;
      const lg = p.createLinearGradient(0, y, 0, y + sh);
      if (i % 2 === 0) { lg.addColorStop(0, '#103622'); lg.addColorStop(1, '#0c2a1a'); }
      else            { lg.addColorStop(0, '#0c2819'); lg.addColorStop(1, '#091f12'); }
      p.fillStyle = lg; p.fillRect(g.ox, y, g.pw, sh + 0.6);
    }
    // floodlight pool (centre brighter) + edge vignettes for focus
    const fl = p.createRadialGradient(g.ox+g.pw/2, g.oy+g.ph*0.45, 25, g.ox+g.pw/2, g.oy+g.ph*0.45, g.ph*0.62);
    fl.addColorStop(0, 'rgba(150,210,165,0.10)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = fl; p.fillRect(g.ox, g.oy, g.pw, g.ph);
    const vg = p.createLinearGradient(0, g.oy, 0, g.oy + g.ph);
    vg.addColorStop(0, 'rgba(0,0,0,0.24)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.24)');
    p.fillStyle = vg; p.fillRect(g.ox, g.oy, g.pw, g.ph);
    const hv = p.createLinearGradient(g.ox, 0, g.ox + g.pw, 0);
    hv.addColorStop(0, 'rgba(0,0,0,0.20)'); hv.addColorStop(0.5, 'rgba(0,0,0,0)'); hv.addColorStop(1, 'rgba(0,0,0,0.20)');
    p.fillStyle = hv; p.fillRect(g.ox, g.oy, g.pw, g.ph);

    // glowing markings
    p.strokeStyle = 'rgba(234,255,243,0.95)';
    p.lineWidth = 2;
    p.shadowColor = 'rgba(120,255,190,0.5)'; p.shadowBlur = 5;
    const L = (x1,y1,x2,y2)=>{ p.beginPath(); p.moveTo(wx(x1),wy(y1)); p.lineTo(wx(x2),wy(y2)); p.stroke(); };
    const RECT = (x,y,w,h)=>{ p.beginPath(); p.rect(wx(x),wy(y),w*g.s,h*g.s); p.stroke(); };
    RECT(0, 0, CFG.PW, CFG.PL);
    L(0, CFG.PL/2, CFG.PW, CFG.PL/2);
    p.beginPath(); p.arc(wx(CFG.PW/2), wy(CFG.PL/2), CFG.centerR * g.s, 0, 6.2832); p.stroke();
    dot(p, CFG.PW/2, CFG.PL/2, 2.2);
    drawBoxes(p, true); drawBoxes(p, false);
    // corner arcs
    const cR = 1.0 * g.s;
    const carc = (cx, cy, a0, a1) => { p.beginPath(); p.arc(wx(cx), wy(cy), cR, a0, a1); p.stroke(); };
    carc(0, 0, 0, Math.PI/2);
    carc(CFG.PW, 0, Math.PI/2, Math.PI);
    carc(CFG.PW, CFG.PL, Math.PI, Math.PI*1.5);
    carc(0, CFG.PL, Math.PI*1.5, Math.PI*2);
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
    const back = gy + (top ? -1 : 1) * CFG.goalDepth;
    const nx0 = wx(gx0), nx1 = wx(gx1), ny0 = wy(gy), ny1 = wy(back);
    const inset = 7;
    const bnx0 = nx0 + inset, bnx1 = nx1 - inset;
    p.save();
    // faint net fill (gives the goal volume)
    p.fillStyle = 'rgba(190,225,255,0.05)';
    p.beginPath(); p.moveTo(nx0, ny0); p.lineTo(nx1, ny0); p.lineTo(bnx1, ny1); p.lineTo(bnx0, ny1); p.closePath(); p.fill();
    // fine net mesh, softly lit
    p.strokeStyle = 'rgba(196,228,255,0.36)'; p.lineWidth = 0.8;
    p.shadowColor = 'rgba(150,220,255,0.4)'; p.shadowBlur = 3;
    for (let i = 0; i <= 11; i++) { const f = i/11; p.beginPath(); p.moveTo(lerp(nx0,nx1,f), ny0); p.lineTo(lerp(bnx0,bnx1,f), ny1); p.stroke(); }
    for (let j = 0; j <= 6; j++) { const f = j/6; const yy = lerp(ny0,ny1,f); p.beginPath(); p.moveTo(lerp(nx0,bnx0,f), yy); p.lineTo(lerp(nx1,bnx1,f), yy); p.stroke(); }
    p.restore();
    // posts + crossbar (solid, bright, glowing) + a back bar for 3D
    p.save();
    p.lineCap = 'round';
    p.strokeStyle = '#ffffff'; p.lineWidth = 3.6;
    p.shadowColor = 'rgba(150,230,255,0.9)'; p.shadowBlur = 9;
    p.beginPath();
    p.moveTo(nx0, ny0); p.lineTo(nx0, ny1);
    p.moveTo(nx1, ny0); p.lineTo(nx1, ny1);
    p.moveTo(nx0, ny0); p.lineTo(nx1, ny0);
    p.stroke();
    p.lineWidth = 2; p.strokeStyle = 'rgba(255,255,255,0.85)';
    p.beginPath(); p.moveTo(bnx0, ny1); p.lineTo(bnx1, ny1); p.stroke();
    p.restore();
  }

  function render() {
    // 3D path (only when toggled on AND fully loaded); any failure reverts to the untouched 2D body below
    if (game.settings.gfx === '3D' && R3D && R3D.ready) {
      try { render3D(); return; } catch (e) { failTo2D('3D error — back to 2D'); }   // only a real crash reverts; slowness is the player's call
    }
    if (!ctx || !geom) return;
    ctx.clearRect(0, 0, 600, 600);
    ctx.drawImage(pitchCv, 0, 0);
    drawNetRipples();
    drawAimHints();
    drawPlayers();
    drawBall();
    drawFx();
    drawBallMarker();
  }

  // ============================================================
  // 3D RENDERER (optional, behind the Graphics toggle). three.js is
  // vendored locally (three.module.js) and lazy-loaded. The 2D path above
  // is the hard fallback: any failure flips back to 2D, never blank.
  // ============================================================
  const THREE_URL = './three.module.js?v=22';
  function toggleGfx() {
    game.settings.gfx = game.settings.gfx === '3D' ? '2D' : '3D';
    saveStore(); renderSettings(); updateHudLayout();
    if (game.settings.gfx === '3D') ensure3D(); else showPitch3D(false);
  }
  // 3D camera presets — selectable in Settings. Side = fixed side-on broadcast (default,
  // equidistant goals); Behind = the original elevated behind-the-near-goal view.
  const CAM_PRESETS = {
    Side: { fov: 49, pos: [-100, 74, 0], look: [0, -1, 0] },
    Behind: { fov: 44, pos: [0, 90, 116], look: [0, 0, 4] },   // zoomed in — chip rides up to the top band (cam-behind HUD), freeing the bottom
  };
  function applyCam() {
    if (!R3D || !R3D.ready) return;
    const c = CAM_PRESETS[game.settings.cam] || CAM_PRESETS.Side;
    R3D.camera.fov = c.fov;
    R3D.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    R3D.camera.lookAt(c.look[0], c.look[1], c.look[2]);
    R3D.camera.updateProjectionMatrix();
  }
  function toggleCam() {
    game.settings.cam = game.settings.cam === 'Side' ? 'Behind' : 'Side';
    saveStore(); renderSettings(); applyCam(); updateHudLayout();
    if (game.settings.gfx === '3D' && R3D && R3D.ready) render();   // live update if 3D is showing
  }
  function toggleChase() {   // On = your player auto-runs to the ball; Off = it holds until you steer
    game.settings.chase = game.settings.chase === 'On' ? 'Off' : 'On';
    saveStore(); renderSettings();
  }
  function cycleWeather() {
    const seq = ['Auto', 'Clear', 'Rain'];
    game.settings.weather = seq[(seq.indexOf(game.settings.weather || 'Auto') + 1) % seq.length];
    saveStore(); renderSettings();
  }
  // In the 3D Behind-the-net view we lift the action chip + dash pip into the empty band
  // below the scoreboard (CSS class) so the camera can drop lower and zoom into the field.
  function updateHudLayout() {
    const m = $('match');
    if (m) m.classList.toggle('cam-behind', game.settings.gfx === '3D' && game.settings.cam === 'Behind');
  }
  function showPitch3D(on) {
    if (cv3d) cv3d.classList.toggle('hidden', !on);
    if (cv) cv.classList.toggle('hidden', !!on && R3D && R3D.ready);   // hide 2D canvas only once 3D is live
  }
  function failTo2D(msg) {
    game.settings.gfx = '2D';
    try { saveStore(); renderSettings(); } catch (e) {}
    showPitch3D(false); updateHudLayout();
    if (cv) cv.classList.remove('hidden');
    if (msg) { showToast(msg); say(msg); }
  }
  function ensure3D() {
    if (R3D && R3D.ready) { showPitch3D(true); return; }
    if (_threeLoading) return;
    if (!cv3d) cv3d = $('pitch3d');
    if (_webglOK == null) {   // probe once, and release the probe context so we don't leak it on retries
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (gl) { const lc = gl.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); }
      _webglOK = !!gl;
    }
    if (!_webglOK) { failTo2D('3D needs WebGL — using 2D'); return; }
    if (window.__THREE) { tryBuild3D(); return; }
    _threeLoading = true;
    let settled = false;
    window.__onThree = () => { if (settled) return; settled = true; _threeLoading = false; tryBuild3D(); };
    window.__onThreeFail = () => { if (settled) return; settled = true; _threeLoading = false; failTo2D('3D unavailable — using 2D'); };
    const s = document.createElement('script'); s.type = 'module';
    s.textContent = `import(${JSON.stringify(THREE_URL)}).then(m=>{window.__THREE=m;(window.__onThree||function(){})();}).catch(e=>{(window.__onThreeFail||function(){})(e);});`;
    document.head.appendChild(s);
    setTimeout(() => { if (!window.__THREE) (window.__onThreeFail || function () {})(); }, 9000);
  }
  function tryBuild3D() { try { build3D(window.__THREE); showPitch3D(true); } catch (e) { console.warn('3D build failed', e); failTo2D('3D failed — using 2D'); } }

  function buildPitchTexture() {
    const S = 8, W = Math.round(CFG.PW * S), H = Math.round(CFG.PL * S);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const tx = (m) => m * S, ty = (m) => m * S;
    const stripes = 12, sh = H / stripes;
    for (let i = 0; i < stripes; i++) { x.fillStyle = (i % 2 === 0) ? '#0f3623' : '#0b2917'; x.fillRect(0, i * sh, W, sh + 1); }
    x.strokeStyle = 'rgba(234,255,243,0.95)'; x.lineWidth = Math.max(2, S * 0.4); x.lineJoin = 'round';
    const RECT = (mx, my, mw, mh) => x.strokeRect(tx(mx), ty(my), mw * S, mh * S);
    const DOT = (mx, my, r) => { x.fillStyle = 'rgba(234,255,243,0.95)'; x.beginPath(); x.arc(tx(mx), ty(my), r, 0, 6.2832); x.fill(); };
    RECT(0.6, 0.6, CFG.PW - 1.2, CFG.PL - 1.2);
    x.beginPath(); x.moveTo(tx(0.6), ty(CFG.PL / 2)); x.lineTo(tx(CFG.PW - 0.6), ty(CFG.PL / 2)); x.stroke();
    x.beginPath(); x.arc(tx(CFG.PW / 2), ty(CFG.PL / 2), CFG.centerR * S, 0, 6.2832); x.stroke();
    DOT(CFG.PW / 2, CFG.PL / 2, S * 0.5);
    const box = (top) => {
      const bx = (CFG.PW - CFG.boxW) / 2, sx = (CFG.PW - CFG.sixW) / 2;
      const by = top ? 0.6 : CFG.PL - CFG.boxD - 0.6, sy = top ? 0.6 : CFG.PL - CFG.sixD - 0.6;
      RECT(bx, by, CFG.boxW, CFG.boxD); RECT(sx, sy, CFG.sixW, CFG.sixD);
      const py = top ? CFG.penSpot : CFG.PL - CFG.penSpot; DOT(CFG.PW / 2, py, S * 0.45);
      x.beginPath(); const a0 = top ? 0.32 : Math.PI + 0.32, a1 = top ? Math.PI - 0.32 : 6.2832 - 0.32;
      x.arc(tx(CFG.PW / 2), ty(py), CFG.centerR * S, a0, a1); x.stroke();
    };
    box(true); box(false);
    const cr = 1.0 * S, carc = (cx, cy, a0, a1) => { x.beginPath(); x.arc(tx(cx), ty(cy), cr, a0, a1); x.stroke(); };
    carc(0.6, 0.6, 0, Math.PI / 2); carc(CFG.PW - 0.6, 0.6, Math.PI / 2, Math.PI);
    carc(CFG.PW - 0.6, CFG.PL - 0.6, Math.PI, Math.PI * 1.5); carc(0.6, CFG.PL - 0.6, Math.PI * 1.5, 6.2832);
    return c;
  }
  function radialTex(T, hex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, hexA(hex, 0.9)); g.addColorStop(0.5, hexA(hex, 0.35)); g.addColorStop(1, hexA(hex, 0));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  function netTex(T) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.strokeStyle = 'rgba(220,240,255,0.9)'; x.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) { const p = i / 8 * 64; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 64); x.moveTo(0, p); x.lineTo(64, p); x.stroke(); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 2); return t;
  }
  // classic soccer-ball look: 12 dark pentagons at the icosahedron vertices on a white panel base
  // (an equirectangular map). Used as BOTH the diffuse and emissive map, so it reads as a real ball
  // on a normal screen AND on the additive glasses display (white panels glow, pentagons stay dark).
  function ballTex(T) {
    const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#eef1f6'; x.fillRect(0, 0, W, H);
    const phi = (1 + Math.sqrt(5)) / 2;
    const raw = [[0,1,phi],[0,-1,phi],[0,1,-phi],[0,-1,-phi],[1,phi,0],[-1,phi,0],[1,-phi,0],[-1,-phi,0],[phi,0,1],[-phi,0,1],[phi,0,-1],[-phi,0,-1]];
    const pent = (r, rot) => { x.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI/2 + i*1.25664 + rot; const px = Math.cos(a)*r, py = Math.sin(a)*r; i ? x.lineTo(px,py) : x.moveTo(px,py); } x.closePath(); x.fill(); };
    x.fillStyle = '#10141b';
    for (const [a,b,d] of raw) {
      const L = Math.hypot(a,b,d), ny = b/L;
      const v = Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI;       // 0..1 (top → bottom)
      const u = Math.atan2(d/L, a/L) / 6.28319 + 0.5;                     // 0..1 (around)
      const cy = v * H, stretch = 1 / Math.max(0.42, Math.sin(v * Math.PI));   // widen pentagons near the poles
      for (const du of [-1, 0, 1]) {                                      // wrap across the u=0/1 seam
        const cx = (u + du) * W; if (cx < -50 || cx > W + 50) continue;
        x.save(); x.translate(cx, cy); x.scale(stretch, 1); pent(23, (a + d) * 2.3); x.restore();
      }
    }
    const tex = new T.CanvasTexture(c); tex.anisotropy = 4; return tex;
  }
  function build3D(T) {
    const renderer = new T.WebGLRenderer({ canvas: cv3d, alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false });
    renderer.setPixelRatio(1); renderer.setSize(600, 600, false); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    cv3d.addEventListener('webglcontextlost', (e) => { e.preventDefault(); try { renderer.dispose(); } catch (_) {} R3D = null; failTo2D('3D context lost — using 2D'); }, false);   // invalidate so a later re-enable rebuilds cleanly
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(49, 1, 0.5, 520);   // fixed broadcast cam; pose set from the selected CAM_PRESET via applyCam() below
    scene.add(new T.HemisphereLight(0x9bc2ff, 0x0a2014, 1.0));
    const dl = new T.DirectionalLight(0xffffff, 0.55); dl.position.set(8, 80, 50); scene.add(dl);
    // pitch ground (reuse the 2D art language via a full-bleed texture)
    const tex = new T.CanvasTexture(buildPitchTexture());
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const ground = new T.Mesh(new T.PlaneGeometry(CFG.PW, CFG.PL), new T.MeshBasicMaterial({ map: tex, transparent: true }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    // goals + nets
    const goalMat = new T.MeshBasicMaterial({ color: 0xeafff3 });
    const nMat = new T.MeshBasicMaterial({ map: netTex(T), transparent: true, opacity: 0.22, side: T.DoubleSide, depthWrite: false });
    const buildGoal = (zEnd, dir) => {
      const hw = CFG.goalHalfW, h = CFG.crossbarH, pw = 0.16, d = CFG.goalDepth * dir;
      const g = new T.Group();
      [-hw, hw].forEach(px => { const m = new T.Mesh(new T.BoxGeometry(pw, h, pw), goalMat); m.position.set(px, h / 2, zEnd); g.add(m); });
      const bar = new T.Mesh(new T.BoxGeometry(hw * 2 + pw, pw, pw), goalMat); bar.position.set(0, h, zEnd); g.add(bar);
      [-hw, hw].forEach(px => { const m = new T.Mesh(new T.BoxGeometry(pw, pw, CFG.goalDepth), goalMat); m.position.set(px, h, zEnd + d / 2); g.add(m); });
      const back = new T.Mesh(new T.PlaneGeometry(hw * 2, h), nMat); back.position.set(0, h / 2, zEnd + d); g.add(back);
      scene.add(g);
    };
    buildGoal(-CFG.PL / 2, -1); buildGoal(CFG.PL / 2, 1);
    // shared geometries — a stylised humanoid: head + jersey torso + shorts + two legs + two arms.
    // Limb geos pivot at the JOINT (top), so a per-instance X-rotation swings them through the gait.
    const headGeo = new T.SphereGeometry(0.40, 12, 10); headGeo.translate(0, 2.86, 0);
    const torsoGeo = new T.BoxGeometry(0.82, 1.00, 0.44); torsoGeo.translate(0, 2.00, 0);     // jersey
    const shortsGeo = new T.BoxGeometry(0.80, 0.44, 0.46); shortsGeo.translate(0, 1.42, 0);
    const legGeo = new T.CapsuleGeometry(0.17, 1.06, 3, 6); legGeo.translate(0, -0.70, 0);     // hip pivot at y=0, foot at y=-1.4
    const armGeo = new T.CapsuleGeometry(0.135, 0.74, 3, 6); armGeo.translate(0, -0.50, 0);    // shoulder pivot at y=0
    const blobGeo = new T.CircleGeometry(1.0, 16); blobGeo.rotateX(-Math.PI / 2);
    const skinMat = new T.MeshLambertMaterial({ color: 0xf0c79e, emissive: 0x6e4d33, emissiveIntensity: 0.85 });   // head + bare arms + legs (shared, bright enough to read on the additive display)
    const blobMat = new T.MeshBasicMaterial({ color: 0x223028, transparent: true, opacity: 0.5, depthWrite: false });
    const N = 11;
    const sides = {};
    ['home', 'away'].forEach(side => {
      const kitMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.78 });   // jersey (team colour)
      const shortsMat = new T.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x222222, emissiveIntensity: 0.72 });
      const head   = new T.InstancedMesh(headGeo,   skinMat,   N);
      const torso  = new T.InstancedMesh(torsoGeo,  kitMat,    N);
      const shorts = new T.InstancedMesh(shortsGeo, shortsMat, N);
      const legs   = new T.InstancedMesh(legGeo,    skinMat,   N * 2);   // 2 per player (instance 2i = left, 2i+1 = right)
      const arms   = new T.InstancedMesh(armGeo,    skinMat,   N * 2);   // bare arms (skin) → clear humanoid silhouette
      const blob   = new T.InstancedMesh(blobGeo,   blobMat,   N);
      [head, torso, shorts, legs, arms, blob].forEach(m => { m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); });
      sides[side] = { head, torso, shorts, legs, arms, blob, kitMat, shortsMat };
    });
    // ball — a bit bigger and self-lit; no glow halo, just a clean bright sphere (realistic)
    const ballMap = ballTex(T);
    const ball = new T.Mesh(new T.SphereGeometry(0.85, 24, 18), new T.MeshStandardMaterial({ color: 0xffffff, map: ballMap, emissive: 0xffffff, emissiveMap: ballMap, emissiveIntensity: 0.62, roughness: 0.55, metalness: 0 }));
    // a thin dark contour so the ball keeps a defined edge against bright lines on a regular screen
    // (harmless on the additive glasses display, where dark = transparent)
    const ballOutline = new T.Mesh(new T.SphereGeometry(0.85 * 1.12, 18, 14), new T.MeshBasicMaterial({ color: 0x07101a, side: T.BackSide }));
    ball.add(ballOutline);   // parented → follows the ball automatically
    scene.add(ball);
    [ball, ballOutline].forEach(m => { m.frustumCulled = false; });
    const ballShadow = new T.Mesh(blobGeo, new T.MeshBasicMaterial({ color: 0x101810, transparent: true, opacity: 0.45, depthWrite: false }));
    ballShadow.scale.setScalar(1.15); scene.add(ballShadow);
    // indicator rings + chevron
    const ringGeo = new T.RingGeometry(0.98, 1.4, 30); ringGeo.rotateX(-Math.PI / 2);
    const activeRing = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0x58d6ff, transparent: true, opacity: 1.0, depthWrite: false })); activeRing.scale.setScalar(1.45); scene.add(activeRing);   // YOUR player: bold cyan ring
    const carrierRing = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0x3ef08f, transparent: true, opacity: 0.95, depthWrite: false })); scene.add(carrierRing);
    const chevron = new T.Sprite(new T.SpriteMaterial({ map: radialTex(T, '#58d6ff'), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); chevron.scale.set(2.6, 2.6, 1); scene.add(chevron);   // bright marker over YOUR player
    // a tall glowing beam so the player YOU control is unmistakable anywhere on the pitch
    const beamGeo = new T.CylinderGeometry(0.30, 0.30, 9, 10, 1, true); beamGeo.translate(0, 4.4, 0);
    const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); scene.add(beam);
    // aim guide — line on the pitch + a target ring (mirrors the 2D shoot/pass hints)
    const aimGeo = new T.BufferGeometry(); aimGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    const aimLine = new T.Line(aimGeo, new T.LineBasicMaterial({ color: 0x58d6ff, transparent: true, opacity: 0.9 })); aimLine.frustumCulled = false; scene.add(aimLine);
    const aimRingGeo = new T.RingGeometry(0.65, 1.05, 24); aimRingGeo.rotateX(-Math.PI / 2);
    const aimMarker = new T.Mesh(aimRingGeo, new T.MeshBasicMaterial({ color: 0x58d6ff, transparent: true, opacity: 0.95, depthWrite: false })); scene.add(aimMarker);
    R3D = { T, renderer, scene, camera, ground, tex, ball, ballShadow, activeRing, carrierRing, chevron, beam, aimLine, aimMarker, sides, dummy: new T.Object3D(), part: new T.Object3D(), m4: new T.Matrix4(), ready: true };
    applyCam();        // pose the camera from the selected Side/Behind preset
    refresh3DKits();
  }
  function refresh3DKits() {
    if (!R3D || !game.home || !game.away) return;   // teams may not exist yet (3D can build before a match)
    ['home', 'away'].forEach(side => {
      const kit = teamRenderCol(side), s = R3D.sides[side];
      s.kitMat.color.set(kit); s.kitMat.emissive.set(kit);                       // jersey + sleeves glow the team colour
      s.shortsMat.color.set(shade(kit, -0.26)); s.shortsMat.emissive.set(shade(kit, -0.42));   // shorts: a darker kit shade
    });
  }
  // place one swinging limb: world = playerRoot × (offset · X-swing), into instance idx of mesh
  function setLimb3D(RM, ox, oy, oz, swingX, mesh, idx) {
    const part = R3D.part, m4 = R3D.m4;
    part.position.set(ox, oy, oz); part.rotation.set(swingX, 0, 0); part.scale.set(1, 1, 1); part.updateMatrix();
    m4.multiplyMatrices(RM, part.matrix); mesh.setMatrixAt(idx, m4);
  }
  function syncSide3D(side) {
    const r = R3D, root = r.dummy, S = r.sides[side], players = teamObj(side).players;
    const HIDE = r._hideM || (r._hideM = new r.T.Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(0, -500, 0));
    for (let i = 0; i < 11; i++) {
      const p = players[i];
      if (!p) {
        S.head.setMatrixAt(i, HIDE); S.torso.setMatrixAt(i, HIDE); S.shorts.setMatrixAt(i, HIDE); S.blob.setMatrixAt(i, HIDE);
        S.legs.setMatrixAt(2*i, HIDE); S.legs.setMatrixAt(2*i+1, HIDE); S.arms.setMatrixAt(2*i, HIDE); S.arms.setMatrixAt(2*i+1, HIDE);
        continue;
      }
      const sc = (p.isGK ? 1.12 : 1) * P3D_SCALE;
      const sp = len(p.vx, p.vy), moving = sp > 0.4;
      const s = moving ? Math.sin(p.runPhase) : 0;
      const amp = moving ? clamp(sp * 0.09, 0.16, 0.7) : 0;     // longer strides the faster you run
      const bob = moving ? Math.abs(Math.cos(p.runPhase)) * 0.07 : 0;   // rise on each stride
      const legA = s * amp, armA = -s * amp * 0.6;              // arms counter-swing to the legs
      // body root (position + facing + scale); rigid parts share this matrix
      root.position.set(p.x - 44, bob, p.y - 52.5); root.rotation.set(0, -p.heading + Math.PI/2, 0); root.scale.setScalar(sc); root.updateMatrix();
      const RM = root.matrix;
      S.head.setMatrixAt(i, RM); S.torso.setMatrixAt(i, RM); S.shorts.setMatrixAt(i, RM);
      setLimb3D(RM, -0.22, 1.40, 0,  legA, S.legs, 2*i);       // left / right leg pivot at the hips
      setLimb3D(RM,  0.22, 1.40, 0, -legA, S.legs, 2*i+1);
      setLimb3D(RM, -0.50, 2.42, 0,  armA, S.arms, 2*i);       // left / right arm pivot at the shoulders
      setLimb3D(RM,  0.50, 2.42, 0, -armA, S.arms, 2*i+1);
      // shadow blob — flat on the pitch, no facing / bob
      root.position.set(p.x - 44, 0.02, p.y - 52.5); root.rotation.set(0, 0, 0); root.scale.setScalar(sc * (p.isGK ? 1.05 : 1)); root.updateMatrix();
      S.blob.setMatrixAt(i, root.matrix);
    }
    S.head.instanceMatrix.needsUpdate = true; S.torso.instanceMatrix.needsUpdate = true; S.shorts.instanceMatrix.needsUpdate = true;
    S.legs.instanceMatrix.needsUpdate = true; S.arms.instanceMatrix.needsUpdate = true; S.blob.instanceMatrix.needsUpdate = true;
  }
  function render3D() {
    const r = R3D, b = game.ball;
    syncSide3D('home'); syncSide3D('away');
    const bz = 0.85 + (b.z || 0);
    r.ball.position.set(b.x - 44, bz, b.y - 52.5); r.ball.rotation.z = (b.x + b.y) * 0.22; r.ball.rotation.x = (b.y - b.x) * 0.15;
    r.ballShadow.position.set(b.x - 44, 0.02, b.y - 52.5);
    // indicators (mirror the 2D colour language) — hidden during a goal replay for a clean cinematic
    const aId = (!game._allAI && !game._replay) ? game.activeId : null;
    const ap = aId ? playerById(aId) : null;
    if (ap && ap.side === 'home') {                  // ALWAYS mark the player you control (incl. the keeper)
      const wx2 = ap.x - 44, wz2 = ap.y - 52.5;
      r.activeRing.visible = true; r.activeRing.position.set(wx2, 0.05, wz2);
      const cp = 2.6 + 0.55 * Math.sin(performance.now() / 220);    // gentle pulse so YOUR player is unmistakable
      r.chevron.visible = true; r.chevron.scale.set(cp, cp, 1); r.chevron.position.set(wx2, 3.1, wz2);
      r.beam.visible = true; r.beam.position.set(wx2, 0, wz2);
      r.beam.material.opacity = 0.5 + 0.18 * (0.5 + 0.5 * Math.sin(performance.now() / 220));
    }
    else { r.activeRing.visible = false; r.chevron.visible = false; r.beam.visible = false; }
    const owner = playerById(b.owner);
    if (owner && !owner.isGK) { r.carrierRing.visible = true; r.carrierRing.position.set(owner.x - 44, 0.06, owner.y - 52.5); const cc = (aId === owner.id) ? '#58d6ff' : (owner.side === 'home' ? '#3ef08f' : '#ff7a45'); r.carrierRing.material.color.set(cc); }
    else r.carrierRing.visible = false;
    updateAim3D(ap);
    r.renderer.render(r.scene, r.camera);
  }
  function setAimLine3D(x0, y0, x1, y1, col) {
    const r = R3D, pos = r.aimLine.geometry.attributes.position;
    pos.setXYZ(0, x0 - 44, 0.08, y0 - 52.5); pos.setXYZ(1, x1 - 44, 0.08, y1 - 52.5); pos.needsUpdate = true;
    r.aimLine.material.color.set(col);
  }
  function updateAim3D(ap) {
    const r = R3D, b = game.ball;
    let show = false;
    if (ap && ap.side === 'home' && b.owner === ap.id && game.phase === 'play') {
      if (inShootRange(ap)) {
        const tx = clamp(CFG.PW / 2 + game.steer.x * (CFG.goalHalfW - 0.4), CFG.PW / 2 - CFG.goalHalfW + 0.3, CFG.PW / 2 + CFG.goalHalfW - 0.3);
        const gy = goalY(ap.side);
        setAimLine3D(ap.x, ap.y, tx, gy, '#58d6ff');
        r.aimMarker.position.set(tx - 44, 0.07, gy - 52.5); r.aimMarker.material.color.set('#58d6ff'); show = true;
      } else {
        const m = previewPassTarget(ap);
        if (m) { setAimLine3D(ap.x, ap.y, m.x, m.y, '#3ef08f'); r.aimMarker.position.set(m.x - 44, 0.07, m.y - 52.5); r.aimMarker.material.color.set('#3ef08f'); show = true; }
      }
    }
    r.aimLine.visible = show; r.aimMarker.visible = show;
  }
  // a floating marker that hovers over whoever has the ball — drawn last so it's
  // always visible on top. Colour says which team: cyan = you, green = teammate, orange = opponent.
  function drawBallMarker() {
    const c = playerById(game.ball.owner);
    if (!c) return;
    const isActive = c.id === game.activeId && c.side === 'home' && !game._allAI;
    const bodyR = playerBodyR(c);
    const sx = wx(c.x), sy = wy(c.y);
    const col = isActive ? '#58d6ff' : (c.side === 'home' ? '#3ef08f' : '#ff6a3d');
    const bob = Math.sin(performance.now() / 170) * 2.2;
    let tipY = sy - bodyR * 1.7 + bob;
    if (tipY < 46) tipY = 46;                 // keep on-screen near the top goal
    ctx.save();
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 9;
    const w = 8, h = 12;
    ctx.beginPath();
    ctx.moveTo(sx, tipY);                      // tip points down at the player
    ctx.lineTo(sx - w, tipY - h);
    ctx.lineTo(sx + w, tipY - h);
    ctx.closePath(); ctx.fill();
    // thin dark edge for contrast against bright kits
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 0; ctx.stroke();
    ctx.restore();
  }

  function drawNetRipples() {
    const draw = (side) => {
      const r = game.netRipple[side]; if (r <= 0) return;
      const gy = ownGoalY(side); const top = gy === 0;   // the goal the conceding side defends (flips at half time)
      const gx0 = CFG.PW/2 - CFG.goalHalfW, gx1 = CFG.PW/2 + CFG.goalHalfW;
      const back = gy + (top ? -1 : 1) * CFG.goalDepth;
      ctx.save();
      ctx.strokeStyle = hexA(teamRenderCol(otherSide(side)), 0.5 * r + 0.2);
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
        ctx.beginPath(); ctx.moveTo(wx(p.x), wy(p.y)); ctx.lineTo(wx(tx), wy(goalY(p.side))); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(88,214,255,0.95)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx(tx), wy(goalY(p.side)), 7, 0, 6.2832); ctx.stroke();
        ctx.restore();
      } else {
        const m = previewPassTarget(p);       // preview matches the facing-aware pass (throttled)
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
    // sort by y so lower players draw on top (depth) — reuse a scratch list (no per-frame concat/slice)
    const list = game._drawList || (game._drawList = []);
    list.length = 0;
    for (const p of game.home.players) list.push(p);
    for (const p of game.away.players) list.push(p);
    list.sort((a, b) => a.y - b.y);
    for (const p of list) drawPlayer(p);
  }
  function drawPlayer(p) {
    const s = geom.s;
    const sx = wx(p.x), sy = wy(p.y);
    const team = teamObj(p.side); const t = team.def;
    const kit = team.kitCol || t.col;                // on-pitch strip (away gets a change strip if colours clash)
    const col = p.isGK ? t.gk : kit;
    const isActive = p.id === game.activeId && p.side === 'home' && !game._allAI;
    const hasBall = game.ball.owner === p.id;
    const bodyR = playerBodyR(p);

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
    ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.62, bodyR*0.9, bodyR*0.4, 0, 0, 6.2832); ctx.fill();

    // team-colour ground ring — instant which-side-is-this read for every player
    // (the active player / ball-carrier instead get the brighter possession ring below)
    if (!(isActive || hasBall)) {
      // no shadowBlur here — this draws for ~20 players every frame and blur is the
      // single most expensive canvas op on the glasses; the solid ring reads fine without it
      ctx.fillStyle = hexA(kit, 0.22);
      ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.6, bodyR*1.2, bodyR*0.56, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = kit; ctx.lineWidth = Math.max(1.8, bodyR*0.2);
      ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.6, bodyR*1.2, bodyR*0.56, 0, 0, 6.2832); ctx.stroke();
    }

    // possession / active ring — the carrier gets a filled glow disc (stronger), so it's
    // obvious who has the ball vs. who you merely control.
    if (isActive || hasBall) {
      ctx.save();
      const ringC = isActive ? '#58d6ff' : (p.side === 'home' ? '#3ef08f' : '#ff7a45');   // YOUR player is ALWAYS cyan (offense / with ball / defence)
      ctx.fillStyle = hexA(ringC, isActive ? 0.24 : 0.2);
      ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.55, bodyR*1.32, bodyR*0.72, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = ringC; ctx.lineWidth = isActive ? 3.4 : (hasBall ? 3.0 : 2.2);
      ctx.shadowColor = ringC; ctx.shadowBlur = isActive ? 15 : (hasBall ? 13 : 9);
      ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.55, bodyR*1.25, bodyR*0.66, 0, 0, 6.2832); ctx.stroke();
      if (isActive) {                          // a clear pointer above the player you control
        const py = sy - bodyR * 1.45;
        ctx.fillStyle = '#58d6ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(sx, py + bodyR * 0.55); ctx.lineTo(sx - bodyR * 0.45, py - bodyR * 0.15); ctx.lineTo(sx + bodyR * 0.45, py - bodyR * 0.15); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // running legs
    const swing = Math.sin(p.runPhase) * (len(p.vx,p.vy) > 0.5 ? bodyR*0.5 : 0);
    ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(2.5, bodyR*0.30); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx - bodyR*0.3, sy + bodyR*0.25); ctx.lineTo(sx - bodyR*0.3, sy + bodyR*0.85 + swing);
    ctx.moveTo(sx + bodyR*0.3, sy + bodyR*0.25); ctx.lineTo(sx + bodyR*0.3, sy + bodyR*0.85 - swing);
    ctx.stroke(); ctx.lineCap = 'butt';

    // torso (kit) — saturated so the team colour dominates, with a dark rim for edge pop
    const grad = ctx.createLinearGradient(sx, sy - bodyR, sx, sy + bodyR);
    grad.addColorStop(0, shade(col, 0.30)); grad.addColorStop(1, shade(col, -0.10));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(sx, sy, bodyR*0.88, bodyR*1.02, 0, 0, 6.2832); ctx.fill();
    ctx.lineWidth = Math.max(1.6, bodyR*0.16); ctx.strokeStyle = shade(col, -0.5); ctx.stroke();

    // shorts (secondary kit colour)
    ctx.fillStyle = t.col2;
    ctx.beginPath(); ctx.ellipse(sx, sy + bodyR*0.55, bodyR*0.6, bodyR*0.34, 0, 0, 6.2832); ctx.fill();
    // captain's armband
    if (p.captain) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(sx - bodyR*0.66, sy - bodyR*0.22, bodyR*0.24, bodyR*0.36); }

    // goalkeeper gloves
    if (p.isGK) {
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath(); ctx.arc(sx - bodyR*0.72, sy + bodyR*0.08, bodyR*0.22, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + bodyR*0.72, sy + bodyR*0.08, bodyR*0.22, 0, 6.2832); ctx.fill();
    }

    // head (leads in facing direction) with a hair cap for definition
    const hx = sx + Math.cos(p.heading) * bodyR*0.5;
    const hy = sy + Math.sin(p.heading) * bodyR*0.5 - bodyR*0.18;
    ctx.fillStyle = '#f0c79e';
    ctx.beginPath(); ctx.arc(hx, hy, bodyR*0.44, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#34281e';
    ctx.beginPath(); ctx.arc(hx, hy, bodyR*0.44, Math.PI, 2*Math.PI); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(hx, hy, bodyR*0.44, 0, 6.2832); ctx.stroke();

    // number
    ctx.fillStyle = pickInk(col); ctx.font = `800 ${Math.round(bodyR*0.85)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num), sx, sy + bodyR*0.04);

    // discipline / fitness pips — tiny cues so you know who to manage
    if (p.cards >= 1) { ctx.fillStyle = p.cards >= 2 ? '#ff4d5e' : '#ffd23f'; ctx.fillRect(sx + bodyR*0.62, sy - bodyR*1.12, bodyR*0.3, bodyR*0.44); }
    if (!p.isGK && (p.stam != null ? p.stam : 1) < 0.45) { ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.arc(sx - bodyR*0.8, sy - bodyR*0.95, bodyR*0.22, 0, 6.2832); ctx.fill(); }

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

  // hi-vis glow colour for the ball — bright & warm so it pops off the pitch and any kit.
  // (One-line tweak if you ever want a different ball colour.)
  const BALL_GLOW = '#ffd23f';
  function drawBall() {
    const b = game.ball;
    const z = b.z || 0;
    // trail (ground) — tinted to match the ball glow so the path is easy to follow
    if (b.trail.length > 4) {
      for (let i = 0; i < b.trail.length - 2; i += 2) {
        const a = (i / b.trail.length) * 0.42;
        ctx.fillStyle = hexA(BALL_GLOW, a);
        ctx.beginPath(); ctx.arc(wx(b.trail[i]), wy(b.trail[i+1]), 2.4, 0, 6.2832); ctx.fill();
      }
    }
    const sx = wx(b.x), sy = wy(b.y);
    const zPix = z * geom.s * 2.2;                              // exaggerated so the arc reads on a small pitch
    const R = Math.max(9.5, geom.s * 1.32) * (1 + z * 0.09);    // bigger & bolder so it's unmistakable
    const by = sy - zPix;
    // ground shadow (shrinks & fades as the ball rises)
    const sh = clamp(1 - z * 0.14, 0.3, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * sh})`;
    ctx.beginPath(); ctx.ellipse(sx, sy + R*0.5, R*0.95*sh, R*0.42*sh, 0, 0, 6.2832); ctx.fill();

    // pulsing hi-vis halo — the ball always glows so you can pick it out from the players
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);
    ctx.save();
    const halo = ctx.createRadialGradient(sx, by, R*0.55, sx, by, R*2.2);
    halo.addColorStop(0, hexA(BALL_GLOW, 0.42 + 0.20*pulse));
    halo.addColorStop(0.55, hexA(BALL_GLOW, 0.14));
    halo.addColorStop(1, hexA(BALL_GLOW, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(sx, by, R*2.2, 0, 6.2832); ctx.fill();
    ctx.restore();

    // white sphere body with soft 3-D shading + a warm bloom
    ctx.save();
    ctx.shadowColor = hexA(BALL_GLOW, 0.85); ctx.shadowBlur = 14;
    const g = ctx.createRadialGradient(sx - R*0.34, by - R*0.36, R*0.2, sx, by, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f3f8ff'); g.addColorStop(1, '#cdd9e4');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, by, R, 0, 6.2832); ctx.fill();
    ctx.restore();

    // classic soccer-ball panels: a centre pentagon, seams to the rim, and dark caps
    // between them (rotates as the ball travels, so it reads as spinning)
    ctx.save();
    ctx.translate(sx, by); ctx.rotate((b.x + b.y) * 0.22);
    const dark = 'rgba(18,30,52,0.92)';
    const TAU5 = 1.25664, TOP = -1.5708;                        // 2π/5, start at the top
    ctx.fillStyle = dark;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = TOP + i*TAU5; const px = Math.cos(a)*R*0.40, py = Math.sin(a)*R*0.40; i ? ctx.lineTo(px,py) : ctx.moveTo(px,py); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, R*0.11); ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = TOP + i*TAU5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*0.40, Math.sin(a)*R*0.40); ctx.lineTo(Math.cos(a)*R*0.96, Math.sin(a)*R*0.96); ctx.stroke();
      const ca = a + TAU5/2;                                    // dark panel cap at the rim, between seams
      ctx.beginPath(); ctx.arc(Math.cos(ca)*R*0.82, Math.sin(ca)*R*0.82, R*0.15, 0, 6.2832); ctx.fill();
    }
    ctx.restore();

    // crisp dark outline (separates the ball from white-kitted players) + bright accent rim
    ctx.save();
    ctx.strokeStyle = 'rgba(16,26,44,0.92)'; ctx.lineWidth = Math.max(1.2, R*0.12);
    ctx.beginPath(); ctx.arc(sx, by, R, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = hexA(BALL_GLOW, 0.6 + 0.4*pulse); ctx.lineWidth = Math.max(1, R*0.09);
    ctx.beginPath(); ctx.arc(sx, by, R*0.93, 0, 6.2832); ctx.stroke();
    ctx.restore();
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
    const hc = teamRenderCol('home'), ac = teamRenderCol('away');   // match the on-pitch strips
    $('sb-home-code').textContent = h.code; $('sb-away-code').textContent = a.code;
    $('sb-home-dot').style.color = hc; $('sb-away-dot').style.color = ac;
    $('sb-home-dot').style.background = hc; $('sb-away-dot').style.background = ac;
    document.documentElement.style.setProperty('--home-col', hc);
    document.documentElement.style.setProperty('--away-col', ac);
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
    const mf = $('mom-fill');
    if (mf) {
      const m = clamp(game.mom || 0, -1, 1), half = 80, w = Math.abs(m) * half;
      mf.style.left = (m >= 0 ? half : half - w) + 'px'; mf.style.width = w + 'px';
      mf.style.background = m >= 0 ? 'var(--home-col)' : 'var(--away-col)';
    }
    SFX.crowdLevel(clamp(0.25 + Math.abs(game.mom || 0) * 0.7, 0, 1));   // crowd swells with the momentum
    // ⚡ pip = your sprint stamina meter (a gold ring that empties as you sprint, refills when you don't)
    const pip = $('dash-pip');
    if (pip) {
      const ap = playerById(game.activeId);
      const e = (ap && ap.side === 'home' && !game._allAI && ap.sprintE != null) ? ap.sprintE : 1;
      const deg = Math.round(clamp(e, 0, 1) * 360);
      pip.style.background = `conic-gradient(var(--gold) ${deg}deg, rgba(120,140,130,0.22) ${deg}deg)`;
      const sprinting = !!(ap && ap._sprinting);
      pip.classList.toggle('sprinting', sprinting);          // brighten + pulse while actively surging
      pip.classList.toggle('low', e < 0.18 && !sprinting);   // dim hint when nearly empty
      const wasReady = pip._wasReady;                         // pulse the instant it refills to full
      const full = e > 0.985;
      if (full && wasReady === false) { pip.classList.remove('ready'); void pip.offsetWidth; pip.classList.add('ready'); }
      pip._wasReady = full;
    }
    // spectator: show a WATCHING badge, hide the player controls
    const badge = $('watch-badge'); if (badge) badge.classList.toggle('hidden', !game.watching);
    const arow = $('action-chip'); if (arow) arow.style.visibility = game.watching ? 'hidden' : '';
    if (pip) pip.style.visibility = game.watching ? 'hidden' : '';
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
      else if (have) { mode = 'pass'; icon = '▸'; label = 'PASS'; }
      else if (attackingPhase) { mode = 'switch'; icon = '⟳'; label = 'SWITCH'; }  // switch to carrier
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
  // ----- live "other scores" ticker (league / career) -----
  let tickerT = 0;
  function startRoundTicker(fixtures, youIdx) {
    game.ticker = null;
    if (!fixtures) return;
    const events = [], finals = {};
    fixtures.forEach((pair, i) => {
      if (i === youIdx) return;
      const sc = simMatch(pair[0], pair[1]).score;     // pre-roll the final so the table & ticker agree
      finals[i] = sc;
      for (let g = 0; g < sc[0]; g++) events.push({ t: rrange(4, 88), i, side: 0, a: pair[0], b: pair[1] });
      for (let g = 0; g < sc[1]; g++) events.push({ t: rrange(4, 88), i, side: 1, a: pair[0], b: pair[1] });
    });
    events.sort((x, y) => x.t - y.t);
    const run = {};
    events.forEach(e => { run[e.i] = run[e.i] || [0, 0]; run[e.i][e.side]++; e.ra = run[e.i][0]; e.rb = run[e.i][1]; });
    game.ticker = { events, finals, shown: 0 };
  }
  function tickTicker() {
    const tk = game.ticker; if (!tk) return;
    const min = game.clockSec / 60;
    while (tk.shown < tk.events.length && tk.events[tk.shown].t <= min) {
      const e = tk.events[tk.shown]; tk.shown++;
      showTickerLine(`${Math.round(e.t)}'  ${teamById(e.a).code} ${e.ra}–${e.rb} ${teamById(e.b).code}`);
    }
  }
  function showTickerLine(text) {
    const el = $('match-ticker'); if (!el) return;
    el.textContent = '⚽ ' + text; el.classList.add('show');
    clearTimeout(tickerT); tickerT = setTimeout(() => el.classList.remove('show'), 3400);
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
    const pc = game.passStat || { home:{att:0,comp:0}, away:{att:0,comp:0} };
    const pcH = pc.home.att ? Math.round(pc.home.comp / pc.home.att * 100) : 0;
    const pcA = pc.away.att ? Math.round(pc.away.comp / pc.away.att * 100) : 0;
    const rows = [
      ['POSSESSION', possH, 100 - possH, '%'],
      ['SHOTS', s.shots.home, s.shots.away, ''],
      ['ON TARGET', s.sot.home, s.sot.away, ''],
      ['PASS ACCURACY', pcH, pcA, '%'],
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
  function renderLineups() {
    const sheet = (team, side) => {
      const t = team.def, col = teamRenderCol(side);
      const head = `<div class="lu-crest" style="background:${col};color:${pickInk(col)}">${t.glyph}</div><div class="lu-tname">${t.name}</div>`;
      const rows = team.players.map(p =>
        `<div class="lu-row"><span class="lu-num" style="color:${col}">${p.num}</span><span class="lu-pname">${p.name || ('#' + p.num)}</span><span class="lu-ovr">${p.ovr || ''}</span><span class="lu-pos">${p.role}</span></div>`
      ).join('');
      return `<div class="lu-col">${head}<div class="lu-list">${rows}</div></div>`;
    };
    $('lu-home').innerHTML = sheet(game.home, 'home');
    $('lu-away').innerHTML = sheet(game.away, 'away');
    const meta = $('lu-meta');
    if (meta) meta.textContent = game.matchMode === 'cup' ? 'Cup' : game.matchMode === 'league' ? 'League' : game.matchMode === 'career' ? 'Career' : game.watching ? 'Exhibition · Watching' : 'Exhibition';
  }
  function renderResult() {
    const hs = game.home.score, as = game.away.score;
    $('result-title').textContent = hs === as ? 'Full Time' : (hs > as ? `${game.home.def.name} win!` : `${game.away.def.name} win!`);
    $('result-score').textContent = scoreLine();
    const mo = $('result-motm'); if (mo) mo.textContent = game.motm ? `★ Man of the Match — ${game.motm.name} (${game.motm.code}) · ${game.motm.note}` : '';
    renderStatGrid($('result-stats'));
    const sm = $('result-shotmap'); if (sm) sm.innerHTML = shotMapHTML();
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
      // auto-save the live match every couple of seconds so an exit never loses progress
      if ((game.saveT = (game.saveT || 0) + dt) > 2 && game.phase !== 'ended' && game.matchMode !== 'tutorial') { game.saveT = 0; saveMatch(); }
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
      sprintState: () => { const p = playerById(game.activeId); return p ? { id: p.id, sprintE: +(p.sprintE != null ? p.sprintE : 1).toFixed(3), sprinting: !!p._sprinting } : null; },
      wantSprint: () => { const p = playerById(game.activeId); return p ? shouldAutoSprint(p) : null; },
      allAI: (v) => { game._allAI = !!v; },
      nav: (id) => navigateTo(id),
      score: () => scoreLine(),
      startCup: (you) => startCup(you || TEAMS[0].id),
      cupPlay: () => cupPlay(),
      cup: () => game.cup,
      startLeague: (you) => startLeague(you || TEAMS[0].id),
      leaguePlay: () => leaguePlay(),
      league: () => game.league,
      leagueTable: () => leagueTable(),
      startTutorial: () => startTutorial(),
      tutorial: () => game.tutorial,
      startCareer: (you) => startCareer(you || TEAMS[0].id),
      careerAdvance: () => careerAdvance(),
      career: () => game.career,
      pen: () => game.penalty,
      penFast: (v) => { game._penFast = !!v; },
      penKick: (dir) => { penInput(dir || 'ArrowUp'); penInput('Enter'); },
      saveMatch, clearMatch, hasSaved: hasSavedMatch, resume: () => { const s = loadMatchSnap(); return s ? restoreMatch(s) : false; },
      watch: () => enterWatch(), unwatch: () => exitWatch(false), watchMatch: (a, b) => startWatchMatch(a || TEAMS[0].id, b),
      sub: (out, inn) => doSub(game.home, out, inn), autoSubTick: () => autoSubTick(),
      gfx: (v) => { game.settings.gfx = v || '3D'; updateHudLayout(); if (game.settings.gfx === '3D') ensure3D(); else showPitch3D(false); }, r3d: () => R3D,
      cam: (v) => { game.settings.cam = v || 'Side'; applyCam(); updateHudLayout(); render(); }, toggleCam: () => toggleCam(),
      half: () => game.half, secondHalf: () => startSecondHalf(), atkUp: (s) => atkUp(s),
      pollPad: () => pollGamepad(),
      setpiece: () => game.sp, spStart: (type) => triggerSetPiece(type || 'fk', type === 'corner' ? 'L' : CFG.PW/2, 6),
      spKey: (k) => spInput(k), spForce: (aim, power) => { if (game.sp) { game.sp.aim = aim; game.sp.power = power; spCommit(); } },
      sendOff: (id) => { const p = playerById(id); if (p) sendOff(p); },
      injure: (id) => { const p = playerById(id); if (p) injurePlayer(p); },
      setStam: (id, v) => { const p = playerById(id); if (p) p.stam = v; },
      // testing: end the on-screen match with a given scoreline (drives season/cup result handlers)
      finishMatch: (hs, as) => { if (!game.home) return false; game.home.score = hs|0; game.away.score = as|0; game.clockSec = HALF_SIM * 2; game.half = 2; goFulltime(); return true; },
      careerCupPlay: () => careerCupPlay(), leagueCupPlay: () => leagueCupPlay(),
      startWorldCup: (you) => startWorldCup(you || TEAMS[0].id), worldcup: () => game.worldcup,
      worldcupPlay: () => { game.worldcup.stage === 'group' ? worldcupPlay() : worldcupKOPlay(); },
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
