import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('StatisticalIndependence', context);
const plain = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}; tolerance=${tolerance}`);
const tableFrom = text => api.buildContingencyTable(api.parseDataset(text, { hasHeader: false }).observations);
const defaultTable = () => api.buildContingencyTable(api.dataset.observations);

function checkMargins(expected, tolerance = 1e-12) {
  expected.expectedCounts.forEach((row, i) => near(sum(row), expected.rowTotals[i], tolerance));
  expected.columnTotals.forEach((total, j) => near(sum(expected.expectedCounts.map(row => row[j])), total, tolerance));
  near(sum(expected.expectedCounts.flat()), expected.totalObservations, tolerance);
}

test('HW6 expected: original counts yield exact expected values, labels, margins and descriptive diagnostics', () => {
  const expected = plain(api.computeExpectedFrequencies(defaultTable()));
  assert.equal(expected.status, 'defined');
  assert.equal(expected.reason, null);
  assert.deepEqual(expected.expectedCounts, [[7.5, 4.5], [7.5, 4.5]]);
  assert.deepEqual(expected.rowCategories, ['Individual', 'Group']);
  assert.deepEqual(expected.columnCategories, ['Pass', 'Fail']);
  assert.deepEqual(expected.rowTotals, [12, 12]);
  assert.deepEqual(expected.columnTotals, [15, 9]);
  assert.equal(expected.totalObservations, 24);
  assert.deepEqual(expected.diagnostics, { minExpectedCount: 4.5, cellsBelow5: 2, percentageBelow5: 50,
    zeroExpectedCells: 0, hasZeroExpectedCounts: false, numberOfRows: 2, numberOfColumns: 2, totalCells: 4 });
  checkMargins(expected);
});

test('HW6 expected: exact signed and absolute differences are descriptive, without test contributions', () => {
  const result = plain(api.compareObservedExpected(defaultTable()));
  assert.deepEqual(result.cells, [
    [{ observed: 7, expected: 7.5, difference: -.5, absoluteDifference: .5 },
      { observed: 5, expected: 4.5, difference: .5, absoluteDifference: .5 }],
    [{ observed: 8, expected: 7.5, difference: .5, absoluteDifference: .5 },
      { observed: 4, expected: 4.5, difference: -.5, absoluteDifference: .5 }]
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['cells', 'expected']);
});

for (const [name, text, values] of [
  ['2×2', 'B,Y\nA,X\nB,Y', [[4 / 3, 2 / 3], [2 / 3, 1 / 3]]],
  ['2×3', 'B,Y\nA,Z\nB,X\nA,Y', [[1, .5, .5], [1, .5, .5]]],
  ['3×2', 'C,Y\nB,X\nA,Y\nC,Y', [[1.5, .5], [.75, .25], [.75, .25]]],
  ['3×3', 'C,Z\nB,Y\nA,X\nB,Y', [[.25, .5, .25], [.5, 1, .5], [.25, .5, .25]]],
  ['1×1', 'Only,Same\nOnly,Same', [[2]]],
  ['1×3', 'Only,Z\nOnly,Y\nOnly,X', [[1, 1, 1]]],
  ['3×1', 'Z,Only\nY,Only\nX,Only', [[1], [1], [1]]]
]) {
  test(`HW6 expected: ${name} preserves margins, category order and complete matrix precision`, () => {
    const table = tableFrom(text), expected = plain(api.computeExpectedFrequencies(table));
    assert.deepEqual(expected.expectedCounts, values);
    assert.deepEqual(expected.rowCategories, plain(table.rowCategories));
    assert.deepEqual(expected.columnCategories, plain(table.columnCategories));
    checkMargins(expected);
    const comparison = api.compareObservedExpected(table);
    comparison.cells.forEach((row, i) => row.forEach((entry, j) => {
      assert.equal(entry.observed, table.observedCounts[i][j]);
      assert.equal(entry.expected, values[i][j]);
      assert.equal(entry.difference, entry.observed - entry.expected);
    }));
  });
}

test('HW6 expected: zero observed combinations can have positive, unrounded noninteger expectations', () => {
  const table = tableFrom('B,Y\nA,X\nB,Y');
  const result = api.compareObservedExpected(table);
  assert.equal(result.cells[0][1].observed, 0);
  assert.equal(result.cells[0][1].expected, 2 / 3);
  assert.equal(result.cells[0][1].difference, -2 / 3);
  assert.notEqual(result.cells[0][1].expected, .666667);
});

test('HW6 expected: explicit zero margins yield zero expectations without division by zero', () => {
  const table = { rowCategories: ['Empty row', 'Present'], columnCategories: ['Empty column', 'Present'],
    observedCounts: [[0, 0], [0, 3]], rowTotals: [0, 3], columnTotals: [0, 3], totalObservations: 3 };
  const expected = plain(api.computeExpectedFrequencies(table));
  assert.deepEqual(expected.expectedCounts, [[0, 0], [0, 3]]);
  assert.equal(expected.diagnostics.minExpectedCount, 0);
  assert.equal(expected.diagnostics.zeroExpectedCells, 3);
  assert.equal(expected.diagnostics.hasZeroExpectedCounts, true);
  assert.equal(expected.diagnostics.cellsBelow5, 4);
  assert.equal(expected.diagnostics.percentageBelow5, 100);
  assert.deepEqual(plain(api.compareObservedExpected(table).cells).map(row => row.map(cell => cell.difference)), [[0, 0], [0, 0]]);
  checkMargins(expected);
});

test('HW6 expected: N=0 reports undefined expectations, differences and diagnostics explicitly', () => {
  const table = { rowCategories: ['A'], columnCategories: ['B'], observedCounts: [[0]], rowTotals: [0], columnTotals: [0], totalObservations: 0 };
  const result = plain(api.compareObservedExpected(table));
  assert.equal(result.expected.status, 'undefined');
  assert.match(result.expected.reason, /N = 0/);
  assert.deepEqual(result.expected.expectedCounts, [[null]]);
  assert.deepEqual(result.cells, [[{ observed: 0, expected: null, difference: null, absoluteDifference: null }]]);
  for (const key of ['minExpectedCount', 'cellsBelow5', 'percentageBelow5', 'zeroExpectedCells', 'hasZeroExpectedCounts']) {
    assert.equal(result.expected.diagnostics[key], null);
  }
});

test('HW6 expected: diagnostic threshold means strictly below 5, with no validity decision', () => {
  const table = { rowCategories: ['A', 'B'], columnCategories: ['X', 'Y'],
    observedCounts: [[10, 0], [0, 10]], rowTotals: [10, 10], columnTotals: [10, 10], totalObservations: 20 };
  const d = plain(api.computeExpectedFrequencies(table).diagnostics);
  assert.equal(d.minExpectedCount, 5);
  assert.equal(d.cellsBelow5, 0);
  assert.equal(d.percentageBelow5, 0);
  assert.doesNotMatch(JSON.stringify(d), /valid|reject|pValue|statistic/i);
});

test('HW6 expected: malformed matrices, inconsistent totals, nonfinite/negative/fractional counts are rejected', () => {
  const base = plain(defaultTable());
  const invalid = [null, {}, { ...base, totalObservations: 0 }, { ...base, totalObservations: Infinity },
    { ...base, rowTotals: [13, 12] }, { ...base, columnTotals: [15, 8] },
    { ...base, observedCounts: [[7], [8, 4]] }, { ...base, observedCounts: [[7, NaN], [8, 4]] },
    { ...base, observedCounts: [[7, Infinity], [8, 4]] }, { ...base, observedCounts: [[7, -5], [8, 4]] },
    { ...base, observedCounts: [[7, 5.1], [8, 4]] }, { ...base, observedCounts: [[7, '5'], [8, 4]] },
    { ...base, rowCategories: ['A', 'A'] }, { ...base, rowCategories: ['', 'B'] },
    { ...base, columnCategories: [null, 'Y'] }, { ...base, rowCategories: Array(2) },
    { ...base, observedCounts: Array(2), rowTotals: [0, 0], columnTotals: [0, 0], totalObservations: 0 }];
  for (const table of invalid) {
    assert.throws(() => api.computeExpectedFrequencies(table));
    assert.throws(() => api.compareObservedExpected(table));
  }
});

test('HW6 expected: bounded matrix dimensions and label lengths reject unsupported direct inputs', () => {
  const base = plain(defaultTable());
  assert.throws(() => api.computeExpectedFrequencies({ ...base, rowCategories: Array(51).fill('A') }), /50 categories/);
  assert.throws(() => api.computeExpectedFrequencies({ ...base, columnCategories: Array(51).fill('X') }), /50 categories/);
  assert.throws(() => api.computeExpectedFrequencies({ ...base, rowCategories: ['A'.repeat(101), 'B'] }), /length limit/);
});

test('HW6 expected: 5000 observations and 50×50 categories compute all 2500 cells and diagnostics', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ studyMethod: `R${i % 50}`, examOutcome: `C${Math.floor(i / 50) % 50}` }));
  const result = api.compareObservedExpected(api.buildContingencyTable(rows));
  assert.equal(result.expected.expectedCounts.flat().length, 2500);
  assert.ok(result.expected.expectedCounts.flat().every(value => value === 2));
  assert.ok(result.cells.flat().every(cell => cell.difference === 0));
  assert.equal(result.expected.diagnostics.cellsBelow5, 2500);
  assert.equal(result.expected.diagnostics.percentageBelow5, 100);
  checkMargins(result.expected, 1e-9);
});

test('HW6 expected: computations do not mutate caller data and results are deeply immutable', () => {
  const table = plain(defaultTable()), before = JSON.stringify(table);
  const result = api.compareObservedExpected(table);
  assert.equal(JSON.stringify(table), before);
  assert.throws(() => { result.expected.expectedCounts[0][0] = 99; }, TypeError);
  assert.throws(() => { result.cells[0][0].difference = 99; }, TypeError);
  table.rowTotals[0] = 99;
  assert.equal(result.expected.rowTotals[0], 12);
});

test('HW6 expected: dataset updates atomically refresh expectations and preserve them on errors; reset restores defaults', () => {
  const original = api.getState();
  const changed = api.applyDataset('Format,Result\nA,X\nA,Y\nB,X');
  assert.equal(changed.revision, original.revision + 1);
  assert.deepEqual(plain(changed.independenceComparison), plain(api.compareObservedExpected(changed.contingencyTable)));
  assert.throws(() => api.applyDataset('Format,Result\nBroken'));
  assert.equal(api.getState(), changed);
  const reset = api.resetDataset();
  assert.deepEqual(plain(reset.independenceComparison), plain(original.independenceComparison));
});
