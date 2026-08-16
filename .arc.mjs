import { chromium } from 'playwright';
const dir = '/tmp/claude-0/-home-user-Bloodline/f99fd3f0-4d81-56f8-860f-11f64f2faa0a/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
let native = 0; const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('dialog', async d => { native++; await d.accept(); });

const career = () => p.evaluate(() => { const c = localStorage.getItem('bloodline_career'); return c ? JSON.parse(c).data : null; });
const yard = () => p.evaluate(() => { const s = localStorage.getItem('bloodline_stable'); return s ? JSON.parse(s).data : null; });
const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    const n = await p.$('.notice-modal');
    if (!n) break;
    const t = (await p.textContent('.notice-title'))?.trim();
    if (t && !/No Training Yet/.test(t)) seen.push(t);
    const btns = await p.$$('.notice-btn');
    await btns[btns.length - 1].click();
    await p.waitForTimeout(200);
  }
};
const seen = [];

await p.addInitScript(() => localStorage.setItem('skipRaceUnlocked', 'true'));
await p.goto('http://localhost:5173/?test-career', { waitUntil: 'networkidle' });
await p.selectOption('#division', 'maiden');
await p.fill('#horse-legacy-points', '0');
await p.fill('#stable-legacy-points', '0');
await p.click('.cash-btn[data-amount="10000"]');   // a bare new yard, the worst case
await p.click('#start-btn');
await p.waitForSelector('.stable-hub');

console.log('=== hub at debut ===');
console.log(' ', (await p.textContent('.profile-meta')).replace(/\s+/g, ' ').trim());
console.log(' ', (await p.textContent('.profile-condition')).replace(/\s+/g, ' ').trim());
console.log('  rest button present:', !!(await p.$('#nav-rest')));
console.log('  retire link present:', !!(await p.$('#nav-retire')));
await p.screenshot({ path: dir + '/arc-hub.png' });

async function raceOnce(n) {
  // Injured horses cannot enter; rest instead.
  const c = await career();
  if ((c.weeksInjured ?? 0) > 0) {
    await p.click('#nav-rest');
    await p.waitForTimeout(400);
    await dismiss();
    return 'rested';
  }
  await p.click('#nav-race-calendar');
  await p.waitForTimeout(300);
  await dismiss();
  const card = await p.$('.race-card');
  if (!card) return 'no-race';
  await card.click();
  await p.waitForSelector('.raceday-screen', { timeout: 5000 });
  await p.click('#go-btn');
  await p.waitForSelector('.race-intro-cue', { timeout: 8000 });
  await p.click('.race-intro-cue');
  await p.waitForSelector('#skip-race-btn');
  await p.click('.stage');
  await p.waitForFunction(() => { const x = document.querySelector('#skip-race-btn'); return x && !x.disabled; }, { timeout: 15000 });
  await p.click('#skip-race-btn');
  await p.waitForSelector('.results-screen', { timeout: 25000 });
  await p.waitForTimeout(400);
  await dismiss();
  await p.click('#return-btn');
  await p.waitForSelector('.stable-hub, .career-recap', { timeout: 10000 });
  return (await p.$('.career-recap')) ? 'recap' : 'ok';
}

console.log('\n=== racing a full career in a BARE yard ===');
for (let i = 1; i <= 24; i++) {
  const r = await raceOnce(i);
  if (r === 'recap') { console.log(`  race ${i}: career ended`); break; }
  const c = await career();
  if (!c) { console.log(`  race ${i}: career cleared`); break; }
  if (i % 4 === 0 || r === 'rested') {
    console.log(`  ${String(i).padStart(2)}: age ${c.horse.age} · cond ${Math.round(c.horse.condition)} · morale ${Math.round(c.horse.morale)} · spd ${Math.round(c.horse.stats.speed)}/${Math.round(c.horse.potential.speed)} · legacy ${c.horseLegacy.points}${r === 'rested' ? '  (rested — injured)' : ''}`);
  }
}

console.log('\n  notices seen:', [...new Set(seen)].join(' | ') || '(none)');

const c = await career();
if (c) {
  console.log('\n=== end of career ===');
  console.log('  age', c.horse.age, '| races', c.stats.racesCompleted, '| stage tag:', (await p.textContent('.stage-tag'))?.trim());
  const advice = await p.$('.retire-advice-text');
  if (advice) console.log('  trainer:', (await advice.textContent()).replace(/\s+/g,' ').trim());
  await p.screenshot({ path: dir + '/arc-late.png' });

  console.log('\n=== retiring on the player\'s call ===');
  await p.click('#nav-retire');
  await p.waitForSelector('.notice-modal');
  console.log(' ', (await p.textContent('.notice-modal')).replace(/\s+/g,' ').trim().slice(0, 190));
  const btns = await p.$$('.notice-btn');
  await btns[btns.length - 1].click();
  await p.waitForSelector('.career-recap', { timeout: 8000 });
}

const newGame = await p.$('#new-game-btn');
if (!newGame) {
  await p.click('.career-recap #new-game-btn').catch(()=>{});
}
const rb = await p.$('#new-game-btn');
if (rb) { await rb.click(); await p.waitForTimeout(600); await dismiss(); }

const y = await yard();
console.log('\n=== bloodstock ===');
console.log('  horses in the yard:', y?.bloodstock?.length ?? 0);
for (const bs of y?.bloodstock ?? []) {
  console.log(`   ${bs.horse.name}: ${bs.wins}w/${bs.starts} · retired at ${bs.horse.age} · peak ${bs.legacyPeak} · injury-ended ${bs.retiredByInjury}`);
}
console.log('  archived prestige:', y?.legacy?.archivedPoints);

console.log('\n' + (native === 0 ? 'PASS: zero native alerts' : `FAIL: ${native} native alerts`));
if (errs.length) console.log('PAGE ERRORS:\n  ' + [...new Set(errs)].join('\n  '));
await b.close();
