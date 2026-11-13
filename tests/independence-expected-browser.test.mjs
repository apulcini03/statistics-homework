import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => {
  if (browser) {
    await browser.close();
    assert.deepEqual(browser.exceptions, [], 'No unhandled application exceptions');
  }
});
const chartIds = () => browser.evaluate('Object.values(Chart.instances).map(chart=>chart.id)');
const formatted = value => value === null ? 'N/A' : value.toFixed(6);
const signed = value => value === null ? 'N/A' : value === 0 ? '0.000000' : (value > 0 ? '+' : '') + value.toFixed(6);
async function apply(text, hasHeader = true) {
  await browser.set('independenceDatasetInput', text);
  await browser.evaluate(`document.getElementById('independenceHasHeader').checked=${hasHeader}`);
  await browser.click('applyIndependenceDataset');
}

async function checkView() {
  const view = await browser.evaluate(`(() => {
    const expected = document.querySelector('#independenceExpectedTable table');
    const comparison = document.querySelector('#independenceComparisonTable table');
    const c = Chart.getChart('independenceExpectedChart');
    return { state: StatisticalIndependence.getState(),
      header: [...expected.tHead.rows[0].cells].map(cell=>cell.textContent),
      rows: [...expected.tBodies[0].rows].map(row=>[...row.cells].map(cell=>cell.textContent)),
      footer: [...expected.tFoot.rows[0].cells].map(cell=>cell.textContent),
      comparisonHeader: [...comparison.tHead.rows[0].cells].map(cell=>cell.textContent),
      comparisons: [...comparison.tBodies[0].rows].map(row=>[...row.cells].map(cell=>cell.textContent)),
      labels: c.data.labels, datasets: c.data.datasets.map(d=>({label:d.label,data:d.data})),
      min: c.options.scales.y.min, startsAtZero: c.options.scales.y.beginAtZero,
      stacked: !!c.options.scales.y.stacked,
      totalCharts: Object.keys(Chart.instances).length,
      totalTables: document.querySelectorAll('section[aria-labelledby="expected-frequencies"] table').length,
      diagnostics: document.getElementById('independenceExpectedDiagnostics').textContent,
      note: document.getElementById('independenceExpectedChartNote').textContent };
  })()`);
  const e = view.state.independenceComparison.expected, cells = view.state.independenceComparison.cells;
  const names = Object.values(view.state.activeDataset.variables).map(variable => variable.label);
  assert.deepEqual(view.header, [`${names[0]} / ${names[1]}`, ...e.columnCategories, 'Row total']);
  assert.deepEqual(view.rows, e.rowCategories.map((label, i) => [label, ...e.expectedCounts[i].map(formatted), String(e.rowTotals[i])]));
  assert.deepEqual(view.footer, ['Column total', ...e.columnTotals.map(String), String(e.totalObservations)]);
  assert.deepEqual(view.comparisonHeader, [names[0], names[1], 'Observed O', 'Expected E', 'Difference O − E']);
  const flat = cells.flatMap((row, i) => row.map((entry, j) => ({ ...entry,
    row: e.rowCategories[i], column: e.columnCategories[j] })));
  assert.deepEqual(view.comparisons, flat.map(entry => [entry.row, entry.column, String(entry.observed), formatted(entry.expected), signed(entry.difference)]));
  assert.deepEqual(view.labels, flat.slice(0, 50).map(entry => `${names[0]}: ${entry.row} | ${names[1]}: ${entry.column}`));
  assert.deepEqual(view.datasets, [
    { label: 'Observed counts O', data: flat.slice(0, 50).map(entry => entry.observed) },
    { label: 'Expected counts E', data: flat.slice(0, 50).map(entry => entry.expected) }
  ]);
  assert.equal(view.min, 0);
  assert.equal(view.startsAtZero, true);
  assert.equal(view.stacked, false);
  assert.equal(view.totalCharts, 3);
  assert.equal(view.totalTables, 2);
  return view;
}

test('HW6 expected UI: default matrices, signed differences, diagnostics and chart agree before rounding', async () => {
  await browser.navigate(7);
  const view = await checkView();
  assert.deepEqual(view.state.independenceComparison.expected.expectedCounts, [[7.5, 4.5], [7.5, 4.5]]);
  assert.deepEqual(view.state.independenceComparison.cells.map(row=>row.map(cell=>cell.difference)), [[-.5, .5], [.5, -.5]]);
  assert.match(view.diagnostics, /Rows: 2; columns: 2; expected cells: 4/);
  assert.match(view.diagnostics, /Minimum expected count: 4\.500000/);
  assert.match(view.diagnostics, /below 5: 2 \(50\.0000%\)/);
  assert.match(view.diagnostics, /equal to zero: 0/);
  assert.match(view.note, /all 4 of 4 cells/);
  assert.equal(await browser.evaluate("document.querySelectorAll('.status').length"), 3);
});

test('HW6 expected UI: category dimensions, zero cells and single categories refresh labels and unrounded chart values', async () => {
  await browser.navigate(7);
  for (const text of ['B,Y\nA,X\nB,Y', 'B,Y\nA,Z\nB,X\nA,Y', 'C,Y\nB,X\nA,Y\nC,Y',
    'C,Z\nB,Y\nA,X\nB,Y', 'Only,Same\nOnly,Same', 'Only,Z\nOnly,Y\nOnly,X', 'Z,Only\nY,Only\nX,Only']) {
    const oldIds = await chartIds();
    await apply('Format,Result\n' + text);
    const view = await checkView();
    assert.ok(view.header[0].includes('Format / Result'));
    assert.ok((await chartIds()).every(id=>!oldIds.includes(id)));
  }
  await apply('A,X\nA,Y\nB,X', false);
  const view = await checkView();
  assert.equal(view.datasets[1].data[3], 1 / 3);
  assert.notEqual(view.datasets[1].data[3], .333333);
  assert.equal(view.state.independenceComparison.cells[1][1].observed, 0);
});

test('HW6 expected UI: invalid edits preserve statistics, tables and chart; format remains descriptive counts; reset restores', async () => {
  await browser.navigate(7);
  await apply('Format,Result\nA,X\nA,Y\nB,X');
  const previous = await browser.evaluate(`window.expectedReference=StatisticalIndependence.getState().independenceComparison;
    ({state:JSON.stringify(StatisticalIndependence.getState()),html:document.getElementById('independenceComparisonTable').innerHTML,
      chart:Chart.getChart('independenceExpectedChart').id})`);
  await browser.set('independenceFrequencyFormat', 'percentage');
  assert.equal(await browser.evaluate('window.expectedReference===StatisticalIndependence.getState().independenceComparison'), true);
  assert.equal(await browser.evaluate("Chart.getChart('independenceExpectedChart').id"), previous.chart);
  await apply('Format,Result\nBroken');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'), previous.state);
  assert.equal(await browser.evaluate("document.getElementById('independenceComparisonTable').innerHTML"), previous.html);
  assert.equal(await browser.evaluate("Chart.getChart('independenceExpectedChart').id"), previous.chart);
  await browser.click('resetIndependenceDataset');
  const reset = await checkView();
  assert.deepEqual(reset.state.independenceComparison.expected.expectedCounts, [[7.5, 4.5], [7.5, 4.5]]);
  assert.equal(reset.header[0], 'Study Method / Exam Outcome');
});

test('HW6 expected UI: repeated updates and explicit chart destruction recreate exactly three live plots', async () => {
  await browser.navigate(7);
  for (let repeat = 0; repeat < 3; repeat++) {
    await browser.evaluate("Chart.getChart('independenceExpectedChart').destroy()");
    assert.equal((await chartIds()).length, 2);
    await apply(`Row${repeat},Col${repeat}\nOther,Else`, false);
    await checkView();
    await browser.click('resetIndependenceDataset');
    await checkView();
  }
});

test('HW6 expected UI: without Chart.js both authoritative tables and diagnostics update and recover', async () => {
  await browser.navigate(7);
  await browser.evaluate('Object.values(Chart.instances).forEach(chart=>chart.destroy());window.savedChart=Chart;window.Chart=undefined');
  await apply('Format,Result\nA,X\nA,Y\nB,X');
  assert.deepEqual(await browser.evaluate('StatisticalIndependence.getState().independenceComparison.expected.expectedCounts'), [[4/3, 2/3], [2/3, 1/3]]);
  assert.equal(await browser.evaluate("document.querySelectorAll('section[aria-labelledby=\"expected-frequencies\"] table').length"), 2);
  assert.match(await browser.evaluate("document.getElementById('independenceExpectedDiagnostics').textContent"), /expected cells: 4/);
  assert.match(await browser.evaluate("document.getElementById('independenceExpectedChartFeedback').textContent"), /Chart.js failed to load/);
  await browser.evaluate('window.Chart=window.savedChart;delete window.savedChart');
  await browser.click('resetIndependenceDataset');
  await checkView();
});

test('HW6 expected UI: HTML-like variable names and categories remain literal text', async () => {
  await browser.navigate(7);
  await apply('<svg onload=window.injected=true>,Result\n<img src=x onerror=window.injected=true>,A & B\nÉquipe,✓');
  const view = await checkView();
  assert.ok(view.header[0].includes('<svg onload=window.injected=true>'));
  assert.ok(view.rows[0][0].includes('<img src=x onerror=window.injected=true>'));
  assert.equal(await browser.evaluate('window.injected === undefined'), true);
  assert.equal(await browser.evaluate("document.querySelectorAll('section[aria-labelledby=\"expected-frequencies\"] img,section[aria-labelledby=\"expected-frequencies\"] svg').length"), 0);
});

test('HW6 expected UI: 5000 observations, full 50×50 tables and capped chart fit 320/768/1440px, including destroy()', async () => {
  await browser.navigate(7);
  const maximum = Array.from({length:5000}, (_,i)=>`${'r'.repeat(95)}${i%50},${'c'.repeat(95)}${Math.floor(i/50)%50}`).join('\n');
  for (const text of [null, maximum]) {
    if (text) {
      await apply(text, false);
      const view = await checkView();
      assert.equal(view.comparisons.length, 2500);
      assert.equal(view.rows.length, 50);
      assert.equal(view.labels.length, 50);
      assert.equal(view.state.independenceComparison.expected.expectedCounts.flat().length, 2500);
      assert.match(view.note, /first 50 of 2500/);
      assert.equal(view.state.independenceComparison.expected.diagnostics.cellsBelow5, 2500);
    }
    for (const width of [320,768,1440]) {
      await browser.viewport(width);
      for (const destroyed of [false,true]) {
        if (destroyed) await browser.evaluate("Chart.getChart('independenceExpectedChart').destroy()");
        const layout = await browser.evaluate(`(() => {
          const width=document.documentElement.clientWidth;
          return {fits:document.documentElement.scrollWidth<=width,
            overflow:[...document.querySelectorAll('body *')].filter(e=>{
              const wrapper=e.closest('#independenceTableContainer,.independence-frequency-table');
              if(wrapper && wrapper!==e)return false;
              const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1);
            }).map(e=>e.tagName+'#'+e.id)};
        })()`);
        assert.equal(layout.fits,true,`Page overflow at ${width}, maximum=${!!text}, destroyed=${destroyed}`);
        assert.deepEqual(layout.overflow,[]);
        if(destroyed) {
          if(text)await apply(text,false);else await browser.click('resetIndependenceDataset');
        }
      }
    }
  }
});
