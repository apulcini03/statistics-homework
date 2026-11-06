import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const script = readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8');
const context = vm.createContext({ document: { addEventListener() {} } });
new vm.Script(script).runInContext(context);
const evaluate = expression => vm.runInContext(expression, context);
const calculate = (id, n, method) => evaluate(`calculateRiemann('${id}',${n},'${method}')`);
const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} within ${tolerance} of ${expected}`);
const methods = ['left', 'right', 'midpoint'];

for (const method of methods) {
  test(`Riemann ${method}: sine approximates 2`, () => {
    near(calculate('sin', 1000, method).approximation, 2, 2e-6);
  });
  test(`Riemann ${method}: square approximates 1/3`, () => {
    near(calculate('square', 10000, method).approximation, 1 / 3, 5.1e-5);
  });
  test(`Riemann ${method}: both steps use the specified value at the jump`, () => {
    const expected = { left: [2, 0.5], right: [2.1, 0.45], midpoint: [2, 0.5] }[method];
    near(calculate('step', 20, method).approximation, expected[0], 1e-12);
    near(calculate('indicator', 20, method).approximation, expected[1], 1e-12);
    near(calculate('step', 1000, method).approximation, 2, 0.002001);
    near(calculate('indicator', 1000, method).approximation, 0.5, 0.001001);
  });
  test(`Riemann ${method}: absolute value`, () => {
    near(calculate('absolute', 20, method).approximation, 0.25, 1e-12);
  });
  test(`Riemann ${method}: sinc including its zero limit`, () => {
    assert.equal(evaluate('RIEMANN_FUNCTIONS.sinc.evaluate(0)'), 1);
    near(calculate('sinc', 10000, method).approximation, 1.851937051982466, 1.6e-4);
  });
  test(`Riemann ${method}: actual sampling points and evaluation count`, () => {
    const result = evaluate(`(()=>{const samples=[];
      const result=riemannSum(x=>{samples.push(x);return x*x},0,1,4,'${method}');
      return {samples,result}})()`);
    const offset = { left: 0, right: 1, midpoint: 0.5 }[method];
    assert.deepEqual(Array.from(result.samples), Array.from({ length: 4 }, (_, i) => (i + offset) / 4));
    assert.equal(result.result.evaluations, 4);
    result.result.rectangles.forEach((r, i) => {
      near(r.left, i / 4, 1e-15);
      near(r.right, (i + 1) / 4, 1e-15);
      near(r.sample, (i + offset) / 4, 1e-15);
      near(r.height, r.sample ** 2, 1e-15);
    });
  });
  test(`Riemann ${method}: improper correction never evaluates zero and remains finite`, () => {
    for (const n of [1, 2, 20, 10000]) {
      const result = evaluate(`(()=>{const samples=[];
        const definition=RIEMANN_FUNCTIONS.inverseSqrt;
        const result=riemannSum(x=>{samples.push(x);if(!(x>0))throw Error('zero sample');
          return definition.evaluate(x)},0,1,${n},'${method}',definition.firstPanelIntegral);
        return {samples,result}})()`);
      assert.equal(result.result.evaluations, n - 1);
      assert.equal(result.samples.length, n - 1);
      assert.ok(result.samples.every(x => x > 0 && x <= 1));
      assert.ok(Number.isFinite(result.result.approximation));
      assert.ok(result.result.rectangles.every(r => Number.isFinite(r.height)));
      assert.equal(result.result.rectangles[0].corrected, true);
      assert.equal(result.result.rectangles[0].sample, null);
      near(result.result.rectangles[0].height * result.result.width, 2 / Math.sqrt(n), 1e-14);
    }
    near(calculate('inverseSqrt', 10000, method).approximation, 2, 0.006);
    assert.throws(() => evaluate('RIEMANN_FUNCTIONS.inverseSqrt.evaluate(0)'), /x > 0/);
  });
  test(`Riemann ${method}: coarse-to-fine errors decrease in appropriate cases`, () => {
    for (const id of ['sin', 'square', 'sinc', 'inverseSqrt']) {
      const errors = [20, 200, 2000].map(n => calculate(id, n, method).absoluteError);
      assert.ok(errors[1] < errors[0], `${id}: 200 intervals improve over 20`);
      assert.ok(errors[2] < errors[1], `${id}: 2000 intervals improve over 200`);
    }
    // Steps and |x-.5| can already be exact on aligned partitions.
    for (const id of ['step', 'indicator', 'absolute']) {
      near(calculate(id, 2000, method).approximation,
        { step: 2, indicator: 0.5, absolute: 0.25 }[id], 0.001001);
    }
  });
}

for (const raw of ['', ' ', '-1', '0', '1.5', '10001', '1e100', 'Infinity', 'NaN', 'abc']) {
  test(`Riemann input rejects ${JSON.stringify(raw)}`, () => {
    assert.throws(() => evaluate(`parseRiemannIntervals(${JSON.stringify(raw)})`), /integer/);
  });
}

test('Riemann input accepts both bounds and the default', () => {
  for (const raw of ['1', '20', '10000']) {
    assert.equal(evaluate(`parseRiemannIntervals('${raw}')`), Number(raw));
  }
});

test('Riemann rejects unsupported functions, methods and non-finite quadrature values', () => {
  for (const id of ['dirichlet', 'thomae', 'constructor', 'toString']) {
    assert.throws(() => calculate(id, 20, 'left'), /supported function/);
  }
  assert.throws(() => calculate('sin', 20, 'trapezoid'), /supported Riemann method/);
  assert.throws(() => evaluate("riemannSum(()=>Infinity,0,1,20,'left')"), /non-finite/);
});

test('Riemann visualization keeps actual rectangles while calculating the full partition', () => {
  const result = calculate('square', 10000, 'right');
  const displayed = evaluate("displayedRiemannRectangles(calculateRiemann('square',10000,'right').rectangles)");
  assert.equal(result.evaluations, 10000);
  assert.equal(result.rectangles.length, 10000);
  assert.equal(displayed.length, 200);
  assert.equal(displayed[0].left, 0);
  assert.equal(displayed.at(-1).right, 1);
  displayed.forEach(r => near(r.right - r.left, 1 / 10000, 1e-15));
  near(result.approximation, 1 / 3 + 1 / 20000 + 1 / 600000000, 1e-12);
});

test('Riemann curve plotting uses finite points and shows both sides of jumps', () => {
  for (const id of ['sin', 'square', 'step', 'absolute', 'inverseSqrt', 'indicator', 'sinc']) {
    const points = evaluate(`riemannCurvePoints(calculateRiemann('${id}',20,'midpoint'))`);
    assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(points.every((p, i) => i === 0 || p.x >= points[i - 1].x));
    if (id === 'inverseSqrt') assert.ok(points[0].x > 0);
    if (id === 'step' || id === 'indicator') {
      const jump = points.filter(p => p.x === 0.5).map(p => p.y);
      assert.deepEqual(Array.from(jump), id === 'step' ? [1, 3] : [1, 0]);
    }
  }
});

test('Riemann steps on odd partitions sample the jump without assuming alignment', () => {
  for (const method of methods) {
    const expected = method === 'left' ? [5 / 3, 2 / 3] : [7 / 3, 1 / 3];
    near(calculate('step', 3, method).approximation, expected[0], 1e-12);
    near(calculate('indicator', 3, method).approximation, expected[1], 1e-12);
  }
});
