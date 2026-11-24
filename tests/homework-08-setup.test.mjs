import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const page = new URL('../homework-08/index.html', import.meta.url);
const html = readFileSync(page, 'utf8');
const source = readFileSync(new URL('script.js', page), 'utf8');
const text = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
  .replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&').replace(/\s+/g, ' ');

test('HW7 Step 1: files, English metadata, shared style and valid local references', () => {
  assert.ok(existsSync(page));
  assert.ok(existsSync(new URL('script.js', page)));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1.0"/);
  assert.match(html, /href="\.\.\/css\/style.css"/);
  assert.match(html, /<script src="script.js" defer><\/script>/);
  assert.match(html, /href="\.\.\/index.html" class="homework-button">← Back to homepage/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(id), id);
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (ref.startsWith('#')) assert.ok(ids.includes(ref.slice(1)), ref);
    else {
      if (ref.startsWith('https:')) {
        assert.equal(ref, 'https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js');
        continue;
      }
      assert.ok(existsSync(new URL(ref, page)), fileURLToPath(new URL(ref, page)));
    }
  }
});

test('HW7 Step 1: convergence definitions, hypotheses and implication branches', () => {
  for (const formula of [
    'For every ε > 0, P(|X_n − X| > ε) → 0',
    'P(lim_{n→∞} X_n = X) = 1', 'E[(X_n − X)²] → 0',
    'F_{X_n}(x) → F_X(x) at every continuity point x of F_X',
    'Almost sure convergence ⇒ convergence in probability',
    'L² convergence ⇒ convergence in probability',
    'Convergence in probability ⇒ convergence in distribution'
  ]) assert.ok(text.includes(formula), formula);
  assert.match(text, /common probability space/);
  assert.match(text, /finite second moments/);
  assert.match(text, /converses do not hold in general/);
  assert.match(text, /neither implies the other without additional assumptions/);
  assert.match(text, /not a linear ranking/);
  assert.equal((html.match(/<tr>/g) || []).length, 5, 'Four comparison rows and a header');
});

test('HW7 Step 1: LLN, CLT and square-root formulas with sufficient assumptions', () => {
  for (const formula of [
    'X̄_n = (X_1 + … + X_n) / n', 'E[X̄_n] = μ',
    'Var(X̄_n) = σ² / n', 'SD(X̄_n) = σ / √n',
    'Weak Law of Large Numbers (WLLN) gives X̄_n → μ in probability',
    'Strong Law of Large Numbers (SLLN) gives X̄_n → μ almost surely',
    'E[|X_1|] < ∞', '0 < σ² < ∞',
    '√n (X̄_n − μ) / σ → N(0, 1) in distribution',
    '√n (X̄_n − μ) → N(0, σ²) in distribution',
    'Var(X_1 + … + X_n) = ∑_{i=1}^n Var(X_i) + 2 ∑_{i<j} Cov(X_i, X_j)'
  ]) assert.ok(text.includes(formula), formula);
  assert.match(text, /independent and identically distributed.*finite variance σ²/);
  assert.match(text, /sample mean itself converges to μ/);
  assert.match(text, /non-degenerate limiting distribution/);
  assert.match(text, /pairwise zero covariances ensure this/);
  assert.match(text, /Independence guarantees zero covariances when variances exist/);
  assert.match(text, /not a universal requirement of all convergence theorems/);
  assert.match(text, /1\/√n decrease in sampling standard deviation/);
});

test('HW7 Step 1: conditional events and parameter inference are distinguished', () => {
  for (const formula of [
    'P(A | B) = P(A ∩ B) / P(B), for P(B) > 0',
    'P(A | B) = P(B | A) P(A) / P(B)',
    'Posterior ∝ Likelihood × Prior', 'p(θ | D) = p(D | θ) p(θ) / p(D)',
    'p(D) = ∫ p(D | θ) p(θ) dθ'
  ]) assert.ok(text.includes(formula), formula);
  assert.match(text, /P\(A\) > 0 so that P\(B \| A\) is defined/);
  for (const component of ['Prior', 'Likelihood', 'Posterior']) {
    assert.ok(html.includes(`<dt><strong>${component}</strong></dt>`));
  }
  assert.match(text, /probability or density of the observed data, viewed as a function of θ/);
  assert.match(text, /not generally a normalized probability distribution over the parameter/);
  assert.match(text, /Conditional probabilities above concern events/);
  assert.match(text, /unknown parameter θ after observing data D/);
  assert.match(text, /positive and finite/);
});

test('HW7 scaffold: Bayesian experiments remain empty after implementing sample-mean experiments', () => {
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotThrow(() => vm.runInNewContext(source, {}));
  const future = html.slice(html.indexOf('<section class="homework-section" aria-labelledby="exercise-2">'));
  assert.doesNotMatch(future, /<(?:canvas|input|select|button|output|iframe)\b|\bon\w+=/i);
  const slots = [...future.matchAll(/<div id="([^"]+)" class="future-component" data-placeholder="(controls|chart|results)">([\s\S]*?)<\/div>/g)];
  assert.equal(slots.length, 3);
  for (const [, id, , content] of slots) assert.equal(content.trim(), '', id);
  assert.equal((html.match(/class="status"/g) || []).length, 1);
  assert.match(text, /No experiments have been run/);
  assert.match(text, /Other experiments remain pending/);
});
