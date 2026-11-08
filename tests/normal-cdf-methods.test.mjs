import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const context = vm.createContext({ document: { addEventListener() {} } });
new vm.Script(readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8')).runInContext(context);
const evaluate = expression => vm.runInContext(expression, context);
const calculate = (id, x, n = id === 'erf-series' ? 100 : 10000, tolerance = 1e-13) =>
  evaluate(`NormalCdf.calculate('${id}',${x},${n},${tolerance})`);
const near = (a, b, tolerance) => assert.ok(Number.isFinite(a) && Math.abs(a-b) <= tolerance,
  `${a} differs from ${b} by more than ${tolerance}`);
const methods = ['trapezoidal','simpson','erf-series'];

// Independent binary64 vectors generated with CPython 3.10.7, macOS libm:
// python3 -c 'import math; print([(x, .5*math.erfc(-x/math.sqrt(2))) for x in ...])'
// https://docs.python.org/3.10/library/math.html#math.erfc
// erfc directly computes the small tail, independently of these quadratures and
// erf power series. These are double precision checks, not certified exact digits.
// Test tolerances below apply to observed algorithm error, not claimed guarantees.
const vectors = [[-4,3.167124183311996e-5],[-3,.0013498980316300957],[-2,.022750131948179216],
  [-1.96,.02499789514822043],[-1,.15865525393145705],[-.5,.30853753872598694],[0,.5],
  [.5,.691462461274013],[1,.8413447460685429],[1.96,.9750021048517795],
  [2,.9772498680518208],[3,.9986501019683699],[4,.9999683287581669]];

for (const id of methods) {
  test(`Normal CDF ${id}: all 13 NIST references and independent erfc vectors`, () => {
    for (const [x, expected] of vectors) {
      const r = calculate(id,x);
      assert.ok(['completed','converged','accuracy-warning'].includes(r.status), r.message);
      near(r.approximation, expected, id === 'trapezoidal' ? 3e-8 : 3e-13);
      assert.ok(r.approximation >= 0 && r.approximation <= 1);
      assert.ok(r.absoluteError <= 1e-5);
      near(r.absoluteError, Math.abs(r.approximation-r.reference), 1e-16);
      assert.equal(r.referenceTolerance, 1e-5);
      assert.ok(r.elapsedMs >= 0);
    }
  });
  test(`Normal CDF ${id}: zero, symmetry, monotonicity, counts and missing reference`, () => {
    const zero=calculate(id,0);
    assert.equal(zero.approximation,.5); assert.equal(zero.evaluations,0); assert.equal(zero.iterations,0);
    let previous=-1;
    for(let i=-40;i<=40;i++) {
      const x=i/10, r=calculate(id,x);
      near(r.approximation+calculate(id,-x).approximation,1,2e-16);
      assert.ok(r.approximation >= previous); previous=r.approximation;
      if(x!==0) {
        if(id==='erf-series') { assert.equal(r.evaluations,0); assert.ok(r.iterations>0 && r.iterations<=100); }
        else { assert.equal(r.evaluations,10001); assert.equal(r.iterations,10000); }
      }
    }
    const r=calculate(id,.25);
    assert.equal(r.reference,null); assert.equal(r.absoluteError,null);
  });
}

test('Normal CDF quadrature: increasing resolution improves both methods and bounds contain error', () => {
  for(const id of ['trapezoidal','simpson']) {
    for(const [x,expected] of [[1,.8413447460685429],[-3,.0013498980316300957]]) {
      const coarse=calculate(id,x,20), fine=calculate(id,x,200), finer=calculate(id,x,2000);
      assert.ok(Math.abs(fine.approximation-expected)<Math.abs(coarse.approximation-expected));
      assert.ok(Math.abs(finer.approximation-expected)<Math.abs(fine.approximation-expected));
      for(const r of [coarse,fine,finer]) assert.ok(Math.abs(r.approximation-expected)<=r.discretizationBound+r.tailBound+1e-15);
    }
  }
});

test('Normal CDF quadrature: negative tails avoid cancellation, explicit cutoff and positive rounding', () => {
  for(const id of ['trapezoidal','simpson']) {
    for(const [x,expected] of [[-8,6.22096057427182e-16],[-10,7.619853024160593e-24]]) {
      const r=calculate(id,x,10000);
      assert.ok(Math.abs(r.approximation/expected-1)<2e-6);
      assert.equal(r.cutoff,12); assert.ok(r.tailBound>0 && r.tailBound<2e-33);
      assert.equal(r.tailProbability,r.approximation);
    }
    const r=calculate(id,10);
    assert.equal(r.approximation,1); assert.ok(r.tailProbability>0); assert.match(r.message,/rounded to 1/);
    assert.equal(calculate(id,10.1).status,'error');
    assert.equal(calculate(id,-1e308).approximation,null);
    assert.equal(calculate(id,4,2).evaluations,3);
    if(id==='trapezoidal') assert.match(calculate(id,1,2).message,/invalid at this resolution/);
  }
});

test('Normal CDF Simpson: odd n rejected, never silently rounded, including x=0', () => {
  for(const x of [0,1]) {
    assert.throws(()=>evaluate(`NormalCdf.simpson(${x},3)`),/even/);
    const r=calculate('simpson',x,3); assert.equal(r.approximation,null); assert.match(r.message,/even/);
  }
});

test('Normal CDF series: recurrence, term count, tolerances, non-convergence and cancellation warning', () => {
  // At x=1: z=1/sqrt(2); the next-term recurrence and alternating remainder
  // independently reproduce the first two partial sums (no factorial algorithm used).
  const one=calculate('erf-series',.01,1,1e-3);
  near(one.approximation,.5+.01/Math.sqrt(2*Math.PI),1e-16);
  assert.equal(one.iterations,1);
  const two=calculate('erf-series',.1,2,1e-7), z=.1/Math.SQRT2;
  near(two.approximation,.5+(z-z*z*z/3)/Math.sqrt(Math.PI),1e-16);
  assert.equal(two.iterations,2);
  const loose=calculate('erf-series',2,100,1e-4), tight=calculate('erf-series',2,100,1e-13);
  assert.ok(tight.iterations>loose.iterations);
  assert.ok(Math.abs(tight.approximation-.9772498680518208)<Math.abs(loose.approximation-.9772498680518208));
  assert.ok(tight.remainderBound<=1e-13);
  const failed=calculate('erf-series',4,1,1e-15);
  assert.equal(failed.status,'not-converged'); assert.equal(failed.converged,false);
  assert.equal(failed.approximation,null); assert.equal(failed.absoluteError,null); assert.equal(failed.iterations,1);
  const warning=calculate('erf-series',4,100,1e-15);
  assert.equal(warning.status,'accuracy-warning'); assert.ok(warning.roundoffEstimate>1e-15);
  near(warning.approximation,.9999683287581669,3e-13);
  assert.equal(calculate('erf-series',4.01).approximation,null);
  assert.match(calculate('erf-series',-8).message,/supports.*4.*cancellation/);
});

test('Normal CDF algorithms: invalid values and numeric parameters rejected without fabricated probabilities', () => {
  for(const id of methods) {
    for(const x of ['NaN','Infinity','-Infinity','null',"'1'"]) {
      assert.throws(()=>evaluate(`NormalCdf.methods.find(m=>m.id==='${id}').compute(${x})`));
    }
    for(const raw of ['', '-1','1.5','Infinity','100001','abc']) {
      assert.throws(()=>evaluate(`NormalCdf.validateParameter('${id}',${JSON.stringify(raw)})`));
    }
    for(const n of ['NaN','Infinity','null',"'1000'"]) {
      assert.equal(evaluate(`NormalCdf.calculate('${id}',1,${n}).approximation`),null);
    }
  }
  for(const t of ['NaN','Infinity','0','1e-16','.1',"'1e-12'"]) {
    assert.throws(()=>evaluate(`NormalCdf.erfSeries(1,100,${t})`));
  }
  assert.throws(()=>evaluate("NormalCdf.calculate('unknown',1,100)"));
});

test('Normal CDF density uses the actual Gaussian; no integration evaluations used for plotting', () => {
  near(evaluate('NormalCdf.density(0)'),1/Math.sqrt(2*Math.PI),1e-16);
  near(evaluate('NormalCdf.density(2)'),Math.exp(-2)/Math.sqrt(2*Math.PI),1e-16);
  assert.throws(()=>evaluate('NormalCdf.density(NaN)'));
});

// In particular, do not switch integration intervals at |x|=1: different
// discretization errors on either side can create a non-monotone jump.
test('Normal CDF quadrature: monotonic across zero and nearby values at |x|=1', () => {
  for(const id of ['trapezoidal','simpson']) for(const n of [20,1000,10000]) {
    let previous=-1;
    for(const x of [-1-1e-10,-1,-1+1e-10,-1e-12,0,1e-12,1-1e-10,1,1+1e-10]) {
      const r=calculate(id,x,n);
      assert.ok(Number.isFinite(r.approximation),r.message);
      assert.ok(r.approximation+2e-16>=previous, `${id}: non-monotone at ${x}`);
      previous=r.approximation;
    }
  }
});

test('Normal CDF quadrature: reported density evaluation count matches actual calls', () => {
  const instrumented = readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8')
    .replace('function density(x) {', 'function density(x) { globalThis.densityCalls++;');
  const c=vm.createContext({document:{addEventListener(){}},densityCalls:0});
  vm.runInContext(instrumented,c);
  for(const id of ['trapezoidal','simpson']) for(const x of [0,1,-8]) {
    c.densityCalls=0;
    const r=vm.runInContext(`NormalCdf.calculate('${id}',${x},20)`,c);
    assert.equal(r.evaluations,c.densityCalls);
    assert.equal(c.densityCalls,x===0?0:21);
  }
});
