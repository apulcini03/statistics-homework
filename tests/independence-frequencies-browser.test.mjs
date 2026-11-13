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

const chartIds = () => browser.evaluate('Object.values(Chart.instances).map(chart => chart.id)');
const display = (value, mode) => value === null ? 'N/A'
  : mode === 'percentage' ? `${(value * 100).toFixed(4)}%` : value.toFixed(6);

async function apply(text, hasHeader = true) {
  await browser.set('independenceDatasetInput', text);
  await browser.evaluate(`document.getElementById('independenceHasHeader').checked = ${hasHeader}`);
  await browser.click('applyIndependenceDataset');
}

async function checkViews() {
  const view = await browser.evaluate(`(() => {
    const read = id => {
      const table = document.querySelector('#' + id + ' table');
      return { headers: [...table.tHead.rows[0].cells].map(cell => cell.textContent),
        rows: [...table.tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent)),
        footer: table.tFoot ? [...table.tFoot.rows[0].cells].map(cell => cell.textContent) : null };
    };
    const readChart = id => {
      const chart = Chart.getChart(id);
      return { labels: chart.data.labels,
        datasets: chart.data.datasets.map(dataset => ({label: dataset.label, data: dataset.data})),
        stacked: chart.options.scales.y.stacked, min: chart.options.scales.y.min, max: chart.options.scales.y.max };
    };
    const state = StatisticalIndependence.getState();
    return { state, names: Object.values(state.activeDataset.variables).map(variable => variable.label),
      mode: document.getElementById('independenceFrequencyFormat').value,
      joint: read('independenceJointTable'), columnGivenRow: read('independenceColumnGivenRowTable'),
      rowGivenColumn: read('independenceRowGivenColumnTable'),
      rowTitle: document.getElementById('independenceColumnGivenRowTitle').textContent,
      columnTitle: document.getElementById('independenceRowGivenColumnTitle').textContent,
      rowChart: readChart('independenceColumnGivenRowChart'), columnChart: readChart('independenceRowGivenColumnChart'),
      count: Object.keys(Chart.instances).length,
      tables: document.querySelectorAll('section[aria-labelledby="marginal-conditional"] table').length };
  })()`);
  const { contingencyTable: t, frequencies: f } = view.state;
  const fmt = value => display(value, view.mode);
  assert.deepEqual(view.joint.headers, [`${view.names[0]} / ${view.names[1]}`, ...t.columnCategories, 'Row marginal']);
  assert.deepEqual(view.joint.rows, t.rowCategories.map((label, i) => [label, ...f.jointRelativeFrequencies[i].map(fmt), fmt(f.rowMarginals[i])]));
  assert.deepEqual(view.joint.footer, ['Column marginal', ...f.columnMarginals.map(fmt), fmt(f.totalRelativeFrequency)]);
  assert.deepEqual(view.columnGivenRow.rows, t.rowCategories.map((label, i) => [label, ...f.columnGivenRow[i].map(fmt), fmt(1)]));
  assert.deepEqual(view.rowGivenColumn.rows, t.rowCategories.map((label, i) => [label, ...f.rowGivenColumn[i].map(fmt)]));
  assert.deepEqual(view.rowGivenColumn.footer, ['Column sum', ...t.columnCategories.map(() => fmt(1))]);
  assert.ok(view.rowTitle.startsWith(`${view.names[1]} given ${view.names[0]}`));
  assert.ok(view.columnTitle.startsWith(`${view.names[0]} given ${view.names[1]}`));
  assert.deepEqual(view.rowChart.labels, t.rowCategories);
  assert.deepEqual(view.rowChart.datasets, t.columnCategories.map((label, j) => ({ label, data: f.columnGivenRow.map(row => row[j]) })));
  assert.deepEqual(view.columnChart.labels, t.columnCategories);
  assert.deepEqual(view.columnChart.datasets, t.rowCategories.map((label, i) => ({ label, data: f.rowGivenColumn[i] })));
  for (const chart of [view.rowChart, view.columnChart]) {
    assert.equal(chart.stacked, true);
    assert.equal(chart.min, 0);
    assert.equal(chart.max, 1);
  }
  assert.equal(view.count, 2);
  assert.equal(view.tables, 3);
  return view;
}

test('HW6 frequency UI: default tables, marginals and both charts match unrounded ratios', async () => {
  await browser.navigate(7);
  const view = await checkViews();
  assert.deepEqual(view.state.frequencies.jointRelativeFrequencies, [[7 / 24, 5 / 24], [8 / 24, 4 / 24]]);
  assert.deepEqual(view.state.frequencies.rowMarginals, [.5, .5]);
  assert.deepEqual(view.state.frequencies.columnMarginals, [.625, .375]);
  assert.deepEqual(view.rowChart.datasets[0].data, [7 / 12, 8 / 12]);
  assert.deepEqual(view.columnChart.datasets[0].data, [7 / 15, 5 / 9]);
  assert.match(await browser.evaluate("document.getElementById('independenceMarginalSummary').textContent"), /Pass = 0\.625000; Fail = 0\.375000/);
  assert.match(await browser.evaluate("document.querySelector('#independenceTableContainer table').caption.textContent"), /absolute frequencies/);
});

test('HW6 frequency UI: decimal/percentage changes affect display only, with consistent chart axes and tooltips', async () => {
  await browser.navigate(7);
  const before = await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())');
  const observed = await browser.evaluate("document.getElementById('independenceTableContainer').innerHTML");
  const ids = await chartIds();
  await browser.set('independenceFrequencyFormat', 'percentage');
  await checkViews();
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'), before);
  assert.equal(await browser.evaluate("document.getElementById('independenceTableContainer').innerHTML"), observed);
  assert.ok((await chartIds()).every(id => !ids.includes(id)));
  const labels = await browser.evaluate(`(() => {
    const c = Chart.getChart('independenceColumnGivenRowChart');
    return { axis: c.options.scales.y.title.text,
      tick: c.options.scales.y.ticks.callback(.5),
      tooltip: c.options.plugins.tooltip.callbacks.label({dataset:c.data.datasets[0],raw:7/12}) };
  })()`);
  assert.equal(labels.axis, 'Conditional percentage');
  assert.equal(labels.tick, '50.0000%');
  assert.equal(labels.tooltip, 'Pass: 58.3333%');
  await browser.set('independenceFrequencyFormat', 'decimal');
  await checkViews();
});

test('HW6 frequency UI: alternative dimensions, first-occurrence labels, zero cells and single-category variables', async () => {
  await browser.navigate(7);
  for (const text of [
    'Format,Result\nB,Yes\nA,No\nB,Yes',
    'Format,Result\nB,Y\nA,Z\nB,X\nA,Y',
    'Format,Result\nC,Y\nB,X\nA,Y\nC,Y',
    'Format,Result\nC,Z\nB,Y\nA,X\nB,Y',
    'Format,Result\nOnly,Same\nOnly,Same',
    'Format,Result\nOnly,Z\nOnly,Y\nOnly,X',
    'Format,Result\nZ,Only\nY,Only\nX,Only'
  ]) {
    const oldIds = await chartIds();
    await apply(text);
    const view = await checkViews();
    assert.deepEqual(view.names, ['Format', 'Result']);
    assert.ok((await chartIds()).every(id => !oldIds.includes(id)));
  }
  assert.equal(await browser.evaluate("document.querySelectorAll('section:has(.status) table,section:has(.status) canvas').length"), 0);
});

test('HW6 frequency UI: invalid data preserve all statistics, tables and charts; reset restores defaults', async () => {
  await browser.navigate(7);
  await apply('Format,Result\nA,X\nA,Y\nA,Z');
  await browser.set('independenceFrequencyFormat', 'percentage');
  await checkViews();
  const before = await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())');
  const tables = await browser.evaluate(`[...document.querySelectorAll('section[aria-labelledby="marginal-conditional"] table')].map(e=>e.outerHTML)`);
  const ids = await chartIds();
  await apply('Format,Result\nBroken');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'), before);
  assert.deepEqual(await browser.evaluate(`[...document.querySelectorAll('section[aria-labelledby="marginal-conditional"] table')].map(e=>e.outerHTML)`), tables);
  assert.deepEqual(await chartIds(), ids);
  await browser.click('resetIndependenceDataset');
  const reset = await checkViews();
  assert.deepEqual(reset.names, ['Study Method', 'Exam Outcome']);
  assert.deepEqual(reset.state.frequencies.jointRelativeFrequencies, [[7 / 24, 5 / 24], [8 / 24, 4 / 24]]);
  assert.equal(reset.mode, 'percentage');
});

test('HW6 frequency UI: HTML-like names and categories remain literal text in all outputs', async () => {
  await browser.navigate(7);
  await apply('<svg onload=window.injected=true>,Result\n<img src=x onerror=window.injected=true>,A & B\nÉquipe,✓');
  const view = await checkViews();
  assert.equal(view.names[0], '<svg onload=window.injected=true>');
  assert.equal(view.rowChart.labels[0], '<img src=x onerror=window.injected=true>');
  assert.equal(await browser.evaluate(`document.querySelectorAll('section[aria-labelledby="marginal-conditional"] svg,section[aria-labelledby="marginal-conditional"] img,section[aria-labelledby="marginal-conditional"] script').length`), 0);
  assert.equal(await browser.evaluate('window.injected === undefined'), true);
});

test('HW6 frequency UI: destroyed charts recreate exactly two instances on repeated format and dataset updates', async () => {
  await browser.navigate(7);
  for (let repeat = 0; repeat < 3; repeat++) {
    await browser.evaluate('Object.values(Chart.instances).forEach(chart=>chart.destroy())');
    assert.deepEqual(await chartIds(), []);
    await browser.set('independenceFrequencyFormat', repeat % 2 ? 'decimal' : 'percentage');
    await checkViews();
    await apply(`A${repeat},X\nB${repeat},Y`, false);
    await checkViews();
  }
});

test('HW6 frequency UI: 320/768/1440px contain tables and canvases before, after and between chart recreation', async () => {
  await browser.navigate(7);
  for (const maximum of [false, true]) {
    if (maximum) {
      await apply(Array.from({ length: 5000 }, (_, i) => `${'r'.repeat(95)}${i % 50},${'c'.repeat(95)}${Math.floor(i / 50) % 50}`).join('\n'), false);
      const view = await checkViews();
      assert.equal(view.rowChart.datasets.length, 50);
      assert.equal(view.columnChart.datasets.length, 50);
      assert.equal(await browser.evaluate("Chart.getChart('independenceColumnGivenRowChart').options.plugins.legend.display"), false);
    }
    for (const width of [320, 768, 1440]) {
      await browser.viewport(width);
      for (const destroyed of [false, true]) {
        if (destroyed) await browser.evaluate('Object.values(Chart.instances).forEach(chart=>chart.destroy())');
        const bounds = await browser.evaluate(`(() => {
          const available = document.documentElement.clientWidth;
          return { fits: document.documentElement.scrollWidth <= available,
            overflow: [...document.querySelectorAll('body *')].filter(e=>{
              const scroll = e.closest('#independenceTableContainer,.independence-frequency-table');
              if(scroll && e!==scroll)return false;
              const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right > available+1);
            }).map(e=>e.tagName+'#'+e.id) };
        })()`);
        assert.equal(bounds.fits, true, `Page overflow at ${width}, maximum=${maximum}, destroyed=${destroyed}`);
        assert.deepEqual(bounds.overflow, []);
        if (destroyed) await browser.set('independenceFrequencyFormat', 'decimal');
      }
    }
  }
});

test('HW6 frequency UI: simulated Chart.js unavailability leaves correct tables and can recover', async () => {
  await browser.navigate(7);
  await browser.evaluate('Object.values(Chart.instances).forEach(chart=>chart.destroy());window.savedChart=Chart;window.Chart=undefined');
  await apply('A,X\nB,Y', false);
  assert.match(await browser.evaluate("document.getElementById('independenceChartFeedback').textContent"), /Chart.js failed to load/);
  assert.equal(await browser.evaluate(`document.querySelectorAll('section[aria-labelledby="marginal-conditional"] table').length`), 3);
  assert.deepEqual(await browser.evaluate('StatisticalIndependence.getState().frequencies.jointRelativeFrequencies'), [[.5, 0], [0, .5]]);
  await browser.evaluate('window.Chart=window.savedChart;delete window.savedChart');
  await browser.set('independenceFrequencyFormat', 'decimal');
  await checkViews();
  assert.equal(await browser.evaluate("document.getElementById('independenceChartFeedback').textContent"), '');
});
