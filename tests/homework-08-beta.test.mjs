import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('BetaBernoulliInference', context);
const plain = x => JSON.parse(JSON.stringify(x));
const near = (x, expected, tolerance = 1e-11) => assert.ok(Math.abs(x - expected) <= tolerance,
  `${x} vs ${expected}; tolerance ${tolerance}`);
const relative = (x, expected, tolerance = 1e-9) => near(x, expected, Math.abs(expected) * tolerance);
const parameters = extra => ({ ...plain(api.defaults), ...extra });

test('HW7 Beta moments: independent rational formulas for symmetric, asymmetric and tiny shapes', () => {
  assert.deepEqual(plain(api.moments(2, 2)), { mean: 0.5, variance: 0.05 });
  near(api.moments(1, 1).mean, 0.5); near(api.moments(1, 1).variance, 1 / 12);
  for (const [a, b] of [[0.1, 0.2], [0.5, 0.5], [2, 8], [1000, 1000], [11000, 11000]]) {
    const m = api.moments(a, b);
    near(m.mean, a / (a + b));
    near(m.variance, a * b / ((a + b) ** 2 * (a + b + 1)));
  }
  const tiny = api.moments(1e-200, 1e-200);
  near(tiny.mean, 0.5); near(tiny.variance, 0.25);
});

test('HW7 Beta default: derived Beta(10,4), observed proportion and unrounded posterior moments', () => {
  const r = api.analyze(api.defaults);
  assert.deepEqual(plain(r.posterior), { a: 10, b: 4 });
  assert.equal(r.parameters.n, 10); assert.equal(r.sampleProportion, 0.8);
  near(r.priorMoments.mean, 0.5); near(r.priorMoments.variance, 0.05);
  near(r.posteriorMoments.mean, 10 / 14, 1e-15);
  near(r.posteriorMoments.variance, 40 / (14 ** 2 * 15), 1e-15);
  assert.ok(r.posteriorMoments.mean > r.priorMoments.mean);
  assert.ok(r.posteriorMoments.variance < r.priorMoments.variance);
});

test('HW7 Beta no data: posterior is prior, s/n undefined and normalized likelihood flat', () => {
  for (const [a, b] of [[2, 2], [0.1, 0.2], [1, 1], [8, 2]]) {
    const r = api.analyze(parameters({ a, b, successes: 0, failures: 0 }));
    assert.equal(r.parameters.n, 0); assert.equal(r.sampleProportion, null);
    assert.deepEqual(plain(r.posterior), { a, b });
    assert.deepEqual(plain(r.curves[0]), plain(r.curves[2]));
    assert.ok(r.curves[1].every(p => p.y === 1));
  }
});

test('HW7 Beta one-sided observations update the correct shape, for arbitrary asymmetric priors', () => {
  assert.deepEqual(plain(api.posteriorParameters(0.5, 3, 12, 0)), { a: 12.5, b: 3 });
  assert.deepEqual(plain(api.posteriorParameters(0.5, 3, 0, 12)), { a: 0.5, b: 15 });
  assert.equal(api.analyze(parameters({ successes: 12, failures: 0 })).sampleProportion, 1);
  assert.equal(api.analyze(parameters({ successes: 0, failures: 12 })).sampleProportion, 0);
});

test('HW7 log-beta: independent Python math.lgamma references, including small and large shapes', () => {
  // Reference constants computed independently using Python's math.lgamma.
  for (const [a, b, expected] of [[0.1, 0.2, 2.6809784793469147], [0.5, 0.5, 1.1447298858494008],
    [0.001, 1000, 6.900271629687268], [1000, 1000, -1388.4826016359038],
    [11000, 11000, -15252.625274107559], [10, 4, -7.958576903813899]]) {
    near(api.logBeta(a, b), expected, 7e-11);
    near(api.logBeta(a, b), api.logBeta(b, a), 1e-12);
  }
  near(api.logBeta(1, 1), 0, 1e-15);
  near(api.logBeta(2, 2), -Math.log(6));
});

test('HW7 Beta interior densities: independent polynomial and arcsine formulas', () => {
  for (const x of [1e-6, 0.01, 0.1, 0.25, 0.5, 0.8, 0.99, 1 - 1e-6]) {
    assert.equal(api.density(x, 1, 1), 1);
    relative(api.density(x, 2, 2), 6 * x * (1 - x));
    relative(api.density(x, 10, 4), 2860 * x ** 9 * (1 - x) ** 3);
    relative(api.density(x, 0.5, 0.5), 1 / (Math.PI * Math.sqrt(x * (1 - x))));
    relative(api.density(x, 0.5, 1), 0.5 / Math.sqrt(x));
  }
  relative(api.density(0.5, 11000, 11000), 118.34406062670725, 1e-9);
  relative(api.density(0.0001, 0.001, 1000), 9.03362210982521, 1e-9);
});

test('HW7 Beta endpoints: correct zeros, finite limits and genuine infinite singularities', () => {
  for (const x of [0, 1]) assert.equal(api.density(x, 1, 1), 1);
  assert.equal(api.density(0, 2, 2), 0); assert.equal(api.density(1, 2, 2), 0);
  near(api.density(0, 1, 5), 5); near(api.density(1, 5, 1), 5);
  assert.equal(api.density(0, 0.5, 2), Infinity);
  assert.equal(api.density(1, 2, 0.5), Infinity);
  assert.equal(api.density(0, 0.5, 0.5), Infinity);
  assert.equal(api.density(1, 0.5, 0.5), Infinity);
  assert.equal(api.logDensity(0, 2, 2), -Infinity);
});

test('HW7 Beta normalization: independent quadrature of density, first and second moments', () => {
  // Composite midpoint integration is independent of the log-beta recurrence.
  const n = 40000;
  for (const [a, b] of [[1, 1], [2, 2], [10, 4], [3, 7]]) {
    let area = 0, first = 0, second = 0;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) / n, weight = api.density(x, a, b) / n;
      area += weight; first += x * weight; second += x * x * weight;
    }
    const m = api.moments(a, b);
    near(area, 1, 2e-8); near(first, m.mean, 2e-8);
    near(second - first ** 2, m.variance, 2e-8);
  }
  // Remove the arcsine endpoint singularities by x = sin²(t); never evaluate
  // infinity times zero at t=0 or t=pi/2.
  let area = 0;
  for (let i = 0; i < 10000; i++) {
    const t = (i + 0.5) * Math.PI / 20000, x = Math.sin(t) ** 2;
    area += api.density(x, 0.5, 0.5) * 2 * Math.sin(t) * Math.cos(t) * Math.PI / 20000;
  }
  near(area, 1, 1e-8);
});

test('HW7 likelihood: raw Bernoulli kernel, endpoint empty factors and area normalization', () => {
  near(api.logLikelihood(0.8, 8, 2), Math.log(0.8 ** 8 * 0.2 ** 2));
  assert.equal(api.logLikelihood(0, 0, 0), 0); assert.equal(api.logLikelihood(1, 0, 0), 0);
  assert.equal(api.logLikelihood(0, 1, 0), -Infinity); assert.equal(api.logLikelihood(1, 0, 1), -Infinity);
  const grid = [0, 0.25, 0.5, 0.8, 1], values = api.likelihoodGrid(grid, 8, 2);
  values.forEach((p, i) => near(p.y, grid[i] ** 8 * (1 - grid[i]) ** 2));
  const r = api.analyze(api.defaults);
  // Integral theta^8(1-theta)^2 = B(9,3) = 1/495, independently from factorials.
  for (const p of r.curves[1]) relative(p.y, 495 * p.x ** 8 * (1 - p.x) ** 2);
  assert.notDeepEqual(plain(r.curves[1]), plain(r.curves[2]));
  const uniform = api.analyze(parameters({ a: 1, b: 1 }));
  assert.deepEqual(plain(uniform.curves[1]), plain(uniform.curves[2]), 'Coincidence with uniform prior is mathematical, not a relabeling');
});

test('HW7 Beta plot: common interior grid includes central peaks and does not replace infinite endpoints', () => {
  for (const input of [api.defaults, parameters({ a: 0.001, b: 0.1 }), parameters({ a: 1000, b: 1000, successes: 10000, failures: 10000 })]) {
    const r = api.analyze(input), grid = r.curves[0].map(p => p.x);
    assert.ok(grid.length < 1800);
    assert.equal(grid[0], 1e-6); assert.equal(grid.at(-1), 1 - 1e-6);
    assert.ok(grid.every((x, i) => x > 0 && x < 1 && (!i || x > grid[i - 1])));
    for (const curve of r.curves) {
      assert.deepEqual(plain(curve.map(p => p.x)), plain(grid));
      assert.ok(curve.every(p => Number.isFinite(p.y) && p.y >= 0));
    }
  }
  const singular = api.analyze(parameters({ a: 0.5, b: 0.5, successes: 0, failures: 0 }));
  assert.equal(singular.boundaries[0].atZero, Infinity);
  assert.equal(singular.boundaries[0].atOne, Infinity);
  assert.ok(singular.curves[0][0].y > 300);
});

test('HW7 Beta numerical range: distinguish true singularities, finite overflow and finite tail underflow', () => {
  assert.ok(Number.isFinite(api.logDensity(Number.MIN_VALUE, 0.001, 1)));
  assert.throws(() => api.density(Number.MIN_VALUE, 0.001, 1), /floating-point range/);
  assert.equal(api.density(0, 0.001, 1), Infinity);
  const r = api.analyze(parameters({ a: 1000, b: 1000, successes: 10000, failures: 10000 }));
  assert.ok(r.underflowCount > 0);
  assert.ok(r.curves[2].some(p => p.y > 100));
  assert.ok(r.curves[2].some(p => p.y === 0));
});

test('HW7 Beta validation: invalid shapes, counts, theta values and nonfinite inputs rejected', () => {
  for (const [key, values] of Object.entries({ a: [0, -1, 0.0001, 1001, '', Infinity, NaN, null],
    b: [0, -1, 0.0001, 1001, '', Infinity, NaN, false],
    successes: [-1, 1.5, 10001, '', Infinity, NaN], failures: [-1, 1.5, 10001, '', Infinity, NaN] })) {
    for (const value of values) assert.throws(() => api.analyze(parameters({ [key]: value })), `${key}=${value}`);
  }
  for (const theta of [-0.1, 1.1, NaN, Infinity, null, '']) assert.throws(() => api.density(theta, 2, 2));
  assert.throws(() => api.validateBeta(22001, 1));
  const input = { a: '2', b: '2', successes: '8', failures: '2' };
  assert.deepEqual(plain(api.validateParameters(input)), { a: 2, b: 2, successes: 8, failures: 2, n: 10 });
  assert.deepEqual(input, { a: '2', b: '2', successes: '8', failures: '2' });
});
