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
const setup = async (model = 'A', maxN = 127, count = 1000) => {
  await browser.set('simulation-model', model);
  await browser.set('simulation-max', maxN);
  await browser.set('simulation-count', count);
};
const run = async () => {
  await browser.click('run-simulation');
  assert.match(await browser.evaluate("document.getElementById('simulation-feedback').textContent"), /Simulation complete/);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 4);
};
const summary = () => browser.evaluate("document.getElementById('simulation-results').textContent");
const chartState = () => browser.evaluate(`({
  paths: Chart.getChart('simulation-paths').data.datasets.map(d=>d.data),
  deviation: Chart.getChart('simulation-deviation').data.datasets.map(d=>d.data),
  mse: Chart.getChart('simulation-mse').data.datasets.map(d=>d.data),
  cdfs: Chart.getChart('simulation-distribution').data.datasets.map(d=>d.data),
  ids: Object.values(Chart.instances).map(c=>c.id)
})`);

test('HW7 simulations UI: starts without computed results; theory explicitly separates finite samples from proof', async () => {
  await browser.navigate(8);
  await browser.waitFor("typeof Chart === 'function'");
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 0);
  assert.equal(await summary(), '');
  const text = await browser.evaluate("document.querySelector('section[aria-labelledby=\"convergence-simulations\"]').textContent");
  assert.match(text, /finite simulation cannot prove almost sure convergence/);
  assert.match(text, /m = floor\(log₂ n\), k = n − 2\^m/);
  assert.match(text, /no almost sure convergence/);
  assert.match(text, /both L² ⇒ almost sure and probability ⇒ almost sure/);
});

test('HW7 A UI: paths visibly revisit 1 once in every complete displayed block; theoretical curves match', async () => {
  await setup('A');
  await run();
  const state = await chartState();
  assert.equal(state.paths.length, 8);
  for (const path of state.paths) {
    assert.equal(path.length, 127);
    for (let m = 0; m <= 6; m++) {
      assert.equal(path.slice(2 ** m - 1, 2 ** (m + 1) - 1).reduce((sum, p) => sum + p.y, 0), 1);
    }
  }
  state.deviation[1].forEach(point => assert.equal(point.y, 2 ** -Math.floor(Math.log2(point.x))));
  assert.deepEqual(state.deviation[1], state.mse[1]);
  assert.match(await summary(), /trajectories = 1000; maximum n = 127; ε = 0.5; seed = 42/);
  assert.match(await summary(), /Zero observed deviations do not imply zero population probability/);
});

test('HW7 B UI: paths retain a single Z; theory and estimates shrink while all four charts are replaced', async () => {
  const old = (await chartState()).ids;
  await setup('B');
  assert.equal(await summary(), '', 'Editing invalidates prior results');
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 0);
  await run();
  const state = await chartState();
  state.paths.forEach(path => path.forEach(p => assert.ok(Math.abs(p.y * p.x - path[0].y) < 1e-12)));
  state.mse[1].forEach(p => assert.equal(p.y, 1 / p.x ** 2));
  assert.ok(state.ids.every(id => !old.includes(id)));
  assert.match(await browser.evaluate("document.getElementById('simulation-model-info').textContent"), /almost surely, in L², in probability and in distribution/);
});

test('HW7 C UI: parity errors persist while marginal CDFs remain invariant and reference pairing is respected', async () => {
  await setup('C');
  await run();
  const state = await chartState();
  for (const path of state.paths) {
    assert.notEqual(path[0].y, path[1].y);
    path.forEach((p, i) => assert.equal(p.y, path[i % 2].y));
  }
  state.mse[1].forEach(p => assert.equal(p.y, p.x % 2 ? 2 : 0));
  state.deviation[0].forEach(p => assert.equal(p.y, p.x % 2 ? state.deviation[0][0].y : 0));
  assert.deepEqual(state.cdfs[0], state.cdfs[3], 'n=1 and n=127 use the same W sample');
  assert.deepEqual(state.cdfs[1], state.cdfs[2], 'n=2 and n=126 use the same Z sample');
  assert.deepEqual(state.cdfs[1], state.cdfs[4], 'Even sample equals the actual reference X=Z');
  const text = await browser.evaluate("document.getElementById('simulation-model-info').textContent");
  assert.match(text, /every marginal is N\(0, 1\)/);
  assert.match(text, /no convergence in probability, in L² or almost surely to X/);
  assert.match(text, /Identical distributions do not mean identical values/);
});

test('HW7 repeated UI runs: seeds reproduce statistics and charts, with exactly four live instances', async () => {
  const original = await chartState(), text = await summary();
  await run();
  const repeated = await chartState();
  assert.deepEqual(repeated.paths, original.paths);
  assert.deepEqual(repeated.deviation, original.deviation);
  assert.deepEqual(repeated.cdfs, original.cdfs);
  assert.equal(await summary(), text);
  await browser.set('simulation-seed', 43);
  await run();
  assert.notDeepEqual((await chartState()).paths, original.paths);
  await browser.set('simulation-seed', 42);
});

test('HW7 validation UI: invalid and empty inputs give readable errors with no old charts or results', async () => {
  for (const [id, value, message] of [
    ['simulation-epsilon', 0, /strictly positive/], ['simulation-epsilon', -1, /strictly positive/],
    ['simulation-epsilon', '', /empty values/], ['simulation-count', 5001, /Trajectories/],
    ['simulation-count', 10.5, /Trajectories/], ['simulation-max', 14, /Maximum n/],
    ['simulation-max', 1024, /Maximum n/], ['simulation-seed', -1, /Seed/]
  ]) {
    await browser.click('reset-simulation');
    await browser.set(id, value);
    await browser.click('run-simulation');
    assert.match(await browser.evaluate("document.getElementById('simulation-feedback').textContent"), message);
    assert.equal(await summary(), '');
    assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 0);
  }
  await browser.click('reset-simulation');
  await setup('A', 15, 10);
  await browser.set('simulation-epsilon', 1);
  await browser.set('simulation-seed', 0);
  await run();
  assert.ok((await chartState()).deviation.flat().every(p => p.y === 0), 'Strict threshold at ε=1');
});

test('HW7 reset UI: defaults restored and a cancelled run never publishes stale results', async () => {
  await browser.click('reset-simulation');
  await setup('A', 1023, 5000);
  await browser.evaluate(`document.getElementById('convergence-form').requestSubmit();
    document.getElementById('reset-simulation').click();`);
  await browser.evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await summary(), '');
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 0);
  assert.deepEqual(await browser.evaluate(`['simulation-model','simulation-count','simulation-max','simulation-epsilon','simulation-seed']
    .map(id=>document.getElementById(id).value)`), ['A', '2000', '127', '0.5', '42']);
  assert.match(await browser.evaluate("document.getElementById('simulation-feedback').textContent"), /Reset complete/);
});

test('HW7 async UI: maximum workload yields to timers and edits cancel old work before a new result', async () => {
  await setup('A', 1023, 5000);
  await browser.evaluate(`window.timerTicks=0; window.heartbeat=setInterval(()=>timerTicks++,0);
    document.getElementById('convergence-form').requestSubmit();`);
  await browser.waitFor("document.getElementById('simulation-feedback').textContent.includes('%')");
  await setup('C', 15, 100);
  await run();
  assert.match(await summary(), /C — Alternating normals; trajectories = 100; maximum n = 15/);
  assert.ok(await browser.evaluate('clearInterval(heartbeat); timerTicks > 1'));
});

test('HW7 CDN unavailable: actual blocked script preserves text results; charts recover on reload', async () => {
  await browser.send('Network.enable');
  await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8);
  assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await setup('B', 15, 100);
  await browser.click('run-simulation');
  assert.match(await summary(), /Estimated MSE/);
  assert.match(await browser.evaluate("document.getElementById('simulation-chart-warning').textContent"), /Chart.js is unavailable/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8);
  await browser.waitFor("typeof Chart === 'function'");
  await setup('B', 15, 100);
  await run();
  assert.equal(await browser.evaluate("document.getElementById('simulation-chart-warning').textContent"), '');
});

test('HW7 chart rendering failure: textual results survive and later reruns recover', async () => {
  await browser.click('reset-simulation');
  await browser.evaluate('window.RealChart=Chart; window.Chart=class {constructor(){throw Error("Rendering failure")}}; void 0');
  await browser.click('run-simulation');
  assert.match(await summary(), /Estimated MSE/);
  assert.match(await browser.evaluate("document.getElementById('simulation-chart-warning').textContent"), /could not be rendered/);
  await browser.evaluate('window.Chart=RealChart; void 0');
  await run();
});

test('HW7 maximum UI run: all indices calculated without monopolizing the event loop', async () => {
  await setup('A', 1023, 5000);
  await browser.evaluate(`window.maxTicks=0; window.maxHeartbeat=setInterval(()=>maxTicks++,0);
    document.getElementById('convergence-form').requestSubmit(); void 0`);
  await browser.waitFor("document.getElementById('simulation-feedback').textContent.startsWith('Simulation complete')");
  assert.ok(await browser.evaluate('clearInterval(maxHeartbeat); maxTicks > 20'));
  assert.match(await summary(), /statistics used all 1023 indices and all 5000 trajectories/);
  assert.equal((await chartState()).paths[0].length, 127);
});

test('HW7 responsive UI: pending, all three rendered models and reset fit 320, 768 and 1440px', async () => {
  const check = async width => {
    const layout = await browser.evaluate(`(() => {
      const width=document.documentElement.clientWidth;
      return {overflow:document.documentElement.scrollWidth>width,
        elements:[...document.querySelectorAll('body *')].filter(e=>{
          const r=e.getBoundingClientRect();
          return r.width>0 && (r.left < -1 || r.right > width+1 || e.scrollWidth > e.clientWidth+1);
        }).map(e=>e.tagName+'#'+e.id)};
    })()`);
    assert.deepEqual(layout, { overflow: false, elements: [] }, `${width}px`);
  };
  for (const width of [320, 768, 1440]) {
    await browser.viewport(width);
    await browser.click('reset-simulation');
    await check(width);
    for (const model of ['A', 'B', 'C']) {
      await setup(model, 31, 100);
      await run();
      await check(width);
    }
    await browser.click('reset-simulation');
    await check(width);
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0,
    'LLN, CLT, scaling and Bayesian slots remain untouched');
});
