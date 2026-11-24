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
const result = id => browser.evaluate(`Object.fromEntries([...document.querySelectorAll('#${id} dt')].map(dt=>[dt.textContent,dt.nextElementSibling.textContent]))`);
const setConditional = async (a, b, joint) => {
  await browser.set('conditional-a', a); await browser.set('conditional-b', b); await browser.set('conditional-joint', joint);
};
const setBayes = async (prior, h, notH) => {
  await browser.set('bayes-prior', prior); await browser.set('bayes-likelihood-h', h); await browser.set('bayes-likelihood-not-h', notH);
};
const count = () => browser.evaluate('Object.keys(Chart.instances).length');
const chart = () => browser.evaluate(`({
  id:Chart.getChart('bayes-prior-chart').id,
  points:Chart.getChart('bayes-prior-chart').data.datasets[0].data,
  selected:Chart.getChart('bayes-prior-chart').data.datasets[1].data,
  gaps:Chart.getChart('bayes-prior-chart').data.datasets[0].spanGaps
})`);

test('HW7 events UI: English initial state, no computed results and explicit synthetic interpretation', async () => {
  await browser.navigate(8);
  await browser.waitFor("typeof Chart === 'function'");
  assert.equal(await text('conditional-results'), '');
  assert.equal(await text('bayes-event-results'), '');
  assert.equal(await count(), 0);
  const content = await browser.evaluate("document.querySelector('section[aria-labelledby=\"bayes-theorem\"]').textContent");
  assert.match(content, /Synthetic Diagnostic Test/);
  assert.match(content, /not an individual diagnostic assessment/);
  assert.match(content, /95% does not imply a 95% probability/);
  assert.match(content, /does not create information from nothing/);
  assert.match(content, /not the full sensitivity experiment/);
});

test('HW7 conditional UI: exact numeric labels and disjoint bars distinguish the two conditioning directions', async () => {
  await browser.click('calculate-conditional');
  const values = await result('conditional-results');
  assert.equal(Number(values['P(A | B)']), 0.4);
  assert.equal(Number(values['P(B | A)']), 0.5);
  assert.equal(Number(values['P(A ∩ B)']), 0.2);
  const meters = await browser.evaluate("[...document.querySelectorAll('#conditional-visual meter')].map(e=>({value:e.value,min:e.min,max:e.max,label:e.getAttribute('aria-label')}))");
  assert.equal(meters.length, 4);
  assert.ok(meters.every(m => m.min === 0 && m.max === 1 && m.label));
  assert.ok(Math.abs(meters.reduce((s, m) => s + m.value, 0) - 1) < 1e-12);
});

test('HW7 conditional UI: incoherent inputs clear prior results; zero denominators stay undefined', async () => {
  for (const [a, b, joint, error] of [[0.9, 0.6, 0.1, /Fréchet/], [0.4, 0.5, 0.45, /Fréchet/],
    [-0.1, 0.5, 0, /between 0 and 1/], ['', 0.5, 0, /empty values/]]) {
    await setConditional(a, b, joint);
    assert.equal(await text('conditional-results'), '');
    await browser.click('calculate-conditional');
    assert.match(await text('conditional-feedback'), error);
    assert.equal(await text('conditional-visual'), '');
    assert.equal(await text('conditional-results'), '');
  }
  await setConditional(0.4, 0, 0); await browser.click('calculate-conditional');
  let r = await result('conditional-results');
  assert.match(r['P(A | B)'], /Undefined: P\(B\) = 0/);
  assert.equal(r['P(B | A)'], '0');
  await setConditional(0, 0.4, 0); await browser.click('calculate-conditional');
  r = await result('conditional-results');
  assert.equal(r['P(A | B)'], '0');
  assert.match(r['P(B | A)'], /Undefined: P\(A\) = 0/);
  await setConditional(0, 0, 0); await browser.click('calculate-conditional');
  r = await result('conditional-results');
  assert.match(r['P(A | B)'], /Undefined/); assert.match(r['P(B | A)'], /Undefined/);
});

test('HW7 diagnostic UI: expected posterior, evidence and factor, with the selected point plotted exactly', async () => {
  await browser.click('bayes-diagnostic-preset');
  const r = await result('bayes-event-results'), state = await chart();
  assert.equal(Number(r['Prior P(H)']), 0.01);
  assert.equal(Number(r['Likelihood P(E | H)']), 0.95);
  assert.equal(Number(r['Likelihood P(E | not H)']), 0.05);
  assert.ok(Math.abs(Number(r['Evidence probability P(E)']) - 0.059) < 1e-12);
  assert.match(r['Posterior P(H | E)'], /^0.161016949153/);
  assert.equal(Number(r['Bayes factor P(E | H) / P(E | not H)']), 19);
  assert.equal(state.points.length, 201);
  assert.equal(state.selected[0].x, 0.01);
  assert.ok(Math.abs(state.selected[0].y - 0.16101694915254236) < 1e-12);
  assert.equal(state.gaps, false);
  assert.equal(await count(), 1);
});

test('HW7 prior sensitivity UI: changing only prevalence moves the marker while likelihoods and curve stay fixed', async () => {
  const old = await chart();
  await browser.set('bayes-prior', 0.1);
  assert.equal(await text('bayes-event-results'), '');
  assert.equal(await count(), 0);
  await browser.click('calculate-bayes');
  const updated = await chart();
  assert.notEqual(updated.id, old.id);
  assert.deepEqual(updated.points, old.points);
  assert.equal(updated.selected[0].x, 0.1);
  assert.ok(Math.abs(updated.selected[0].y - 0.095 / 0.14) < 1e-12);
  assert.match(await text('bayes-prior-summary'), /increasing the prior increases the posterior/);
  assert.deepEqual(await browser.evaluate("['bayes-likelihood-h','bayes-likelihood-not-h'].map(id=>document.getElementById(id).value)"), ['0.95', '0.05']);
  for (let i = 0; i < 3; i++) {
    await browser.click('calculate-bayes');
    assert.equal(await count(), 1);
  }
});

test('HW7 Bayes endpoints UI: impossible evidence creates gaps, undefined results and no marker ordinate', async () => {
  for (const [prior, h, notH, impossibleAt] of [[0, 1, 0, 0], [1, 0, 1, 200], [0.5, 0, 0, null]]) {
    await setBayes(prior, h, notH); await browser.click('calculate-bayes');
    const r = await result('bayes-event-results'), state = await chart();
    assert.equal(Number(r['Evidence probability P(E)']), 0);
    assert.match(r['Posterior P(H | E)'], /Undefined: P\(E\) = 0/);
    assert.equal(state.selected[0].y, null);
    if (impossibleAt === null) assert.ok(state.points.every(p => p.y === null));
    else assert.equal(state.points[impossibleAt].y, null);
    assert.match(await text('bayes-prior-summary'), /no selected marker is drawn/);
  }
  for (const [prior, h, notH, posterior] of [[0, 1, 0.2, 0], [1, 0.2, 1, 1], [0.1, 1, 0, 1], [0.1, 0, 1, 0]]) {
    await setBayes(prior, h, notH); await browser.click('calculate-bayes');
    assert.equal((await chart()).selected[0].y, posterior);
  }
  await setBayes(0.1, 1, 0); await browser.click('calculate-bayes');
  assert.match((await result('bayes-event-results'))['Bayes factor P(E | H) / P(E | not H)'], /Undefined/);
});

test('HW7 Bayes invalid inputs and tiny evidence: no stale chart, no fake zero posterior for underflow', async () => {
  for (const [id, value] of [['bayes-prior', -1], ['bayes-prior', 1.01], ['bayes-likelihood-h', 1.1], ['bayes-likelihood-not-h', '']]) {
    await browser.click('bayes-diagnostic-preset');
    await browser.set(id, value);
    assert.equal(await count(), 0);
    await browser.click('calculate-bayes');
    assert.equal(await text('bayes-event-results'), '');
    assert.equal(await text('bayes-prior-summary'), '');
    assert.match(await text('bayes-event-feedback'), /between 0 and 1|empty values/);
  }
  await setBayes(Number.MIN_VALUE, Number.MIN_VALUE, 0); await browser.click('calculate-bayes');
  const r = await result('bayes-event-results');
  assert.match(r['Evidence probability P(E)'], /Positive.*underflow/);
  assert.match(r['Posterior P(H | E)'], /^1 /);
  assert.equal((await chart()).selected[0].y, 1);
});

test('HW7 event resets: default inputs restored, calculators and chart lifecycle stay isolated', async () => {
  await browser.click('bayes-diagnostic-preset');
  const id = (await chart()).id;
  await browser.click('reset-conditional');
  assert.equal(await text('conditional-results'), '');
  assert.equal((await chart()).id, id);
  assert.deepEqual(await browser.evaluate("['conditional-a','conditional-b','conditional-joint'].map(id=>document.getElementById(id).value)"), ['0.4', '0.5', '0.2']);
  await browser.click('calculate-conditional');
  const previous = await text('conditional-results');
  await browser.click('reset-bayes-event');
  assert.equal(await count(), 0);
  assert.equal(await text('bayes-event-results'), '');
  assert.equal(await text('conditional-results'), previous);
  assert.deepEqual(await browser.evaluate("['bayes-prior','bayes-likelihood-h','bayes-likelihood-not-h'].map(id=>document.getElementById(id).value)"), ['0.01', '0.95', '0.05']);
});

test('HW7 event CDN fallback and rendering failure: both calculators remain operational and charts recover', async () => {
  await browser.send('Network.enable');
  await browser.send('Network.setBlockedURLs', { urls: ['*cdn.jsdelivr.net*'] });
  await browser.navigate(8);
  assert.equal(await browser.evaluate('typeof Chart'), 'undefined');
  await browser.click('calculate-conditional');
  assert.equal(Number((await result('conditional-results'))['P(A | B)']), 0.4);
  await browser.click('bayes-diagnostic-preset');
  assert.match((await result('bayes-event-results'))['Posterior P(H | E)'], /^0.161016949153/);
  assert.match(await text('bayes-event-chart-warning'), /Chart.js is unavailable/);
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await browser.navigate(8); await browser.waitFor("typeof Chart === 'function'");
  await browser.evaluate('window.RealEventChart=Chart;window.Chart=class {constructor(){throw Error("Rendering failure")}};void 0');
  await browser.click('calculate-bayes');
  assert.match(await text('bayes-event-chart-warning'), /could not be rendered/);
  assert.match((await result('bayes-event-results'))['Posterior P(H | E)'], /^0.161016949153/);
  await browser.evaluate('window.Chart=RealEventChart;void 0');
  await browser.click('calculate-bayes');
  assert.equal(await count(), 1);
  assert.equal(await text('bayes-event-chart-warning'), '');
});

test('HW7 event calculators coexist with Steps 2 and 3 without invalidating their results or charts', async () => {
  await browser.click('run-simulation');
  await browser.set('means-count', 200); await browser.set('means-max', 100); await browser.click('run-lln');
  assert.equal(await count(), 9);
  const old2 = await text('simulation-results'), old3 = await text('means-parameters');
  await browser.set('bayes-prior', 0.2);
  assert.equal(await count(), 8);
  assert.equal(await text('simulation-results'), old2); assert.equal(await text('means-parameters'), old3);
  await browser.click('calculate-bayes');
  const bayes = await text('bayes-event-results');
  await browser.click('reset-simulation'); assert.equal(await count(), 5);
  await browser.click('reset-means'); assert.equal(await count(), 1);
  assert.equal(await text('bayes-event-results'), bayes);
  await browser.click('reset-bayes-event'); assert.equal(await count(), 0);
});

test('HW7 events responsive: valid, invalid, undefined and reset states fit 320, 768 and 1440px', async () => {
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
    await browser.click('reset-conditional'); await browser.click('reset-bayes-event'); await check(width);
    await browser.click('calculate-conditional'); await browser.click('bayes-diagnostic-preset'); await check(width);
    await setConditional(0.9, 0.6, 0.1); await browser.click('calculate-conditional');
    await browser.set('bayes-prior', ''); await browser.click('calculate-bayes'); await check(width);
    await setConditional(0, 0, 0); await browser.click('calculate-conditional');
    await setBayes(0.5, 0, 0); await browser.click('calculate-bayes'); await check(width);
    await browser.click('reset-conditional'); await browser.click('reset-bayes-event'); await check(width);
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0,
    'No parameter-inference or full sensitivity experiment implemented');
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
});
