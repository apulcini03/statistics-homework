import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../homework-07/script.js', import.meta.url), 'utf8'), context);
const api = vm.runInContext('StatisticalIndependence', context);
const plain = value => JSON.parse(JSON.stringify(value));
const makeRows = pairs => pairs.map(([studyMethod, examOutcome]) => ({ studyMethod, examOutcome }));

function checkInvariants(table) {
  const sum = values => values.reduce((a, b) => a + b, 0);
  assert.equal(sum(table.rowTotals), table.totalObservations);
  assert.equal(sum(table.columnTotals), table.totalObservations);
  assert.equal(sum(table.observedCounts.flat()), table.totalObservations);
  table.observedCounts.forEach((row, i) => {
    assert.equal(sum(row), table.rowTotals[i]);
    row.forEach(value => assert.ok(Number.isSafeInteger(value) && value >= 0));
  });
  table.columnTotals.forEach((count, j) => assert.equal(count, sum(table.observedCounts.map(row => row[j]))));
}

test('HW6 dataset: original observations produce independently checked counts and totals', () => {
  const table = plain(api.buildContingencyTable(api.dataset.observations));
  assert.deepEqual(table, {
    rowCategories: ['Individual', 'Group'], columnCategories: ['Pass', 'Fail'],
    observedCounts: [[7, 5], [8, 4]], rowTotals: [12, 12], columnTotals: [15, 9], totalObservations: 24
  });
  checkInvariants(table);
});

const configurations = [
  ['2×2', [['B', 'Yes'], ['A', 'No'], ['B', 'Yes']], [[2, 0], [0, 1]]],
  ['2×3', [['B', 'Y'], ['A', 'Z'], ['B', 'X'], ['A', 'Y']], [[1, 0, 1], [1, 1, 0]]],
  ['3×2', [['C', 'Y'], ['B', 'X'], ['A', 'Y'], ['C', 'Y']], [[2, 0], [0, 1], [1, 0]]],
  ['3×3', [['C', 'Z'], ['B', 'Y'], ['A', 'X'], ['B', 'Y']], [[1, 0, 0], [0, 2, 0], [0, 0, 1]]],
  ['1×1', [['Only', 'Same'], ['Only', 'Same']], [[2]]],
  ['1×3', [['Only', 'Z'], ['Only', 'Y'], ['Only', 'X']], [[1, 1, 1]]],
  ['3×1', [['Z', 'Only'], ['Y', 'Only'], ['X', 'Only']], [[1], [1], [1]]]
];
for (const [name, pairs, expected] of configurations) {
  test(`HW6 dataset: ${name} retains first-occurrence ordering, zeros and invariants`, () => {
    const rows = makeRows(pairs), before = JSON.stringify(rows);
    const table = plain(api.buildContingencyTable(rows));
    assert.deepEqual(table.observedCounts, expected);
    assert.deepEqual(table.rowCategories, [...new Set(pairs.map(row => row[0]))]);
    assert.deepEqual(table.columnCategories, [...new Set(pairs.map(row => row[1]))]);
    assert.equal(table.totalObservations, pairs.length);
    checkInvariants(table);
    assert.equal(JSON.stringify(rows), before, 'Pure computation does not mutate caller data');
  });
}

test('HW6 dataset: comma-separated text handles whitespace, blank lines, CRLF and optional explicit header', () => {
  const withHeader = api.parseDataset('\uFEFF \r\n studyMethod , examOutcome \r\n Individual , Pass \r\n\r\n Group , Fail \r\n');
  assert.deepEqual(plain(withHeader.variableNames), ['Study Method', 'Exam Outcome']);
  const withoutHeader = api.parseDataset('\n Individual , Pass \n \n Group , Fail \n', { hasHeader: false });
  assert.deepEqual(plain(withoutHeader), plain(withHeader));
  const custom = api.parseDataset('Teaching format,Result\rSolo,Good\rTeam,Bad');
  assert.deepEqual(plain(custom.variableNames), ['Teaching format', 'Result']);
  assert.deepEqual(plain(api.extractCategories(custom.observations)), {
    rowCategories: ['Solo', 'Team'], columnCategories: ['Good', 'Bad']
  });
});

const invalidText = [
  ['empty', '', /at least one/],
  ['blank', ' \n\r\n', /at least one/],
  ['header only', 'Method,Outcome', /at least one/],
  ['missing first value', 'Method,Outcome\n,Pass', /Line 2.*nonempty/],
  ['missing second value', 'Method,Outcome\nSolo,', /Line 2.*nonempty/],
  ['too few columns', 'Method,Outcome\nSolo', /Line 2.*exactly two/],
  ['too many columns', 'Method,Outcome\nSolo,Pass,Extra', /Line 2.*exactly two/],
  ['malformed row between valid rows', 'Method,Outcome\nSolo,Pass\nBroken\nTeam,Fail', /Line 3.*exactly two/],
  ['duplicate header names', 'Method,method\nSolo,Pass', /distinct/],
  ['duplicate display names', 'studyMethod,Study Method\nSolo,Pass', /distinct/],
  ['empty header name', 'Method,\nSolo,Pass', /nonempty/],
  ['invalid header shape', 'Method,Outcome,Other\nSolo,Pass', /exactly two/],
  ['repeated header', 'Method,Outcome\nSolo,Pass\nMethod,Outcome', /Line 3.*header/],
  ['reversed header', 'Method,Outcome\nOutcome,Method', /inconsistent header/],
  ['inconsistent header', 'Method,Outcome\nMethod,Other', /inconsistent header/],
  ['quoted field', 'Method,Outcome\n"Solo",Pass', /quoted/],
  ['quoted delimiter', 'Method,Outcome\n"Solo,Team",Pass', /exactly two/],
  ['multiline quoted value', 'Method,Outcome\n"Solo\nTeam",Pass', /exactly two/],
  ['long value', `Method,Outcome\n${'a'.repeat(101)},Pass`, /100 characters/],
  ['long header', `${'a'.repeat(101)},Outcome\nSolo,Pass`, /100 characters/]
];
for (const [name, input, expected] of invalidText) {
  test(`HW6 dataset: rejects ${name} without dropping observations`, () => {
    assert.throws(() => api.parseDataset(input), expected);
  });
}

test('HW6 dataset: validators reject invalid types and malformed paired observations', () => {
  for (const input of [null, undefined, 123, []]) assert.throws(() => api.parseDataset(input), /must be text/);
  assert.throws(() => api.parseDataset('A,B', { hasHeader: 'no' }), /header setting/);
  for (const rows of [null, [], [{}], [null], [{ studyMethod: 'A' }],
    [{ studyMethod: 'A', examOutcome: 'B', extra: 1 }],
    [{ studyMethod: 'A', examOutcome: 0 }], [{ studyMethod: 'A', examOutcome: '  ' }]]) {
    assert.throws(() => api.validateDataset(rows));
    assert.throws(() => api.buildContingencyTable(rows));
  }
});

test('HW6 dataset: size boundaries admit 5000 observations and 50 categories; excesses are explicit errors', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => `A${i % 50},B${Math.floor(i / 50) % 50}`);
  const parsed = api.parseDataset(rows.join('\n'), { hasHeader: false });
  const table = plain(api.buildContingencyTable(parsed.observations));
  assert.equal(table.totalObservations, 5000);
  assert.equal(table.rowCategories.length, 50);
  assert.equal(table.columnCategories.length, 50);
  checkInvariants(table);
  assert.throws(() => api.parseDataset([...rows, 'A0,B0'].join('\n'), { hasHeader: false }), /5000 observations/);
  assert.throws(() => api.validateDataset(Array.from({ length: 5001 }, () => ({ studyMethod: 'A', examOutcome: 'B' }))), /5000/);
  for (const column of [0, 1]) {
    const excessive = Array.from({ length: 51 }, (_, i) => column === 0 ? `${i},B` : `A,${i}`);
    assert.throws(() => api.parseDataset(excessive.join('\n'), { hasHeader: false }), /50 categories/);
  }
  assert.equal(api.parseDataset(`${'a'.repeat(100)},${'b'.repeat(100)}`, { hasHeader: false }).observations.length, 1);
  assert.throws(() => api.parseDataset(' '.repeat(1100001)), /1100000 characters/);
});

test('HW6 dataset: category lookup safely handles object property names and special characters', () => {
  const pairs = [['__proto__', 'constructor'], ['toString', '<b>Pass</b>'], ['__proto__', '&']];
  const table = plain(api.buildContingencyTable(makeRows(pairs)));
  assert.deepEqual(table.observedCounts, [[1, 0, 1], [0, 1, 0]]);
  checkInvariants(table);
});

test('HW6 dataset: atomic repeated updates, immutable snapshots, error recovery and reset preserve Step 1 API', () => {
  const original = JSON.stringify(api.dataset);
  const initialRevision = api.getState().revision;
  const first = api.applyDataset('Teaching format,Result\nSolo,Good\nTeam,Bad\nSolo,Good');
  assert.equal(first.revision, initialRevision + 1);
  assert.equal(first.activeDataset.variables.studyMethod.label, 'Teaching format');
  assert.deepEqual(plain(first.contingencyTable.observedCounts), [[2, 0], [0, 1]]);
  assert.throws(() => api.applyDataset('Method,Outcome\nBroken'), /exactly two/);
  assert.equal(api.getState(), first, 'Failure changes neither state nor revision');
  const second = api.applyDataset('X,Y\nX,Z\nW,Z', { hasHeader: false });
  assert.equal(second.revision, first.revision + 1);
  assert.deepEqual(plain(second.contingencyTable.observedCounts), [[1, 1], [0, 1]]);
  assert.equal(first.contingencyTable.totalObservations, 3);
  assert.throws(() => { second.contingencyTable.observedCounts[0][0] = 999; }, TypeError);
  assert.throws(() => { second.activeDataset.observations[0].studyMethod = 'Changed'; }, TypeError);
  const reset = api.resetDataset();
  assert.equal(reset.activeDataset, api.dataset);
  assert.equal(reset.revision, second.revision + 1);
  assert.equal(reset.contingencyTable.totalObservations, 24);
  assert.equal(JSON.stringify(api.dataset), original);
});
