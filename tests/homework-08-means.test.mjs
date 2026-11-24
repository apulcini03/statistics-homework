import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('SampleMeanExperiments', context);
const rng = vm.runInContext('ConvergenceSimulations.createRng', context);
const plain = value => JSON.parse(JSON.stringify(value));
const parameters = extra => ({ ...plain(api.defaults), count: 1000, maxN: 100, ...extra });
const near = (x, target, tolerance = 1e-12) => assert.ok(Math.abs(x - target) <= tolerance,
  `${x} vs ${target}, tolerance ${tolerance}`);

test('HW7 means: known population moments, σ²/n, σ/√n and dependent variance', () => {
  assert.deepEqual(plain(api.populationMoments('bernoulli', 0.5)), { mean: 0.5, variance: 0.25, sd: 0.5 });
  const uniform = api.populationMoments('uniform');
  near(uniform.mean, 0.5); near(uniform.variance, 1 / 12);
  assert.deepEqual(plain(api.meanTheory('bernoulli', 0.5, 100)), { mean: 0.5, variance: 0.0025, sd: 0.05 });
  for (const n of [1, 2, 100, 2000]) {
    near(api.meanTheory('bernoulli', 0.5, n, true).variance, 0.25);
    near(api.meanTheory('uniform', null, n, true).variance, 1 / 12);
    near(api.meanTheory('uniform', null, n).variance, 1 / (12 * n));
  }
  near(api.meanTheory('bernoulli', 0.5, 400).sd / api.meanTheory('bernoulli', 0.5, 100).sd, 0.5);
  near(api.meanTheory('bernoulli', 0.5, 400).variance / api.meanTheory('bernoulli', 0.5, 100).variance, 0.25);
});

test('HW7 means: seeded Bernoulli and Uniform samples reproduce and have the correct support', () => {
  for (const distribution of ['bernoulli', 'uniform']) {
    const a = api.sampleFromSeed(distribution, 0.3, 2000, 42);
    assert.deepEqual(plain(a), plain(api.sampleFromSeed(distribution, 0.3, 2000, 42)));
    assert.notDeepEqual(plain(a), plain(api.sampleFromSeed(distribution, 0.3, 2000, 43)));
    assert.ok(a.every(x => x >= 0 && x < (distribution === 'uniform' ? 1 : 2)));
    if (distribution === 'bernoulli') assert.ok(a.every(x => x === 0 || x === 1));
    else assert.ok(new Set(a).size > 1900);
  }
  assert.ok(api.sampleFromSeed('bernoulli', 0, 2000, 0).every(x => x === 0));
  assert.ok(api.sampleFromSeed('bernoulli', 1, 2000, 0).every(x => x === 1));
});

test('HW7 means: cumulative averages use the same sample prefixes without mutation', () => {
  const values = [1, 0, 1, 0];
  assert.deepEqual(plain(api.cumulativeMeans(values)), [1, 0.5, 2 / 3, 0.5]);
  assert.deepEqual(values, [1, 0, 1, 0]);
  assert.deepEqual(plain(api.finalMeans([[1, 0, 1, 0], [0, 0, 1, 0], [1, 1]])), [0.5, 0.25, 1]);
  assert.throws(() => api.finalMeans([]));
  const sample = api.sampleFromSeed('uniform', null, 100, 71);
  const means = api.cumulativeMeans(sample);
  for (const n of [1, 2, 5, 100]) near(means[n - 1], sample.slice(0, n).reduce((s, x) => s + x, 0) / n);
  assert.throws(() => api.cumulativeMeans([]));
  assert.throws(() => api.cumulativeMeans([NaN]));
});

test('HW7 means: unbiased empirical variance and theoretical standardization', () => {
  assert.deepEqual(plain(api.sampleMoments([1, 2, 3])), { mean: 2, variance: 1, sd: 1 });
  assert.deepEqual(plain(api.sampleMoments([0.5, 0.5, 0.5])), { mean: 0.5, variance: 0, sd: 0 });
  near(api.standardizeMean(0.55, 100, api.populationMoments('bernoulli', 0.5)), 1);
  near(api.standardizeMean(0.5 + Math.sqrt(1 / 12) / 10, 100, api.populationMoments('uniform')), 1);
  assert.equal(api.standardizeMean(1, 100, api.populationMoments('bernoulli', 1)), null);
  assert.equal(api.standardizeMean(0, 100, api.populationMoments('bernoulli', 0)), null);
});

test('HW7 replicas: pairwise observations have zero covariance within six Monte Carlo standard errors', () => {
  for (const distribution of ['bernoulli', 'uniform']) {
    const random = rng(177), population = api.populationMoments(distribution, 0.5);
    const pairs = Array.from({ length: 5000 }, () => api.generateSample(distribution, 0.5, 2, random));
    const covariance = pairs.reduce((sum, pair) => sum + (pair[0] - population.mean) * (pair[1] - population.mean), 0) / pairs.length;
    near(covariance, 0, 6 * population.variance / Math.sqrt(pairs.length));
  }
});

test('HW7 LLN: strict deviation threshold and raw versus capped Chebyshev bound', () => {
  assert.equal(api.deviationProbability([0, 0.5, 1, 0.75], 0.5, 0.25), 0.5);
  assert.deepEqual(plain(api.chebyshevBound(0.25, 1, 0.1)), { raw: 25, capped: 1 });
  near(api.chebyshevBound(0.25, 100, 0.1).raw, 0.25);
  near(api.chebyshevBound(1 / 12, 100, 0.1).raw, 1 / 12);
  assert.equal(api.chebyshevBound(0, 1, Number.MIN_VALUE).raw, 0);
  assert.equal(api.chebyshevBound(0.25, 1, Number.MIN_VALUE).capped, 1);
  for (const epsilon of [0, -1, Infinity, NaN]) assert.throws(() => api.chebyshevBound(0.25, 100, epsilon));
});

test('HW7 CLT histogram: uneven widths, exact boundaries, final endpoint and unit integrated density', () => {
  const values = [-2, -1, 0, 0.5, 1, 3], edges = [-2, 0, 1, 3];
  const bins = api.histogram(values, edges);
  assert.deepEqual(plain(bins.map(b => b.count)), [2, 2, 2]);
  near(bins[0].density, 1 / 6); near(bins[1].density, 1 / 3); near(bins[2].density, 1 / 6);
  near(bins.reduce((s, b) => s + b.density * (b.right - b.left), 0), 1);
  assert.deepEqual(values, [-2, -1, 0, 0.5, 1, 3]);
  for (const bad of [[], [1], [0, 0], [1, 0], [0, Infinity]]) assert.throws(() => api.histogram([0], bad));
  assert.throws(() => api.histogram([2], [0, 1]));
  near(api.normalDensity(0), 1 / Math.sqrt(2 * Math.PI));
  near(api.normalDensity(1), api.normalDensity(-1));
});

for (const distribution of ['bernoulli', 'uniform']) {
  test(`HW7 ${distribution}: engine preserves prefixes and full independent replicas in every estimator`, () => {
    const p = parameters({ distribution, count: 200, maxN: 30, paths: 2 });
    const result = api.simulate(p), random = rng(p.seed);
    const replicaMeans = Array.from({ length: p.count }, () => api.cumulativeMeans(api.generateSample(distribution, p.p, p.maxN, random)));
    for (const snapshot of result.snapshots) {
      const means = replicaMeans.map(path => path[snapshot.n - 1]);
      assert.deepEqual(plain(snapshot.means), plain(means));
      const moments = api.sampleMoments(means), row = result.statistics[snapshot.n - 1];
      near(row.mean, moments.mean); near(row.variance, moments.variance);
      near(row.probability, api.deviationProbability(means, result.population.mean, p.epsilon));
    }
    for (let path = 0; path < p.paths; path++) for (const point of result.paths[path]) near(point.y, replicaMeans[path][point.x - 1]);
    assert.notDeepEqual(plain(replicaMeans[0]), plain(replicaMeans[1]));
    assert.deepEqual(plain(result), plain(api.simulate(p)));
    const more = api.simulate({ ...p, count: 201, paths: 8 });
    assert.deepEqual(plain(result.paths), plain(more.paths.slice(0, 2)), 'Plot count does not change generated samples');
    assert.deepEqual(plain(result.snapshots[0].means), plain(more.snapshots[0].means.slice(0, 200)));
  });
}

for (const distribution of ['bernoulli', 'uniform']) {
  test(`HW7 ${distribution}: Monte Carlo LLN, CLT and variance scaling use statistically motivated tolerances`, () => {
    const p = parameters({ distribution, count: 5000, maxN: 200 });
    const result = api.simulate(p), pop = result.population;
    // Bounded populations have kurtosis <= 3 at p=.5 / Uniform. Six asymptotic
    // sample-variance SEs sqrt(2/(R-1))*variance give a conservative fixed-seed check.
    const relativeVarianceTolerance = 6 * Math.sqrt(2 / (p.count - 1));
    for (const n of [1, 10, 100, 200]) {
      const row = result.statistics[n - 1];
      near(row.mean, pop.mean, 6 * Math.sqrt(row.theory.variance / p.count));
      near(row.variance, row.theory.variance, row.theory.variance * relativeVarianceTolerance);
      assert.ok(row.probability <= row.bound.capped + 6 * Math.sqrt(0.25 / p.count));
    }
    near(result.dependent.variance, pop.variance, pop.variance * relativeVarianceTolerance);
    assert.ok(result.dependent.variance > 150 * result.statistics[199].variance);
    for (const row of result.clt) {
      near(row.mean, 0, 6 / Math.sqrt(p.count));
      near(row.variance, 1, relativeVarianceTolerance);
      near(row.histogram.reduce((s, b) => s + b.density * (b.right - b.left), 0), 1);
      assert.equal(row.histogram.reduce((s, b) => s + b.count, 0), p.count);
      assert.deepEqual(plain(row.histogram.map(b => b.left)), plain(result.edges.slice(0, -1)));
    }
  });
}

test('HW7 dependence: one Y per replica yields exactly the same empirical variance at every n', () => {
  const p = parameters({ distribution: 'uniform', maxN: 200, count: 200 });
  const result = api.simulate(p), random = rng((p.seed ^ 0x9e3779b9) >>> 0);
  const ys = Array.from({ length: p.count }, () => random());
  assert.deepEqual(plain(result.dependent), { ...plain(api.sampleMoments(ys)), theory: 1 / 12 });
  for (const n of [1, 10, 200]) near(api.meanTheory('uniform', null, n, true).variance, 1 / 12);
});

test('HW7 degenerate Bernoulli: exact LLN and zero variances, with undefined CLT instead of NaN', () => {
  for (const p of [0, 1]) {
    const result = api.simulate(parameters({ p, count: 200, maxN: 100, epsilon: Number.MIN_VALUE }));
    assert.equal(result.clt.length, 0);
    assert.equal(result.dependent.variance, 0);
    for (const row of result.statistics) {
      assert.equal(row.mean, p); assert.equal(row.variance, 0); assert.equal(row.sd, 0);
      assert.equal(row.probability, 0); assert.equal(row.bound.raw, 0);
    }
    assert.ok(result.paths.every(path => path.every(point => point.y === p)));
    assert.doesNotMatch(JSON.stringify(result), /NaN|Infinity/);
  }
});

test('HW7 means: invalid inputs rejected and irrelevant Uniform p safely ignored', () => {
  for (const [key, values] of Object.entries({
    distribution: ['bad', '', null], p: ['', -0.1, 1.1, NaN, Infinity], maxN: [0, 2001, 10.5, '', null],
    count: [0, 199, 5001, 200.5], paths: [0, 9, 1.5], epsilon: [0, -1, '', Infinity, NaN],
    seed: [null, -1, 1.5, 4294967296, Infinity]
  })) for (const value of values) assert.throws(() => api.simulate(parameters({ [key]: value })), `${key}=${value}`);
  const p = api.validateParameters(parameters({ distribution: 'uniform', p: '', seed: 0, maxN: 1 }));
  assert.equal(p.p, null);
  assert.equal(api.simulate(p).statistics.length, 1);
});

test('HW7 means: batches yield, plotting is bounded, and n values respect the requested horizon', () => {
  const steps = api.simulationSteps(parameters({ maxN: 2000, count: 200 }));
  let step, yields = 0;
  do { step = steps.next(); if (!step.done) yields++; } while (!step.done);
  assert.equal(yields, 12);
  assert.equal(step.value.statistics.length, 2000);
  assert.ok(step.value.paths.every(path => path.length <= 300 && path[0].x === 1 && path.at(-1).x === 2000));
  assert.deepEqual(plain(step.value.snapshots.map(s => s.n)), [1, 2, 5, 10, 30, 50, 100, 200, 2000]);
  const short = api.simulate(parameters({ maxN: 3, count: 200 }));
  assert.deepEqual(plain(short.snapshots.map(s => s.n)), [1, 2, 3]);
});
