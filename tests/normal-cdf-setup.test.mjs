import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const context = vm.createContext({ document: { addEventListener() {} } });
new vm.Script(readFileSync(new URL('../homework-06/script.js', import.meta.url), 'utf8')).runInContext(context);
const evaluate = expression => vm.runInContext(expression, context);

// Independent transcription of NIST's displayed areas from 0 to |z|.
// https://www.itl.nist.gov/div898/handbook/eda/section3/eda3671.htm
// Five decimals only. Tolerance 1e-5 is a conservative display-resolution
// allowance, not a NIST-certified bound. No future CDF algorithm is used here.
const publishedAreas = [
  [0, 0.00000], [0.5, 0.19146], [1, 0.34134], [1.96, 0.47500],
  [2, 0.47725], [3, 0.49865], [4, 0.49997]
];

test('Normal CDF setup: references match the NIST published area table without extra precision', () => {
  const source = evaluate('NormalCdf.source');
  assert.equal(source.url, 'https://www.itl.nist.gov/div898/handbook/eda/section3/eda3671.htm');
  assert.equal(source.decimalPlaces, 5);
  assert.equal(source.displayResolution, 1e-5);
  assert.equal(source.comparisonTolerance, 1e-5);
  assert.match(source.limitation, /not a certified error bound/);
  for (const [x, area] of publishedAreas) {
    for (const sign of [-1, 1]) {
      const value = evaluate(`NormalCdf.referenceAt(${x * sign}).cdf`);
      assert.ok(Math.abs(value - (0.5 + sign * area)) < 1e-15);
      assert.ok(Math.abs(value * 100000 - Math.round(value * 100000)) < 1e-10);
    }
  }
});

test('Normal CDF setup: exactly 13 ordered references, valid probabilities and symmetry', () => {
  const refs = evaluate('NormalCdf.references');
  assert.deepEqual(Array.from(refs, r => r.x), [-4,-3,-2,-1.96,-1,-0.5,0,0.5,1,1.96,2,3,4]);
  for (let i = 0; i < refs.length; i++) {
    assert.ok(refs[i].cdf >= 0 && refs[i].cdf <= 1);
    if (i) assert.ok(refs[i].cdf > refs[i - 1].cdf);
    assert.ok(Math.abs(refs[i].cdf + refs[refs.length - i - 1].cdf - 1) <= 1e-5);
  }
  assert.equal(evaluate('NormalCdf.referenceAt(0).cdf'), 0.5);
  assert.equal(evaluate('NormalCdf.referenceAt(-0).cdf'), 0.5);
  assert.equal(evaluate('NormalCdf.referenceAt(0.25)'), null);
  assert.equal(evaluate('NormalCdf.referenceAt(1.96000001)'), null);
  assert.equal(evaluate('NormalCdf.referenceAt(10)'), null);
});

for (const raw of ['1','-4','-1.96','0','.5','+0.5',' 1.96 ','1e2','-1e308','0e-400']) {
  test(`Normal CDF x validation accepts ${JSON.stringify(raw)}`, () => {
    assert.equal(evaluate(`NormalCdf.parseX(${JSON.stringify(raw)})`), Number(raw));
  });
}

for (const raw of ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e309', '1e-400', '1,5',
  'abc', '0x10', '1 2', '1e', '--1']) {
  test(`Normal CDF x validation rejects ${JSON.stringify(raw)}`, () => {
    assert.throws(() => evaluate(`NormalCdf.parseX(${JSON.stringify(raw)})`));
  });
}

test('Normal CDF setup: programmatic validation rejects non-numeric or non-finite x', () => {
  for (const x of ['null', 'undefined', 'NaN', 'Infinity', "'1'", 'true', '{}']) {
    assert.throws(() => evaluate(`NormalCdf.validateX(${x})`));
  }
});

test('Normal CDF setup: method catalog has no callable or fabricated numerical implementations', () => {
  const methods = evaluate('NormalCdf.methods');
  assert.deepEqual(Array.from(methods, method => method.id), ['trapezoidal', 'simpson', 'erf-series']);
  assert.ok(methods.every(method => method.available === false && method.compute === null));
  assert.equal(evaluate('Object.isFrozen(NormalCdf.methods) && Object.isFrozen(NormalCdf.references)'), true);
});

test('Normal CDF setup: standardized pending records keep all computed metrics null, even at x=0', () => {
  for (const method of ['trapezoidal', 'simpson', 'erf-series']) {
    for (const x of [0, 1, 0.25]) {
      const result = evaluate(`NormalCdf.createPendingResult('${method}',${x})`);
      assert.equal(result.status, 'unavailable');
      for (const field of ['approximation', 'absoluteError', 'evaluations', 'iterations', 'elapsedMs']) {
        assert.equal(result[field], null);
      }
      assert.equal(result.reference, x === 0 ? 0.5 : x === 1 ? 0.84134 : null);
      assert.equal(result.referenceTolerance, x === 0.25 ? null : 1e-5);
    }
  }
  assert.throws(() => evaluate("NormalCdf.createPendingResult('unknown',1)"));
});

test('Normal CDF setup: planned parameter validation enforces integer limits and Simpson parity only', () => {
  assert.equal(evaluate("NormalCdf.validateParameter('trapezoidal','1000')"), 1000);
  assert.equal(evaluate("NormalCdf.validateParameter('simpson','1000')"), 1000);
  assert.equal(evaluate("NormalCdf.validateParameter('erf-series','100')"), 100);
  for (const [method, raw] of [['trapezoidal',''],['trapezoidal','-1'],['trapezoidal','1.5'],
    ['trapezoidal','100001'],['simpson','3'],['simpson','0'],['erf-series','1001'],['erf-series','Infinity']]) {
    assert.throws(() => evaluate(`NormalCdf.validateParameter('${method}','${raw}')`));
  }
});

test('Normal CDF setup: formatters distinguish unavailable/invalid values and preserve reference precision', () => {
  assert.equal(evaluate('NormalCdf.formatNumber(null)'), 'Unavailable');
  assert.equal(evaluate('NormalCdf.formatNumber(NaN)'), 'Invalid numeric value');
  assert.equal(evaluate('NormalCdf.formatNumber(Infinity)'), 'Invalid numeric value');
  assert.equal(evaluate('NormalCdf.formatNumber(0)'), '0');
  assert.equal(evaluate('NormalCdf.formatReference(0.00003)'), '0.00003');
  assert.equal(evaluate('NormalCdf.formatReference(0.5)'), '0.50000');
  assert.equal(evaluate('NormalCdf.formatReference(null)'), 'Not tabulated');
});
