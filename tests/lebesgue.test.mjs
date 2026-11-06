import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const context = vm.createContext({ document: { addEventListener() {} } });
new vm.Script(readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8'))
  .runInContext(context);
const evaluate = expression => vm.runInContext(expression, context);
const calculate = (id, K, M, method = 'midpoint') =>
  evaluate(`calculateLebesgue('${id}',${K},${M},'${method}')`);
const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`);
const references = {
  square: [1 / 3, 0.00026], sin: [2, 0.00081], step: [2, 0.00051],
  absolute: [0.25, 0.000126], indicator: [0.5, 0.000251],
  sinc: [1.851937051982466, 0.00080], inverseSqrt: [2, 0.00224]
};

for (const [id, [reference, tolerance]] of Object.entries(references)) {
  for (const method of ['lower', 'midpoint', 'upper']) {
    test(`Lebesgue ${id}/${method}: approaches the reference integral`, () => {
      const result = calculate(id, 2000, 20000, method);
      near(result.approximation, reference, tolerance);
      assert.equal(result.reference, reference);
      assert.equal(result.evaluations, 20000);
    });
  }
  test(`Lebesgue ${id}: ordered estimates and measure conservation at multiple resolutions`, () => {
    for (const [K, M] of [[1, 1], [7, 3], [20, 2000], [10000, 101]]) {
      const result = calculate(id, K, M);
      const estimates = result.totalEstimates;
      assert.ok(estimates.lower <= estimates.midpoint + 1e-12);
      assert.ok(estimates.midpoint <= estimates.upper + 1e-12);
      assert.equal(result.levels.reduce((sum, level) => sum + level.count, 0), M);
      near(result.measureSum, result.b - result.a);
      near(result.accountedMeasure, result.originalB - result.originalA);
      assert.ok(result.levels.every(level => level.measure >= 0 &&
        level.lower <= level.midpoint && level.midpoint <= level.upper));
    }
  });
}

test('Lebesgue uses the same catalog and never calls the Riemann quadrature', () => {
  assert.equal(evaluate('INTEGRATION_FUNCTIONS === RIEMANN_FUNCTIONS'), true);
  assert.equal(evaluate(`(()=>{const original=riemannSum;
    riemannSum=()=>{throw Error('Riemann must not be called')};
    try{return Number.isFinite(calculateLebesgue('square',20,2000,'midpoint').approximation)}
    finally{riemannSum=original}})()`), true);
});

test('Lebesgue aggregates quantized levels rather than summing raw sample values', () => {
  const result = evaluate(`(()=>{const values=[0,.25,.5,.75,1];let calls=0;
    const r=lebesgueLevelEstimates(()=>values[calls++],0,1,4,5);return {r,calls}})()`);
  assert.equal(result.calls, 5);
  assert.deepEqual(Array.from(result.r.levels, level => level.count), [1, 1, 1, 2]);
  near(result.r.estimates.lower, 0.45);
  near(result.r.estimates.midpoint, 0.575);
  near(result.r.estimates.upper, 0.7);
  assert.notEqual(result.r.estimates.midpoint, 0.5, 'Raw midpoint-sample mean would be 0.5');
});

test('Lebesgue actual midpoint locations and sample-wise bounds, including rounding at edges', () => {
  const result = evaluate(`(()=>{const values=[.1,.3,.5,.7];const xs=[];let i=0;
    const r=lebesgueLevelEstimates(x=>{xs.push(x);return values[i++]},0,2,3,4);
    return {r,xs,values}})()`);
  assert.deepEqual(Array.from(result.xs), [0.25, 0.75, 1.25, 1.75]);
  const sampleIntegral = result.values.reduce((sum, value) => sum + value, 0) / 2;
  assert.ok(result.r.estimates.lower <= sampleIntegral);
  assert.ok(sampleIntegral <= result.r.estimates.upper);
  assert.equal(result.r.levels.at(-1).count > 0, true, 'Maximum assigned to last level');
  near(result.r.measureSum, 2);
});

test('Lebesgue constant functions and degenerate sampled ranges use one effective level', () => {
  for (const constant of [0, 3, 1e300]) {
    const r = evaluate(`lebesgueLevelEstimates(()=>${constant},0,0.5,10000,37)`);
    assert.equal(r.requestedK, 10000);
    assert.equal(r.K, 1);
    assert.equal(r.levels[0].count, 37);
    near(r.measureSum, 0.5);
    assert.equal(r.estimates.lower, constant / 2);
    assert.equal(r.estimates.midpoint, constant / 2);
    assert.equal(r.estimates.upper, constant / 2);
  }
  const coarse = calculate('square', 20, 1);
  assert.equal(coarse.K, 1);
  near(coarse.approximation, 0.25);
  assert.ok(coarse.totalEstimates.upper < 1 / 3,
    'Sample-based upper approximation is not necessarily an upper bound on the exact integral');
});

test('Lebesgue improper strategy separates the exact tail from the sampled interval', () => {
  const result = evaluate(`(()=>{const f=INTEGRATION_FUNCTIONS.inverseSqrt.evaluate;
    const xs=[];INTEGRATION_FUNCTIONS.inverseSqrt.evaluate=x=>{xs.push(x);return f(x)};
    try{return {r:calculateLebesgue('inverseSqrt',200,2000,'midpoint'),xs}}
    finally{INTEGRATION_FUNCTIONS.inverseSqrt.evaluate=f}})()`);
  near(result.r.a, 0.01);
  near(result.r.analyticContribution, 0.2);
  near(result.r.analyticDomainLength, 0.01);
  near(result.r.measureSum, 0.99);
  near(result.r.accountedMeasure, 1);
  near(result.r.approximation, result.r.numericalContribution + 0.2);
  assert.equal(result.xs.length, 2000);
  assert.ok(result.xs.every(x => x > 0.01 && x < 1));
  for (const [K, M] of [[1, 1], [10000, 100000]]) {
    const r = calculate('inverseSqrt', K, M);
    assert.ok(Number.isFinite(r.approximation));
  }
});

test('Lebesgue refining K and M improves representative errors without a universal monotonicity claim', () => {
  for (const id of ['sin', 'square', 'sinc', 'inverseSqrt']) {
    const coarse = calculate(id, 20, 200);
    const fine = calculate(id, 2000, 20000);
    assert.ok(fine.absoluteError < coarse.absoluteError / 10, id);
  }
  const lowK = calculate('square', 10, 2000);
  const highK = calculate('square', 1000, 2000);
  near(highK.measureSum, lowK.measureSum);
  assert.equal(highK.evaluations, lowK.evaluations);
  assert.ok(highK.totalEstimates.upper - highK.totalEstimates.lower <
    (lowK.totalEstimates.upper - lowK.totalEstimates.lower) / 90);
  assert.ok(calculate('square', 1000, 2000).absoluteError <
    calculate('square', 1000, 2).absoluteError / 100);
});

for (const field of ['K', 'M']) {
  for (const raw of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', 'abc',
    field === 'K' ? '10001' : '100001', '1e100']) {
    test(`Lebesgue invalid ${field}=${JSON.stringify(raw)}`, () => {
      const args = field === 'K' ? [raw, '2000'] : ['20', raw];
      assert.throws(() => evaluate(`parseLebesgueResolution(${args.map(JSON.stringify).join(',')})`), /integer/);
    });
  }
}

test('Lebesgue validates programmatic inputs, non-finite results and unsupported functions', () => {
  for (const args of ["'square',0,20,'midpoint'", "'square',20,Infinity,'midpoint'",
    "'square',20,20,'constructor'", "'dirichlet',20,20,'midpoint'", "'thomae',20,20,'midpoint'"]) {
    assert.throws(() => evaluate(`calculateLebesgue(${args})`));
  }
  for (const value of ['NaN', 'Infinity', '-1', "'1'"]) {
    assert.throws(() => evaluate(`lebesgueLevelEstimates(()=>${value},0,1,20,20)`), /finite, non-negative/);
  }
  assert.throws(() => evaluate('lebesgueLevelEstimates(()=>1e308,0,10,20,20)'), /numeric range/);
  for (const bounds of ['1,0', '0,Infinity', '0,0']) {
    assert.throws(() => evaluate(`lebesgueLevelEstimates(()=>1,${bounds},20,20)`), /finite increasing/);
  }
});

test('Lebesgue grouped rendering preserves all measures and contributions', () => {
  for (const method of ['lower', 'midpoint', 'upper']) {
    const result = calculate('square', 10000, 1000, method);
    const groups = evaluate(`displayedLebesgueLevels(calculateLebesgue('square',10000,1000,'${method}').levels,'${method}')`);
    assert.ok(groups.length <= 200);
    assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 1000);
    near(groups.reduce((sum, group) => sum + group.measure, 0), 1);
    near(groups.reduce((sum, group) => sum + group.contribution, 0), result.numericalContribution);
  }
});
