import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('ConvergenceSimulations', context);
const plain = x => JSON.parse(JSON.stringify(x));
const parameters = (model = 'A', extra = {}) => ({ ...plain(api.defaults), model, ...extra });
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} differs from ${expected} by more than ${tolerance}`);

test('HW7 RNG: seeds reproduce draws, zero works, distinct seeds differ, values lie in [0,1)', () => {
  for (const seed of [0, 42, 0xffffffff]) {
    const a = api.createRng(seed), b = api.createRng(seed);
    const values = Array.from({ length: 1000 }, () => a());
    assert.deepEqual(values, Array.from({ length: 1000 }, () => b()));
    assert.ok(values.every(x => x >= 0 && x < 1));
    assert.ok(new Set(values).size > 990);
  }
  assert.notEqual(api.createRng(1)(), api.createRng(2)());
});

test('HW7 typewriter: n=1, consecutive dyadic blocks, exact endpoints and one hit per block', () => {
  assert.deepEqual(plain(api.typewriterIndex(1)), { m: 0, k: 0, size: 1, left: 0, right: 1 });
  for (let m = 0; m <= 9; m++) {
    const size = 2 ** m;
    const block = Array.from({ length: size }, (_, k) => api.typewriterIndex(size + k));
    assert.equal(block.length, size);
    for (let k = 0; k < size; k++) {
      assert.deepEqual(plain(block[k]), { m, k, size, left: k / size, right: (k + 1) / size });
      assert.equal(api.valueAt('A', size + k, { u: k / size }), 1, 'Left endpoint included');
      assert.equal(api.valueAt('A', size + k, { u: (k + 1) / size }), 0, 'Right endpoint excluded');
    }
    for (const u of [0, 0.125, 0.5, 0.999999999]) {
      assert.equal(block.reduce((sum, _, k) => sum + api.valueAt('A', size + k, { u }), 0), 1);
    }
  }
  for (const n of [0, -1, 1.5, 1024, NaN, Infinity]) assert.throws(() => api.typewriterIndex(n));
});

test('HW7 A theory: blockwise probability and L² errors, including strict ε boundary', () => {
  for (let n = 1; n <= 1023; n++) {
    const expected = 2 ** -Math.floor(Math.log2(n));
    assert.deepEqual(plain(api.theoretical('A', n, 0.5)), { probability: expected, mse: expected });
    for (const epsilon of [1, 2, Number.MAX_VALUE]) {
      assert.deepEqual(plain(api.theoretical('A', n, epsilon)), { probability: 0, mse: expected });
    }
  }
});

test('HW7 B: a single Z is reused along the whole path, with exact 1/n² theoretical MSE', () => {
  const p = parameters('B');
  const latents = api.generateLatents(p);
  assert.deepEqual(plain(latents), plain(api.generateLatents(p)));
  for (const latent of latents.slice(0, 10)) {
    const path = api.generateTrajectory('B', latent, p.maxN);
    assert.equal(path.length, p.maxN);
    path.forEach((x, i) => close(x * (i + 1), latent.z));
  }
  for (const n of [1, 2, 127, 1023]) close(api.theoretical('B', n, 0.5).mse, 1 / n ** 2);
  close(api.theoretical('B', 1, 1).probability, 0.31731050786291415, 2e-7);
  close(api.theoretical('B', 2, 1).probability, 0.04550026389635842, 2e-7);
  assert.equal(api.theoretical('B', 1023, Number.MAX_VALUE).probability, 0);
});

test('HW7 normal probability approximation matches independent central and tail reference values', () => {
  for (const [x, tail] of [[0, 0.5], [0.5, 0.3085375387259869], [1, 0.15865525393145707],
    [2, 0.02275013194817921], [3, 0.0013498980316300945], [6, 9.865876450376946e-10]]) {
    close(api.normalSurvival(x), tail, 8e-8);
    close(api.normalSurvival(-x), 1 - tail, 8e-8);
  }
});

test('HW7 C: alternating fixed independent Z/W and nonvanishing odd-index errors', () => {
  const latent = { z: 3, w: -2 };
  assert.deepEqual(plain(api.generateTrajectory('C', latent, 15)), Array.from({ length: 15 }, (_, i) => i % 2 ? 3 : -2));
  for (let n = 1; n <= 127; n++) {
    const expected = n % 2 ? { probability: 0.4795001221869535, mse: 2 } : { probability: 0, mse: 0 };
    const actual = api.theoretical('C', n, 1);
    close(actual.probability, expected.probability, 2e-7);
    assert.equal(actual.mse, expected.mse);
  }
});

test('HW7 C: Gaussian marginals, independent paired draws and identical parity distributions across time', () => {
  const latents = api.generateLatents(parameters('C', { count: 5000, seed: 91 }));
  const moment = key => latents.reduce((s, l) => s + l[key], 0) / latents.length;
  for (const key of ['z', 'w']) {
    close(moment(key), 0, 0.04);
    close(latents.reduce((s, l) => s + l[key] ** 2, 0) / latents.length, 1, 0.06);
  }
  close(latents.reduce((s, l) => s + l.z * l.w, 0) / latents.length, 0, 0.04);
  for (const n of [1, 2, 126, 127]) {
    const values = latents.map(l => api.valueAt('C', n, l));
    const cdf = api.empiricalCDF(values, [-1, 0, 1]);
    cdf.forEach((point, i) => close(point.y, [0.158655, 0.5, 0.841345][i], 0.03));
  }
});

test('HW7 error estimators: reference pairing, strict > ε, exact probabilities and MSE', () => {
  const errors = api.calculateErrors([1, 3, -2, 4], [0, 1, -1, 4]);
  assert.deepEqual(plain(errors), [1, 2, -1, 0]);
  assert.deepEqual(plain(api.estimateErrors(errors, 1)), { probability: 0.25, mse: 1.5 });
  assert.throws(() => api.calculateErrors([1], []));
  assert.throws(() => api.estimateErrors([], 1));
  assert.throws(() => api.estimateErrors([NaN], 1));
});

for (const model of ['A', 'B', 'C']) {
  test(`HW7 ${model}: seeded simulation is reproducible and Monte Carlo statistics match direct full-sample calculations`, () => {
    const p = parameters(model, { count: 1000, maxN: 31 });
    const result = api.simulate(p);
    assert.deepEqual(plain(result), plain(api.simulate(p)));
    assert.equal(result.statistics.length, p.maxN);
    const latents = api.generateLatents(p);
    for (const row of result.statistics) {
      const errors = latents.map(l => api.valueAt(model, row.n, l) - (model === 'C' ? l.z : 0));
      const probability = errors.filter(e => Math.abs(e) > p.epsilon).length / p.count;
      const mse = errors.reduce((s, e) => s + e ** 2, 0) / p.count;
      close(row.probability, probability);
      close(row.mse, mse);
    }
    assert.equal(result.paths.length, 8);
    result.paths.forEach(path => assert.equal(path.length, 31));
    assert.notDeepEqual(plain(result.statistics), plain(api.simulate({ ...p, seed: 43 }).statistics));
  });
}

test('HW7 Monte Carlo: known population values are reproduced within sampling tolerances', () => {
  for (const model of ['A', 'B', 'C']) {
    const result = api.simulate(parameters(model, { count: 5000, maxN: 127 }));
    for (const n of [1, 2, 7, 31, 126, 127]) {
      const row = result.statistics[n - 1];
      close(row.probability, row.theory.probability, 0.035);
      close(row.mse, row.theory.mse, model === 'C' ? 0.12 : 0.05);
    }
    if (model === 'C') {
      assert.deepEqual(plain(result.statistics[0]), { ...plain(result.statistics[126]), n: 1 });
      assert.equal(result.statistics[125].mse, 0);
    }
  }
});

test('HW7 empirical CDF: correct normalization, repeated atoms and no mutation', () => {
  const sample = [1, 0, 1, 0];
  assert.deepEqual(plain(api.empiricalCDF(sample, [-1, 0, 0.5, 1, 2])),
    [{ x: -1, y: 0 }, { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  assert.deepEqual(sample, [1, 0, 1, 0]);
  assert.throws(() => api.empiricalCDF([], [0]));
  for (const model of ['A', 'B', 'C']) {
    const d = api.simulate(parameters(model, { count: 100, maxN: 15 })).distributions;
    for (const points of [...d.snapshots.map(s => s.cdf), d.reference, d.theoreticalReference]) {
      assert.deepEqual(plain(points.map(p => p.x)), plain(d.reference.map(p => p.x)));
      assert.ok(points.every((p, i) => p.y >= 0 && p.y <= 1 && (!i || p.y >= points[i - 1].y)));
    }
    assert.equal(d.reference[0].y, 0);
    assert.equal(d.reference.at(-1).y, 1);
  }
});

test('HW7 parameter validation rejects missing, nonfinite, fractional and out-of-range inputs', () => {
  for (const [key, values] of Object.entries({
    model: ['', 'D', 'toString', null], count: ['', 0, 9, 5001, 10.5, NaN, Infinity, null],
    maxN: [0, 14, 1024, 15.5, undefined], epsilon: ['', 0, -1, NaN, Infinity, null],
    seed: ['', -1, 0x100000000, 1.5, NaN, Infinity, false]
  })) for (const value of values) assert.throws(() => api.simulate(parameters('A', { [key]: value })), `${key}=${value}`);
  assert.deepEqual(plain(api.validateParameters({ model: 'B', count: '10', maxN: '15', epsilon: '1e-12', seed: '0' })),
    { model: 'B', count: 10, maxN: 15, epsilon: 1e-12, seed: 0 });
  for (const epsilon of [0, -1, Infinity, NaN]) assert.throws(() => api.theoretical('B', 1, epsilon));
});

test('HW7 maximum workload: bounded full statistics, unthinned early paths and parity-safe plotting', () => {
  const p = parameters('A', { count: 5000, maxN: 1023 });
  const iterator = api.simulationSteps(p);
  let step, yields = 0;
  do { step = iterator.next(); if (!step.done) yields++; } while (!step.done);
  const result = step.value;
  assert.equal(yields, 63, 'Batching yields every 16 indices');
  assert.equal(result.statistics.length, 1023);
  assert.equal(result.paths[0].length, 127);
  for (const path of result.paths) {
    for (let m = 0; m <= 6; m++) {
      assert.equal(path.slice(2 ** m - 1, 2 ** (m + 1) - 1).reduce((s, point) => s + point.y, 0), 1);
    }
  }
  for (const maxN of [15, 16, 127, 128, 1022, 1023]) {
    const indices = api.displayIndices(maxN);
    assert.ok(indices.length <= 256);
    assert.equal(indices[0], 1);
    assert.equal(indices.at(-1), maxN);
    for (let m = 0; 2 ** m <= maxN; m++) assert.ok(indices.includes(2 ** m));
    assert.ok(indices.some(n => n % 2 === 1) && indices.some(n => n % 2 === 0));
  }
});
