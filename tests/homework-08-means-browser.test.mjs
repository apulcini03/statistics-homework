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
const chartCount = () => browser.evaluate('Object.keys(Chart.instances).length');
const setup = async (distribution = 'bernoulli', count = 1000, maxN = 200) => {
  await browser.set('means-distribution', distribution);
  await browser.set('means-count', count);
  await browser.set('means-max', maxN);
};
const run = async () => {
  await browser.click('run-lln');
  assert.match(await text('means-feedback'), /experiments complete/);
};
const rows = id => browser.evaluate(`[...document.querySelectorAll('#${id} tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent))`);

test('HW7 means UI: starts empty and distinguishes theoretical claims, density and covariance', async () => {
  await browser.navigate(8);
  await browser.waitFor("typeof Chart === 'function'");
  assert.equal(await chartCount(), 0);
  assert.equal(await text('means-parameters'), '');
  const content = await browser.evaluate("document.querySelector('main').textContent");
  assert.match(content, /finitely many paths cannot prove almost sure convergence/);
  assert.match(content, /upper bound, not an exact probability/);
  assert.match(content, /min\(1, bound\)/);
  assert.match(content, /does not make the original\s+observations normal/);
  assert.match(content, /independence is sufficient but not necessary/);
  assert.match(content, /Do not apply the i.i.d. CLT automatically/);
  assert.equal(await browser.evaluate("document.getElementById('clt-n').disabled"), true);
});

test('HW7 Bernoulli UI: LLN paths, capped probability bound, CLT and variance tables are consistent', async () => {
  await setup();
  await run();
  assert.equal(await chartCount(), 4);
  assert.match(await text('means-population'), /μ = 0.500000; σ² = 0.250000; σ = 0.500000/);
  assert.match(await text('means-parameters'), /replicas = 1000; displayed paths = 6; ε = 0.1; seed = 42/);
  assert.match(await text('lln-results'), /estimated P\(\|X̄_n − μ\| > ε\)/);
  const state = await browser.evaluate(`({
    paths:Chart.getChart('means-lln-chart').data.datasets.map(d=>d.data),
    bound:Chart.getChart('means-probability-chart').data.datasets[1].data,
    sd:Chart.getChart('means-scaling-chart').data.datasets[1].data,
    choices:[...document.getElementById('clt-n').options].map(o=>Number(o.value))
  })`);
  assert.equal(state.paths.length, 7);
  assert.ok(state.paths.at(-1).every(p => p.y === 0.5));
  assert.equal(state.bound[0].y, 1);
  assert.ok(state.bound.every(p => p.y >= 0 && p.y <= 1));
  state.sd.forEach(p => assert.ok(Math.abs(p.y - 0.5 / Math.sqrt(p.x)) < 1e-12));
  assert.deepEqual(state.choices, [1, 2, 5, 10, 30, 50, 100, 200]);
  const table = await rows('means-scaling-table'), r100 = table.find(r => r[0] === '100');
  assert.equal(Number(r100[1]), 0.0025);
  assert.equal(Number(r100[2]), 0.05);
  const dependence = await rows('means-dependence-table');
  assert.ok(dependence.every(r => Number(r[3]) === 0.25 && r[4] === dependence[0][4]));
  assert.ok(Number(dependence.at(-1)[4]) > 100 * Number(dependence.at(-1)[2]));
});

test('HW7 CLT selector: shared density bins, population standardization and no resimulation or duplicate charts', async () => {
  const before = await browser.evaluate(`({ids:Object.values(Chart.instances).map(c=>c.id),
    paths:Chart.getChart('means-lln-chart').data.datasets[0].data,
    centers:Chart.getChart('means-clt-chart').data.datasets[0].data.map(p=>p.x)})`);
  await browser.set('clt-n', 100);
  assert.match(await text('clt-results'), /n = 100; independent replicas = 1000/);
  assert.match(await text('clt-results'), /Histogram area = 1.00000/);
  const state = await browser.evaluate(`({
    ids:Object.values(Chart.instances).map(c=>c.id),
    histogram:Chart.getChart('means-clt-chart').data.datasets[0],
    normal:Chart.getChart('means-clt-chart').data.datasets[1].data,
    paths:Chart.getChart('means-lln-chart').data.datasets[0].data
  })`);
  assert.equal(state.ids.length, 4);
  assert.deepEqual(state.paths, before.paths);
  assert.deepEqual(state.histogram.data.map(p => p.x), before.centers);
  assert.equal(state.histogram.type, 'bar');
  assert.ok(state.normal.some(p => p.x === 0 && Math.abs(p.y - 1 / Math.sqrt(2 * Math.PI)) < 1e-12));
  const width = state.histogram.data[1].x - state.histogram.data[0].x;
  assert.ok(Math.abs(state.histogram.data.reduce((sum, p) => sum + p.y * width, 0) - 1) < 1e-12);
  assert.equal(before.ids.filter(id => state.ids.includes(id)).length, 3, 'Only the CLT chart changes');
});

test('HW7 mean reruns: seed reproduces results, edits clear all three sections and Uniform uses σ²=1/12', async () => {
  const original = await rows('means-scaling-table');
  await run();
  assert.deepEqual(await rows('means-scaling-table'), original);
  await browser.set('means-seed', 43);
  assert.equal(await text('means-parameters'), '');
  assert.deepEqual(await rows('means-scaling-table'), []);
  assert.deepEqual(await rows('means-dependence-table'), []);
  assert.equal(await chartCount(), 0);
  await run();
  assert.notDeepEqual(await rows('means-scaling-table'), original);
  await setup('uniform');
  assert.equal(await browser.evaluate("document.getElementById('means-p').disabled"), true);
  await browser.set('means-p', ''); // Irrelevant disabled parameter must not reject Uniform.
  await run();
  assert.match(await text('means-population'), /σ² = 0.0833333/);
  assert.match(await text('means-parameters'), /Bernoulli p unused/);
  const row = (await rows('means-scaling-table')).find(r => r[0] === '100');
  assert.ok(Math.abs(Number(row[1]) - 1 / 1200) < 1e-9);
  assert.equal(await chartCount(), 4);
});

test('HW7 p=0 and p=1: exact constant means, explicit σ=0 state and no misleading standardized chart', async () => {
  for (const p of [0, 1]) {
    await browser.click('reset-means');
    await setup('bernoulli', 200, 100);
    await browser.set('means-p', p);
    await run();
    assert.equal(await chartCount(), 3);
    assert.match(await text('clt-results'), /σ = 0: standardization is undefined/);
    assert.equal(await browser.evaluate("Chart.getChart('means-clt-chart') === undefined"), true);
    const table = await rows('means-scaling-table');
    assert.ok(table.every(r => r.slice(1).every(v => Number(v) === 0)));
    const values = await browser.evaluate("Chart.getChart('means-lln-chart').data.datasets.flatMap(d=>d.data.map(p=>p.y))");
    assert.ok(values.every(v => v === p));
    assert.doesNotMatch(await text('lln-results') + await text('clt-results'), /NaN|Infinity/);
  }
  await browser.set('means-p', 0.5);
  await run();
  assert.equal(await chartCount(), 4);
});

test('HW7 means validation: invalid numbers never leave stale tables, plots or CLT choices', async () => {
  for (const [id, value, message] of [
    ['means-p', -0.1, /between 0 and 1/], ['means-p', 1.1, /between 0 and 1/],
    ['means-p', '', /empty values/], ['means-count', 199, /Replicas/], ['means-count', 5001, /Replicas/],
    ['means-max', 2001, /Maximum n/], ['means-max', 0, /Maximum n/],
    ['means-paths', 9, /Displayed paths/], ['means-paths', 1.5, /Displayed paths/],
    ['means-epsilon', 0, /strictly positive/], ['means-epsilon', '', /empty values/], ['means-seed', -1, /Invalid seed/]
  ]) {
    await browser.click('reset-means');
    await browser.set(id, value);
    await browser.click('run-lln');
    assert.match(await text('means-feedback'), message);
    assert.equal(await chartCount(), 0);
    assert.equal(await text('means-parameters'), '');
    assert.equal(await browser.evaluate("document.getElementById('clt-n').disabled"), true);
  }
});

test('HW7 means reset and asynchronous cancellation: no obsolete publication after reset or edits', async () => {
  await browser.click('reset-means');
  await setup('bernoulli', 5000, 2000);
  await browser.evaluate(`document.getElementById('means-form').requestSubmit();
    document.getElementById('reset-means').click(); void 0`);
  await browser.evaluate('new Promise(resolve=>setTimeout(resolve,60))');
  assert.match(await text('means-feedback'), /Reset complete/);
  assert.equal(await chartCount(), 0);
  assert.deepEqual(await browser.evaluate(`['means-distribution','means-p','means-count','means-max','means-paths','means-epsilon','means-seed']
    .map(id=>document.getElementById(id).value)`), ['bernoulli', '0.5', '3000', '500', '6', '0.1', '42']);
  await setup('bernoulli', 5000, 2000);
  await browser.evaluate("document.getElementById('means-form').requestSubmit(); void 0");
  await browser.waitFor("document.getElementById('means-feedback').textContent.includes('%')");
  await setup('uniform', 200, 3);
  await run();
  assert.match(await text('means-parameters'), /Uniform\(0,1\).*maximum n = 3; replicas = 200/);
  assert.deepEqual(await browser.evaluate("[...document.getElementById('clt-n').options].map(o=>o.value)"), ['1', '2', '3']);
});

test('HW7 means maximum workload: yields to the event loop, bounds displayed points and keeps full numerical samples', async () => {
  await setup('uniform', 5000, 2000);
  await browser.evaluate(`window.meansTicks=0;window.meansHeartbeat=setInterval(()=>meansTicks++,0);
    document.getElementById('means-form').requestSubmit(); void 0`);
  await browser.waitFor("document.getElementById('means-feedback').textContent.startsWith('Sample-mean experiments complete')");
  assert.ok(await browser.evaluate('clearInterval(meansHeartbeat); meansTicks > 50'));
  assert.equal((await rows('means-scaling-table')).at(-1)[0], '2000');
  assert.ok(await browser.evaluate("Chart.getChart('means-lln-chart').data.datasets.every(d=>d.data.length<=300)"));
  await browser.set('clt-n', 2000);
  assert.match(await text('clt-results'), /independent replicas = 5000/);
  assert.equal(await chartCount(), 4);
});

test('HW7 means CDN blocked: numerical tables and CLT summaries remain operational', async () => {
  await browser.send('Network.enable');
  await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8);
  assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await setup('bernoulli', 200, 100);
  await run();
  assert.equal((await rows('means-scaling-table')).length, 7);
  assert.equal((await rows('means-dependence-table')).length, 7);
  assert.match(await text('means-chart-warning'), /Chart.js is unavailable/);
  await browser.set('clt-n', 100);
  assert.match(await text('clt-results'), /empirical variance of Z_n/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8);
  await browser.waitFor("typeof Chart === 'function'");
});

test('HW7 means and Step 2 run together: their charts, parameters and resets are isolated', async () => {
  await browser.click('run-simulation');
  const step2 = await browser.evaluate(`({ids:Object.values(Chart.instances).map(c=>c.id),
    text:document.getElementById('simulation-results').textContent})`);
  await setup('bernoulli', 200, 100);
  await run();
  assert.equal(await chartCount(), 8);
  await browser.set('clt-n', 10);
  await browser.click('reset-means');
  assert.equal(await chartCount(), 4);
  assert.deepEqual(await browser.evaluate('Object.values(Chart.instances).map(c=>c.id)'), step2.ids);
  assert.equal(await text('simulation-results'), step2.text);
  await run();
  await browser.click('reset-simulation');
  assert.equal(await chartCount(), 4);
  assert.match(await text('means-feedback'), /experiments complete/);
});

test('HW7 means responsive: tables and charts fit at 320, 768 and 1440px, including degenerate and reset states', async () => {
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
    await browser.viewport(width);
    await browser.click('reset-means'); await check(width);
    for (const distribution of ['bernoulli', 'uniform']) {
      await setup(distribution, 200, 100);
      await run(); await check(width);
    }
    await setup('bernoulli', 200, 100); await browser.set('means-p', 0);
    await run(); await check(width);
    await browser.click('reset-means'); await check(width);
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0);
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
});
