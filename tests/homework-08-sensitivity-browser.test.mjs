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
const rows = id => browser.evaluate(`[...document.querySelectorAll('#${id} tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent))`);
const count = () => browser.evaluate('Object.keys(Chart.instances).length');
const load = async id => { await browser.set('bayes-scenario', id); await browser.click('load-bayes-scenario'); };

test('HW7 sensitivity UI: synthetic initial state, no automatic graphs and no overall conclusions', async () => {
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  assert.equal(await count(), 0);
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.deepEqual(await rows('bayes-scenarios-table'), []);
  const content = await browser.evaluate("document.querySelector('section[aria-labelledby=\"bayesian-experiments\"]').textContent");
  assert.match(content, /synthetic counts/);
  assert.match(content, /not automatically better or worse/);
  assert.match(content, /not a proof/);
  assert.match(content, /not the final conclusions/);
  assert.match(await browser.evaluate("document.getElementById('bayesian-results').closest('section').textContent"), /completed in Step 7/);
});

test('HW7 scenario loading: A–D update Step 5 controls, moments and its three curves using computed results', async () => {
  const expected = [
    ['A', ['1', '1', '8', '2'], 'Beta(9, 3)', 0.75],
    ['B', ['20', '20', '8', '2'], 'Beta(28, 22)', 0.56],
    ['C', ['8', '2', '8', '2'], 'Beta(16, 4)', 0.8],
    ['D', ['20', '20', '80', '20'], 'Beta(100, 40)', 5 / 7]
  ];
  for (const [id, inputs, posterior, mean] of expected) {
    await load(id);
    assert.deepEqual(await browser.evaluate("['beta-a','beta-b','beta-successes','beta-failures'].map(id=>document.getElementById(id).value)"), inputs);
    const betaRows = await rows('beta-table-container');
    assert.equal(betaRows[0][2], posterior);
    assert.ok(Math.abs(Number(betaRows[1][2]) - mean) < 1e-12);
    assert.match(await text('bayes-scenario-state'), new RegExp(`^Scenario ${id} —`));
    assert.equal(await browser.evaluate("Chart.getChart('beta-density-chart').data.datasets.length"), 3);
    assert.equal(await count(), 2);
  }
  const previous = await text('bayes-scenario-state');
  await browser.set('bayes-scenario', 'A');
  assert.equal(await text('bayes-scenario-state'), previous, 'Selecting without loading does not change applied scenario attribution');
});

test('HW7 prior comparison table and plot: only A/B/C are plotted, with a common grid and correct numeric moments', async () => {
  const table = await rows('bayes-scenarios-table');
  assert.equal(table.length, 4);
  const expected = [[0.75, 27 / 1872], [0.56, 616 / 127500], [0.8, 64 / 8400], [5 / 7, 4000 / 2763600]];
  table.forEach((row, i) => {
    assert.ok(Math.abs(Number(row[6]) - expected[i][0]) < 1e-8);
    assert.ok(Math.abs(Number(row[7]) - expected[i][1]) < 1e-9);
    assert.equal(Number(row[8]), 0.8);
  });
  const plot = await browser.evaluate("Chart.getChart('bayes-comparison-chart').data.datasets.map(d=>({label:d.label,data:d.data}))");
  assert.equal(plot.length, 3);
  assert.deepEqual(plot.map(d => d.label[0]), ['A', 'B', 'C']);
  plot.forEach(d => assert.deepEqual(d.data.map(p => p.x), plot[0].data.map(p => p.x)));
  const half = plot[0].data.find(p => p.x === 0.5);
  assert.ok(Math.abs(half.y - 495 * 0.5 ** 10) < 1e-11);
  const originalIds = await browser.evaluate('Object.values(Chart.instances).map(c=>c.id)');
  await browser.click('compare-bayes-priors');
  assert.equal(await count(), 2);
  const updatedIds = await browser.evaluate('Object.values(Chart.instances).map(c=>c.id)');
  assert.equal(updatedIds.filter(id => originalIds.includes(id)).length, 1, 'Only the comparison chart is replaced');
});

test('HW7 preset attribution: edits, invalid values, unannounced programmatic changes and resets become Custom', async () => {
  await load('B'); await browser.set('beta-a', 21);
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.deepEqual(await rows('beta-table-container'), []);
  await browser.click('update-beta');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.equal((await rows('beta-table-container'))[0][2], 'Beta(29, 22)');
  await load('B');
  await browser.evaluate("document.getElementById('beta-successes').value='9';void 0");
  await browser.click('update-beta');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  await load('C'); await browser.set('beta-b', ''); await browser.click('update-beta');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.deepEqual(await rows('beta-table-container'), []);
  await load('A'); await browser.click('reset-beta');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.equal(await count(), 1, 'Resetting Step 5 preserves the independent scenario comparison');
});

test('HW7 growth experiment: correct fixed-prior rows, weights, means and variances drive both plots', async () => {
  await browser.click('run-bayes-growth');
  const table = await rows('bayes-growth-table');
  assert.deepEqual(table.map(r => r[0]), ['10', '50', '100', '500']);
  const expected = [[28, 22, 0.56], [60, 30, 2 / 3], [100, 40, 5 / 7], [420, 120, 7 / 9]];
  table.forEach((r, i) => {
    assert.equal(r[3], `Beta(${expected[i][0]}, ${expected[i][1]})`);
    assert.ok(Math.abs(Number(r[4]) - expected[i][2]) < 1e-8);
    assert.ok(Math.abs(Number(r[6]) - (expected[i][2] - 0.8)) < 1e-8);
    assert.ok(Math.abs(Number(r[7]) - 40 / (40 + Number(r[0]))) < 1e-8);
  });
  const data = await browser.evaluate(`({means:Chart.getChart('bayes-growth-mean-chart').data.datasets.map(d=>d.data),
    variances:Chart.getChart('bayes-growth-variance-chart').data.datasets[0].data})`);
  assert.ok(data.means[1].every(p => p.y === 0.8));
  data.means[0].forEach((p, i) => assert.ok(Math.abs(p.y - expected[i][2]) < 1e-15));
  data.variances.forEach((p, i) => {
    const [a, b] = expected[i];
    assert.ok(Math.abs(p.y - a * b / ((a + b) ** 2 * (a + b + 1))) < 1e-15);
  });
  assert.match(await text('bayes-growth-interpretation'), /variance decreases/);
});

test('HW7 custom growth prior: clears obsolete results, isolates state and retains nonmonotone finite variance', async () => {
  const scenarios = await rows('bayes-scenarios-table');
  await browser.set('bayes-growth-a', 0.001);
  assert.deepEqual(await rows('bayes-growth-table'), []);
  assert.equal(await browser.evaluate("Chart.getChart('bayes-growth-mean-chart') === undefined"), true);
  await browser.set('bayes-growth-b', 1000); await browser.click('run-bayes-growth');
  assert.match(await text('bayes-growth-summary'), /Beta\(0.001, 1000\)/);
  assert.match(await text('bayes-growth-interpretation'), /not decreasing at every displayed sample size/);
  const variance = await browser.evaluate("Chart.getChart('bayes-growth-variance-chart').data.datasets[0].data");
  assert.ok(variance[1].y > variance[0].y);
  assert.deepEqual(await rows('bayes-scenarios-table'), scenarios);
  await browser.set('bayes-growth-a', ''); await browser.click('run-bayes-growth');
  assert.match(await text('bayes-growth-feedback'), /empty values/);
  assert.deepEqual(await rows('bayes-growth-table'), []);
  assert.equal(await browser.evaluate("Chart.getChart('bayes-growth-variance-chart') === undefined"), true);
});

test('HW7 sensitivity resets and repeated runs: clear all owned charts and restore defaults without duplicates', async () => {
  await browser.click('reset-bayes-experiments');
  assert.equal(await count(), 0);
  assert.deepEqual(await rows('bayes-scenarios-table'), []); assert.deepEqual(await rows('bayes-growth-table'), []);
  assert.deepEqual(await browser.evaluate("['bayes-growth-a','bayes-growth-b'].map(id=>document.getElementById(id).value)"), ['20', '20']);
  assert.equal(await browser.evaluate("document.getElementById('bayes-scenario').value"), 'A');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  for (let i = 0; i < 3; i++) {
    await load('A'); await browser.click('run-bayes-growth');
    assert.equal(await count(), 4);
  }
});

test('HW7 sensitivity fallback: CDN unavailable and rendering failures preserve tables and loaded Step 5 results', async () => {
  await browser.send('Network.enable'); await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8); assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await load('D'); await browser.click('run-bayes-growth');
  assert.equal((await rows('beta-table-container'))[0][2], 'Beta(100, 40)');
  assert.equal((await rows('bayes-scenarios-table')).length, 4);
  assert.equal((await rows('bayes-growth-table')).length, 4);
  assert.match(await text('bayes-comparison-warning'), /Chart.js is unavailable/);
  assert.match(await text('bayes-growth-warning'), /Chart.js is unavailable/);
  assert.match(await text('bayes-scenario-state'), /^Scenario D/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  await browser.evaluate('window.RealSensitivityChart=Chart;window.Chart=class{constructor(){throw Error("Rendering failure")}};void 0');
  await browser.click('compare-bayes-priors'); await browser.click('run-bayes-growth');
  assert.match(await text('bayes-comparison-warning'), /could not be rendered/);
  assert.match(await text('bayes-growth-warning'), /could not be rendered/);
  assert.equal((await rows('bayes-growth-table')).length, 4);
  await browser.evaluate('window.Chart=RealSensitivityChart;void 0');
  await load('B'); await browser.click('run-bayes-growth'); assert.equal(await count(), 4);
});

test('HW7 sensitivity isolation: convergence, sample-mean and diagnostic calculators remain independent', async () => {
  await browser.click('run-simulation');
  await browser.set('means-count', 200); await browser.set('means-max', 100); await browser.click('run-lln');
  await browser.click('calculate-conditional'); await browser.click('bayes-diagnostic-preset');
  const old = await browser.evaluate("['simulation-results','means-parameters','conditional-results','bayes-event-results'].map(id=>document.getElementById(id).textContent)");
  assert.equal(await count(), 13);
  await load('C'); await browser.click('reset-bayes-experiments');
  assert.equal(await count(), 9);
  assert.deepEqual(await browser.evaluate("['simulation-results','means-parameters','conditional-results','bayes-event-results'].map(id=>document.getElementById(id).textContent)"), old);
  await browser.click('reset-simulation'); await browser.click('reset-means'); await browser.click('reset-bayes-event');
  assert.equal(await count(), 0);
});

test('HW7 sensitivity responsive: scenario tables, custom results, invalid and reset states fit 320, 768 and 1440px', async () => {
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
    await browser.viewport(width); await browser.click('reset-bayes-experiments'); await check(width);
    await load('B'); await browser.click('run-bayes-growth'); await check(width);
    await browser.set('bayes-growth-a', 0.001); await browser.set('bayes-growth-b', 1000);
    await browser.click('run-bayes-growth'); await check(width);
    await browser.set('bayes-growth-a', ''); await browser.click('run-bayes-growth'); await check(width);
    await browser.click('reset-bayes-experiments'); await check(width);
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0);
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
});
