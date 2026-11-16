import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js',import.meta.url),'utf8'),context);
const api=vm.runInContext('StatisticalIndependence',context);
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}; tolerance=${tolerance}`);
// Independent df=1 tails: CPython math.erfc(math.sqrt(statistic/2)),
// using the identity Q(1/2,x)=erfc(sqrt(x)); DLMF 8.4.6.
const expected={
  A:{counts:[[7,5],[8,4]],n:24,chi:8/45,p:.6732899796599957,v:Math.sqrt(1/135),min:4.5,below:2},
  B:{counts:[[20,20],[20,20]],n:80,chi:0,p:1,v:0,min:20,below:0},
  C:{counts:[[22,18],[18,22]],n:80,chi:.8,p:.37109336952269756,v:.1,min:20,below:0},
  D:{counts:[[35,5],[5,35]],n:80,chi:45,p:1.9703444711799152e-11,v:.75,min:20,below:0}
};

for(const id of ['A','B','C','D']){
  test(`HW6 experiments: ${id} reconstructs the exact table from valid individual observations`,()=>{
    const rows=api.generateExperimentObservations(id);
    assert.equal(rows.length,expected[id].n);
    for(const row of rows){
      assert.deepEqual(Object.keys(row).sort(),['examOutcome','studyMethod']);
      assert.ok(['Individual','Group'].includes(row.studyMethod));
      assert.ok(['Pass','Fail'].includes(row.examOutcome));
      assert.equal(Object.isFrozen(row),true);
    }
    const table=api.buildContingencyTable(rows);
    assert.deepEqual(plain(table.observedCounts),expected[id].counts);
    assert.deepEqual(plain(table.rowCategories),['Individual','Group']);
    assert.deepEqual(plain(table.columnCategories),['Pass','Fail']);
    assert.equal(table.totalObservations,expected[id].n);
    assert.deepEqual(plain(api.generateExperimentObservations(id)),plain(rows),'Generation is deterministic');
  });
  test(`HW6 experiments: ${id} statistics and diagnostics match independent analytic references`,()=>{
    const result=api.getExperimentResults().find(entry=>entry.id===id), ref=expected[id];
    const t=result.contingencyTable, testResult=result.chiSquareTest;
    near(testResult.chiSquare,ref.chi,1e-14);
    assert.equal(testResult.degreesOfFreedom,1);
    near(testResult.pValue,ref.p,Math.max(1e-25,2e-11*ref.p));
    near(result.cramersV.value,ref.v,1e-15);
    assert.equal(testResult.diagnostics.minExpectedCount,ref.min);
    assert.equal(testResult.diagnostics.cellsBelow5,ref.below);
    assert.equal(testResult.diagnostics.zeroExpectedCells,0);
    assert.equal(testResult.applicability.assumptionsVerified,false);
    assert.equal(testResult.applicability.asymptoticReference,id==='A'?'caution-sparse':'no-small-expected-count-warning');
    assert.deepEqual(plain(testResult),plain(api.computeChiSquareTest(t)),'Summary uses the existing Pearson algorithm');
    for(const alpha of [.01,.05,.1]){
      assert.equal(api.interpretChiSquareTest(testResult,alpha).decision,id==='D'?'Reject H₀':'Fail to reject H₀');
    }
  });
}

test('HW6 experiments: A preserves the original observations, not just aggregate frequencies',()=>{
  assert.equal(api.generateExperimentObservations('A'),api.dataset.observations);
  assert.equal(api.getState().activeExperimentId,'A');
});

test('HW6 experiments: cached comparison does not mutate active data, alpha or dataset revision',()=>{
  const state=api.getState(), comparison=api.getExperimentResults();
  assert.equal(api.getState(),state);
  assert.equal(api.getExperimentResults(),comparison);
  for(const alpha of [.01,.1,.05]){
    api.setSignificanceLevel(alpha);
    assert.equal(api.getExperimentResults(),comparison);
    assert.equal(api.getState().activeDataset,state.activeDataset);
    assert.equal(api.getState().chiSquareTest,state.chiSquareTest);
    assert.equal(api.getState().revision,state.revision);
  }
  assert.throws(()=>{comparison[0].contingencyTable.observedCounts[0][0]=999;},TypeError);
});

test('HW6 experiments: repeated loading preserves alpha and marks every preset as synthetic',()=>{
  api.setSignificanceLevel(.1);
  for(const id of ['D','B','C','A','D','C']){
    const previous=api.getState();
    const next=api.loadExperiment(id);
    assert.equal(next.activeExperimentId,id);
    assert.equal(next.activeDataset.isSynthetic,true);
    assert.match(next.activeDataset.description,/Synthetic illustrative data/);
    assert.equal(next.alpha,.1);
    assert.equal(next.revision,previous.revision+1);
    assert.deepEqual(plain(next.contingencyTable.observedCounts),expected[id].counts);
    assert.deepEqual(plain(next.chiSquareTest),plain(api.computeChiSquareTest(next.contingencyTable)));
    assert.equal(next.interpretation.decision,id==='D'?'Reject H₀':'Fail to reject H₀');
  }
});

test('HW6 experiments: manual edits clear preset attribution while invalid input preserves the loaded scenario',()=>{
  api.loadExperiment('B');
  const before=api.getState();
  assert.throws(()=>api.applyDataset('Format,Result\nBroken'));
  assert.equal(api.getState(),before);
  const manual=api.applyDataset('Format,Result\nSolo,Good\nTeam,Bad\nSolo,Good');
  assert.equal(manual.activeExperimentId,null);
  assert.equal(manual.activeDataset.isSynthetic,false);
  assert.equal(manual.activeDataset.title,'User-provided paired observations');
  assert.deepEqual(plain(manual.contingencyTable.observedCounts),[[2,0],[0,1]]);
  const comparison=api.getExperimentResults();
  assert.deepEqual(plain(comparison.find(row=>row.id==='B').contingencyTable.observedCounts),expected.B.counts);
  const reset=api.resetDataset();
  assert.equal(reset.activeExperimentId,'A');
  assert.equal(reset.activeDataset,api.dataset);
  assert.equal(reset.alpha,.1);
});

test('HW6 experiments: unknown preset IDs do not alter any validated state',()=>{
  const before=api.getState();
  for(const id of ['',null,undefined,'E','__proto__',0]){
    assert.throws(()=>api.generateExperimentObservations(id),/four experiments/);
    assert.throws(()=>api.loadExperiment(id),/four experiments/);
    assert.equal(api.getState(),before);
  }
});

test('HW6 conclusions: cited empirical independence, conditionals and expected counts match existing calculations',()=>{
  const b=api.getExperimentResults().find(row=>row.id==='B');
  assert.deepEqual(plain(api.computeExpectedFrequencies(b.contingencyTable).expectedCounts),expected.B.counts);
  assert.equal(b.chiSquareTest.chiSquare,0);
  assert.equal(b.chiSquareTest.pValue,1);
  assert.equal(b.cramersV.value,0);
  const c=api.getExperimentResults().find(row=>row.id==='C'), f=api.computeFrequencies(c.contingencyTable);
  assert.deepEqual(plain(f.rowMarginals),[.5,.5]);
  assert.deepEqual(plain(f.columnMarginals),[.5,.5]);
  assert.equal(f.columnGivenRow[0][0],.55);
  assert.equal(f.columnGivenRow[1][0],.45);
  for(const row of api.getExperimentResults().filter(row=>row.id!=='A')){
    assert.deepEqual(plain(api.computeExpectedFrequencies(row.contingencyTable).expectedCounts),[[20,20],[20,20]]);
  }
  const html=readFileSync(new URL('../homework-07/index.html',import.meta.url),'utf8');
  const text=html.split('<div id="independenceExperimentConclusions">')[1].split('</div>')[0].replace(/\s+/g,' ');
  for(const fragment of ['χ² = 0, p = 1 and V = 0','22/40 = 0.55','18/40 = 0.45','χ² = 0.8, df = 1',
    'p ≈ 0.3711 and V = 0.1','χ² = 45, df = 1, V = 0.75 and p ≈ 1.97e-11','two expected counts are 4.5']){
    assert.ok(text.includes(fragment),fragment);
  }
  assert.match(text,/not proof of independence in the population/);
  assert.match(text,/observational comparison, not a randomized intervention/);
  assert.match(text,/preparation or motivation could confound/);
  assert.match(text,/no empirical conclusions about real students/);
});
