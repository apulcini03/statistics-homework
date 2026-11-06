import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
const screenshots = process.env.LEBESGUE_SCREENSHOT_DIR;
before(async () => {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await startBrowser();
});
after(async () => {
  if (!browser) return;
  await browser.close();
  assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
});

test('Lebesgue UI: defaults and all catalog functions/methods with repeated chart replacement', async () => {
  await browser.viewport(1440);
  await browser.navigate(6);
  assert.equal(await browser.evaluate('lebesgueLevels.value'), '20');
  assert.equal(await browser.evaluate('lebesgueSamples.value'), '2000');
  assert.equal(await browser.evaluate('lebesgueMethod.value'), 'midpoint');
  assert.equal(await browser.evaluate('lebesgueFunction.options.length'), 7);
  let previousIds = [];
  for (const id of ['sin', 'square', 'step', 'absolute', 'inverseSqrt', 'indicator', 'sinc']) {
    await browser.set('lebesgueFunction', id);
    for (const method of ['lower', 'midpoint', 'upper']) {
      await browser.set('lebesgueMethod', method);
      await browser.click('calculateLebesgueBtn');
      const result = await browser.evaluate(`(()=>{
        const expected=calculateLebesgue(lebesgueFunction.value,20,2000,lebesgueMethod.value);
        return {summary:lebesgueResults.textContent,note:lebesguePlotNote.textContent,expected,
          measure:Chart.getChart('lebesgueMeasuresChart').data.datasets[0].data,
          contributions:Chart.getChart('lebesgueContributionsChart').data.datasets[0].data,
          ids:Object.keys(Chart.instances)};
      })()`);
      assert.equal(result.ids.length, 2);
      assert.ok(result.ids.every(chartId => !previousIds.includes(chartId)));
      previousIds = result.ids;
      assert.match(result.summary, /Requested levels K: 20/);
      assert.match(result.summary, /Domain midpoint samples M: 2000/);
      assert.match(result.summary, /Function evaluations: 2000/);
      assert.match(result.summary, /not rigorous bounds/);
      assert.ok(result.summary.includes(result.expected.approximation.toPrecision(12)));
      assert.ok(Math.abs(result.measure.reduce((a, b) => a + b, 0) - result.expected.domainLength) < 1e-12);
      assert.ok(Math.abs(result.contributions.reduce((a, b) => a + b, 0) - result.expected.numericalContribution) < 1e-12);
      if (id === 'inverseSqrt') {
        assert.match(result.summary, /\(hybrid\)/);
        assert.match(result.summary, /Analytic contribution: 0\.200000000000/);
        assert.match(result.summary, /Level-discretized interval: \[0\.01, 1\]/);
        assert.match(result.note, /analytic contribution.*separately/);
      }
    }
  }
});

test('Lebesgue UI: independent K/M, degenerate sampled range and grouped maximum rendering', async () => {
  await browser.navigate(6);
  await browser.set('lebesgueFunction', 'square');
  await browser.set('lebesgueLevels', '10000');
  await browser.set('lebesgueSamples', '1');
  await browser.click('calculateLebesgueBtn');
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Levels used: 1/);
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Degenerate sampled range/);
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Approximation: 0\.250000000000/);
  await browser.set('lebesgueSamples', '100000');
  await browser.click('calculateLebesgueBtn');
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Levels used: 10000/);
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Function evaluations: 100000/);
  assert.match(await browser.evaluate('lebesguePlotNote.textContent'), /200 bars for 10000 levels/);
  const data = await browser.evaluate(`Chart.getChart('lebesgueMeasuresChart').data.datasets[0].data`);
  assert.equal(data.length, 200);
  assert.ok(Math.abs(data.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  await browser.set('lebesgueLevels', '7');
  await browser.click('calculateLebesgueBtn');
  assert.match(await browser.evaluate('lebesgueResults.textContent'), /Function evaluations: 100000/);
  assert.equal(await browser.evaluate(`Chart.getChart('lebesgueMeasuresChart').data.labels.length`), 7);
});

test('Lebesgue UI: invalid inputs retain previous plots and recover on valid inputs', async () => {
  await browser.navigate(6);
  await browser.click('calculateLebesgueBtn');
  const ids = await browser.evaluate('Object.keys(Chart.instances)');
  for (const [field, invalids] of [
    ['lebesgueLevels', ['', '-1', '0', '1.5', '10001', '1e100']],
    ['lebesgueSamples', ['', '-1', '0', '1.5', '100001', '1e100']]
  ]) {
    for (const raw of invalids) {
      await browser.set(field, raw);
      await browser.click('calculateLebesgueBtn');
      assert.match(await browser.evaluate('lebesgueResults.textContent'), /integer/);
      assert.match(await browser.evaluate('lebesguePlotNote.textContent'), /last successful calculation/);
      assert.deepEqual(await browser.evaluate('Object.keys(Chart.instances)'), ids);
    }
    await browser.set(field, field === 'lebesgueLevels' ? '20' : '2000');
  }
  await browser.click('calculateLebesgueBtn');
  assert.notDeepEqual(await browser.evaluate('Object.keys(Chart.instances)'), ids);
});

test('Lebesgue UI: Riemann and level charts coexist without changing each other', async () => {
  await browser.navigate(6);
  await browser.set('riemannFunction', 'square');
  await browser.set('riemannMethod', 'right');
  await browser.click('calculateRiemannBtn');
  const original = await browser.evaluate(`({summary:riemannResults.textContent,
    data:Chart.getChart('riemannChart').data,id:Chart.getChart('riemannChart').id})`);
  await browser.click('calculateLebesgueBtn');
  await browser.set('lebesgueFunction', 'inverseSqrt');
  await browser.set('lebesgueMethod', 'upper');
  await browser.click('calculateLebesgueBtn');
  assert.deepEqual(await browser.evaluate(`({summary:riemannResults.textContent,
    data:Chart.getChart('riemannChart').data,id:Chart.getChart('riemannChart').id})`), original);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 3);
  const levelIds = await browser.evaluate(`['lebesgueMeasuresChart','lebesgueContributionsChart'].map(id=>Chart.getChart(id).id)`);
  await browser.set('riemannIntervals', '100');
  await browser.click('calculateRiemannBtn');
  assert.deepEqual(await browser.evaluate(`['lebesgueMeasuresChart','lebesgueContributionsChart'].map(id=>Chart.getChart(id).id)`), levelIds);
});

test('Lebesgue UI: charts and controls fit 320px and desktop before and after repeated calculations', async () => {
  await browser.viewport(320);
  await browser.navigate(6);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth'), 320);
  for (const width of [320, 1440]) {
    await browser.viewport(width);
    for (const id of ['square', 'step', 'inverseSqrt', 'sinc']) {
      await browser.set('lebesgueFunction', id);
      await browser.click('calculateLebesgueBtn');
      const sizes = await browser.evaluate(`({client:document.documentElement.clientWidth,
        scroll:document.documentElement.scrollWidth,
        charts:['lebesgueMeasuresChart','lebesgueContributionsChart'].map(id=>{
          const c=Chart.getChart(id);return {width:c.width,height:c.height}})})`);
      if (width === 320) assert.equal(sizes.client, 320);
      else assert.ok(sizes.client <= width && sizes.client >= width - 20,
        'Desktop content width may exclude a native vertical scrollbar');
      assert.equal(sizes.scroll, sizes.client);
      assert.ok(sizes.charts.every(chart => chart.width > 100 && chart.height > 100));
    }
    if (screenshots) {
      await browser.evaluate(`document.getElementById('lebesgueResults').scrollIntoView({block:'start'})`);
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(screenshots, `lebesgue-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
});
