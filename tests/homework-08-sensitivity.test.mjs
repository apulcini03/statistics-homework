import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('BayesianSensitivityExperiments', context);
const beta = vm.runInContext('BetaBernoulliInference', context);
const plain = x => JSON.parse(JSON.stringify(x));
const near = (x, expected, tolerance = 1e-13) => assert.ok(Math.abs(x - expected) <= tolerance,
  `${x} vs ${expected}, tolerance ${tolerance}`);

test('HW7 sensitivity scenarios: A–D derive exact posterior shapes, moments and proportions', () => {
  const rows = api.scenarioResults();
  assert.deepEqual(plain(rows.map(r => r.id)), ['A', 'B', 'C', 'D']);
  const expected = [[9, 3, 3 / 4, 27 / (12 ** 2 * 13)], [28, 22, 14 / 25, 616 / (50 ** 2 * 51)],
    [16, 4, 4 / 5, 64 / (20 ** 2 * 21)], [100, 40, 5 / 7, 4000 / (140 ** 2 * 141)]];
  rows.forEach((r, i) => {
    const [a, b, mean, variance] = expected[i];
    assert.deepEqual(plain(r.posterior), { a, b });
    near(r.posteriorMoments.mean, mean); near(r.posteriorMoments.variance, variance);
    assert.equal(r.sampleProportion, 0.8);
    near(r.priorMoments.mean, i === 2 ? 0.8 : 0.5);
    assert.equal(r.parameters.n, i === 3 ? 100 : 10);
  });
});

test('HW7 prior comparison: identical data produce different posteriors, with a stronger symmetric prior pulling toward 0.5', () => {
  const [a, b, c, d] = api.scenarioResults();
  assert.ok([a, b, c].every(r => r.parameters.successes === 8 && r.parameters.failures === 2));
  assert.equal(new Set([a, b, c].map(r => r.posteriorMoments.mean)).size, 3);
  assert.ok(Math.abs(b.posteriorMoments.mean - 0.5) < Math.abs(a.posteriorMoments.mean - 0.5));
  assert.equal(b.parameters.a, d.parameters.a); assert.equal(b.parameters.b, d.parameters.b);
  assert.ok(Math.abs(d.posteriorMoments.mean - 0.8) < Math.abs(b.posteriorMoments.mean - 0.8));
});

test('HW7 increasing n: fixed Beta(20,20), constant 0.8, exact shapes and decreasing gap and variance', () => {
  const rows = api.sampleSizeExperiment(20, 20);
  const expected = [[10, 28, 22, 14 / 25], [50, 60, 30, 2 / 3], [100, 100, 40, 5 / 7], [500, 420, 120, 7 / 9]];
  rows.forEach((r, i) => {
    const [n, a, b, mean] = expected[i];
    assert.equal(r.parameters.n, n);
    assert.deepEqual(plain(r.posterior), { a, b });
    assert.equal(r.parameters.a, 20); assert.equal(r.parameters.b, 20);
    assert.equal(r.parameters.successes, 0.8 * n); assert.equal(r.parameters.failures, 0.2 * n);
    near(r.sampleProportion, 0.8); near(r.posteriorMoments.mean, mean);
    near(r.posteriorMoments.variance, a * b / ((a + b) ** 2 * (a + b + 1)));
    near(r.difference, mean - 0.8); near(r.priorWeight, 40 / (40 + n));
    if (i) {
      assert.ok(Math.abs(r.difference) < Math.abs(rows[i - 1].difference));
      assert.ok(r.posteriorMoments.variance < rows[i - 1].posteriorMoments.variance);
      assert.ok(r.priorWeight < rows[i - 1].priorWeight);
    }
  });
});

test('HW7 configurable prior: weighted-mean identity and fixed-prior sensitivity without a universal monotonicity claim', () => {
  for (const [a, b] of [[1, 1], [8, 2], [0.5, 0.5], [0.001, 1000], [1000, 0.001]]) {
    const rows = api.sampleSizeExperiment(a, b);
    for (const r of rows) {
      near(r.posteriorMoments.mean, r.priorWeight * a / (a + b) + (1 - r.priorWeight) * 0.8);
      near(r.difference, r.priorWeight * (a / (a + b) - 0.8));
      assert.ok(r.priorWeight > 0 && r.priorWeight < 1);
    }
  }
  assert.ok(api.sampleSizeExperiment(8, 2).every(r => Math.abs(r.difference) < 1e-15));
  const extreme = api.sampleSizeExperiment(0.001, 1000);
  assert.ok(extreme[1].posteriorMoments.variance > extreme[0].posteriorMoments.variance,
    'A valid custom prior can have increasing variance over a finite range; do not rescale it');
});

test('HW7 posterior comparison: only A/B/C share one grid and densities agree with the Step 5 API', () => {
  const result = api.posteriorComparison();
  assert.deepEqual(plain(result.curves.map(c => c.id)), ['A', 'B', 'C']);
  assert.ok(result.grid.length < 1800);
  for (const curve of result.curves) {
    assert.deepEqual(plain(curve.points.map(p => p.x)), plain(result.grid));
    const r = api.scenarioResults().find(r => r.id === curve.id);
    for (const index of [0, Math.floor(result.grid.length / 2), result.grid.length - 1]) {
      const p = curve.points[index];
      near(p.y, beta.density(p.x, r.posterior.a, r.posterior.b));
      assert.ok(Number.isFinite(p.y) && p.y >= 0);
    }
  }
  assert.equal(result.grid[0], 1e-6); assert.equal(result.grid.at(-1), 1 - 1e-6);
});

test('HW7 experiment summaries agree with complete Step 5 analyses before rounding', () => {
  for (const scenario of api.scenarios) {
    const summary = api.updateSummary(scenario), full = beta.analyze(scenario);
    assert.deepEqual(plain(summary.parameters), plain(full.parameters));
    assert.deepEqual(plain(summary.posterior), plain(full.posterior));
    assert.deepEqual(plain(summary.priorMoments), plain(full.priorMoments));
    assert.deepEqual(plain(summary.posteriorMoments), plain(full.posteriorMoments));
    assert.equal(summary.sampleProportion, full.sampleProportion);
  }
});

test('HW7 sensitivity validation: prior limits and scenario IDs reuse existing validation', () => {
  for (const [a, b] of [[0, 20], [-1, 20], [0.0001, 20], [1001, 20], ['', 20], [20, NaN], [Infinity, 20]]) {
    assert.throws(() => api.sampleSizeExperiment(a, b));
  }
  for (const id of ['', 'E', null, undefined]) assert.throws(() => api.getScenario(id));
  assert.equal(api.getScenario('B').a, 20);
  assert.deepEqual(plain(api.sampleSizeExperiment('20', '20')), plain(api.sampleSizeExperiment(20, 20)));
});

test('HW7 experiment purity: definitions are frozen and computed results cannot modify presets', () => {
  assert.equal(Object.isFrozen(api.scenarios), true);
  assert.ok(api.scenarios.every(Object.isFrozen));
  const r = api.scenarioResults();
  r[0].parameters.a = 123; r[0].posterior.a = 999;
  assert.equal(api.getScenario('A').a, 1);
  assert.equal(api.scenarioResults()[0].posterior.a, 9);
});
