import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
const screenshotDirectory = process.env.RIEMANN_SCREENSHOT_DIR;
before(async () => {
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
  browser = await startBrowser();
});
after(async () => {
  if (!browser) return;
  await browser.close();
  assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
});

test('Riemann UI: defaults, all functions/methods and repeated Chart.js replacement', async () => {
  await browser.viewport(1440);
  await browser.navigate(6);
  assert.equal(await browser.evaluate('riemannIntervals.value'), '20');
  assert.equal(await browser.evaluate('riemannFunction.options.length'), 7);
  const references = { sin: 2, square: 1 / 3, step: 2,
    absolute: 0.25, inverseSqrt: 2, indicator: 0.5, sinc: 1.851937051982466 };
  let previousId = null;
  for (const id of Object.keys(references)) {
    await browser.set('riemannFunction', id);
    for (const method of ['left', 'right', 'midpoint']) {
      await browser.set('riemannMethod', method);
      await browser.click('calculateRiemannBtn');
      const result = await browser.evaluate(`(()=>{
        const c=Chart.getChart('riemannChart');
        return {id:c.id,instances:Object.keys(Chart.instances).length,
          summary:riemannResults.textContent,note:riemannPlotNote.textContent,
          title:[c.options.plugins.title.text].flat().join(' '),
          samples:c.data.datasets[1].data,curve:c.data.datasets[0].data,
          expected:calculateRiemann(riemannFunction.value,20,riemannMethod.value)};
      })()`);
      assert.notEqual(result.id, previousId);
      previousId = result.id;
      assert.equal(result.instances, 1);
      assert.match(result.summary, /Subintervals: 20/);
      assert.match(result.summary, new RegExp(`Quadrature function evaluations: ${id === 'inverseSqrt' ? 19 : 20} `));
      assert.ok(Math.abs(result.expected.reference - references[id]) < 1e-14);
      assert.ok(result.curve.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      assert.deepEqual(result.samples, result.expected.rectangles.filter(r => !r.corrected)
        .map(r => ({ x: r.sample, y: r.height })));
      assert.match(result.summary, new RegExp(result.expected.approximation.toPrecision(12).replace(/[.+]/g, '\\$&')));
      if (id === 'inverseSqrt') {
        assert.match(result.title, /Improper quadrature/);
        assert.match(result.summary, /adapted quadrature/);
        assert.match(result.note, /orange rectangle/);
        assert.ok(result.curve[0].x > 0);
      }
    }
  }
});

test('Riemann UI: invalid intervals are rejected without replacing the last valid plot', async () => {
  await browser.navigate(6);
  await browser.click('calculateRiemannBtn');
  const chartId = await browser.evaluate("Chart.getChart('riemannChart').id");
  for (const raw of ['', '-1', '0', '1.5', '10001', '1e100']) {
    await browser.set('riemannIntervals', raw);
    await browser.click('calculateRiemannBtn');
    assert.match(await browser.evaluate('riemannResults.textContent'), /integer.*between 1 and 10000/);
    assert.match(await browser.evaluate('riemannPlotNote.textContent'), /last successful calculation/);
    assert.equal(await browser.evaluate("Chart.getChart('riemannChart').id"), chartId);
  }
  await browser.set('riemannIntervals', '40');
  await browser.click('calculateRiemannBtn');
  assert.match(await browser.evaluate('riemannResults.textContent'), /Subintervals: 40/);
  assert.notEqual(await browser.evaluate("Chart.getChart('riemannChart').id"), chartId);
});

test('Riemann UI: full computation and explicitly simplified rendering at the maximum', async () => {
  await browser.navigate(6);
  await browser.set('riemannFunction', 'square');
  await browser.set('riemannIntervals', '10000');
  await browser.set('riemannMethod', 'right');
  await browser.click('calculateRiemannBtn');
  assert.match(await browser.evaluate('riemannResults.textContent'), /Quadrature function evaluations: 10000/);
  assert.match(await browser.evaluate('riemannPlotNote.textContent'), /200 of 10000 actual rectangles/);
  assert.equal(await browser.evaluate("Chart.getChart('riemannChart').data.datasets[1].data.length"), 200);
  await browser.set('riemannFunction', 'inverseSqrt');
  await browser.set('riemannIntervals', '1');
  await browser.click('calculateRiemannBtn');
  assert.match(await browser.evaluate('riemannResults.textContent'), /Approximation: 2\.00000000000/);
  assert.match(await browser.evaluate('riemannResults.textContent'), /Quadrature function evaluations: 0 /);
  assert.equal(await browser.evaluate("Chart.getChart('riemannChart').data.datasets[1].data.length"), 0);
});

test('Riemann UI: mobile 320px and desktop contain the graph before and after calculations', async () => {
  await browser.viewport(320);
  await browser.navigate(6);
  const checkWidth = async width => {
    const dimensions = await browser.evaluate('({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})');
    assert.equal(dimensions.inner, width);
    if (width === 320) assert.equal(dimensions.client, 320);
    assert.equal(dimensions.scroll, dimensions.client, 'No horizontal overflow with or without a vertical scrollbar');
  };
  await checkWidth(320);
  for (const id of ['sin', 'step', 'inverseSqrt', 'sinc']) {
    await browser.set('riemannFunction', id);
    await browser.click('calculateRiemannBtn');
    await checkWidth(320);
    assert.ok(await browser.evaluate("Chart.getChart('riemannChart').width > 100"));
  }
  if (screenshotDirectory) {
    await browser.evaluate("document.getElementById('riemannControls').scrollIntoView({block:'start'})");
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(screenshotDirectory, 'mobile.png'), Buffer.from(screenshot.data, 'base64'));
  }
  await browser.viewport(1440);
  await browser.click('calculateRiemannBtn');
  await checkWidth(1440);
  assert.ok(await browser.evaluate("Chart.getChart('riemannChart').width > 500"));
  if (screenshotDirectory) {
    await browser.evaluate("document.getElementById('riemannResults').scrollIntoView({block:'start'})");
    const desktop = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(screenshotDirectory, 'desktop.png'), Buffer.from(desktop.data, 'base64'));
  }
});
