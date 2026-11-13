import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('StatisticalIndependence', context);
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-12) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
const sum = values => values.reduce((a, b) => a + b, 0);

test('HW6 frequencies: default joint proportions and marginals are correct before display rounding', () => {
  const table = api.buildContingencyTable(api.dataset.observations);
  const joint = plain(api.computeJointFrequencies(table));
  assert.deepEqual(joint, { jointRelativeFrequencies: [[7 / 24, 5 / 24], [8 / 24, 4 / 24]],
    rowMarginals: [.5, .5], columnMarginals: [.625, .375], totalRelativeFrequency: 1 });
  near(sum(joint.jointRelativeFrequencies.flat()), 1);
  near(sum(joint.rowMarginals), 1);
  near(sum(joint.columnMarginals), 1);
  assert.notEqual(joint.jointRelativeFrequencies[0][0], .291667, 'No intermediate rounding');
});

test('HW6 frequencies: default conditional distributions use row and column totals, not N', () => {
  const table = api.buildContingencyTable(api.dataset.observations);
  const f = plain(api.computeConditionalFrequencies(table));
  assert.deepEqual(f.columnGivenRow, [[7 / 12, 5 / 12], [8 / 12, 4 / 12]]);
  assert.deepEqual(f.rowGivenColumn, [[7 / 15, 5 / 9], [8 / 15, 4 / 9]]);
  f.columnGivenRow.forEach(row => near(sum(row), 1));
  table.columnCategories.forEach((_, j) => near(sum(f.rowGivenColumn.map(row => row[j])), 1));
});

for (const [name, input] of [
  ['2×2', 'B,Y\nA,X\nB,Y'], ['2×3', 'B,Y\nA,Z\nB,X\nA,Y'],
  ['3×2', 'C,Y\nB,X\nA,Y\nC,Y'], ['3×3', 'C,Z\nB,Y\nA,X\nB,Y'],
  ['1×1', 'Only,Same\nOnly,Same'], ['1×3', 'Only,Z\nOnly,Y\nOnly,X'],
  ['3×1', 'Z,Only\nY,Only\nX,Only']
]) {
  test(`HW6 frequencies: ${name} normalizes both directions, preserves zeros, labels and source counts`, () => {
    const table = api.buildContingencyTable(api.parseDataset(input, { hasHeader: false }).observations);
    const original = JSON.stringify(table), f = plain(api.computeFrequencies(table));
    near(sum(f.jointRelativeFrequencies.flat()), 1);
    near(sum(f.rowMarginals), 1);
    near(sum(f.columnMarginals), 1);
    table.observedCounts.forEach((row, i) => {
      near(sum(f.columnGivenRow[i]), 1);
      row.forEach((count, j) => {
        assert.equal(f.jointRelativeFrequencies[i][j], count / table.totalObservations);
        assert.equal(f.columnGivenRow[i][j], count / table.rowTotals[i]);
        assert.equal(f.rowGivenColumn[i][j], count / table.columnTotals[j]);
        if (count === 0) {
          assert.equal(f.jointRelativeFrequencies[i][j], 0);
          assert.equal(f.columnGivenRow[i][j], 0);
          assert.equal(f.rowGivenColumn[i][j], 0);
        }
      });
    });
    table.columnTotals.forEach((_, j) => near(sum(f.rowGivenColumn.map(row => row[j])), 1));
    assert.equal(JSON.stringify(table), original);
  });
}

test('HW6 frequencies: explicit zero margins are null, distinct from observed zero cells', () => {
  const table = { rowCategories: ['Empty row', 'Present'], columnCategories: ['Empty column', 'Present'],
    observedCounts: [[0, 0], [0, 3]], rowTotals: [0, 3], columnTotals: [0, 3], totalObservations: 3 };
  assert.deepEqual(plain(api.computeFrequencies(table)), {
    jointRelativeFrequencies: [[0, 0], [0, 1]], rowMarginals: [0, 1], columnMarginals: [0, 1],
    totalRelativeFrequency: 1, columnGivenRow: [[null, null], [0, 1]], rowGivenColumn: [[null, 0], [null, 1]]
  });
  assert.equal(api.formatFrequency(null), 'N/A');
  assert.equal(api.formatFrequency(0), '0.000000');
});

test('HW6 frequencies: N=0 makes joint, marginal and conditional frequencies explicitly undefined', () => {
  const table = { rowCategories: ['Empty'], columnCategories: ['Empty'], observedCounts: [[0]],
    rowTotals: [0], columnTotals: [0], totalObservations: 0 };
  assert.deepEqual(plain(api.computeFrequencies(table)), {
    jointRelativeFrequencies: [[null]], rowMarginals: [null], columnMarginals: [null], totalRelativeFrequency: null,
    columnGivenRow: [[null]], rowGivenColumn: [[null]]
  });
});

test('HW6 frequencies: formatting is display-only, handles machine roundoff and rejects nonfinite values', () => {
  assert.equal(api.formatFrequency(7 / 24), '0.291667');
  assert.equal(api.formatFrequency(7 / 24, 'percentage'), '29.1667%');
  assert.equal(api.formatFrequency(null, 'percentage'), 'N/A');
  assert.equal(api.formatFrequency(1 + Number.EPSILON), '1.000000');
  assert.equal(api.formatFrequency(1), '1.000000');
  assert.equal(api.formatFrequency(1, 'percentage'), '100.0000%');
  for (const value of [NaN, Infinity, -Infinity, undefined, '0.5', -.01, 1.01]) {
    assert.throws(() => api.formatFrequency(value));
  }
  assert.throws(() => api.formatFrequency(.5, 'unknown'), /format/);
  const table = api.buildContingencyTable(api.parseDataset('A,X\nA,Y\nA,Z', { hasHeader: false }).observations);
  const f = api.computeFrequencies(table);
  assert.equal(f.columnGivenRow[0][0], 1 / 3);
  assert.equal(sum(f.columnGivenRow[0].map(value => Number(api.formatFrequency(value)))), .999999);
  near(sum(f.columnGivenRow[0]), 1);
});

test('HW6 frequencies: invalid shapes, unsafe counts and inconsistent totals are rejected', () => {
  const base = { rowCategories: ['A'], columnCategories: ['B'], observedCounts: [[1]],
    rowTotals: [1], columnTotals: [1], totalObservations: 1 };
  for (const invalid of [null, {}, { ...base, observedCounts: [[NaN]] }, { ...base, observedCounts: [[Infinity]] },
    { ...base, observedCounts: [[-1]] }, { ...base, observedCounts: [[.5]] }, { ...base, observedCounts: [[1, 0]] },
    { ...base, rowTotals: [2] }, { ...base, columnTotals: [2] }, { ...base, totalObservations: 2 },
    { ...base, totalObservations: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => api.computeJointFrequencies(invalid));
    assert.throws(() => api.computeConditionalFrequencies(invalid));
  }
});

test('HW6 frequencies: maximum-size data normalize within tolerance, without intermediate rounding', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ studyMethod: `R${i % 50}`, examOutcome: `C${Math.floor(i / 50) % 50}` }));
  const table = api.buildContingencyTable(rows), f = api.computeFrequencies(table);
  near(sum(f.jointRelativeFrequencies.flat()), 1);
  near(sum(f.rowMarginals), 1);
  near(sum(f.columnMarginals), 1);
  f.columnGivenRow.forEach(row => { near(sum(row), 1); assert.equal(api.formatFrequency(sum(row)), '1.000000'); });
  table.columnTotals.forEach((_, j) => near(sum(f.rowGivenColumn.map(row => row[j])), 1));
});

test('HW6 frequencies: state updates atomically with counts, invalid inputs preserve statistics, reset restores originals', () => {
  const original = api.getState();
  const updated = api.applyDataset('Format,Result\nSolo,Good\nSolo,Bad\nTeam,Good');
  assert.equal(updated.revision, original.revision + 1);
  assert.deepEqual(plain(updated.frequencies.jointRelativeFrequencies), [[1 / 3, 1 / 3], [1 / 3, 0]]);
  assert.deepEqual(plain(updated.frequencies), plain(api.computeFrequencies(updated.contingencyTable)));
  assert.throws(() => api.applyDataset('Format,Result\nBroken'));
  assert.equal(api.getState(), updated);
  assert.throws(() => { updated.frequencies.rowMarginals[0] = 99; }, TypeError);
  const reset = api.resetDataset();
  assert.deepEqual(plain(reset.frequencies), plain(original.frequencies));
  assert.equal(reset.activeDataset, api.dataset);
});
