import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
const count = () => browser.evaluate('Object.keys(Chart.instances).length');
const rows = id => browser.evaluate(`[...document.querySelectorAll('#${id} tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent))`);
const resetAll = async () => {
  for (const id of ['reset-simulation', 'reset-means', 'reset-conditional', 'reset-bayes-event', 'reset-bayes-experiments']) await browser.click(id);
};
const setValues = async values => { for (const [id, value] of Object.entries(values)) await browser.set(id, value); };
const renderAll = async () => {
  await resetAll();
  await setValues({ 'simulation-count': 200, 'simulation-max': 31, 'simulation-seed': 42 });
  await browser.click('run-simulation');
  await setValues({ 'means-count': 200, 'means-max': 100, 'means-paths': 3, 'means-seed': 42 });
  await browser.click('run-lln');
  await browser.click('calculate-conditional'); await browser.click('bayes-diagnostic-preset');
  await browser.set('bayes-scenario', 'B'); await browser.click('load-bayes-scenario');
  await browser.click('run-bayes-growth');
};
const exercise1Snapshot = () => browser.evaluate(`['simulation-results','means-parameters','lln-results','clt-results','means-scaling-table']
  .map(id=>document.getElementById(id).textContent)`);

async function clickHomepageEntry() {
  const point = await browser.evaluate(`(()=>{const a=document.querySelector('a[href="homework-08/"]');
    a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  await browser.waitFor("location.pathname === '/homework-08/' && document.readyState === 'complete'");
}

async function screenshot(name) {
  const directory = process.env.HW7_FINAL_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(directory, name), Buffer.from(shot.data, 'base64'));
}

test('HW7 final navigation: real pointer opens the unique Completed homepage card and return navigation works', async () => {
  await browser.navigate();
  const card = await browser.evaluate(`(()=>{const links=document.querySelectorAll('a[href="homework-08/"]');
    const card=links[0].closest('.card');return {count:links.length,title:card.querySelector('h3').textContent,status:card.querySelector('.status').textContent};})()`);
  assert.deepEqual(card, { count: 1, title: 'Homework 7 — Modes of Convergence & Bayesian Inference', status: 'Completed' });
  await clickHomepageEntry();
  assert.match(await browser.evaluate("document.querySelector('h1').textContent"), /HW 7/);
  assert.equal(await count(), 0);
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
  await clickHomepageEntry();
});

test('HW7 final Exercise 1: all convergence models, epsilon/seed reruns, LLN distributions, CLT sizes and degenerate Bernoulli', async () => {
  await browser.navigate(8);
  await setValues({ 'simulation-count': 200, 'simulation-max': 31 });
  for (const model of ['A', 'B', 'C']) {
    await browser.set('simulation-model', model); await browser.click('run-simulation');
    assert.match(await text('simulation-feedback'), /Simulation complete/);
    assert.equal(await count(), 4);
  }
  const getPaths = () => browser.evaluate("JSON.stringify(Chart.getChart('simulation-paths').data.datasets.map(d=>d.data))");
  const old = await getPaths();
  await setValues({ 'simulation-epsilon': 0.8, 'simulation-seed': 17 }); await browser.click('run-simulation');
  assert.notEqual(await getPaths(), old);
  const seeded = await getPaths(); await browser.click('run-simulation'); assert.equal(await getPaths(), seeded);
  await browser.set('simulation-epsilon', 0); await browser.click('run-simulation');
  assert.equal(await text('simulation-results'), ''); assert.equal(await count(), 0);
  await browser.set('simulation-epsilon', 0.5); await browser.click('run-simulation');
  await setValues({ 'means-count': 200, 'means-max': 200, 'means-paths': 3 });
  for (const distribution of ['bernoulli', 'uniform']) {
    await browser.set('means-distribution', distribution); await browser.click('run-lln');
    assert.match(await text('means-feedback'), /experiments complete/);
    for (const n of [1, 10, 100, 200]) {
      await browser.set('clt-n', n); assert.match(await text('clt-results'), new RegExp(`^n = ${n};`));
    }
    assert.equal(await count(), 8);
  }
  await browser.set('means-distribution', 'bernoulli');
  for (const p of [0, 1]) {
    await browser.set('means-p', p); await browser.click('run-lln');
    assert.match(await text('clt-results'), /standardization is undefined/);
    assert.equal(await count(), 7);
  }
  await browser.set('means-p', 0.5); await browser.click('run-lln');
  const variance = (await rows('means-scaling-table')).find(r => r[0] === '100');
  assert.equal(Number(variance[1]), 0.0025); assert.equal(Number(variance[2]), 0.05);
  assert.ok((await rows('means-dependence-table')).every(r => Number(r[3]) === 0.25));
});

test('HW7 final Exercise 2: invalid/undefined conditions, Bayes prior changes, all scenarios and Custom state preserve Exercise 1', async () => {
  await browser.navigate(8); await renderAll();
  const initial = await exercise1Snapshot();
  await browser.set('conditional-joint', 0.9); await browser.click('calculate-conditional');
  assert.equal(await text('conditional-results'), ''); assert.match(await text('conditional-feedback'), /Fréchet/);
  await setValues({ 'conditional-a': 0, 'conditional-b': 0, 'conditional-joint': 0 });
  await browser.click('calculate-conditional'); assert.match(await text('conditional-results'), /Undefined/);
  await browser.click('reset-conditional'); await browser.click('calculate-conditional');
  await browser.click('bayes-diagnostic-preset'); assert.match(await text('bayes-event-results'), /0.161016949153/);
  await browser.set('bayes-prior', 0.1); await browser.click('calculate-bayes');
  assert.match(await text('bayes-event-results'), /0.678571428571/);
  await browser.set('bayes-prior', ''); await browser.click('calculate-bayes'); assert.equal(await text('bayes-event-results'), '');
  await browser.click('bayes-diagnostic-preset');
  const diagnostic = await text('bayes-event-results');
  for (const [id, posterior] of [['A', 'Beta(9, 3)'], ['B', 'Beta(28, 22)'], ['C', 'Beta(16, 4)'], ['D', 'Beta(100, 40)']]) {
    await browser.set('bayes-scenario', id); await browser.click('load-bayes-scenario');
    assert.equal((await rows('beta-table-container'))[0][2], posterior);
  }
  await browser.set('bayes-scenario', 'B'); await browser.click('load-bayes-scenario');
  await browser.set('beta-b', 21); await browser.click('update-beta');
  assert.match(await text('bayes-scenario-state'), /^Custom/);
  assert.equal((await rows('beta-table-container'))[0][2], 'Beta(28, 23)');
  await browser.set('beta-successes', -1); await browser.click('update-beta'); assert.deepEqual(await rows('beta-table-container'), []);
  await browser.click('reset-beta'); await browser.click('update-beta');
  assert.equal((await rows('beta-table-container'))[0][2], 'Beta(10, 4)');
  await browser.click('run-bayes-growth'); assert.equal((await rows('bayes-growth-table')).at(-1)[3], 'Beta(420, 120)');
  assert.deepEqual(await exercise1Snapshot(), initial);
  assert.equal(await text('bayes-event-results'), diagnostic);
  await resetAll(); assert.equal(await count(), 0);
});

test('HW7 final chart integration: all 13 charts agree with unrounded APIs, and full reset/repeat reproduces seeded results', async () => {
  await browser.navigate(8); await renderAll();
  const inspect = () => browser.evaluate(`(()=>{
    const datasets=id=>Chart.getChart(id).data.datasets;
    const growth=BayesianSensitivityExperiments.sampleSizeExperiment(20,20);
    const same=(a,b)=>Math.abs(a-b)<1e-12;
    return {
      ids:Object.values(Chart.instances).map(c=>c.id),
      paths:JSON.stringify(datasets('simulation-paths').map(d=>d.data)),
      checks:[
        datasets('simulation-mse')[1].data.every(p=>same(p.y,ConvergenceSimulations.theoretical('A',p.x,0.5).mse)),
        datasets('means-scaling-chart')[1].data.every(p=>same(p.y,SampleMeanExperiments.meanTheory('bernoulli',0.5,p.x).sd)),
        same(datasets('bayes-prior-chart')[1].data[0].y,EventProbabilityCalculators.bayes(EventProbabilityCalculators.diagnostic).posterior),
        same(datasets('beta-density-chart')[2].data.find(p=>p.x===0.5).y,BetaBernoulliInference.density(0.5,28,22)),
        same(datasets('bayes-comparison-chart')[0].data.find(p=>p.x===0.5).y,BetaBernoulliInference.density(0.5,9,3)),
        datasets('bayes-growth-mean-chart')[0].data.every((p,i)=>same(p.y,growth[i].posteriorMoments.mean)),
        datasets('bayes-growth-variance-chart')[0].data.every((p,i)=>same(p.y,growth[i].posteriorMoments.variance))
      ]
    };
  })()`);
  const first = await inspect(); assert.equal(first.ids.length, 13); assert.ok(first.checks.every(Boolean));
  await resetAll(); assert.equal(await count(), 0);
  for (const id of ['simulation-results', 'means-parameters', 'conditional-results', 'bayes-event-results', 'beta-table-container', 'bayes-scenarios-table', 'bayes-growth-table']) assert.equal(await text(id), '');
  await renderAll(); const second = await inspect();
  assert.equal(second.ids.length, 13); assert.ok(second.ids.every(id => !first.ids.includes(id)));
  assert.ok(second.checks.every(Boolean)); assert.equal(second.paths, first.paths);
});

test('HW7 final CDN-off integration: every numerical component works without Chart.js and normal operation recovers', async () => {
  await browser.send('Network.enable'); await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8); assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await renderAll();
  assert.match(await text('simulation-feedback'), /Simulation complete/);
  assert.match(await text('means-feedback'), /experiments complete/);
  assert.match(await text('conditional-results'), /0.400000000000/);
  assert.match(await text('bayes-event-results'), /0.161016949153/);
  assert.equal((await rows('beta-table-container'))[0][2], 'Beta(28, 22)');
  assert.equal((await rows('bayes-scenarios-table')).length, 4); assert.equal((await rows('bayes-growth-table')).length, 4);
  for (const id of ['simulation-chart-warning', 'means-chart-warning', 'bayes-event-chart-warning', 'beta-chart-warning', 'bayes-comparison-warning', 'bayes-growth-warning']) assert.match(await text(id), /unavailable/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  await renderAll(); assert.equal(await count(), 13);
});

test('HW7 final responsive publication: homepage and all components together fit 320, 768 and 1440px with standard scrollbars', async () => {
  const check = async width => {
    const layout = await browser.evaluate(`(()=>{const width=document.documentElement.clientWidth;
      return {overflow:document.documentElement.scrollWidth>width,
        elements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();
          return r.width>0&&(r.left < -1||r.right>width+1||e.scrollWidth>e.clientWidth+1);
        }).map(e=>e.tagName+'#'+e.id)};})()`);
    assert.deepEqual(layout, { overflow: false, elements: [] }, `${width}px`);
  };
  for (const width of [320, 768, 1440]) {
    await browser.viewport(width); await browser.navigate(); await check(width);
    await browser.evaluate("document.querySelector('a[href=\"homework-08/\"]').scrollIntoView({block:'center'})");
    await screenshot(`homepage-${width}.png`);
    await clickHomepageEntry(); await renderAll(); await check(width); assert.equal(await count(), 13);
    await browser.evaluate('scrollTo(0,0)'); await screenshot(`homework-08-${width}.png`);
    await browser.set('simulation-epsilon', 0); await browser.click('run-simulation');
    await browser.set('bayes-prior', ''); await browser.click('calculate-bayes'); await check(width);
    await resetAll(); await check(width); assert.equal(await count(), 0);
  }
});
