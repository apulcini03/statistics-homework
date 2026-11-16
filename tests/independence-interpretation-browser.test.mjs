import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async()=>{browser=await startBrowser();});
after(async()=>{if(browser){await browser.close();assert.deepEqual(browser.exceptions,[],'No unhandled application exceptions');}});
async function apply(text, hasHeader=true){
  await browser.set('independenceDatasetInput',text);
  await browser.evaluate(`document.getElementById('independenceHasHeader').checked=${hasHeader}`);
  await browser.click('applyIndependenceDataset');
}
async function view(){return browser.evaluate(`({
  state:StatisticalIndependence.getState(),alpha:document.getElementById('independenceAlpha').value,
  decision:document.getElementById('independenceInterpretationDecision').textContent,
  hypotheses:document.getElementById('independenceInterpretationHypotheses').textContent,
  descriptive:document.getElementById('independenceInterpretationDescriptive').textContent,
  metrics:document.getElementById('independenceInterpretationMetrics').textContent,
  warnings:document.getElementById('independenceInterpretationWarnings').textContent,
  explanation:document.getElementById('independenceInterpretationExplanation').textContent,
  feedback:document.getElementById('independenceAlphaFeedback').textContent,
  charts:Object.values(Chart.instances).map(chart=>chart.id)
})`);}

test('HW6 interpretation UI: default alpha, hypotheses, V and all three formal decisions retain sparse caution',async()=>{
  await browser.navigate(7);
  assert.deepEqual(await browser.evaluate("[...document.getElementById('independenceAlpha').options].map(option=>({value:Number(option.value),label:option.textContent}))"),
    [{value:.01,label:'0.01'},{value:.05,label:'0.05'},{value:.1,label:'0.10'}]);
  assert.equal((await view()).alpha,'0.05');
  for(const alpha of [.01,.05,.1]){
    await browser.set('independenceAlpha',String(alpha));
    const current=await view();
    assert.equal(current.decision,'Fail to reject H₀');
    assert.equal(current.state.interpretation.status,'available');
    assert.ok(Math.abs(current.state.cramersV.value-Math.sqrt(1/135))<1e-15);
    assert.match(current.descriptive,/Cramér's V: 0\.08606629658/);
    assert.match(current.metrics,/Asymptotic p-value: 0\.673289979660/);
    assert.ok(current.metrics.includes('α: '+alpha.toFixed(2)));
    assert.match(current.hypotheses,/Study Method and Exam Outcome are independent in the population/);
    assert.match(current.warnings,/Sparse expected counts.*may be unreliable/);
    assert.match(current.explanation,/does not establish population independence/);
  }
  const prose=await browser.evaluate("document.querySelector('section[aria-labelledby=\"statistical-interpretation\"]').textContent");
  assert.match(prose,/equality p = α belongs to Fail to reject H₀/);
  assert.match(prose,/does not establish causation/);
});

test('HW6 interpretation UI: alpha changes preserve source references, p-value, revision and every chart instance',async()=>{
  await browser.navigate(7);
  const before=await view();
  await browser.evaluate(`window.previousState=StatisticalIndependence.getState();window.datasetChanges=0;
    document.addEventListener('statistical-independence:dataset-change',()=>window.datasetChanges++);`);
  for(const alpha of [.01,.1,.05]){
    await browser.set('independenceAlpha',String(alpha));
    const current=await view();
    assert.deepEqual(current.charts,before.charts);
    assert.equal(current.state.revision,before.state.revision);
    assert.equal(current.state.chiSquareTest.pValue,before.state.chiSquareTest.pValue);
    assert.equal(await browser.evaluate(`['activeDataset','contingencyTable','frequencies','independenceComparison','chiSquareTest','cramersV']
      .every(key=>window.previousState[key]===StatisticalIndependence.getState()[key])`),true);
  }
  assert.equal(await browser.evaluate('window.datasetChanges'),0);
});

test('HW6 interpretation UI: association, nonapplicable tables and reset replace old text while retaining alpha',async()=>{
  await browser.navigate(7);
  await browser.set('independenceAlpha','0.1');
  await apply('Teaching format,Result\n'+[...Array(20).fill('Solo,Good'),...Array(20).fill('Team,Bad')].join('\n'));
  let current=await view();
  assert.equal(current.decision,'Reject H₀');
  assert.equal(current.state.cramersV.value,1);
  assert.match(current.hypotheses,/Teaching format and Result/);
  assert.equal(current.alpha,'0.1');
  await apply('Only,Same\nOnly,Same',false);
  current=await view();
  assert.equal(current.decision,'Decision unavailable');
  assert.equal(current.state.cramersV.value,null);
  assert.match(current.descriptive,/Cramér's V: N\/A/);
  assert.match(current.metrics,/Asymptotic p-value: N\/A/);
  assert.match(current.warnings,/No inferential decision is reported/);
  assert.ok(!current.hypotheses.includes('Teaching format'));
  await browser.click('resetIndependenceDataset');
  current=await view();
  assert.equal(current.alpha,'0.1');
  assert.equal(current.decision,'Fail to reject H₀');
  assert.match(current.hypotheses,/Study Method and Exam Outcome/);
  assert.match(current.warnings,/Sparse expected counts/);
  assert.equal(current.charts.length,4);
});

test('HW6 interpretation UI: invalid datasets and invalid alpha preserve validated results without stale decisions',async()=>{
  await browser.navigate(7);
  await browser.set('independenceAlpha','0.01');
  const before=await view();
  await apply('Format,Result\nBroken');
  const invalid=await view();
  assert.deepEqual(invalid,before);
  await browser.set('independenceAlpha','0.2');
  const badAlpha=await view();
  assert.equal(badAlpha.alpha,'0.01');
  assert.deepEqual(badAlpha.state,before.state);
  assert.equal(badAlpha.decision,before.decision);
  assert.match(badAlpha.feedback,/previous significance level and interpretation are unchanged/);
  await browser.set('independenceAlpha','0.05');
  assert.equal((await view()).feedback,'');
});

test('HW6 interpretation UI: tiny valid p-values and underflow use formal decisions with numerical warnings',async()=>{
  await browser.navigate(7);
  await apply([...Array(100).fill('A,X'),...Array(100).fill('B,Y')].join('\n'),false);
  let current=await view();
  assert.equal(current.decision,'Reject H₀');
  assert.equal(current.state.interpretation.basis,'asymptotic-p-value');
  assert.ok(current.state.chiSquareTest.pValue>0);
  await apply([...Array(2500).fill('A,X'),...Array(2500).fill('B,Y')].join('\n'),false);
  for(const alpha of [.01,.05,.1]){
    await browser.set('independenceAlpha',String(alpha));
    current=await view();
    assert.equal(current.decision,'Reject H₀');
    assert.equal(current.state.interpretation.basis,'log-asymptotic-p-value');
    assert.match(current.metrics,/Underflow \(p > 0; log p/);
    assert.match(current.warnings,/formal comparison uses log p/);
    assert.match(current.explanation,/not proof/);
  }
});

test('HW6 interpretation UI: dynamic HTML-like names remain text and V is zero for empirical independence',async()=>{
  await browser.navigate(7);
  await apply('<svg onload=window.injected=true>,Result\n<img src=x onerror=window.injected=true>,Good\n<img src=x onerror=window.injected=true>,Bad\nOther,Good\nOther,Bad');
  const current=await view();
  assert.equal(current.state.cramersV.value,0);
  assert.equal(current.state.chiSquareTest.pValue,1);
  assert.equal(current.decision,'Fail to reject H₀');
  assert.ok(current.hypotheses.includes('<svg onload=window.injected=true>'));
  assert.equal(await browser.evaluate("document.querySelectorAll('section[aria-labelledby=\"statistical-interpretation\"] svg,section[aria-labelledby=\"statistical-interpretation\"] img').length"),0);
  assert.equal(await browser.evaluate('window.injected===undefined'),true);
});

test('HW6 interpretation UI: 320/768/1440px contain alpha, long labels and maximum-category summaries',async()=>{
  await browser.navigate(7);
  const maximum=Array.from({length:5000},(_,i)=>`${'r'.repeat(95)}${i%50},${'c'.repeat(95)}${Math.floor(i/50)%50}`).join('\n');
  for(const text of [null,maximum]){
    if(text)await apply(text,false);
    for(const width of [320,768,1440]){
      await browser.viewport(width);
      await browser.set('independenceAlpha','0.1');
      const layout=await browser.evaluate(`(()=>{const width=document.documentElement.clientWidth;
        return {fits:document.documentElement.scrollWidth<=width,overflow:[...document.querySelectorAll('body *')].filter(e=>{
          const wrapper=e.closest('#independenceTableContainer,.independence-frequency-table');if(wrapper&&wrapper!==e)return false;
          const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1);
        }).map(e=>e.tagName+'#'+e.id)};})()`);
      assert.equal(layout.fits,true,`Page overflow at ${width}; maximum=${!!text}`);
      assert.deepEqual(layout.overflow,[]);
      const current=await view();
      assert.equal(current.charts.length,4);
      assert.equal(current.decision,'Fail to reject H₀');
      assert.match(current.warnings,/Sparse expected counts/);
    }
  }
});
