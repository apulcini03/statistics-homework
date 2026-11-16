import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('StatisticalIndependence', context);
const references = JSON.parse(readFileSync(new URL('./chi-square-reference-vectors.json', import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}; tolerance=${tolerance}`);
const tableFrom = text => api.buildContingencyTable(api.parseDataset(text, { hasHeader: false }).observations);

test('HW6 Pearson: original statistic, df, contributions and independently referenced p-value', () => {
  const result = api.computeChiSquareTest(api.buildContingencyTable(api.dataset.observations));
  near(result.chiSquare, 8 / 45, 1e-15);
  assert.deepEqual(plain(result.contributions), [[1 / 30, 1 / 18], [1 / 30, 1 / 18]]);
  near(result.contributions.flat().reduce((a, b) => a + b, 0), result.chiSquare, 1e-15);
  assert.equal(result.degreesOfFreedom, 1);
  near(result.pValue, Number(references.vectors[0].probability), 5e-14);
  assert.equal(result.status, 'computed');
  assert.equal(result.applicability.statisticComputable, true);
  assert.equal(result.applicability.asymptoticReference, 'caution-sparse');
  assert.equal(result.diagnostics.minExpectedCount, 4.5);
  assert.equal(result.diagnostics.cellsBelow5, 2);
  assert.equal(result.applicability.assumptionsVerified, false);
  assert.match(result.applicability.warnings.join(' '), /may be unreliable.*not an absolute validity rule/);
  assert.ok(!('decision' in result) && !('alpha' in result));
});

for (const vector of references.vectors) {
  test(`HW6 Chi-square survival: independent df=${vector.df}, statistic=${vector.statistic}`, () => {
    const result = api.chiSquareSurvival(vector.statistic, vector.df);
    const expected = Number(vector.probability);
    assert.ok(Number.isFinite(result.probability) && result.probability >= 0 && result.probability <= 1);
    assert.ok(Number.isFinite(result.logProbability));
    if (expected === 0) {
      assert.equal(result.probability, 0);
      assert.equal(result.status, 'underflow');
    } else {
      near(result.probability, expected, 2e-11 * expected + 2 * Number.MIN_VALUE);
    }
    near(result.logProbability, vector.logProbability, 2e-10);
  });
}

for (const [name, text, df] of [
  ['2×2', 'B,Y\nA,X\nB,Y', 1], ['2×3', 'B,Y\nA,Z\nB,X\nA,Y', 2],
  ['3×2', 'C,Y\nB,X\nA,Y\nC,Y', 2], ['3×3', 'C,Z\nB,Y\nA,X\nB,Y', 4]
]) {
  test(`HW6 Pearson: ${name} has correct df, finite contributions and unchanged source counts`, () => {
    const table = tableFrom(text), before = JSON.stringify(table), result = api.computeChiSquareTest(table);
    assert.equal(result.degreesOfFreedom, df);
    assert.equal(result.status, 'computed');
    assert.ok(result.pValue > 0 && result.pValue <= 1);
    near(result.contributions.flat().reduce((a, b) => a + b, 0), result.chiSquare);
    assert.equal(JSON.stringify(table), before);
  });
}

test('HW6 Pearson: exact empirical independence gives zero statistic and p=1 for positive df', () => {
  const table = { rowCategories: ['A', 'B'], columnCategories: ['X', 'Y'],
    observedCounts: [[10, 10], [10, 10]], rowTotals: [20, 20], columnTotals: [20, 20], totalObservations: 40 };
  const result = api.computeChiSquareTest(table);
  assert.equal(result.chiSquare, 0);
  assert.equal(result.pValue, 1);
  assert.equal(result.pValueDetails.status, 'exact-zero-statistic');
  assert.equal(result.applicability.asymptoticReference, 'no-small-expected-count-warning');
  assert.equal(result.applicability.assumptionsVerified, false);
});

test('HW6 Pearson: single-category variables have defined zero contributions but no asymptotic p-value', () => {
  for (const text of ['Only,Same\nOnly,Same', 'Only,X\nOnly,Y', 'A,Only\nB,Only']) {
    const result = api.computeChiSquareTest(tableFrom(text));
    assert.equal(result.status, 'not-applicable');
    assert.equal(result.chiSquare, 0);
    assert.equal(result.degreesOfFreedom, 0);
    assert.equal(result.pValue, null);
    assert.equal(result.pValueDetails, null);
    assert.ok(result.contributions.flat().every(value => value === 0));
    assert.equal(result.applicability.statisticComputable, true);
    assert.equal(result.applicability.asymptoticReference, 'not-applicable');
  }
});

test('HW6 Pearson: zero expected counts remain unsupported without removing categories', () => {
  const table = { rowCategories: ['Empty', 'A', 'B'], columnCategories: ['X', 'Y'],
    observedCounts: [[0, 0], [5, 5], [5, 5]], rowTotals: [0, 10, 10], columnTotals: [10, 10], totalObservations: 20 };
  const before = JSON.stringify(table), result = api.computeChiSquareTest(table);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.chiSquare, null);
  assert.equal(result.pValue, null);
  assert.equal(result.diagnostics.zeroExpectedCells, 2);
  assert.equal(result.contributions.length, 3);
  assert.ok(result.contributions.flat().every(value => value === null));
  assert.equal(result.degreesOfFreedom, 2, 'Nominal df uses all displayed dimensions; no p-value is computed');
  assert.match(result.reason, /categories are not removed/);
  assert.equal(JSON.stringify(table), before);
});

test('HW6 Pearson: N=0 is explicitly undefined', () => {
  const table = { rowCategories: ['A'], columnCategories: ['X'], observedCounts: [[0]], rowTotals: [0], columnTotals: [0], totalObservations: 0 };
  const result = api.computeChiSquareTest(table);
  assert.equal(result.status, 'undefined');
  assert.equal(result.chiSquare, null);
  assert.equal(result.pValue, null);
  assert.deepEqual(plain(result.contributions), [[null]]);
});

test('HW6 survival: explicit convergence failure, invalid domains and extreme finite inputs', () => {
  const failed = api.chiSquareSurvival(5, 1, { maxIterations: 1 });
  assert.equal(failed.status, 'not-converged');
  assert.equal(failed.probability, null);
  assert.match(failed.reason, /did not converge/);
  for (const statistic of [-1, NaN, Infinity, '1']) assert.throws(() => api.chiSquareSurvival(statistic, 1));
  for (const df of [0, -1, 1.5, NaN, Infinity, 2402]) assert.throws(() => api.chiSquareSurvival(1, df));
  for (const maxIterations of [0, -1, 1.5, 10001]) assert.throws(() => api.chiSquareSurvival(1, 1, { maxIterations }));
  assert.equal(api.chiSquareSurvival(Number.MAX_VALUE, 2401).status, 'underflow');
  assert.equal(api.chiSquareSurvival(Number.MIN_VALUE, 1).status, 'rounded-to-one');
  assert.equal(api.chiSquareSurvival(1e-100, 1).status, 'rounded-to-one');
});

test('HW6 p-value formatting: tiny positive values, subnormal numbers and underflow never masquerade as exact zero', () => {
  const tiny = api.chiSquareSurvival(1000, 1);
  assert.ok(tiny.probability > 0);
  assert.match(api.formatPValue(tiny), /e-\d+/);
  const subnormal = api.chiSquareSurvival(1480, 2);
  assert.equal(subnormal.status, 'subnormal');
  assert.match(api.formatPValue(subnormal), /subnormal/);
  const underflow = api.chiSquareSurvival(1500, 2);
  assert.equal(underflow.probability, 0);
  assert.equal(underflow.logProbability, -750);
  assert.match(api.formatPValue(underflow), /Underflow \(p > 0; log p/);
  assert.match(api.formatPValue(api.chiSquareSurvival(1e-100, 1)), /rounded/);
  assert.equal(api.formatPValue(null), 'N/A');
  assert.throws(() => api.formatPValue({ probability: NaN }));
  assert.throws(() => api.formatPValue({ probability: 0 }));
});

test('HW6 Pearson: malformed contingency tables are rejected through existing expected-count validation', () => {
  const base = plain(api.getState().contingencyTable);
  for (const invalid of [null, {}, { ...base, rowTotals: [99, 12] }, { ...base, totalObservations: 0 },
    { ...base, observedCounts: [[7, NaN], [8, 4]] }, { ...base, observedCounts: [[7, -5], [8, 4]] },
    { ...base, observedCounts: [[7, 5.5], [8, 4]] }, { ...base, rowCategories: ['A', 'A'] }]) {
    assert.throws(() => api.computeChiSquareTest(invalid));
  }
});

test('HW6 Pearson: maximum supported dimensions have df=2401 and complete contributions', () => {
  const rows = Array.from({length:5000}, (_,i)=>({studyMethod:`R${i%50}`,examOutcome:`C${Math.floor(i/50)%50}`}));
  const result = api.computeChiSquareTest(api.buildContingencyTable(rows));
  assert.equal(result.degreesOfFreedom, 2401);
  assert.equal(result.contributions.flat().length, 2500);
  assert.equal(result.chiSquare, 0);
  assert.equal(result.pValue, 1);
  assert.equal(result.applicability.asymptoticReference, 'caution-sparse');
});

test('HW6 Pearson: atomic immutable state uses existing expected diagnostics, survives errors and resets', () => {
  const initial = api.getState();
  const changed = api.applyDataset('Format,Result\nA,X\nA,Y\nB,X');
  assert.equal(changed.chiSquareTest.diagnostics, changed.independenceComparison.expected.diagnostics);
  assert.deepEqual(plain(changed.chiSquareTest), plain(api.computeChiSquareTest(changed.contingencyTable)));
  assert.throws(() => api.applyDataset('Format,Result\nBroken'));
  assert.equal(api.getState(), changed);
  assert.throws(() => { changed.chiSquareTest.contributions[0][0] = 99; }, TypeError);
  const reset = api.resetDataset();
  assert.deepEqual(plain(reset.chiSquareTest), plain(initial.chiSquareTest));
});
