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

async function apply(text, hasHeader = true) {
  await browser.set('independenceDatasetInput', text);
  await browser.evaluate(`document.getElementById('independenceHasHeader').checked = ${hasHeader}`);
  await browser.click('applyIndependenceDataset');
}

async function checkRendered(expectedMatrix) {
  const view = await browser.evaluate(`(() => {
    const table = document.querySelector('#independenceTableContainer table');
    const state = StatisticalIndependence.getState();
    return { computed: state.contingencyTable,
      headers: [...table.tHead.rows[0].cells].map(cell => cell.textContent),
      rows: [...table.tBodies[0].rows].map(row => [...row.cells].map(cell => cell.textContent)),
      footer: [...table.tFoot.rows[0].cells].map(cell => cell.textContent),
      names: Object.values(state.activeDataset.variables).map(variable => variable.label),
      tables: document.querySelectorAll('#independenceTableContainer table').length,
      caption: table.caption.textContent,
      scopes: [...table.querySelectorAll('th')].every(cell => ['row', 'col'].includes(cell.scope))
    };
  })()`);
  const t = view.computed;
  assert.deepEqual(t.observedCounts, expectedMatrix);
  assert.deepEqual(view.headers, [`${view.names[0]} / ${view.names[1]}`, ...t.columnCategories, 'Row total']);
  assert.deepEqual(view.rows, t.rowCategories.map((label, i) => [label, ...t.observedCounts[i].map(String), String(t.rowTotals[i])]));
  assert.deepEqual(view.footer, ['Column total', ...t.columnTotals.map(String), String(t.totalObservations)]);
  assert.equal(view.tables, 1, 'Repeated updates replace rather than stack tables');
  assert.equal(view.scopes, true);
  assert.ok(view.names.every(name => view.caption.includes(name)));
}

test('HW6 dataset UI: initial 24 paired observations match every cell and total', async () => {
  await browser.navigate(7);
  await checkRendered([[7, 5], [8, 4]]);
  const initial = await browser.evaluate(`({
    lines: document.getElementById('independenceDatasetInput').value.split(String.fromCharCode(10)).length,
    hasHeader: document.getElementById('independenceHasHeader').checked,
    summary: document.getElementById('independenceDatasetSummary').textContent,
    origin: document.getElementById('independenceDatasetOrigin').textContent,
    future: document.querySelectorAll('.status').length
  })`);
  assert.equal(initial.lines, 25);
  assert.equal(initial.hasHeader, true);
  assert.match(initial.summary, /N\): 24.*Study Method: 2 categories; Exam Outcome: 2 categories/);
  assert.match(initial.origin, /Synthetic illustrative data/);
  assert.equal(initial.future, 5);
});

test('HW6 dataset UI: repeated 2×2, 2×3, 3×2, 3×3 and single-category changes publish fresh revisions', async () => {
  await browser.navigate(7);
  await browser.evaluate(`window.datasetUpdates = [];
    document.addEventListener('statistical-independence:dataset-change', event => {
      window.datasetUpdates.push({revision: event.detail.revision, total: event.detail.contingencyTable.totalObservations});
    });`);
  const configurations = [
    ['Method,Outcome\nB,Yes\nA,No\nB,Yes', true, [[2, 0], [0, 1]]],
    ['Format,Result\nB,Y\nA,Z\nB,X\nA,Y', true, [[1, 0, 1], [1, 1, 0]]],
    ['C,Y\nB,X\nA,Y\nC,Y', false, [[2, 0], [0, 1], [1, 0]]],
    ['Format,Result\nC,Z\nB,Y\nA,X\nB,Y', true, [[1, 0, 0], [0, 2, 0], [0, 0, 1]]],
    ['Only,Same\nOnly,Same', false, [[2]]],
    ['Only,Z\nOnly,Y\nOnly,X', false, [[1, 1, 1]]],
    ['Z,Only\nY,Only\nX,Only', false, [[1], [1], [1]]]
  ];
  for (const [text, hasHeader, expected] of configurations) {
    await apply(text, hasHeader);
    await checkRendered(expected);
    assert.match(await browser.evaluate("document.getElementById('independenceDatasetFeedback').textContent"), /Dataset applied/);
  }
  assert.deepEqual(await browser.evaluate('window.datasetUpdates'), configurations.map((config, i) => ({
    revision: i + 1, total: config[0].split('\n').length - Number(config[1])
  })));
  assert.equal(await browser.evaluate('StatisticalIndependence.dataset.observations.length'), 24);
  assert.equal(await browser.evaluate("document.querySelectorAll('section:has(.status) table').length"), 0);
});

test('HW6 dataset UI: malformed input preserves active data, rendered counts and revision; correction and reset recover', async () => {
  await browser.navigate(7);
  await apply('Format,Result\nSolo,Good\nTeam,Bad');
  const state = await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())');
  const markup = await browser.evaluate("document.getElementById('independenceTableContainer').innerHTML");
  const invalid = ['', 'Format,Result', 'Format,Result\nSolo', 'Format,Result\n,Good',
    'Format,Format\nSolo,Good', 'Format,Result\nSolo,Good\nFormat,Result',
    'Format,Result\nResult,Format', 'Format,Result\n"Solo",Good',
    'Format,Result\nSolo,Good,Extra',
    'Format,Result\n' + Array(5001).fill('Solo,Good').join('\n')];
  for (const text of invalid) {
    await apply(text);
    assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'), state);
    assert.equal(await browser.evaluate("document.getElementById('independenceTableContainer').innerHTML"), markup);
    assert.match(await browser.evaluate("document.getElementById('independenceDatasetFeedback').textContent"), /last valid dataset and table are unchanged/);
    assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').getAttribute('aria-invalid')"), 'true');
    assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').value"), text);
  }
  await apply('\n A , X \n\n B , Y \n', false);
  await checkRendered([[1, 0], [0, 1]]);
  assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').hasAttribute('aria-invalid')"), false);
  await browser.click('resetIndependenceDataset');
  await checkRendered([[7, 5], [8, 4]]);
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeDataset === StatisticalIndependence.dataset'), true);
  assert.equal(await browser.evaluate("document.getElementById('independenceHasHeader').checked"), true);
  assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').value.split(String.fromCharCode(10)).length"), 25);
  assert.match(await browser.evaluate("document.getElementById('independenceDatasetOrigin').textContent"), /Synthetic illustrative/);
});

test('HW6 dataset UI: user-provided variable names and special category labels render as text', async () => {
  await browser.navigate(7);
  await apply('<svg onload=window.injected=true>,Result\n<img src=x onerror=window.injected=true>,A & B\nÉquipe,✓\n__proto__,constructor');
  await checkRendered([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const safe = await browser.evaluate(`({
    injected: window.injected === undefined,
    elements: document.querySelectorAll('#independenceTableContainer img,#independenceTableContainer svg,#independenceTableContainer script').length,
    text: document.getElementById('independenceTableContainer').textContent,
    summary: document.getElementById('independenceDatasetSummary').textContent
  })`);
  assert.equal(safe.injected, true);
  assert.equal(safe.elements, 0);
  assert.ok(safe.text.includes('<img src=x onerror=window.injected=true>'));
  assert.ok(safe.text.includes('A & B'));
  assert.ok(safe.summary.includes('<svg onload=window.injected=true>'));
});

test('HW6 dataset UI: default and maximum-size tables remain contained at 320, 768 and 1440 px', async () => {
  await browser.navigate(7);
  for (const maximum of [false, true]) {
    if (maximum) {
      const value = 'r'.repeat(95);
      await apply(Array.from({ length: 5000 }, (_, i) => `${value}${i % 50},${'c'.repeat(95)}${Math.floor(i / 50) % 50}`).join('\n'), false);
      assert.equal(await browser.evaluate('StatisticalIndependence.getState().contingencyTable.totalObservations'), 5000);
      assert.equal(await browser.evaluate("document.querySelectorAll('#independenceTableContainer tbody tr').length"), 50);
      assert.equal(await browser.evaluate("[...document.querySelectorAll('#independenceTableContainer tbody td')].every(cell => cell.textContent === '2' || cell.textContent === '100')"), true);
    }
    for (const width of [320, 768, 1440]) {
      await browser.viewport(width);
      const bounds = await browser.evaluate(`(() => {
        const container = document.getElementById('independenceTableContainer');
        const available = document.documentElement.clientWidth;
        return { overflowX: getComputedStyle(container).overflowX,
          pageFits: document.documentElement.scrollWidth <= available,
          overflowing: [...document.querySelectorAll('body *')].filter(e => {
            if (e !== container && container.contains(e)) return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && (r.left < -1 || r.right > available + 1);
          }).map(e => e.tagName + '#' + e.id),
          scrollable: container.scrollWidth > container.clientWidth };
      })()`);
      assert.equal(bounds.pageFits, true, `Page overflow at ${width}px, maximum=${maximum}`);
      assert.deepEqual(bounds.overflowing, []);
      assert.equal(bounds.overflowX, 'auto');
      if (maximum) assert.equal(bounds.scrollable, true, 'Wide table scrolls inside its own region');
    }
  }
  await browser.click('resetIndependenceDataset');
  await checkRendered([[7, 5], [8, 4]]);
});
