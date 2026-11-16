import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async()=>{browser=await startBrowser();});
after(async()=>{if(browser){await browser.close();assert.deepEqual(browser.exceptions,[],'No unhandled application exceptions');}});
const chartIds=()=>browser.evaluate('Object.values(Chart.instances).map(chart=>chart.id)');
async function load(id){await browser.set('independenceExperiment',id);await browser.click('loadIndependenceExperiment');}

async function readComparison(){return browser.evaluate(`({
  rows:[...document.querySelectorAll('#independenceExperimentsTable tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent)),
  headers:[...document.querySelectorAll('#independenceExperimentsTable thead th')].map(cell=>cell.textContent),
  expected:StatisticalIndependence.getExperimentResults().map(entry=>{
    const t=entry.contingencyTable,test=entry.chiSquareTest;
    return [entry.name,String(t.totalObservations),t.rowCategories.length+' × '+t.columnCategories.length,
      test.chiSquare.toPrecision(12),String(test.degreesOfFreedom),StatisticalIndependence.formatPValue(test.pValueDetails),
      entry.cramersV.value.toPrecision(10),test.diagnostics.minExpectedCount.toFixed(6),
      test.applicability.warnings.join(' ') || 'No small-expected-count warning; sampling assumptions still require assessment.'];
  })
})`);}

async function checkActive(id){
  const view=await browser.evaluate(`(()=>{
    const s=StatisticalIndependence.getState(),f=s.frequencies,t=s.contingencyTable;
    const chart=id=>{const c=Chart.getChart(id);return c.data.datasets.map(d=>d.data);};
    return {state:s,active:document.getElementById('independenceActiveExperiment').textContent,
      origin:document.getElementById('independenceDatasetOrigin').textContent,
      editor:StatisticalIndependence.parseDataset(document.getElementById('independenceDatasetInput').value,
        {hasHeader:document.getElementById('independenceHasHeader').checked}).observations,
      observed:[...document.querySelectorAll('#independenceTableContainer tbody tr')].map(row=>[...row.cells].slice(1).map(c=>Number(c.textContent))),
      expected:[...document.querySelectorAll('#independenceExpectedTable tbody tr')].map(row=>[...row.cells].slice(1,-1).map(c=>Number(c.textContent))),
      jointFirst:document.querySelector('#independenceJointTable tbody tr td').textContent,
      rowChart:chart('independenceColumnGivenRowChart'),columnChart:chart('independenceRowGivenColumnChart'),
      expectedChart:chart('independenceExpectedChart'),contributionChart:chart('independenceChiSquareChart'),
      decision:document.getElementById('independenceInterpretationDecision').textContent,
      warnings:document.getElementById('independenceInterpretationWarnings').textContent,
      chi:document.getElementById('independenceChiSquareSummary').textContent,
      descriptive:document.getElementById('independenceInterpretationDescriptive').textContent,
      mode:document.getElementById('independenceFrequencyFormat').value,
      chartCount:Object.keys(Chart.instances).length,tableCount:document.querySelectorAll('#independenceExperimentsTable table').length};
  })()`);
  const s=view.state,t=s.contingencyTable,f=s.frequencies;
  assert.equal(s.activeExperimentId,id);
  assert.ok(view.active.includes(id+' —'));
  assert.match(view.active,/Synthetic illustrative data/);
  assert.match(view.origin,/Synthetic illustrative data/);
  assert.equal(s.activeDataset.isSynthetic,true);
  assert.deepEqual(view.editor,s.activeDataset.observations);
  assert.deepEqual(view.observed,t.observedCounts.map((row,i)=>[...row,t.rowTotals[i]]));
  assert.deepEqual(view.expected,s.independenceComparison.expected.expectedCounts);
  const first=f.jointRelativeFrequencies[0][0];
  assert.equal(view.jointFirst,view.mode==='percentage'?(first*100).toFixed(4)+'%':first.toFixed(6));
  assert.deepEqual(view.rowChart,t.columnCategories.map((_,j)=>f.columnGivenRow.map(row=>row[j])));
  assert.deepEqual(view.columnChart,f.rowGivenColumn);
  assert.deepEqual(view.expectedChart,[t.observedCounts.flat(),s.independenceComparison.expected.expectedCounts.flat()]);
  assert.deepEqual(view.contributionChart,[s.chiSquareTest.contributions.flat()]);
  assert.equal(view.decision,s.interpretation.decision);
  assert.ok(view.chi.includes('Asymptotic p-value:'));
  assert.ok(view.descriptive.includes(s.cramersV.value.toPrecision(10)));
  if(id==='A')assert.match(view.warnings,/Sparse expected counts/);else assert.doesNotMatch(view.warnings,/Sparse expected counts/);
  assert.equal(view.chartCount,4);
  assert.equal(view.tableCount,1);
  return view;
}

test('HW6 experiment UI: four named options and computed comparison, without automatic loading or extra plots',async()=>{
  await browser.navigate(7);
  assert.deepEqual(await browser.evaluate("[...document.getElementById('independenceExperiment').options].map(e=>e.value)"),['A','B','C','D']);
  const comparison=await readComparison();
  assert.deepEqual(comparison.rows,comparison.expected);
  assert.deepEqual(comparison.headers,['Scenario','N','Dimensions','Pearson χ²','df','Asymptotic p-value',"Cramér's V",'Minimum expected count','Reliability notes']);
  assert.match(comparison.rows[0][8],/Sparse expected counts/);
  assert.equal(await browser.evaluate("document.querySelectorAll('.status').length"),0);
  await browser.set('independenceExperiment','D');
  await checkActive('A');
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().contingencyTable.totalObservations'),24);
});

test('HW6 experiment UI: repeated loading switches every active table, chart, editor and interpretation with alpha retained',async()=>{
  await browser.navigate(7);
  await browser.set('independenceAlpha','0.1');
  const counts={A:[[7,5],[8,4]],B:[[20,20],[20,20]],C:[[22,18],[18,22]],D:[[35,5],[5,35]]};
  for(const id of ['D','C','B','A','D','B','C','A']){
    const oldIds=await chartIds();
    await load(id);
    const current=await checkActive(id);
    assert.deepEqual(current.state.contingencyTable.observedCounts,counts[id]);
    assert.equal(current.state.alpha,.1);
    assert.equal(current.decision,id==='D'?'Reject H₀':'Fail to reject H₀');
    assert.ok((await chartIds()).every(value=>!oldIds.includes(value)));
  }
});

test('HW6 experiment UI: manual edits clear scenario attribution, preserve input formatting and reset restores original A',async()=>{
  await browser.navigate(7);
  await load('D');
  const comparison=await readComparison();
  const text=' Format , Result \n Solo , Good \n Team , Bad \n Solo , Good \n';
  await browser.set('independenceDatasetInput',text);
  await browser.click('applyIndependenceDataset');
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeExperimentId'),null);
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeDataset.isSynthetic'),false);
  assert.match(await browser.evaluate("document.getElementById('independenceActiveExperiment').textContent"),/manually supplied observations, not attributed/);
  assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').value"),text);
  assert.deepEqual(await readComparison(),comparison);
  assert.match(await browser.evaluate("document.getElementById('independenceDatasetOrigin').textContent"),/User-provided data/);
  assert.match(await browser.evaluate("document.getElementById('independenceInterpretationHypotheses').textContent"),/Format and Result/);
  await browser.click('resetIndependenceDataset');
  await checkActive('A');
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeDataset===StatisticalIndependence.dataset'),true);
  assert.equal(await browser.evaluate("document.getElementById('independenceExperiment').value"),'A');
});

test('HW6 experiment UI: alpha only changes the formal decision layer, leaving cached comparison, data and plots intact',async()=>{
  await browser.navigate(7);
  for(const id of ['C','D','B']){
    await load(id);
    await browser.evaluate(`window.previous=StatisticalIndependence.getState();window.cache=StatisticalIndependence.getExperimentResults();
      window.comparisonTable=document.querySelector('#independenceExperimentsTable table');window.changes=0;
      document.addEventListener('statistical-independence:dataset-change',()=>window.changes++);`);
    const previous=await chartIds(), comparison=await readComparison();
    for(const alpha of [.01,.05,.1]){
      await browser.set('independenceAlpha',String(alpha));
      const current=await checkActive(id);
      assert.equal(current.state.alpha,alpha);
      assert.equal(current.decision,id==='D'?'Reject H₀':'Fail to reject H₀');
      assert.deepEqual(await chartIds(),previous);
      assert.deepEqual(await readComparison(),comparison);
      assert.equal(await browser.evaluate(`window.previous.contingencyTable===StatisticalIndependence.getState().contingencyTable
        && window.previous.chiSquareTest===StatisticalIndependence.getState().chiSquareTest
        && window.previous.cramersV===StatisticalIndependence.getState().cramersV
        && window.cache===StatisticalIndependence.getExperimentResults()
        && window.comparisonTable===document.querySelector('#independenceExperimentsTable table')`),true);
    }
    assert.equal(await browser.evaluate('window.changes'),0);
  }
});

test('HW6 experiment UI: invalid dataset or preset never replaces a loaded experiment or leaves a false source label',async()=>{
  await browser.navigate(7);
  await load('B');
  const before=await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'), previous=await chartIds();
  await browser.set('independenceDatasetInput','Format,Result\nBroken');
  await browser.click('applyIndependenceDataset');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'),before);
  assert.match(await browser.evaluate("document.getElementById('independenceActiveExperiment').textContent"),/B — Exact sample independence/);
  await browser.set('independenceExperiment','invalid');
  await browser.click('loadIndependenceExperiment');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'),before);
  assert.deepEqual(await chartIds(),previous);
  assert.match(await browser.evaluate("document.getElementById('independenceExperimentFeedback').textContent"),/active dataset and results are unchanged/);
  await load('C');
  await checkActive('C');
  assert.equal(await browser.evaluate("document.getElementById('independenceExperimentFeedback').textContent"),'');
  assert.equal(await browser.evaluate("document.getElementById('independenceDatasetInput').hasAttribute('aria-invalid')"),false);
});

test('HW6 experiment UI: conclusions state checked results and distinguish empirical frequencies, inference and causation',async()=>{
  await browser.navigate(7);
  const text=await browser.evaluate("document.getElementById('independenceExperimentConclusions').textContent.replace(/\\s+/g,' ')");
  assert.match(text,/exact independence of the empirical frequencies, not proof of independence in the population/);
  assert.match(text,/not the data, χ², p-value or V/);
  assert.match(text,/neither a probability nor a causal measure/);
  assert.match(text,/does not show that the method causes the outcome/);
  assert.match(text,/observational comparison, not a randomized intervention/);
  assert.match(text,/preparation or motivation could confound/);
  assert.match(text,/no empirical conclusions about real students/);
  assert.doesNotMatch(text,/H₀ is proven true|certainly independent|H₁ is proven true/);
});

test('HW6 experiment UI: all scenarios and wide comparison fit 320/768/1440px without horizontal page overflow',async()=>{
  await browser.navigate(7);
  for(const width of [320,768,1440]){
    await browser.viewport(width);
    for(const id of ['A','B','C','D']){
      await load(id);
      await checkActive(id);
      const bounds=await browser.evaluate(`(()=>{const width=document.documentElement.clientWidth;
        const wrapper=document.getElementById('independenceExperimentsTable');
        return {fits:document.documentElement.scrollWidth<=width,
          wrapperFits:wrapper.getBoundingClientRect().right<=width+1,
          scroll:getComputedStyle(wrapper).overflowX,
          overflow:[...document.querySelectorAll('body *')].filter(e=>{
            const parent=e.closest('#independenceTableContainer,.independence-frequency-table');if(parent&&parent!==e)return false;
            const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1);
          }).map(e=>e.tagName+'#'+e.id)};})()`);
      assert.equal(bounds.fits,true,`Page overflow at ${width}, scenario ${id}`);
      assert.equal(bounds.wrapperFits,true);
      assert.equal(bounds.scroll,'auto');
      assert.deepEqual(bounds.overflow,[]);
    }
  }
});
