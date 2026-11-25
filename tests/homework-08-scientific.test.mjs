import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../homework-08/index.html', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const convergence = vm.runInContext('ConvergenceSimulations', context);
const means = vm.runInContext('SampleMeanExperiments', context);
const events = vm.runInContext('EventProbabilityCalculators', context);
const sensitivity = vm.runInContext('BayesianSensitivityExperiments', context);
const strip = value => value.replace(/<[^>]*>/g, '').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replace(/\s+/g, ' ');
const ex1 = html.split('id="exercise-1-conclusions">')[1].split('</div>')[0];
const ex2 = html.split('id="bayesian-results-container"')[1].split('</div>')[0];
const overall = html.split('aria-labelledby="conclusions">')[1].split('</section>')[0];
const allText = strip(html);
const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m => strip(m[1]));

test('HW7 scientific numbers: every annotated conclusion value agrees with existing APIs before display rounding', () => {
  const scenarios = sensitivity.scenarioResults();
  const benchmark = means.meanTheory('bernoulli', 0.5, 100);
  const references = {
    'alternating-odd-mse': convergence.theoretical('C', 1, 1).mse,
    'alternating-even-mse': convergence.theoretical('C', 2, 1).mse,
    'bernoulli-mean-variance': benchmark.variance,
    'bernoulli-mean-sd': benchmark.sd,
    'dependent-mean-variance': means.meanTheory('bernoulli', 0.5, 100, true).variance,
    'diagnostic-posterior': events.bayes(events.diagnostic).posterior,
    'uniform-prior-posterior-mean': scenarios[0].posteriorMoments.mean,
    'informative-prior-posterior-mean': scenarios[1].posteriorMoments.mean,
    'success-prior-posterior-mean': scenarios[2].posteriorMoments.mean,
    'larger-sample-posterior-mean': sensitivity.sampleSizeExperiment(20, 20).at(-1).posteriorMoments.mean
  };
  const seen = new Set();
  for (const [, attributes, display] of html.matchAll(/<data\b([^>]*)>([^<]*)<\/data>/g)) {
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const key = attrs['data-reference'];
    assert.ok(Object.hasOwn(references, key), `Unverified numeric reference ${key}`);
    assert.ok(!seen.has(key), `Duplicate citation ${key}`); seen.add(key);
    const actual = Number(attrs.value), expected = references[key];
    assert.ok(Math.abs(actual - expected) <= 4 * Number.EPSILON * Math.max(1, Math.abs(expected)), key);
    // Accept the precision actually printed, without tying tests to surrounding wording.
    const decimalPlaces = display.trim().split('.')[1]?.length ?? 0;
    assert.ok(Math.abs(Number(display) - expected) <= 0.5 * 10 ** -decimalPlaces + 4 * Number.EPSILON, `Display rounding: ${key}`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(references).sort());
});

test('HW7 scientific interpretation: modes, model contrasts, LLN/CLT and covariance limits are present', () => {
  const text = strip(ex1);
  for (const concept of [/almost sure/i, /L²/, /probability/, /distribution/, /Model A/, /Model B/, /Model C/,
    /WLLN/, /SLLN/, /CLT/, /√n/, /non-degenerate/, /covariance/i, /Monte Carlo/]) assert.match(text, concept);
  assert.ok(paragraphs.some(p => /LLN/.test(p) && /CLT/.test(p) && /\b(not|cannot)\b/.test(p)
    && /guarantee|imply|establish|suffic/.test(p)), 'LLN consistency does not alone establish a CLT');
  assert.match(allText, /1\/n; standard deviation decreases as 1\/√n/);
  assert.match(allText, /X̄_n ± z_\{1−α\/2\} σ\/√n/);
  assert.match(allText, /known σ > 0/);
  assert.ok(paragraphs.some(p => /confidence/i.test(p) && /repeated sampling/i.test(p) && /posterior/i.test(p)
    && /\bnot\b/.test(p)), 'Frequentist confidence coverage is distinct from posterior probability');
  assert.match(text, /cannot prove|do not prove/); assert.match(text, /asymptotic/);
});

test('HW7 Bayesian conclusions: event conditioning, model-dependent diagnosis and prior sensitivity stay distinct', () => {
  const text = strip(ex2);
  for (const concept of [/P\(A \| B\)/, /P\(B \| A\)/, /undefined/, /synthetic/i, /sensitivity/i,
    /likelihood/i, /posterior/i, /Beta\(a\+s,b\+f\)/, /conditionally independent/, /prior/i,
    /sampling assumptions/, /misspecified model/]) assert.match(text, concept);
  assert.match(text, /medical recommendation/); assert.match(text, /neither|not/); assert.match(text, /universal/);
  assert.match(text, /prior sensitivity/);
  assert.match(text, /variance/); assert.match(text, /need not|not necessarily/); assert.match(text, /finite n/);
});

test('HW7 final synthesis: completed read-only sections link estimation, updating and modeling assumptions', () => {
  const text = strip(overall);
  for (const concept of [/estimators/, /LLN/, /CLT/, /Conditional probability/, /Bayes/,
    /assumptions/, /sensitivity/, /not proofs/]) assert.match(text, concept);
  assert.doesNotMatch(overall + ex1 + ex2, /<(?:input|button|select|canvas|script|style)\b/i);
  assert.doesNotMatch(html, /data-placeholder=|will be completed in Step 7|Other experiments remain pending/);
});
