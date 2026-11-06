import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const context = vm.createContext({ document: { addEventListener() {} } });
new vm.Script(readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8')).runInContext(context);
const evaluate = expression => vm.runInContext(expression, context);
const near = (actual, expected, tolerance = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}, tolerance ${tolerance}`);

for (const [id, tolerance] of Object.entries({ square: 0.00051, sin: 0.0016, step: 0.00201,
  absolute: 0.00026, inverseSqrt: 0.017, indicator: 0.00101, sinc: 0.0016 })) {
  test(`Comparison ${id}: six methods reuse the original numerical results and cost metrics`, () => {
    const rows = evaluate(`compareIntegrationMethods('${id}',1000,1000,20000,3)`);
    assert.equal(rows.length, 6);
    for (const row of rows) {
      const method = evaluate(`COMPARISON_METHODS.find(d=>d.id==='${row.id}').method`);
      const original = evaluate(row.family === 'riemann'
        ? `calculateRiemann('${id}',1000,'${method}')` : `calculateLebesgue('${id}',1000,20000,'${method}')`);
      assert.equal(row.approximation, original.approximation);
      assert.equal(row.reference, original.reference);
      assert.equal(row.absoluteError, original.absoluteError);
      assert.equal(row.evaluations, row.family === 'riemann' ? id === 'inverseSqrt' ? 999 : 1000 : 20000);
      assert.equal(row.benchmarkEvaluations, row.evaluations * 4);
      assert.equal(row.medianMs, null, 'No performance clock provided to the VM');
      assert.ok(row.absoluteError < tolerance);
      if (id === 'inverseSqrt') {
        assert.equal(row.improper, true);
        near(row.analyticContribution, row.family === 'riemann' ? 2 / Math.sqrt(1000) : 0.2);
        near(row.analyticEnd, row.family === 'riemann' ? 0.001 : 0.01);
      }
    }
  });
}

test('Comparison benchmark: one warm-up, measured repetitions, exact evaluation counts and clock summaries', () => {
  const counts = evaluate(`(()=>{const r=calculateRiemann,l=calculateLebesgue,f=INTEGRATION_FUNCTIONS.square.evaluate;
    let rc=0,lc=0,fc=0,t=0;
    calculateRiemann=(...args)=>{rc++;return r(...args)};
    calculateLebesgue=(...args)=>{lc++;return l(...args)};
    INTEGRATION_FUNCTIONS.square.evaluate=x=>{fc++;return f(x)};
    try{return {rows:compareIntegrationMethods('square',10,7,20,3,()=>t++),rc,lc,fc,t}}
    finally{calculateRiemann=r;calculateLebesgue=l;INTEGRATION_FUNCTIONS.square.evaluate=f}})()`);
  assert.equal(counts.rc, 12);
  assert.equal(counts.lc, 12);
  assert.equal(counts.fc, 12 * 10 + 12 * 20);
  assert.equal(counts.t, 6 * 3 * 2);
  for (const row of counts.rows) {
    assert.equal(row.warmups, 1);
    assert.equal(row.medianMs, 1);
    assert.equal(row.minimumMs, 1);
    assert.equal(row.maximumMs, 1);
    assert.equal(row.timeComplexity, row.family === 'riemann' ? 'O(n)' : 'O(M+K)');
    assert.equal(row.spaceComplexity, row.family === 'riemann' ? 'O(n)' : 'O(M+K)');
  }
});

test('Comparison benchmark: zero/partial/missing timer measurements are reported honestly', () => {
  assert.equal(evaluate('benchmarkIntegration(()=>1,3,()=>0).medianMs'), 0);
  assert.equal(evaluate('benchmarkIntegration(()=>1,3,()=>null).medianMs'), null);
  assert.equal(evaluate(`(()=>{let i=0;return benchmarkIntegration(()=>1,3,()=>++i===3?NaN:i).medianMs})()`), null);
  assert.equal(evaluate('comparisonTimeText(0)'), 'below timer resolution');
});

test('Convergence: explicit n/K/M schedules and per-run evaluation costs for every function', () => {
  for (const id of ['sin', 'square', 'step', 'absolute', 'inverseSqrt', 'indicator', 'sinc']) {
    const runs = evaluate(`runIntegrationConvergence('${id}')`);
    assert.deepEqual(Array.from(runs, c => c.n), [10, 20, 50, 100, 200, 500, 1000]);
    for (const run of runs) {
      assert.equal(run.K, run.n);
      assert.equal(run.M, run.n * 20);
      assert.equal(run.rows.length, 6);
      for (const row of run.rows) assert.equal(row.evaluations,
        row.family === 'riemann' ? run.n - (id === 'inverseSqrt' ? 1 : 0) : run.M);
    }
    if (['sin', 'square', 'inverseSqrt', 'sinc'].includes(id)) {
      for (const row of runs.at(-1).rows) {
        assert.ok(row.absoluteError < runs[0].rows.find(r => r.id === row.id).absoluteError, `${id} ${row.id}`);
      }
    }
  }
});

test('Convergence: exact zero errors have finite display coordinates with raw zero retained', () => {
  const plot = evaluate(`convergenceLogData(runIntegrationConvergence('absolute'))`);
  assert.ok(Number.isFinite(plot.floor) && plot.floor > 0);
  const points = plot.datasets.flatMap(d => d.data);
  assert.ok(points.some(p => p.actualError === 0));
  for (const point of points) {
    assert.ok(Number.isFinite(point.y) && point.y > 0);
    assert.equal(point.y, point.actualError === 0 ? plot.floor : point.actualError);
  }
  const allZero = evaluate(`convergenceLogData([{stage:1,n:1,K:1,M:1,
    rows:COMPARISON_METHODS.map(d=>({id:d.id,absoluteError:0,evaluations:1}))}])`);
  assert.equal(allZero.floor, 1e-16);
  const cost = evaluate(`convergenceLogData(runIntegrationConvergence('square'),true)`);
  assert.equal(cost.datasets[0].data[0].x, 10);
  assert.equal(cost.datasets[3].data[0].x, 200);
});

test('Comparison validates function, resolutions and repetition counts', () => {
  for (const args of ["'dirichlet',10,20,20,3", "'square',0,20,20,3", "'square',10,0,20,3",
    "'square',10,20,0,3", "'square',10,20,20,2", "'square',10,20,20,10", "'square',10,20,20,3.5"]) {
    assert.throws(() => evaluate(`compareIntegrationMethods(${args})`));
  }
  for (const value of ['', '-1', '1.5', 'NaN', '1e100']) {
    assert.throws(() => evaluate(`step4Integer(${JSON.stringify(value)},1,1000,'n')`));
  }
});

for (const n of [1, 3, 20, 1000]) {
  test(`Dirichlet n=${n}: exact rational tags, guaranteed irrational constructions and exact Darboux sums`, () => {
    const result = evaluate(`runDirichletExperiment(${n})`);
    assert.equal(result.rational.length, n);
    assert.equal(result.irrational.length, n);
    result.rational.forEach((p, i) => {
      assert.equal(p.y, 1);
      assert.equal(BigInt(p.numerator) * BigInt(2 * n), BigInt(p.denominator) * BigInt(2 * i + 1));
    });
    result.irrational.forEach((p, i) => {
      assert.equal(p.y, 0);
      assert.equal(p.kind, 'irrational');
      assert.equal(p.index, i);
      assert.equal(p.n, n);
      assert.ok(p.tag.includes('√2/2'));
      assert.ok(p.x > i / n && p.x < (i + 1) / n);
    });
    assert.equal(result.rationalTagSum, 1);
    assert.equal(result.irrationalTagSum, 0);
    assert.equal(result.darbouxLower, 0);
    assert.equal(result.darbouxUpper, 1);
    assert.equal(result.lebesgueIntegral, 0);
    assert.equal(result.riemannIntegral, null);
  });
}

test('Dirichlet supports isolated constructions and validates sampling parameters', () => {
  assert.equal(evaluate("runDirichletExperiment(10,'rational').irrationalTagSum"), null);
  assert.equal(evaluate("runDirichletExperiment(10,'irrational').rationalTagSum"), null);
  for (const n of [0, -1, 1.5, 1001, Infinity]) assert.throws(() => evaluate(`runDirichletExperiment(${n})`));
  assert.throws(() => evaluate("runDirichletExperiment(10,'random')"));
});

test('Thomae exact GCD, fraction reduction, endpoints and large integers', () => {
  assert.equal(evaluate('exactGcd(12n,18n)'), 6n);
  assert.throws(() => evaluate('exactGcd(12,18)'));
  const result = evaluate("thomaeRational('12','18')");
  assert.equal(result.numerator, '2'); assert.equal(result.denominator, '3'); near(result.value, 1 / 3);
  assert.equal(evaluate("thomaeRational('0','17').value"), 1);
  assert.equal(evaluate("thomaeRational('17','17').value"), 1);
  const large = evaluate("thomaeRational('9007199254740993','18014398509481986')");
  assert.equal(large.numerator, '1'); assert.equal(large.denominator, '2'); assert.equal(large.value, 0.5);
});

for (const [p, q] of [['', '1'], ['1', ''], ['-1', '2'], ['3', '2'], ['1.5', '2'], ['1', '0'],
  ['1', '-1'], ['1', 'NaN'], ['1e3', '1000'], ['1', '1'.repeat(101)]]) {
  test(`Thomae rejects invalid exact fraction ${JSON.stringify(p)}/${JSON.stringify(q).slice(0, 25)}`, () => {
    assert.throws(() => evaluate(`thomaeRational(${JSON.stringify(p)},${JSON.stringify(q)})`));
  });
}

test('Thomae rejects inexact Number inputs rather than silently rounding them', () => {
  assert.throws(() => evaluate('thomaeRational(9007199254740992,9007199254740992)'));
});

test('Thomae cloud contains unique reduced fractions, endpoints and denominator-dependent values', () => {
  const r = evaluate("runThomaeExperiment(30,100,'midpoint','2','4')");
  assert.equal(r.points.length, 279);
  assert.equal(new Set(r.points.map(p => p.tag)).size, r.points.length);
  for (const p of r.points) {
    assert.ok(Number(p.denominator) <= 30);
    near(p.y, 1 / Number(p.denominator));
    assert.equal(evaluate(`exactGcd(${p.numerator}n,${p.denominator}n)`), 1n);
  }
  assert.equal(r.points[0].x, 0); assert.equal(r.points[0].y, 1);
  assert.equal(r.points.at(-1).x, 1); assert.equal(r.points.at(-1).y, 1);
  assert.equal(r.selected.denominator, '2'); assert.equal(r.selected.value, 0.5);
  assert.equal(r.irrational.y, 0); assert.equal(r.irrational.kind, 'irrational');
  assert.equal(r.riemannIntegral, 0); assert.equal(r.lebesgueIntegral, 0);
});

test('Thomae exact rational-tag diagnostics depend on tag choice and shrink on representative refinements', () => {
  near(evaluate("thomaeTaggedSum(10,'left')"), 0.27);
  near(evaluate("thomaeTaggedSum(10,'right')"), 0.27);
  near(evaluate("thomaeTaggedSum(10,'midpoint')"), 0.09);
  near(evaluate("thomaeTaggedSum(100,'midpoint')"), 0.013);
  assert.ok(evaluate("thomaeTaggedSum(1000,'midpoint') < thomaeTaggedSum(10,'midpoint')"));
  assert.equal(evaluate("thomaeTaggedSum(1,'left')"), 1);
  assert.equal(evaluate("thomaeTaggedSum(1,'right')"), 1);
  assert.equal(evaluate("thomaeTaggedSum(1,'midpoint')"), 0.5);
});

test('Thomae validates denominator bounds, tag resolutions and methods', () => {
  for (const args of ["0,10,'midpoint','1','2'", "201,10,'midpoint','1','2'",
    "20,0,'midpoint','1','2'", "20,2001,'midpoint','1','2'", "20,1.5,'midpoint','1','2'",
    "20,10,'constructor','1','2'"]) assert.throws(() => evaluate(`runThomaeExperiment(${args})`));
});

test('Pathological rendering limits preserve the full computed point cloud and selected endpoints', () => {
  const r = evaluate("runThomaeExperiment(200,100,'midpoint','1','2')");
  assert.equal(r.points.length, 12233);
  const drawn = evaluate("displayedPathologicalPoints(runThomaeExperiment(200,100,'midpoint','1','2').points)");
  assert.equal(drawn.length, 1000); assert.equal(drawn[0].x, 0); assert.equal(drawn.at(-1).x, 1);
});
