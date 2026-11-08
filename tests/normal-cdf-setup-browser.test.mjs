import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
const screenshots = process.env.NORMAL_CDF_SCREENSHOT_DIR;
before(async () => {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  browser = await startBrowser();
});
after(async () => {
  if (!browser) return;
  await browser.close();
  assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
});

test('Normal CDF UI: required setup elements exist and numerical controls are operational', async () => {
  await browser.navigate(6);
  const result = await browser.evaluate(`({x:normalCdfX.value,
    disabled:[normalCdfMethod.disabled,normalCdfParameter.disabled,calculateNormalCdfBtn.disabled],
    options:[...normalCdfMethod.options].map(o=>o.textContent),
    summary:normalCdfSummary.textContent,rows:[...normalCdfTableBody.rows].map(r=>[...r.cells].map(c=>c.textContent)),
    canvases:!!document.getElementById('normalCdfDensityChart')&&!!document.getElementById('normalCdfErrorChart'),
    charts:Object.keys(Chart.instances).length,state:NormalCdf.getState(),
    labels:[...document.querySelectorAll('#normalCdfControls label')].map(l=>!!document.getElementById(l.htmlFor))})`);
  assert.equal(result.x, '1');
  assert.deepEqual(result.disabled, [false, false, false]);
  assert.equal(result.options.length, 3);
  assert.deepEqual(result.options, ['Trapezoidal integration', 'Simpson integration', 'Error-function power series']);
  assert.match(result.summary, /Ready/);
  assert.match(result.summary, /0\.84134/);
  assert.equal(result.rows.length, 3);
  for (const row of result.rows) {
    assert.equal(row[1], 'Not computed');
    assert.equal(row[2], '0.84134');
    assert.ok(row.slice(3).every(value => value === 'Unavailable'));
  }
  assert.equal(result.canvases, true);
  assert.equal(result.charts, 0, 'No fabricated density/CDF/error datasets');
  assert.ok(result.labels.every(Boolean));
  assert.ok(result.state.results.every(r => r.approximation === null && r.absoluteError === null));
  await browser.evaluate('calculateNormalCdfBtn.click()');
  assert.ok(Math.abs(await browser.evaluate('NormalCdf.getState().results[0].approximation') - 0.8413447460685429) < 3e-6);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 2);
});

test('Normal CDF UI: editing x only validates and looks up exact tabulated references', async () => {
  await browser.navigate(6);
  for (const [raw, reference] of [['-4','0.00003'],['-1.96','0.02500'],['0','0.50000'],['4','0.99997']]) {
    await browser.set('normalCdfX', raw);
    assert.ok((await browser.evaluate('normalCdfSummary.textContent')).includes(reference));
    assert.equal(await browser.evaluate('normalCdfTableBody.rows.length'), 3);
    assert.equal(await browser.evaluate('NormalCdf.getState().results[0].approximation'), null);
  }
  await browser.set('normalCdfX', '0.25');
  assert.match(await browser.evaluate('normalCdfSummary.textContent'), /No stored reference.*no interpolation/);
  for (const invalid of ['', '1e309', '1e-400']) {
    await browser.set('normalCdfX', invalid);
    assert.match(await browser.evaluate('normalCdfSummary.textContent'), /finite real|supported numeric range/);
    assert.equal(await browser.evaluate('normalCdfTableBody.rows.length'), 0);
    assert.equal(await browser.evaluate('NormalCdf.getState().x'), null);
  }
  await browser.set('normalCdfX', '1');
  assert.equal(await browser.evaluate('normalCdfTableBody.rows.length'), 3);
  assert.deepEqual(await browser.evaluate('[normalCdfMethod.disabled,normalCdfParameter.disabled,calculateNormalCdfBtn.disabled]'), [false,false,false]);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 0);
});

test('Normal CDF UI: method metadata and repeated initialization keep controls enabled without duplicates', async () => {
  await browser.navigate(6);
  await browser.set('normalCdfMethod', 'simpson');
  assert.equal(await browser.evaluate('normalCdfParameter.step'), '2');
  await browser.set('normalCdfMethod', 'erf-series');
  assert.equal(await browser.evaluate('normalCdfParameter.value'), '100');
  assert.match(await browser.evaluate('normalCdfParameterLabel.textContent'), /Maximum terms/);
  await browser.evaluate('NormalCdf.initialize();NormalCdf.initialize()');
  assert.equal(await browser.evaluate('normalCdfMethod.options.length'), 3);
  assert.equal(await browser.evaluate('normalCdfTableBody.rows.length'), 3);
  assert.deepEqual(await browser.evaluate('[normalCdfMethod.disabled,normalCdfParameter.disabled,calculateNormalCdfBtn.disabled]'), [false,false,false]);
});

test('Normal CDF infrastructure: table/plot updates replace previous content and preserve unrelated charts', async () => {
  await browser.navigate(6);
  await browser.click('calculateRiemannBtn');
  const originalId = await browser.evaluate("Chart.getChart('riemannChart').id");
  let previous = [];
  for (let i = 0; i < 3; i++) {
    // Infrastructure fixture only: these points do not represent a PDF or CDF,
    // and no planned numerical method is invoked or supplied with fake results.
    const result = await browser.evaluate(`(()=>{
      const fixture={type:'line',data:{datasets:[{label:'UI lifecycle fixture',data:[{x:0,y:1},{x:1,y:2}]}]},
        options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{x:{type:'linear'}}}};
      NormalCdf.updateCharts({density:fixture,errors:fixture});
      NormalCdf.renderTable(NormalCdf.methods.map(m=>NormalCdf.createPendingResult(m.id,1)));
      return {ids:['normalCdfDensityChart','normalCdfErrorChart'].map(id=>Chart.getChart(id).id),
        rows:normalCdfTableBody.rows.length,count:Object.keys(Chart.instances).length};})()`);
    assert.equal(result.rows, 3);
    assert.equal(result.count, 3);
    assert.ok(result.ids.every(id => !previous.includes(id)));
    previous = result.ids;
  }
  await browser.evaluate('NormalCdf.updateCharts()');
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'), 1);
  assert.equal(await browser.evaluate("Chart.getChart('riemannChart').id"), originalId);
});

test('Normal CDF setup: Exercise 1 controls and results coexist without state conflicts', async () => {
  await browser.navigate(6);
  for (const id of ['calculateRiemannBtn','calculateLebesgueBtn','runComparisonBtn',
    'runConvergenceBtn','runDirichletBtn','runThomaeBtn']) await browser.click(id);
  const original = await browser.evaluate(`({ids:Object.keys(Chart.instances),
    summaries:[riemannResults.textContent,lebesgueResults.textContent,comparisonSummary.textContent,
      convergenceSummary.textContent,dirichletSummary.textContent,thomaeSummary.textContent]})`);
  assert.equal(original.ids.length, 8);
  await browser.set('normalCdfX', '-1.96');
  await browser.evaluate('NormalCdf.initialize()');
  assert.deepEqual(await browser.evaluate(`({ids:Object.keys(Chart.instances),
    summaries:[riemannResults.textContent,lebesgueResults.textContent,comparisonSummary.textContent,
      convergenceSummary.textContent,dirichletSummary.textContent,thomaeSummary.textContent]})`), original);
  assert.match(await browser.evaluate('normalCdfSummary.textContent'), /0\.02500/);
});

test('Normal CDF UI: pending canvases and table fit 320px and desktop', async () => {
  await browser.viewport(320);
  await browser.navigate(6);
  for (const width of [320, 1440]) {
    await browser.viewport(width);
    for (const x of ['1', '-4', '0.25', '']) {
      await browser.set('normalCdfX', x);
      const sizes = await browser.evaluate(`({client:document.documentElement.clientWidth,
        scroll:document.documentElement.scrollWidth,canvases:['normalCdfDensityChart','normalCdfErrorChart']
        .map(id=>{const c=document.getElementById(id);return {width:c.getBoundingClientRect().width,
          available:c.parentElement.clientWidth-parseFloat(getComputedStyle(c.parentElement).paddingLeft)
            -parseFloat(getComputedStyle(c.parentElement).paddingRight)}})})`);
      if (width === 320) assert.equal(sizes.client, 320);
      assert.equal(sizes.scroll, sizes.client);
      assert.ok(sizes.canvases.every(c => c.width <= c.available + 1));
    }
    if (screenshots) {
      await browser.set('normalCdfX', '1');
      await browser.evaluate("document.getElementById('normalCdfControls').scrollIntoView({block:'start'})");
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(screenshots, `normal-cdf-${width}.png`), Buffer.from(screenshot.data,'base64'));
    }
  }
});
