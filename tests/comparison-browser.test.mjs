import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
const screenshots = process.env.COMPARISON_SCREENSHOT_DIR;
before(async () => {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await startBrowser();
});
after(async () => {
  if (!browser) return;
  await browser.close();
  assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
});

test('Comparison UI: all seven functions show six correct rows with algorithm-only benchmark metrics', async () => {
  await browser.viewport(1440);
  await browser.navigate(6);
  assert.equal(await browser.evaluate('comparisonFunction.options.length'), 7);
  await browser.set('comparisonRepeats', '3');
  for (const id of ['sin', 'square', 'step', 'absolute', 'inverseSqrt', 'indicator', 'sinc']) {
    await browser.set('comparisonFunction', id);
    await browser.click('runComparisonBtn');
    const result = await browser.evaluate(`({summary:comparisonSummary.textContent,
      rows:[...comparisonTableBody.rows].map(r=>[...r.cells].map(c=>c.textContent)),
      expected:compareIntegrationMethods(comparisonFunction.value,1000,200,4000,3)})`);
    assert.equal(result.rows.length, 6);
    assert.match(result.summary, /Rendering is excluded/);
    assert.match(result.summary, /One warm-up and 3 measured runs/);
    assert.match(result.summary, /K is not a domain-sample count/);
    result.rows.forEach((cells, i) => {
      const expected = result.expected[i];
      assert.equal(cells[0], expected.label);
      assert.equal(cells[1], expected.approximation.toPrecision(12));
      assert.equal(cells[2], expected.reference.toPrecision(12));
      assert.equal(cells[3], expected.absoluteError.toPrecision(6));
      assert.equal(Number(cells[4]), expected.evaluations);
      assert.equal(Number(cells[9]), expected.evaluations * 4);
      assert.match(cells[8], expected.family === 'riemann' ? /O\(n\)/ : /O\(M\+K\)/);
      assert.ok(cells[6] === 'below timer resolution' || Number.isFinite(Number(cells[6])));
    });
    if (id === 'inverseSqrt') {
      assert.match(result.summary, /Adapted methods/);
      assert.ok(result.rows.every(cells => cells[10] !== 'none'));
    }
  }
});

test('Convergence UI: repeated charts keep zero errors finite and expose actual n/K/M and costs', async () => {
  await browser.navigate(6);
  let previous = [];
  for (const id of ['absolute', 'square', 'inverseSqrt']) {
    await browser.set('comparisonFunction', id);
    await browser.click('runConvergenceBtn');
    const result = await browser.evaluate(`({summary:convergenceSummary.textContent,
      charts:['convergenceResolutionChart','convergenceCostChart'].map(id=>{
        const c=Chart.getChart(id);return {id:c.id,scale:c.options.scales.y.type,datasets:c.data.datasets}}),
      count:Object.keys(Chart.instances).length})`);
    assert.equal(result.count, 2);
    assert.match(result.summary, /n=10; K=10; M=200/);
    assert.match(result.summary, /n=1000; K=1000; M=20000/);
    assert.match(result.summary, /raw errors remain zero/);
    assert.equal(await browser.evaluate("Chart.getChart('convergenceResolutionChart').scales.x.max"), 7);
    assert.equal(await browser.evaluate("Chart.getChart('convergenceResolutionChart').options.scales.y.ticks.callback(1e-16)"), '1e-16');
    for (const chart of result.charts) {
      assert.equal(chart.scale, 'logarithmic');
      assert.ok(!previous.includes(chart.id));
      assert.equal(chart.datasets.length, 6);
      assert.ok(chart.datasets.every(d => d.data.length === 7 && d.data.every(p => p.y > 0 && Number.isFinite(p.y))));
    }
    if (id === 'absolute') assert.ok(result.charts[0].datasets.some(d => d.data.some(p => p.actualError === 0)));
    const cost = result.charts[1].datasets;
    assert.equal(cost[0].data[0].x, id === 'inverseSqrt' ? 9 : 10);
    assert.equal(cost[3].data[0].x, 200);
    previous = result.charts.map(c => c.id);
  }
});

test('Dirichlet UI: exact Darboux values and distinct constructed sampling diagnostics', async () => {
  await browser.navigate(6);
  await browser.click('runDirichletBtn');
  assert.match(await browser.evaluate('dirichletSummary.textContent'), /Riemann integral: does not exist/);
  assert.match(await browser.evaluate('dirichletSummary.textContent'), /Exact Darboux lower sum: 0; exact upper sum: 1/);
  assert.match(await browser.evaluate('dirichletSummary.textContent'), /not a Riemann integral/);
  const firstId = await browser.evaluate("Chart.getChart('dirichletChart').id");
  const both = await browser.evaluate("Chart.getChart('dirichletChart').data.datasets");
  assert.equal(both.length, 2);
  assert.ok(both[0].data.every(p => p.y === 1 && p.numerator && p.denominator));
  assert.ok(both[1].data.every(p => p.y === 0 && p.kind === 'irrational' && p.tag.includes('√2/2')));
  for (const mode of ['rational', 'irrational']) {
    await browser.set('dirichletSampling', mode);
    await browser.set('dirichletIntervals', '1000');
    await browser.click('runDirichletBtn');
    const datasets = await browser.evaluate("Chart.getChart('dirichletChart').data.datasets");
    assert.equal(datasets.length, 1);
    assert.equal(datasets[0].data.length, 200);
    assert.ok(datasets[0].data.every(p => p.y === (mode === 'rational' ? 1 : 0)));
    assert.notEqual(await browser.evaluate("Chart.getChart('dirichletChart').id"), firstId);
  }
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 1);
});

test('Thomae UI: exact reduction, rational cloud cap, endpoints and tag-choice diagnostics', async () => {
  await browser.navigate(6);
  await browser.click('runThomaeBtn');
  assert.match(await browser.evaluate('thomaeSummary.textContent'), /lowest terms: 1\/2/);
  assert.match(await browser.evaluate('thomaeSummary.textContent'), /T\(0\)=1; T\(1\)=1/);
  assert.match(await browser.evaluate('thomaeSummary.textContent'), /midpoint tags, n=100: tagged sum 0.013/);
  await browser.set('thomaeMaximumDenominator', '1');
  await browser.set('thomaeIntervals', '1');
  await browser.click('runThomaeBtn');
  assert.equal(await browser.evaluate("Chart.getChart('thomaePointsChart').data.datasets[0].data.length"), 2);
  assert.match(await browser.evaluate('thomaeSummary.textContent'), /tagged sum 0.5000000000/);
  await browser.set('thomaeIntervals', '100');
  await browser.set('thomaeNumerator', '9007199254740993');
  await browser.set('thomaeDenominator', '18014398509481986');
  await browser.set('thomaeMaximumDenominator', '200');
  await browser.set('thomaeTagMethod', 'left');
  await browser.click('runThomaeBtn');
  const result = await browser.evaluate(`({text:thomaeSummary.textContent,
    points:Chart.getChart('thomaePointsChart').data.datasets,
    q:Chart.getChart('thomaeDenominatorsChart').data.datasets[0].data,
    count:Object.keys(Chart.instances).length})`);
  assert.equal(result.count, 2);
  assert.match(result.text, /lowest terms: 1\/2/);
  assert.match(result.text, /Displayed cloud points: 1000\/12233/);
  assert.match(result.text, /left tags, n=100: tagged sum 0.052/);
  assert.equal(result.points[0].data.length, 1000);
  assert.equal(result.points[0].data[0].y, 1);
  assert.equal(result.points[0].data.at(-1).y, 1);
  assert.equal(result.points[2].data[0].y, 0);
  assert.equal(result.q.length, 200);
});

test('Step 4 UI: invalid parameters and exact fractions do not overwrite valid plots or tables', async () => {
  await browser.navigate(6);
  await browser.click('runComparisonBtn');
  await browser.click('runDirichletBtn');
  await browser.click('runThomaeBtn');
  const ids = await browser.evaluate('Object.keys(Chart.instances)');
  const cases = [
    ['comparisonIntervals','runComparisonBtn','comparisonSummary',['','-1','1.5','10001'],'1000'],
    ['comparisonLevels','runComparisonBtn','comparisonSummary',['0','10001'],'200'],
    ['comparisonSamples','runComparisonBtn','comparisonSummary',['0','100001'],'4000'],
    ['comparisonRepeats','runComparisonBtn','comparisonSummary',['','2','10','3.5'],'5'],
    ['dirichletIntervals','runDirichletBtn','dirichletSummary',['','0','1.5','1001'],'20'],
    ['thomaeMaximumDenominator','runThomaeBtn','thomaeSummary',['','0','201'],'30'],
    ['thomaeIntervals','runThomaeBtn','thomaeSummary',['0','2001','1.5'],'100'],
    ['thomaeNumerator','runThomaeBtn','thomaeSummary',['','-1','1.5','5'],'2'],
    ['thomaeDenominator','runThomaeBtn','thomaeSummary',['','0','-1','1.5'],'4']
  ];
  for (const [field, button, summary, invalids, valid] of cases) {
    for (const raw of invalids) {
      await browser.set(field, raw); await browser.click(button);
      assert.match(await browser.evaluate(`document.getElementById('${summary}').textContent`), /integer|digits|Require/i);
      assert.deepEqual(await browser.evaluate('Object.keys(Chart.instances)'), ids);
    }
    await browser.set(field, valid);
  }
  await browser.click('runThomaeBtn');
  assert.notDeepEqual(await browser.evaluate('Object.keys(Chart.instances)'), ids);
});

test('Step 4 UI: old simulators coexist and every chart fits 320px and desktop on repeated runs', async () => {
  await browser.viewport(320);
  await browser.navigate(6);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth'), 320);
  await browser.click('calculateRiemannBtn'); await browser.click('calculateLebesgueBtn');
  const old = await browser.evaluate(`['riemannChart','lebesgueMeasuresChart','lebesgueContributionsChart'].map(id=>Chart.getChart(id).id)`);
  for (const width of [320, 1440]) {
    await browser.viewport(width);
    for (let run = 0; run < 2; run++) {
      await browser.set('comparisonFunction', run ? 'absolute' : 'sin');
      for (const button of ['runComparisonBtn','runConvergenceBtn','runDirichletBtn','runThomaeBtn']) await browser.click(button);
      const result = await browser.evaluate(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
        charts:Object.values(Chart.instances).map(c=>({width:c.width,height:c.height}))})`);
      if (width === 320) assert.equal(result.client, 320);
      assert.equal(result.scroll, result.client);
      assert.equal(result.charts.length, 8);
      assert.ok(result.charts.every(c=>c.width>100&&c.height>100));
    }
    if (screenshots) {
      for (const section of ['convergenceSummary','dirichletSummary','thomaeSummary']) {
        await browser.evaluate(`document.getElementById('${section}').scrollIntoView({block:'start'})`);
        const image = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(screenshots, `${section}-${width}.png`), Buffer.from(image.data,'base64'));
      }
    }
  }
  assert.deepEqual(await browser.evaluate(`['riemannChart','lebesgueMeasuresChart','lebesgueContributionsChart'].map(id=>Chart.getChart(id).id)`), old);
});
