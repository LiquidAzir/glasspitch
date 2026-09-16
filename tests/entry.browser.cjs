/* Full entry regression: real D-pad/Enter, coordinate-free focused clicks and mobile taps.
   Isolated profiles; no production state, external network, or accelerated game fixtures. */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/kgood/.codex/skills/develop-web-game/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.PITCH_URL || 'http://127.0.0.1:5261';
const output = process.env.PITCH_EVIDENCE || path.resolve(__dirname, '../../.visual-review/glasspitch-round2/entry/final');
fs.mkdirSync(output, { recursive: true });
const results = [], errors = [], blocked = [];
function check(name, value, detail) {
  results.push({ name, pass: !!value, detail });
  assert.ok(value, name + ' ' + JSON.stringify(detail || ''));
}
const current = p => p.evaluate(() => ({ screen: __pitch.game.screen, step: __pitch.game.ts.step, idx: __pitch.game.ts.idx, focus: document.activeElement?.dataset.action }));
async function press(p, key) { await p.keyboard.press(key); await p.waitForTimeout(60); }
async function activate(p, method = 'Enter') {
  if (method === 'click') await p.evaluate(() => document.activeElement.click());
  else await p.keyboard.press('Enter');
  await p.waitForTimeout(60);
}
async function reach(p, action) {
  for (let i = 0; i < 35; i++) {
    if ((await current(p)).focus === action) return;
    await press(p, 'ArrowDown');
  }
  throw Error('D-pad could not reach ' + action + ': ' + JSON.stringify(await current(p)));
}
async function select(p, action, method = 'Enter') { await reach(p, action); await activate(p, method); }
async function capture(p, name) { await p.screenshot({ path: path.join(output, name + '.png') }); }
async function fit(p, name) {
  const data = await p.evaluate(() => {
    const screen = document.querySelector('.screen:not(.hidden)');
    const bad = [...screen.querySelectorAll('[data-action]')].filter(e => !e.closest('.hidden') && e.getClientRects().length).map(e => {
      const r = e.getBoundingClientRect();
      return { action: e.dataset.action, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }).filter(r => r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5);
    return { bad, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  check(name + ' controls fit', !data.bad.length && data.scrollWidth <= data.width, data);
}
async function teamLayout(p, name) {
  const data = await p.evaluate(() => {
    const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
    return { card: rect('#ts-card'), header: rect('#team-select .header'), dots: rect('#ts-dots'), difficulty: rect('#ts-diff'), hint: rect('.ts-hint'), height: innerHeight };
  });
  check(name + ' club card clears header and controls', data.card.top >= data.header.bottom && data.card.bottom <= data.dots.top + 1 && data.hint.bottom <= data.height, data);
  await fit(p, name);
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    async function fresh(viewport = { width: 600, height: 600 }, phone = false) {
      const context = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1, serviceWorkers: 'block' });
      await context.route('**/*', r => new URL(r.request().url()).origin === new URL(url).origin ? r.continue() : (blocked.push(r.request().url()), r.abort()));
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__pitch);
      return { context, page };
    }

    for (const method of ['Enter', 'click']) {
      const { context, page: p } = await fresh();
      check(method + ' fresh primary is Play Now', (await current(p)).focus === 'quick-match');
      await activate(p, method);
      check(method + ' one activation starts exhibition', (await current(p)).screen === 'match');
      await p.waitForFunction(() => __pitch.r3d()?.ready);
      await p.waitForTimeout(250);
      await press(p, 'Escape');
      check(method + ' pause selects Resume', (await current(p)).screen === 'pause' && (await current(p)).focus === 'resume');
      const before = await p.evaluate(() => ({ home: __pitch.game.home.teamId, away: __pitch.game.away.teamId, score: [__pitch.game.home.score, __pitch.game.away.score] }));
      await select(p, 'quit-title', method);
      check(method + ' returning title offers Continue first', (await current(p)).focus === 'resume-saved');
      await fit(p, method + ' saved title');
      if (method === 'Enter') await capture(p, '600-saved-title');
      await p.reload();
      await p.waitForFunction(() => window.__pitch);
      await activate(p, method);
      const after = await p.evaluate(() => ({ home: __pitch.game.home.teamId, away: __pitch.game.away.teamId, score: [__pitch.game.home.score, __pitch.game.away.score] }));
      check(method + ' reload Continue preserves match', (await current(p)).screen === 'match' && JSON.stringify(before) === JSON.stringify(after), { before, after });
      await context.close();
    }

    // Previously, changing team left focus on Back, Difficulty or a carousel arrow.
    for (const method of ['Enter', 'click']) {
      for (const [name, directions] of [['back', ['ArrowDown']], ['difficulty', ['ArrowUp']], ['carousel', ['ArrowUp', 'ArrowUp']]]) {
        const { context, page: p } = await fresh();
        await select(p, 'choose-teams', method);
        for (const key of directions) await press(p, key);
        await press(p, 'ArrowRight');
        check(method + ' ' + name + ' change team restores confirmation focus', (await current(p)).focus === 'team-confirm');
        await activate(p, method);
        check(method + ' ' + name + ' pinch advances to opponent', (await current(p)).screen === 'team-select' && (await current(p)).step === 1);
        await press(p, 'ArrowRight');
        await activate(p, method);
        check(method + ' ' + name + ' opponent advances to line-ups', (await current(p)).screen === 'lineups' && (await current(p)).focus === 'kickoff-go');
        await activate(p, method);
        check(method + ' ' + name + ' customized match starts', (await current(p)).screen === 'match');
        await context.close();
      }
    }

    {
      const { context, page: p } = await fresh();
      await select(p, 'choose-teams');
      await p.keyboard.down('Enter');
      for (let i = 0; i < 4; i++) { await p.waitForTimeout(80); await p.keyboard.down('Enter'); }
      await p.keyboard.up('Enter');
      check('Held Enter advances exactly one selection stage', (await current(p)).screen === 'team-select' && (await current(p)).step === 1);
      await p.keyboard.down('Escape');
      await p.keyboard.down('Escape');
      await p.keyboard.up('Escape');
      check('Held Escape returns only to your-team stage', (await current(p)).screen === 'team-select' && (await current(p)).step === 0 && (await current(p)).focus === 'team-confirm');
      await p.keyboard.press('Escape');
      check('Back from first setup stage restores the title opener', (await current(p)).screen === 'title' && (await current(p)).focus === 'choose-teams');
      // Same-task activations specifically check the removed deferred-focus race.
      await select(p, 'choose-teams');
      const immediate = await p.evaluate(() => {
        document.activeElement.click();
        const first = { screen: __pitch.game.screen, step: __pitch.game.ts.step, action: document.activeElement.dataset.action };
        document.activeElement.click();
        return { first, second: { screen: __pitch.game.screen, action: document.activeElement.dataset.action } };
      });
      check('Immediate focused clicks stay attached to their current screen', immediate.first.step === 1 && immediate.first.action === 'team-confirm' && immediate.second.screen === 'lineups' && immediate.second.action === 'kickoff-go', immediate);
      await context.close();
    }

    for (const [name, actions, expected] of [
      ['career', ['goto-career', 'team-confirm', 'career-play', 'kickoff-go'], 'match'],
      ['watch', ['goto-watch', 'team-confirm', 'team-confirm', 'kickoff-go'], 'match'],
      ['shootout', ['goto-shootout', 'team-confirm', 'team-confirm'], 'shootout'],
      ['cup', ['goto-tournaments', 'goto-cup', 'team-confirm', 'cup-play', 'kickoff-go'], 'match'],
      ['league', ['goto-tournaments', 'goto-league', 'team-confirm', 'league-play', 'kickoff-go'], 'match'],
      ['worldcup', ['goto-tournaments', 'goto-worldcup', 'team-confirm', 'worldcup-advance', 'kickoff-go'], 'match'],
      ['tutorial', ['goto-how', 'start-tutorial'], 'match']
    ]) {
      const { context, page: p } = await fresh();
      for (const action of actions) await select(p, action);
      check(name + ' starts entirely with arrows and Enter', (await current(p)).screen === expected);
      const focused = await p.evaluate(() => { const e = document.activeElement; return !!e?.dataset.action && !e.closest('.hidden') && !!e.getClientRects().length; });
      check(name + ' gameplay focus is a visible action', focused);
      await press(p, 'Escape');
      await context.close();
    }

    for (const [name, viewport, phone] of [
      ['600', { width: 600, height: 600 }, false],
      ['390', { width: 390, height: 844 }, true],
      ['390-short', { width: 390, height: 600 }, true]
    ]) {
      const { context, page: p } = await fresh(viewport, phone);
      await fit(p, name + ' title'); await capture(p, name + '-title');
      if (phone) await p.locator('#title [data-action="choose-teams"]').tap(); else await select(p, 'choose-teams');
      await teamLayout(p, name + ' your team'); await capture(p, name + '-team');
      if (phone) await p.locator('[data-action="team-next"]').tap(); else await press(p, 'ArrowRight');
      if (phone) {
        check(name + ' team arrow stays selected after a tap', (await current(p)).focus === 'team-next');
        await p.locator('[data-action="team-confirm"]').tap();
      } else await activate(p, 'click');
      await teamLayout(p, name + ' opponent'); await capture(p, name + '-opponent');
      if (phone) await p.locator('[data-action="team-confirm"]').tap(); else await activate(p);
      await fit(p, name + ' line-ups'); await capture(p, name + '-lineups');
      if (phone) await p.locator('[data-action="kickoff-go"]').tap(); else await activate(p);
      check(name + ' input path reaches match', (await current(p)).screen === 'match');
      await p.waitForFunction(() => __pitch.r3d()?.ready); await p.waitForTimeout(300);
      await capture(p, name + '-match');
      if (phone) {
        await p.locator('.touch-menu').tap();
        check(name + ' native Menu tap pauses', (await current(p)).screen === 'pause');
        await p.locator('[data-action="resume"]').tap();
        check(name + ' native Resume tap returns', (await current(p)).screen === 'match');
        const sizes = await p.locator('.touch-btn,.touch-menu,.touch-pinch').evaluateAll(es => es.map(e => ({ text: e.textContent.trim(), width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })));
        check(name + ' real touch targets at least44px', sizes.every(s => s.width >= 44 && s.height >= 44), sizes);
        await p.locator('.touch-menu').tap(); await p.locator('#pause [data-action="quit-title"]').tap();
        await fit(p, name + ' saved title'); await capture(p, name + '-saved-title');
      } else await press(p, 'Escape');
      await context.close();
    }
    check('No JavaScript errors', errors.length === 0, errors);
    check('No external network requests', blocked.length === 0, blocked);
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ url, results, errors, blocked, passed: results.filter(r => r.pass).length }, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify({ passed: results.length, output }));
})().catch(e => { console.error(e); process.exitCode = 1; });
