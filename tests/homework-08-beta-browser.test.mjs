import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => {
  if (browser) {
    await browser.close();
    assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
  }
});
const text = id => browser.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
const rows = () => browser.evaluate("[...document.querySelectorAll('#beta-table tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent))");
const set = async (a, b, successes, failures) => {
  for (const [id, value] of [['beta-a', a], ['beta-b', b], ['beta-successes', successes], ['beta-failures', failures]]) await browser.set(id, value);
};
const update = () => browser.click('update-beta');
const count = () => browser.evaluate('Object.keys(Chart.instances).length');
const chart = () => browser.evaluate(`({id:Chart.getChart('beta-density-chart').id,
  datasets:Chart.getChart('beta-density-chart').data.datasets.map(d=>({label:d.label,data:d.data}))})`);

test('HW7 Beta UI: explicit conditional Bernoulli model, likelihood transformation and plotting limits', async () => {
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  assert.equal(await count(), 0); assert.deepEqual(await rows(), []);
  const content = await browser.evaluate("document.querySelector('section[aria-labelledby=\"prior-likelihood-posterior\"]').textContent");
  assert.match(content, /independent\s+conditionally on θ/);
  assert.match(content, /not θ itself/);
  assert.match(content, /not a probability distribution over θ/);
  assert.match(content, /integral B\(s\+1,f\+1\)/);
  assert.match(content, /not the posterior\s+for a general prior/);
  assert.match(content, /No curve is renormalized/);
  assert.match(content, /Exact endpoints are excluded/);
});

test('HW7 Beta default UI: correct unrounded moments drive the table and all three density curves', async () => {
  await update();
  const table = await rows();
  assert.deepEqual(table[0], ['Distribution', 'Beta(2, 2)', 'Beta(10, 4)']);
  assert.equal(Number(table[1][1]), 0.5); assert.equal(Number(table[2][1]), 0.05);
  assert.ok(Math.abs(Number(table[1][2]) - 10 / 14) < 1e-12);
  assert.ok(Math.abs(Number(table[2][2]) - 40 / 2940) < 1e-12);
  assert.match(await text('beta-data-results'), /s = 8; f = 2; n = 10/);
  assert.match(await text('beta-data-results'), /0.800000000000/);
  const state = await chart();
  assert.deepEqual(state.datasets.map(d => d.label), ['Prior density', 'Normalized likelihood (shape only)', 'Posterior density']);
  const grid = state.datasets[0].data.map(p => p.x);
  for (const d of state.datasets) {
    assert.deepEqual(d.data.map(p => p.x), grid);
    assert.ok(d.data.every(p => p.x > 0 && p.x < 1 && Number.isFinite(p.y)));
  }
  const atHalf = state.datasets[0].data.find(p => p.x === 0.5);
  assert.ok(Math.abs(atHalf.y - 1.5) < 1e-10);
  const posteriorAtHalf = state.datasets[2].data.find(p => p.x === 0.5);
  assert.ok(Math.abs(posteriorAtHalf.y - 2860 * 0.5 ** 12) < 1e-10);
  assert.equal(await count(), 1);
});

test('HW7 Beta reruns: deterministic data, replaced chart instances, immediate clearing on edits', async () => {
  const first = await chart(), table = await rows();
  await update();
  const repeated = await chart();
  assert.notEqual(first.id, repeated.id); assert.deepEqual(first.datasets, repeated.datasets);
  assert.deepEqual(await rows(), table); assert.equal(await count(), 1);
  await browser.set('beta-a', 8);
  assert.deepEqual(await rows(), []); assert.equal(await count(), 0);
  assert.equal(await text('beta-boundary-results'), ''); assert.equal(await text('beta-update-note'), '');
  await update();
  assert.equal((await rows())[0][1], 'Beta(8, 2)');
  assert.notDeepEqual((await chart()).datasets[0].data, first.datasets[0].data);
});

test('HW7 no-data UI: posterior equals prior, undefined sample proportion and constant likelihood', async () => {
  await set(0.5, 3, 0, 0); await update();
  assert.match(await text('beta-data-results'), /Undefined: no observations/);
  assert.match(await text('beta-update-note'), /posterior equals the prior/);
  const state = await chart();
  assert.deepEqual(state.datasets[0].data, state.datasets[2].data);
  assert.ok(state.datasets[1].data.every(p => p.y === 1));
  assert.equal((await rows())[0][2], 'Beta(0.5, 3)');
});

test('HW7 alternative priors UI: uniform, asymmetric, one-sided data and singular endpoints', async () => {
  await set(1, 1, 8, 2); await update();
  let state = await chart();
  assert.ok(state.datasets[0].data.every(p => p.y === 1));
  assert.deepEqual(state.datasets[1].data, state.datasets[2].data);
  await set(2, 8, 10, 0); await update();
  assert.equal((await rows())[0][2], 'Beta(12, 8)');
  await set(2, 8, 0, 10); await update();
  assert.equal((await rows())[0][2], 'Beta(2, 18)');
  await set(0.5, 0.5, 0, 0); await update();
  assert.match(await text('beta-boundary-results'), /∞ \(theoretical endpoint singularity\)/);
  state = await chart();
  assert.ok(state.datasets[0].data.every(p => Number.isFinite(p.y) && p.x > 0 && p.x < 1));
  assert.ok(state.datasets[0].data[0].y > 300);
});

test('HW7 Beta numeric limits UI: concentrated and highly singular priors remain finite on the plot', async () => {
  for (const [a, b, s, f] of [[0.001, 1000, 0, 0], [1000, 1000, 10000, 10000]]) {
    await set(a, b, s, f); await update();
    const state = await chart();
    assert.ok(state.datasets.every(d => d.data.every(p => Number.isFinite(p.y))));
    assert.equal(await count(), 1);
    assert.match(await text('beta-feedback'), /Posterior updated/);
  }
  assert.match(await text('beta-feedback'), /underflowed to zero/);
  assert.ok((await chart()).datasets[2].data.some(p => p.y > 100));
});

test('HW7 Beta invalid inputs: readable errors and no stale result table, endpoint summary or chart', async () => {
  for (const [id, value, message] of [['beta-a', 0, /positive/], ['beta-a', 0.0001, /Interactive prior/],
    ['beta-a', 1001, /Interactive prior/], ['beta-b', -1, /positive/], ['beta-b', '', /empty values/],
    ['beta-successes', -1, /integers/], ['beta-successes', 0.5, /integers/], ['beta-failures', 10001, /integers/]]) {
    await browser.click('reset-beta'); await update();
    await browser.set(id, value);
    assert.equal(await count(), 0); assert.deepEqual(await rows(), []);
    await update();
    assert.match(await text('beta-feedback'), message);
    assert.equal(await text('beta-data-results'), ''); assert.equal(await text('beta-boundary-results'), '');
    assert.equal(await text('beta-update-note'), ''); assert.equal(await count(), 0);
  }
  await browser.click('reset-beta');
  assert.deepEqual(await browser.evaluate("['beta-a','beta-b','beta-successes','beta-failures'].map(id=>document.getElementById(id).value)"), ['2', '2', '8', '2']);
  assert.match(await text('beta-feedback'), /Reset complete/);
});

test('HW7 Beta CDN and rendering fallback: posterior and moments stay operational and recover', async () => {
  await browser.send('Network.enable'); await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8); assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await update();
  assert.equal((await rows())[0][2], 'Beta(10, 4)');
  assert.match(await text('beta-chart-warning'), /Chart.js is unavailable/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  await browser.evaluate('window.RealBetaChart=Chart;window.Chart=class{constructor(){throw Error("Rendering failure")}};void 0');
  await update();
  assert.equal((await rows())[0][2], 'Beta(10, 4)');
  assert.match(await text('beta-chart-warning'), /could not be rendered/);
  await browser.evaluate('window.Chart=RealBetaChart;void 0');
  await update(); assert.equal(await count(), 1); assert.equal(await text('beta-chart-warning'), '');
});

test('HW7 Beta component isolation: Step 2, means and diagnostic results survive its edits and reset', async () => {
  await browser.click('run-simulation');
  await browser.set('means-count', 200); await browser.set('means-max', 100); await browser.click('run-lln');
  await browser.click('calculate-conditional'); await browser.click('bayes-diagnostic-preset');
  const old = await browser.evaluate("['simulation-results','means-parameters','conditional-results','bayes-event-results'].map(id=>document.getElementById(id).textContent)");
  assert.equal(await count(), 10);
  await browser.set('beta-a', 3); assert.equal(await count(), 9);
  await update(); assert.equal(await count(), 10);
  await browser.click('reset-beta'); assert.equal(await count(), 9);
  assert.deepEqual(await browser.evaluate("['simulation-results','means-parameters','conditional-results','bayes-event-results'].map(id=>document.getElementById(id).textContent)"), old);
  await update();
  await browser.click('reset-simulation'); await browser.click('reset-means'); await browser.click('reset-bayes-event');
  assert.equal(await count(), 1); assert.equal((await rows())[0][2], 'Beta(10, 4)');
});

test('HW7 Beta responsive: default, singular, no-data, invalid and reset states fit 320, 768 and 1440px', async () => {
  const check = async width => {
    const layout = await browser.evaluate(`(() => {
      const width=document.documentElement.clientWidth;
      return {overflow:document.documentElement.scrollWidth>width,
        elements:[...document.querySelectorAll('body *')].filter(e=>{
          const r=e.getBoundingClientRect();
          return r.width>0 && (r.left < -1 || r.right > width+1 || e.scrollWidth>e.clientWidth+1);
        }).map(e=>e.tagName+'#'+e.id)};
    })()`);
    assert.deepEqual(layout, { overflow: false, elements: [] }, `${width}px`);
  };
  for (const width of [320, 768, 1440]) {
    await browser.viewport(width); await browser.click('reset-beta'); await check(width);
    await update(); await check(width);
    await set(0.5, 0.5, 0, 0); await update(); await check(width);
    await set(2, 2, 0, 0); await update(); await check(width);
    await browser.set('beta-a', ''); await update(); await check(width);
    await browser.click('reset-beta'); await check(width);
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0);
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
});
