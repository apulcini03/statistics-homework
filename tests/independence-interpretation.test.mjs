import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('StatisticalIndependence', context);
const plain = value => JSON.parse(JSON.stringify(value));
const original = api.getState().chiSquareTest;
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const withP = p => ({ ...original, pValue: p,
  pValueDetails: { probability: p, logProbability: Math.log(p), status: 'converged' } });

for (const alpha of [.01, .05, .10]) {
  test(`HW6 interpretation: original sample fails to reject at alpha=${alpha}, preserving sparse-count caution`, () => {
    const result = api.interpretChiSquareTest(original, alpha);
    assert.equal(result.decision, 'Fail to reject H₀');
    assert.equal(result.status, 'available');
    assert.equal(result.alpha, alpha);
    assert.equal(result.caution, true);
    assert.match(result.warnings.join(' '), /Sparse expected counts.*may be unreliable/);
    assert.match(result.explanation, /does not establish population independence/);
  });
  test(`HW6 interpretation: strict p<alpha handles below, equality and above alpha=${alpha}`, () => {
    assert.equal(api.interpretChiSquareTest(withP(alpha * (1 - 1e-12)), alpha).decision, 'Reject H₀');
    assert.equal(api.interpretChiSquareTest(withP(alpha), alpha).decision, 'Fail to reject H₀');
    assert.equal(api.interpretChiSquareTest(withP(alpha * (1 + 1e-12)), alpha).decision, 'Fail to reject H₀');
  });
}

test('HW6 interpretation: nonapplicable, unsupported and failed tests never yield an inferential decision', () => {
  const single = api.computeChiSquareTest(api.buildContingencyTable([{studyMethod:'A',examOutcome:'X'}]));
  for (const input of [null, {}, single, { ...original, status:'unsupported' },
    { ...original, status:'numerical-error' }, { ...original, degreesOfFreedom:0 }]) {
    const result = api.interpretChiSquareTest(input, .05);
    assert.equal(result.decision, 'Decision unavailable');
    assert.equal(result.status, 'unavailable');
  }
});

test('HW6 interpretation: invalid probabilities, inconsistent statuses and numerical failures are unavailable', () => {
  for (const p of [null, NaN, Infinity, -1, 2, '0.01']) {
    assert.equal(api.interpretChiSquareTest(withP(p), .05).decision, 'Decision unavailable');
  }
  for (const input of [withP(0), { ...withP(.01), pValueDetails:{status:'not-converged',probability:.01} },
    { ...withP(.01), pValueDetails:{status:'converged',probability:.02} },
    { ...withP(0), pValueDetails:{status:'underflow',probability:0,logProbability:NaN} },
    { ...withP(0), pValueDetails:{status:'underflow',probability:0,logProbability:Math.log(.01)} }]) {
    assert.equal(api.interpretChiSquareTest(input, .05).decision, 'Decision unavailable');
  }
});

test('HW6 interpretation: tiny valid probabilities and consistent underflow remain formal comparisons, not certainties', () => {
  assert.equal(api.interpretChiSquareTest(withP(1e-250), .01).decision, 'Reject H₀');
  const tail = api.chiSquareSurvival(1500,2);
  const result = api.interpretChiSquareTest({ ...original, pValue:tail.probability, pValueDetails:tail }, .01);
  assert.equal(result.decision, 'Reject H₀');
  assert.equal(result.basis, 'log-asymptotic-p-value');
  assert.match(result.warnings.join(' '), /formal comparison uses log p/);
  assert.match(result.explanation, /not proof/);
  const rounded = api.chiSquareSurvival(1e-100,1);
  const roundedResult = api.interpretChiSquareTest({ ...original, pValue:1, pValueDetails:rounded }, .10);
  assert.equal(roundedResult.decision,'Fail to reject H₀');
  assert.match(roundedResult.warnings.join(' '),/rounded to 1/);
});

test('HW6 interpretation: sparse warnings persist through all alpha values without mutation', () => {
  const before=JSON.stringify(original);
  for(const alpha of [.01,.05,.10]) {
    const result=api.interpretChiSquareTest(original,alpha);
    assert.ok(result.warnings.includes(original.applicability.warnings[0]));
    assert.throws(()=>{result.warnings.push('Changed');},/not extensible|read only|frozen/i);
  }
  assert.equal(JSON.stringify(original),before);
});

test('HW6 interpretation: unsupported alpha values are rejected instead of silently normalized', () => {
  for(const alpha of [undefined,null,'0.05',NaN,Infinity,-.05,0,1,.02,.2]) {
    assert.throws(()=>api.interpretChiSquareTest(original,alpha),/significance level/);
    assert.throws(()=>api.setSignificanceLevel(alpha),/significance level/);
  }
});

test('HW6 Cramer: original V matches sqrt(1/135) without display rounding', () => {
  const result=api.computeCramersV(original.chiSquare,24,2,2);
  assert.equal(result.status,'defined');
  near(result.value,Math.sqrt(1/135),1e-15);
  near(result.value,.08606629658238704,1e-15);
});

for(const [name,matrix,expectedV] of [
  ['2×2 independence',[[10,10],[10,10]],0],
  ['2×2 perfect association',[[10,0],[0,10]],1],
  ['2×3 association',[[10,10,0],[0,0,20]],1],
  ['3×3 diagonal',[[10,0,0],[0,10,0],[0,0,10]],1]
]) {
  test(`HW6 Cramer: ${name} has V=${expectedV}`,()=>{
    const rowTotals=matrix.map(row=>row.reduce((a,b)=>a+b,0));
    const columnTotals=matrix[0].map((_,j)=>matrix.reduce((sum,row)=>sum+row[j],0));
    const table={rowCategories:matrix.map((_,i)=>'R'+i),columnCategories:matrix[0].map((_,i)=>'C'+i),
      observedCounts:matrix,rowTotals,columnTotals,totalObservations:rowTotals.reduce((a,b)=>a+b,0)};
    const testResult=api.computeChiSquareTest(table);
    const result=api.computeCramersV(testResult.chiSquare,table.totalObservations,matrix.length,matrix[0].length);
    near(result.value,expectedV);
    assert.equal(result.status,'defined');
  });
}

test('HW6 Cramer: zero N, insufficient dimensions and absent statistics are explicitly undefined',()=>{
  for(const args of [[0,0,2,2],[0,24,1,2],[0,24,2,1],[null,24,2,2],[0,24,0,2]]) {
    const result=api.computeCramersV(...args);
    assert.equal(result.value,null);
    assert.equal(result.status,'undefined');
    assert.ok(result.reason);
  }
  for(const args of [[NaN,24,2,2],[Infinity,24,2,2],[-1,24,2,2],[1,-1,2,2],[1,24,2.5,2],[1,24,51,2]]) {
    assert.throws(()=>api.computeCramersV(...args));
  }
});

test('HW6 Cramer: only endpoint roundoff is corrected; a materially out-of-range value is invalid',()=>{
  const rounded=api.computeCramersV(100*(1+Number.EPSILON),100,2,2);
  assert.equal(rounded.value,1);
  assert.equal(rounded.roundedToBoundary,true);
  const invalid=api.computeCramersV(110,100,2,2);
  assert.equal(invalid.value,null);
  assert.equal(invalid.status,'invalid');
});

test('HW6 interpretation state: alpha updates preserve dataset, counts, p-value, V and dataset revision by identity',()=>{
  const before=api.getState();
  for(const alpha of [.01,.10,.05]) {
    const updated=api.setSignificanceLevel(alpha);
    for(const key of ['activeDataset','contingencyTable','frequencies','independenceComparison','chiSquareTest','cramersV']) {
      assert.equal(updated[key],before[key],key+' was unnecessarily replaced');
    }
    assert.equal(updated.revision,before.revision);
    assert.equal(updated.alpha,alpha);
    assert.equal(updated.interpretation.decision,'Fail to reject H₀');
  }
});

test('HW6 interpretation state: valid data update V and decision, invalid data preserve state, reset keeps alpha',()=>{
  api.setSignificanceLevel(.10);
  const changed=api.applyDataset([...Array(20).fill('A,X'),...Array(20).fill('B,Y')].join('\n'),{hasHeader:false});
  assert.equal(changed.alpha,.10);
  near(changed.cramersV.value,1);
  assert.equal(changed.interpretation.decision,'Reject H₀');
  assert.throws(()=>api.applyDataset('Format,Result\nBroken'));
  assert.equal(api.getState(),changed);
  const reset=api.resetDataset();
  assert.equal(reset.alpha,.10);
  near(reset.cramersV.value,Math.sqrt(1/135));
  assert.equal(reset.interpretation.decision,'Fail to reject H₀');
  assert.deepEqual(plain(reset.chiSquareTest),plain(original));
});
