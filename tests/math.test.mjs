import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const root = new URL('../', import.meta.url);
import assert from 'node:assert/strict';
import {webcrypto,pbkdf2Sync} from 'node:crypto';

const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tol ${t})`);
const nop=()=>{};const drawing=new Proxy({},{get:()=>nop,set:()=>true});
function load(n){const elements=new Map();const document={addEventListener:nop,getElementById:id=>{if(!elements.has(id))elements.set(id,{addEventListener:nop,getContext:()=>drawing,width:540,height:540});return elements.get(id);}};const math=Object.create(Math);let state=2026;math.random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};const context=vm.createContext({document,window:{},console:{log:nop,error:nop},Math:math,TextEncoder,crypto:webcrypto,setInterval,clearInterval});const file=`homework-0${n}/script.js`;new vm.Script(fs.readFileSync(new URL(file, root),'utf8'),{filename:file}).runInContext(context);return expression=>vm.runInContext(expression,context);}
const h1=load(1),h2=load(2),h3=load(3),h4=load(4),h5=load(5);
for(let i=1;i<=5;i++)test(`HW${i} script parse/load`,()=>assert.equal(typeof [h1,h2,h3,h4,h5][i-1],'function'));
test('HW1 G order 9, all points on curve',()=>{assert.equal(h1('scalarMultiply(9,G)'),null);for(let k=1;k<=8;k++)assert.equal(h1(`isOnCurve(scalarMultiply(${k},G)) && scalarMultiply(${k},G)!==null`),true);});
test('HW1 exhaustive group closure, inverse, commutativity, associativity',()=>assert.equal(h1(`(()=>{const ps=[null];for(let x=0;x<17;x++)for(let y=0;y<17;y++)if(isOnCurve({x,y}))ps.push({x,y});const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);for(const a of ps){if(!eq(pointAdd(a,null),a))return false;for(const b of ps){if(!isOnCurve(pointAdd(a,b))||!eq(pointAdd(a,b),pointAdd(b,a)))return false;for(const c of ps)if(!eq(pointAdd(pointAdd(a,b),c),pointAdd(a,pointAdd(b,c))))return false;}}return true})()`),true));
test('HW1 bit totals claimed in HTML',()=>assert.equal(h1(`(()=>{let x=0,y=0;for(let k=1;k<=8;k++){let q=scalarMultiply(k,G);x+=[...to5Bits(q.x)].filter(v=>v==='1').length;y+=[...to5Bits(q.y)].filter(v=>v==='1').length;}return x===12&&y===14})()`),true));
test('HW1 avalanche 6->7 = 7/10',()=>assert.equal(h1('hammingDistance(encodePoint(scalarMultiply(6,G)),encodePoint(scalarMultiply(7,G)))'),7));
test('HW1 Pearson constant/singleton undefined',()=>{assert.equal(h1('pearsonCorrelation([1],[2])'),null);assert.equal(h1('pearsonCorrelation([1,2],[3,3])'),null);near(h1('pearsonCorrelation([1,2,3],[2,4,6])'),1);});
test('HW2 bit/Hamming extremes',()=>{assert.equal(h2(`countOneBits('0xFf00')`),8);assert.equal(h2(`addressHammingDistance('0x'+'0'.repeat(40),'0x'+'f'.repeat(40))`),160);assert.equal(h2(`digestHammingDistance('00','ff')`),8);});
test('HW2 malformed digest rejected',()=>assert.throws(()=>h2(`digestHammingDistance('gg','00')`)));
test('HW2 digest rejects non-hexadecimal characters in either argument', () => {
  for (const invalid of ['gg', '0x00', 'ab cd', 'ab\n', 'é0', '１２', '-1', '0g']) {
    const valid = '0'.repeat(invalid.length);
    for (const pair of [[invalid, valid], [valid, invalid]]) {
      assert.throws(() => h2(`digestHammingDistance(${pair.map(JSON.stringify).join(',')})`),
        /hexadecimal/i);
    }
  }
});
test('HW2 digest rejects unequal lengths', () => {
  for (const pair of [['00', '0000'], ['ff', 'f']]) {
    assert.throws(() => h2(`digestHammingDistance(${pair.map(JSON.stringify).join(',')})`),
      /lengths must match/i);
  }
});
test('HW2 digest rejects empty strings', () => {
  for (const pair of [['', ''], ['', '00'], ['00', '']]) {
    assert.throws(() => h2(`digestHammingDistance(${pair.map(JSON.stringify).join(',')})`));
  }
});
test('HW2 identical digests have zero distance, independent of hex case', () => {
  assert.equal(h2(`digestHammingDistance('0123456789abcdef','0123456789ABCDEF')`), 0);
  assert.equal(h2(`digestHammingDistance('00'.repeat(32),'00'.repeat(32))`), 0);
});
test('HW2 different valid digests retain their bit distance', () => {
  assert.equal(h2(`digestHammingDistance('00','ff')`), 8);
  assert.equal(h2(`digestHammingDistance('a5','A4')`), 1);
  assert.equal(h2(`digestHammingDistance('00'.repeat(32),'ff'.repeat(32))`), 256);
});
test('HW3 all 26 Caesar shifts preserve Unicode and invert',()=>{for(let k=0;k<26;k++)assert.equal(h3(`caesarShift(caesarShift('Abc XYZ 123 à😀!',${k}),-${k})`),'Abc XYZ 123 à😀!');});
test('HW3 frequency total and no-letter score',()=>{assert.equal(h3(`countEnglishLetters('AaBb c!123').total`),5);assert.equal(h3(`calculateCaesarChiSquare('123!?')`),Infinity);});
test('HW3 all Caesar keys recover for long English corpus',()=>{for(let k=0;k<26;k++)assert.equal(h3(`recoverCaesarKey(caesarShift(CAESAR_CORPUS_LETTERS,${k}))[0].key`),k);});
test('HW3 Unicode non ASCII ignored [contract]',()=>assert.equal(h3(`countEnglishLetters('ßﬀı').total`),0));
for(const p of [0,1])test(`HW4 deterministic Bernoulli p=${p}`,()=>assert.equal(h4(`(()=>{let s=simulateStochasticProcess(10,10,'bernoulli',${p});return s.finalScores.every(x=>x===${10*p})&&s.trajectories.every(t=>t.length===11)})()`),true));
test('HW4 Rademacher path support/parity',()=>assert.equal(h4(`(()=>{let s=simulateStochasticProcess(11,500,'rademacher',.5);return s.trajectories.every(t=>t.every((x,i)=>i===0?x===0:Math.abs(x-t[i-1])===1))&&s.finalScores.every(x=>Math.abs(x)<=11&&Math.abs(x%2)===1)})()`),true));
for(const [model,p,mu,varX] of [['bernoulli',.3,.3,.21],['rademacher',.5,0,1]])test(`HW4 seeded moments ${model}`,()=>{const r=h4(`(()=>{let s=simulateStochasticProcess(50,20000,'${model}',${p});return [stochasticMean(s.finalScores),stochasticVariance(s.finalScores)]})()`);near(r[0],50*mu,0.2);near(r[1],50*varX,1.4);});
test('HW4 scale identities',()=>assert.equal(h4(`(()=>{let s=simulateStochasticProcess(25,1000,'bernoulli',.4);return Math.abs(stochasticVariance(s.finalAverages)-stochasticVariance(s.finalScores)/625)<1e-10&&Math.abs(stochasticVariance(s.finalNormalizedScores)-stochasticVariance(s.finalScores)/25)<1e-10})()`),true));
test('HW4 histogram conserves count',()=>assert.equal(h4('buildScoreHistogram([-2,0,2,2]).frequencies.reduce((a,b)=>a+b,0)'),4));
test('HW4 discrete singleton histogram centered on score [regression]',()=>near(h4('buildScoreHistogram([0,0,0]).centers[0]'),0));
test('HW4 LLN theoretical bound and deterministic endpoints',()=>assert.equal(h4(`runLlnSimulation(100,50,'bernoulli',0,.1).results.every(r=>r.empiricalMean===0&&r.empiricalVariance===0&&r.chebyshevBound===0&&r.deviationRate===0)`),true));
test('HW4 CLT integral + excluded tails = 1',()=>near(h4(`(()=>{let a=[-5,-4,-3,0,3.99,4,5];let h=buildCltHistogram(a);return h.density.reduce((a,b)=>a+b,0)*.25+h.outsideCount/a.length})()`),1));
test('HW4 CLT seeded mean/variance n=1000',()=>{let r=h4('cltStatistics(simulateCltExperiment(10000).get(1000))');near(r.mean,0,.05);near(r.variance,1,.06);});
test('HW4 systems/attackers determinism and SE',()=>{assert.equal(h4(`JSON.stringify(runSystemsAttackersSimulation('bernoulli',.3))===JSON.stringify(runSystemsAttackersSimulation('bernoulli',.3))`),true);assert.equal(h4(`runSystemsAttackersSimulation('bernoulli',1).rows.every(r=>r.aggregate===r.attempts&&r.pooledAverage===1&&r.standardError===0)`),true);});
test('HW5 Welford exact default sequence',()=>{const r=h5(`(()=>{let s=createWelfordState();[2,4,6].forEach(x=>updateWelford(s,x));return s})()`);assert.equal(r.mean,4);assert.equal(r.M2,8);assert.equal(r.M2/(r.count-1),4);});
test('HW5 Welford single/constant',()=>{assert.equal(h5('updateWelford(createWelfordState(),3).variance'),null);assert.equal(h5(`(()=>{let s=createWelfordState();for(let i=0;i<100;i++)updateWelford(s,9);return s.M2})()`),0);});
test('HW5 Welford large offset',()=>{const r=h5(`(()=>{let s=createWelfordState();[1e12+2,1e12+4,1e12+6].forEach(x=>updateWelford(s,x));return s})()`);assert.equal(r.M2,8);assert.equal(r.mean,1e12+4);});
for(const value of ['',',','1,,2','NaN','Infinity','1,','a','1e309',Array(101).fill(1).join(',')])test('HW5 invalid parser '+JSON.stringify(value).slice(0,30),()=>assert.throws(()=>h5(`parseWelfordObservations(${JSON.stringify(value)})`)));
test('HW5 finite input with representable correct stats stays finite',()=>{assert.equal(h5(`(()=>{let s=createWelfordState();[1e308,1e308].forEach(x=>updateWelford(s,x));return Number.isFinite(s.mean)&&s.M2===0})()`),true);});
test('HW5 direct verification finite for constant 1e308 [regression]',()=>assert.equal(h5('Number.isFinite(directWelfordStatistics([1e308,1e308]).mean)'),true));
test('HW5 tolerance rejects finite vs infinity [regression]',()=>assert.equal(h5('welfordAlmostEqual(1e308,Infinity)'),false));
test('HW5 opposite extreme finite input rejected or handled [regression]',()=>assert.equal(h5(`(()=>{try{let xs=parseWelfordObservations('1e308,-1e308');let s=createWelfordState();xs.forEach(x=>updateWelford(s,x));return Number.isFinite(s.mean)&&Number.isFinite(s.M2)}catch{return true}})()`),true));
test('HW5 theoretical uniform population moments exact',()=>{let xs=Array.from({length:11},(_,i)=>i);near(xs.reduce((s,x)=>s+x,0)/11,5);near(xs.reduce((s,x)=>s+(x-5)**2,0)/11,10);near(xs.reduce((s,x)=>s+(x-5)**4,0)/11,178);});
test('HW5 exhaustive n=2 unbiasedness and variance formula',()=>{const r=h5(`(()=>{let means=[],vars=[];for(let a=0;a<=10;a++)for(let b=0;b<=10;b++){let s=createWelfordState();updateWelford(s,a);let r=updateWelford(s,b);means.push(r.mean);vars.push(r.variance);}return [samplingAverage(means),samplingAverage(vars),samplingStandardDeviation(means),samplingStandardDeviation(vars),theoreticalSampleMeanSD(2),theoreticalSampleVarianceSD(2)]})()`);near(r[0],5);near(r[1],10);near(r[2],r[4]);near(r[3],r[5]);});
test('HW5 sampling seeded means/variances n=100,m=10000',()=>{const r=h5('analyzeSamplingStatistics(simulateSamplingExperiment(100,10000))');near(r.averageMean,5,.02);near(r.averageVariance,10,.1);near(r.meanEstimatorSD,Math.sqrt(.1),.015);});
test('HW5 hist boundaries preserve all observations',()=>assert.equal(h5('buildSamplingHistogram([0,0.5,5,10],0,10).frequencies.reduce((a,b)=>a+b,0)'),4));
test('HW5 SDs decrease over tested n',()=>assert.equal(h5('SAMPLE_SIZE_VALUES.every((n,i,a)=>i===0||(theoreticalSampleMeanSD(n)<theoreticalSampleMeanSD(a[i-1])&&theoreticalSampleVarianceSD(n)<theoreticalSampleVarianceSD(a[i-1])))'),true));
const seed=await h2(`mnemonicToSeed(TEST_MNEMONIC,'TREZOR')`);test('HW2 BIP39 published test vector with TREZOR',()=>assert.equal(seed,'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04'));
const unicodeSeed=await h2(`mnemonicToSeed(TEST_MNEMONIC,'é')`);test('HW2 NFKD seed normalization vs independent Node implementation',()=>assert.equal(unicodeSeed,pbkdf2Sync('abandon '.repeat(11)+'about','mnemonic'+'é'.normalize('NFKD'),2048,64,'sha512').toString('hex')));

test('Welford: overflow rejects an update atomically', () => {
  for (const values of [[1e308, -1e308], [1e200, -1e200], [2, NaN]]) {
    assert.equal(h5(`(()=>{const s=createWelfordState();updateWelford(s,${values[0]});
      const previous=JSON.stringify(s);let rejected=false;
      try{updateWelford(s,${values[1]})}catch{rejected=true}
      return rejected&&JSON.stringify(s)===previous})()`), true);
  }
});

test('Welford: all non-finite comparisons are rejected', () => {
  for (const a of ['Infinity', '-Infinity', 'NaN']) {
    for (const b of ['Infinity', '-Infinity', 'NaN', '0', '1e308']) {
      assert.equal(h5(`welfordAlmostEqual(${a},${b})`), false);
      assert.equal(h5(`welfordAlmostEqual(${b},${a})`), false);
    }
  }
});

test('Histogram: small integer supports are centered on the actual scores', () => {
  for (const scores of [[0, 0], [1], [-2, 0, 2, 2]]) {
    const result = h4(`buildScoreHistogram(${JSON.stringify(scores)})`);
    assert.deepEqual(Array.from(result.centers),
      Array.from({ length: Math.max(...scores) - Math.min(...scores) + 1 },
        (_, i) => Math.min(...scores) + i));
    assert.deepEqual(Array.from(result.frequencies), Array.from(result.centers,
      center => scores.filter(score => score === center).length));
  }
});

test('Histogram: grouped bins conserve counts and use the same edges as centers', () => {
  const scores = Array.from({ length: 101 }, (_, i) => i - 50);
  const result = h4(`buildScoreHistogram(${JSON.stringify(scores)})`);
  assert.equal(result.frequencies.length, 20);
  const width = 101 / 20;
  const expected = Array(20).fill(0);
  for (const x of scores) expected[Math.floor((x + 50.5) / width)]++;
  assert.deepEqual(Array.from(result.frequencies), expected);
  for (let i = 0; i < 20; i++) near(result.centers[i], -50.5 + (i + 0.5) * width);
});

test('Avalanche explanation: independent draws can repeat and affect coverage', () => {
  const html = fs.readFileSync(new URL('homework-02/index.html', root), 'utf8');
  assert.doesNotMatch(html, /observations are not all independent/);
  assert.match(html, /independent/i);
  assert.match(html, /coverage/i);
});
