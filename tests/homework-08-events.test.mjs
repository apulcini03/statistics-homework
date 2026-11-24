import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-08/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('EventProbabilityCalculators', context);
const plain = value => JSON.parse(JSON.stringify(value));
const near = (x, expected, tolerance = 1e-12) => assert.ok(Math.abs(x - expected) <= tolerance,
  `${x} differs from ${expected} by more than ${tolerance}`);

test('HW7 events: known conditional probabilities are distinct and atoms partition the space', () => {
  const r = api.conditionalProbabilities({ a: 0.4, b: 0.5, joint: 0.2 });
  near(r.givenB, 0.4); near(r.givenA, 0.5);
  assert.notEqual(r.givenB, r.givenA);
  assert.equal(r.joint, 0.2);
  near(r.atoms.reduce((s, a) => s + a.value, 0), 1);
  assert.ok(r.atoms.every(a => a.value >= 0 && a.value <= 1));
});

test('HW7 events: Fréchet boundaries accepted, incoherent intersections rejected, rounding narrowly identified', () => {
  for (const joint of [0.5, 0.6]) {
    const r = api.conditionalProbabilities({ a: 0.9, b: 0.6, joint });
    assert.ok(r.givenB <= 1 && r.givenA <= 1);
  }
  for (const joint of [0.49, 0.61]) assert.throws(() => api.conditionalProbabilities({ a: 0.9, b: 0.6, joint }), /Fréchet/);
  assert.throws(() => api.conditionalProbabilities({ a: 0, b: 0.5, joint: Number.MIN_VALUE }), /Fréchet/,
    'No upper-bound tolerance can turn an impossible tiny intersection into a valid one');
  const rounded = api.conditionalProbabilities({ a: 0.9, b: 0.2, joint: 0.1 });
  assert.equal(rounded.roundingAdjusted, true);
  assert.equal(rounded.atoms.at(-1).value, 0);
  near(rounded.atoms.reduce((s, a) => s + a.value, 0), 1);
});

test('HW7 events: zero denominators produce explicit null conditionals, never fake zero', () => {
  let r = api.conditionalProbabilities({ a: 0.3, b: 0, joint: 0 });
  assert.equal(r.givenB, null); assert.equal(r.givenA, 0);
  r = api.conditionalProbabilities({ a: 0, b: 0.4, joint: 0 });
  assert.equal(r.givenA, null); assert.equal(r.givenB, 0);
  r = api.conditionalProbabilities({ a: 0, b: 0, joint: 0 });
  assert.equal(r.givenA, null); assert.equal(r.givenB, null);
  r = api.conditionalProbabilities({ a: 1, b: 1, joint: 1 });
  assert.equal(r.givenA, 1); assert.equal(r.givenB, 1);
});

test('HW7 Bayes: synthetic diagnostic evidence, posterior and Bayes factor match the known result', () => {
  const r = api.bayes(api.diagnostic);
  near(r.evidence.value, 0.0095 + 0.0495);
  near(r.posterior, 0.0095 / (0.0095 + 0.0495), 2e-15);
  near(r.posterior, 0.16101694915254236, 2e-15);
  near(r.bayesFactor, 19);
  assert.ok(r.posterior < 0.95);
  assert.equal(r.evidence.impossible, false);
  assert.equal(r.evidence.underflow, false);
});

test('HW7 Bayes: total probability and posteriors agree with direct formulas across a deterministic grid', () => {
  for (const prior of [0, 0.01, 0.1, 0.5, 0.9, 1]) {
    for (const likelihoodH of [0, 0.05, 0.5, 0.95, 1]) {
      for (const likelihoodNotH of [0, 0.05, 0.5, 0.95, 1]) {
        const r = api.bayes({ prior, likelihoodH, likelihoodNotH });
        const evidence = likelihoodH * prior + likelihoodNotH * (1 - prior);
        near(r.evidence.value, evidence, 3e-16);
        if (!evidence) assert.equal(r.posterior, null);
        else {
          near(r.posterior, likelihoodH * prior / evidence, 5e-15);
          assert.ok(r.posterior >= 0 && r.posterior <= 1);
        }
      }
    }
  }
});

test('HW7 Bayes: endpoint priors, endpoint likelihoods and impossible evidence remain mathematically distinct', () => {
  assert.equal(api.bayes({ prior: 0, likelihoodH: 1, likelihoodNotH: 0.2 }).posterior, 0);
  assert.equal(api.bayes({ prior: 1, likelihoodH: 0.2, likelihoodNotH: 1 }).posterior, 1);
  assert.equal(api.bayes({ prior: 0.1, likelihoodH: 0, likelihoodNotH: 1 }).posterior, 0);
  assert.equal(api.bayes({ prior: 0.1, likelihoodH: 1, likelihoodNotH: 0 }).posterior, 1);
  for (const parameters of [
    { prior: 0, likelihoodH: 1, likelihoodNotH: 0 },
    { prior: 1, likelihoodH: 0, likelihoodNotH: 1 },
    { prior: 0.5, likelihoodH: 0, likelihoodNotH: 0 }
  ]) {
    const r = api.bayes(parameters);
    assert.equal(r.evidence.impossible, true);
    assert.equal(r.evidence.value, 0);
    assert.equal(r.posterior, null);
  }
  assert.equal(api.bayes({ prior: 0.1, likelihoodH: 1, likelihoodNotH: 0 }).bayesFactor, null);
  assert.equal(api.bayes({ prior: 0.1, likelihoodH: 0, likelihoodNotH: 0 }).bayesFactor, null);
  assert.equal(api.bayes({ prior: 0.1, likelihoodH: 0, likelihoodNotH: 1 }).bayesFactor, 0);
});

test('HW7 Bayes: positive underflowed evidence is not classified as impossible', () => {
  const r = api.bayes({ prior: Number.MIN_VALUE, likelihoodH: Number.MIN_VALUE, likelihoodNotH: 0 });
  assert.equal(r.evidence.underflow, true);
  assert.equal(r.evidence.impossible, false);
  assert.equal(r.posterior, 1);
  assert.ok(Number.isFinite(r.evidence.logValue));
  const equal = api.bayes({ prior: 0.5, likelihoodH: Number.MIN_VALUE, likelihoodNotH: Number.MIN_VALUE });
  assert.equal(equal.evidence.value, Number.MIN_VALUE, 'Scaling retains the representable sum of subnormal weighted terms');
  near(equal.posterior, 0.5);
  const largeFactor = api.bayes({ prior: 0.5, likelihoodH: 1, likelihoodNotH: Number.MIN_VALUE });
  assert.equal(largeFactor.factorOverflow, true);
  assert.ok(largeFactor.posterior >= 0 && largeFactor.posterior <= 1);
});

test('HW7 prior curve: Bayes formula, monotonicity, exact selected marker and equal-likelihood identity', () => {
  const curve = api.priorPosteriorCurve(0.95, 0.05, 0.013);
  assert.equal(curve.points.length, 201);
  assert.equal(curve.points[0].x, 0); assert.equal(curve.points.at(-1).x, 1);
  curve.points.forEach((p, i) => {
    near(p.y, 0.95 * p.x / (0.95 * p.x + 0.05 * (1 - p.x)), 2e-15);
    assert.ok(i === 0 || p.y >= curve.points[i - 1].y);
  });
  assert.equal(curve.selected.x, 0.013);
  near(curve.selected.y, api.bayes({ prior: 0.013, likelihoodH: 0.95, likelihoodNotH: 0.05 }).posterior);
  for (const p of api.priorPosteriorCurve(0.2, 0.2, 0.5).points) near(p.y, p.x);
  assert.ok(api.bayes({ prior: 0.1, likelihoodH: 0.95, likelihoodNotH: 0.05 }).posterior
    > api.bayes(api.diagnostic).posterior);
});

test('HW7 prior curve: impossible points stay null, with no fabricated ordinate or marker', () => {
  const ruleOutNotH = api.priorPosteriorCurve(1, 0, 0);
  assert.equal(ruleOutNotH.points[0].y, null);
  assert.equal(ruleOutNotH.selected.y, null);
  assert.ok(ruleOutNotH.points.slice(1).every(p => p.y === 1));
  const ruleOutH = api.priorPosteriorCurve(0, 1, 1);
  assert.equal(ruleOutH.points.at(-1).y, null);
  assert.equal(ruleOutH.selected.y, null);
  assert.ok(ruleOutH.points.slice(0, -1).every(p => p.y === 0));
  assert.ok(api.priorPosteriorCurve(0, 0, 0.5).points.every(p => p.y === null));
});

test('HW7 events: validation rejects empty, nonfinite and out-of-range values without clamping', () => {
  for (const value of ['', ' ', NaN, Infinity, -Infinity, -0.001, 1.001, null, undefined, true, [], {}]) {
    assert.throws(() => api.validateProbability(value));
    assert.throws(() => api.bayes({ prior: value, likelihoodH: 0.95, likelihoodNotH: 0.05 }));
    assert.throws(() => api.conditionalProbabilities({ a: 0.5, b: 0.5, joint: value }));
  }
  assert.equal(api.validateProbability('0'), 0);
  assert.equal(api.validateProbability('1'), 1);
  assert.deepEqual(plain(api.diagnostic), { prior: 0.01, likelihoodH: 0.95, likelihoodNotH: 0.05 });
});

test('HW7 events: formatting preserves precision and distinguishes undefined from zero', () => {
  assert.equal(api.formatResult(null), 'Undefined');
  assert.equal(api.formatResult(0), '0');
  assert.equal(api.formatResult(1), '1');
  assert.equal(api.formatResult(api.bayes(api.diagnostic).posterior), '0.161016949153');
  assert.throws(() => api.formatResult(NaN));
  assert.throws(() => api.formatResult(Infinity));
  assert.match(api.priorSummary(0.95, 0.05), /increasing the prior increases the posterior/);
  assert.match(api.priorSummary(0, 0), /impossible for every prior/);
  assert.match(api.priorSummary('0', '1'), /rules out H/);
});
