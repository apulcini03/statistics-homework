import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const html = read('homework-08/index.html'), source = read('homework-08/script.js');
const text = value => value.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/g, '')
  .replace(/<[^>]+>/g, '').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&').replace(/\s+/g, ' ');
const context = vm.createContext({});
vm.runInContext(source, context);
const api = name => vm.runInContext(name, context);
const near = (x, expected, tolerance = 1e-12) => assert.ok(Math.abs(x - expected) <= tolerance, `${x} vs ${expected}`);

test('HW7 final publication: unique Completed card, local route, README features and project structure', () => {
  const homepage = read('index.html'), readme = read('README.md');
  assert.equal([...homepage.matchAll(/href="homework-08\/"/g)].length, 1);
  const card = homepage.split('<h3>Homework 7 — Modes of Convergence &amp; Bayesian Inference</h3>')[1].split('</section>')[0];
  assert.match(card, /<span class="status">Completed<\/span>/);
  assert.match(card, /href="homework-08\/" class="homework-button"/);
  const section = readme.split('## Homework 7 — Modes of Convergence & Bayesian Inference')[1].split('## Project Structure')[0];
  for (const concept of [/almost surely/, /L²/, /distribution/, /Monte Carlo/, /WLLN/, /SLLN/, /CLT/,
    /Square-root/, /Conditional probability/, /Bayes/, /Prior, likelihood and posterior/, /Beta-Bernoulli/,
    /sensitivity/, /synthetic scenarios/, /conclusions/]) assert.match(section, concept);
  assert.match(section, /\[Open Homework 7\]\(https:\/\/apulcini03\.github\.io\/statistics-homework\/homework-08\/\)/);
  assert.match(readme, /homework-08\/\s+# HW7 — Modes of Convergence & Bayesian Inference/);
  assert.ok(existsSync(new URL('../homework-08/index.html', import.meta.url)));
});

test('HW7 final assignment coverage: substantive formulas, explanations and controls exist beyond headings', () => {
  const section = id => text(html.split(`aria-labelledby="${id}">`)[1].split('</section>')[0]);
  const requirements = [
    ['four convergence definitions and implications', 'definitions-comparison', [/P\(\|X_n − X\| > ε\)/, /P\(lim_/, /E\[\(X_n − X\)²\]/, /continuity/, /⇒/, /converses/]],
    ['finite simulation limits', 'convergence-simulations', [/Monte Carlo/, /cannot prove/, /seed/, /sampling error/]],
    ['WLLN, SLLN and assumptions', 'law-large-numbers', [/i.i.d./, /WLLN/, /SLLN/, /finite variance/, /prefix/]],
    ['CLT and standardization', 'central-limit-theorem', [/0 < σ² < ∞/, /√n/, /N\(0, 1\)/, /distribution/, /does not make/]],
    ['variance, covariance, standard error and inference', 'square-root-scaling', [/σ² \/ n/, /σ \/ √n/, /Cov\(/, /sufficient but not necessary/, /standard error/, /confidence interval/]],
    ['conditional probability and undefined denominators', 'conditional-probability', [/P\(A ∩ B\) \/ P\(B\)/, /P\(B\) > 0/, /undefined/, /generally different/]],
    ['Bayes, prior, evidence, posterior and synthetic diagnosis', 'bayes-theorem', [/P\(E\) =/, /P\(H \| E\) =/, /prior/i, /likelihood/i, /posterior/i, /synthetic/, /not an individual/]],
    ['Beta-Bernoulli parameter updating', 'prior-likelihood-posterior', [/conditionally on θ/, /Beta\(a,b\)/, /θ\^s/, /Beta\(a \+ s, b \+ f\)/, /not generally a normalized/, /integral B\(s\+1,f\+1\)/]],
    ['prior and data-size sensitivity', 'bayesian-experiments', [/synthetic/, /same data/, /fixed prior/i, /0.8/, /prior weight/i, /sensitivity/i]],
    ['applications, benefits, limits and model assumptions', 'bayesian-results', [/diagnostic/, /uncertainty/, /assumptions/, /prior sensitivity/, /misspecified/]]
  ];
  for (const [name, id, evidence] of requirements) {
    const body = section(id);
    for (const pattern of evidence) assert.match(body, pattern, name);
  }
  for (const id of ['convergence-form', 'means-form', 'conditional-form', 'bayes-event-form', 'beta-form', 'bayes-growth-form']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
});

test('HW7 final numerical benchmarks: typewriter, shrinking and alternating normals, sampling means and Bayesian updates', () => {
  const c = api('ConvergenceSimulations'), m = api('SampleMeanExperiments');
  const e = api('EventProbabilityCalculators'), b = api('BetaBernoulliInference'), s = api('BayesianSensitivityExperiments');
  near(c.theoretical('A', 31, 0.5).probability, 1 / 16); near(c.theoretical('A', 31, 0.5).mse, 1 / 16);
  near(c.theoretical('B', 100, 0.5).mse, 1 / 10000);
  assert.equal(c.theoretical('C', 100, 0.5).mse, 0); assert.equal(c.theoretical('C', 99, 0.5).mse, 2);
  assert.equal(m.populationMoments('bernoulli', 0.5).mean, 0.5);
  assert.equal(m.populationMoments('bernoulli', 0.5).variance, 0.25);
  near(m.meanTheory('bernoulli', 0.5, 100).variance, 0.0025); near(m.meanTheory('bernoulli', 0.5, 100).sd, 0.05);
  near(m.meanTheory('bernoulli', 0.5, 100, true).variance, 0.25);
  near(e.bayes(e.diagnostic).posterior, 0.16101694915254236);
  const posterior = b.posteriorParameters(2, 2, 8, 2);
  assert.equal(posterior.a, 10); assert.equal(posterior.b, 4);
  near(b.moments(posterior.a, posterior.b).mean, 5 / 7); near(b.moments(10, 4).variance, 40 / 2940);
  const expected = [[9, 3, 0.75], [28, 22, 0.56], [16, 4, 0.8], [100, 40, 5 / 7]];
  s.scenarioResults().forEach((r, i) => {
    const [a, beta, mean] = expected[i];
    assert.equal(r.posterior.a, a); assert.equal(r.posterior.b, beta);
    near(r.posteriorMoments.mean, mean); near(r.posteriorMoments.variance, a * beta / ((a + beta) ** 2 * (a + beta + 1)));
  });
  near(s.sampleSizeExperiment(20, 20).at(-1).posteriorMoments.mean, 7 / 9);
});

test('HW7 final technical review: unique IDs, DOM targets, safe rendering and only existing dependencies', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of source.matchAll(/(?:byId|getElementById)\(['"]([^'"]+)['"]\)/g)) assert.ok(ids.includes(id), id);
  for (const [, references] of html.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for (const id of references.split(/\s+/)) assert.ok(ids.includes(id), id);
  }
  assert.doesNotMatch(source, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/);
  assert.doesNotMatch(html, /\son\w+\s*=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]),
    ['https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js', 'script.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]), ['../css/style.css']);
  assert.doesNotMatch(html, /data-placeholder=|Not yet implemented/);
});
