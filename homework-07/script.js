'use strict';

// Descriptive and inferential analysis of paired categorical observations.
const StatisticalIndependence = (() => {
  const variables = Object.freeze({
    studyMethod: Object.freeze({
      label: 'Study Method',
      categories: Object.freeze(['Individual', 'Group'])
    }),
    examOutcome: Object.freeze({
      label: 'Exam Outcome',
      categories: Object.freeze(['Pass', 'Fail'])
    })
  });

  // Hand-authored fictional records, not a contingency table or a random sample.
  // Repeated category pairs represent separate observations.
  const observations = Object.freeze([
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Fail' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Fail' },
    { studyMethod: 'Individual', examOutcome: 'Fail' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Fail' },
    { studyMethod: 'Group', examOutcome: 'Fail' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Fail' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Fail' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Fail' },
    { studyMethod: 'Individual', examOutcome: 'Fail' },
    { studyMethod: 'Group', examOutcome: 'Pass' },
    { studyMethod: 'Individual', examOutcome: 'Pass' },
    { studyMethod: 'Group', examOutcome: 'Pass' }
  ].map(observation => Object.freeze(observation)));

  const dataset = Object.freeze({
    title: 'Study Method and Exam Outcome',
    isSynthetic: true,
    description: 'Synthetic illustrative data; not a real student sample.',
    variables,
    observations
  });

  // These are input observation multiplicities, never precomputed statistics.
  const experimentCatalog = Object.freeze([
    Object.freeze({ id: 'A', name: 'A — Default example', counts: null }),
    Object.freeze({ id: 'B', name: 'B — Exact sample independence', counts: Object.freeze([20, 20, 20, 20]) }),
    Object.freeze({ id: 'C', name: 'C — Weak observed association', counts: Object.freeze([22, 18, 18, 22]) }),
    Object.freeze({ id: 'D', name: 'D — Clear observed association', counts: Object.freeze([35, 5, 5, 35]) })
  ]);

  function experimentById(id) {
    const experiment = experimentCatalog.find(entry => entry.id === id);
    if (!experiment) throw new Error('Choose one of the four experiments A, B, C or D.');
    return experiment;
  }

  function generateExperimentObservations(id) {
    const experiment = experimentById(id);
    if (id === 'A') return dataset.observations;
    const rows = [];
    variables.studyMethod.categories.forEach((studyMethod, i) => {
      variables.examOutcome.categories.forEach((examOutcome, j) => {
        for (let k = 0; k < experiment.counts[2 * i + j]; k++) rows.push({ studyMethod, examOutcome });
      });
    });
    return validateDataset(rows);
  }

  let experimentResults = null;
  function getExperimentResults() {
    if (experimentResults === null) {
      experimentResults = Object.freeze(experimentCatalog.map(experiment => {
        const contingencyTable = buildContingencyTable(generateExperimentObservations(experiment.id));
        const chiSquareTest = computeChiSquareTest(contingencyTable);
        return Object.freeze({ id: experiment.id, name: experiment.name, contingencyTable, chiSquareTest,
          cramersV: computeCramersV(chiSquareTest.chiSquare, contingencyTable.totalObservations,
            contingencyTable.rowCategories.length, contingencyTable.columnCategories.length) });
      }));
    }
    return experimentResults;
  }

  const limits = Object.freeze({ observations: 5000, categories: 50, labelLength: 100, textLength: 1100000 });
  const keys = ['studyMethod', 'examOutcome'];

  function validateDataset(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('The dataset must contain at least one observation.');
    if (rows.length > limits.observations) throw new Error(`The dataset exceeds ${limits.observations} observations.`);
    const categories = keys.map(() => new Set());
    const valid = rows.map((row, index) => {
      if (!row || Object.keys(row).length !== 2 || !keys.every(key => Object.hasOwn(row, key))) {
        throw new Error(`Observation ${index + 1} must contain exactly two paired variable values.`);
      }
      const pair = {};
      keys.forEach((key, column) => {
        const value = row[key];
        if (typeof value !== 'string' || !value.trim()) throw new Error(`Observation ${index + 1} has a missing categorical value.`);
        pair[key] = value.trim();
        if (pair[key].length > limits.labelLength) throw new Error(`Observation ${index + 1} exceeds ${limits.labelLength} characters per value.`);
        categories[column].add(pair[key]);
        if (categories[column].size > limits.categories) throw new Error(`A variable exceeds ${limits.categories} categories.`);
      });
      return Object.freeze(pair);
    });
    return Object.freeze(valid);
  }

  function parseDataset(text, { hasHeader = true } = {}) {
    if (typeof text !== 'string') throw new Error('Dataset input must be text.');
    if (typeof hasHeader !== 'boolean') throw new Error('The header setting must be true or false.');
    if (text.length > limits.textLength) throw new Error(`Input text exceeds ${limits.textLength} characters.`);
    const rows = [];
    let names = null;
    let reserved = null;
    for (const [index, line] of text.split(/\r\n|\n|\r/).entries()) {
      if (!line.trim()) continue;
      const cells = line.split(',').map(cell => cell.trim());
      if (cells.length !== 2) throw new Error(`Line ${index + 1}: expected exactly two comma-separated columns.`);
      if (cells.some(cell => !cell)) throw new Error(`Line ${index + 1}: both values must be nonempty.`);
      if (cells.some(cell => cell.includes('"'))) throw new Error(`Line ${index + 1}: quoted CSV fields are not supported.`);
      if (cells.some(cell => cell.length > limits.labelLength)) throw new Error(`Line ${index + 1}: maximum ${limits.labelLength} characters per value or name.`);
      if (hasHeader && names === null) {
        const displayNames = cells.map((name, i) => name === keys[i] ? variables[keys[i]].label : name);
        if (cells[0].toLowerCase() === cells[1].toLowerCase() || displayNames[0].toLowerCase() === displayNames[1].toLowerCase()) {
          throw new Error(`Line ${index + 1}: header names must be distinct.`);
        }
        names = cells;
        reserved = new Set([...names, ...displayNames].map(name => name.toLowerCase()));
        continue;
      }
      if (hasHeader && cells.some(cell => reserved.has(cell.toLowerCase()))) {
        throw new Error(`Line ${index + 1}: repeated or inconsistent header; header names are reserved.`);
      }
      rows.push({ studyMethod: cells[0], examOutcome: cells[1] });
      if (rows.length > limits.observations) throw new Error(`The dataset exceeds ${limits.observations} observations.`);
    }
    const variableNames = names ? names.map((name, i) => name === keys[i] ? variables[keys[i]].label : name)
      : keys.map(key => variables[key].label);
    return Object.freeze({ variableNames: Object.freeze(variableNames), observations: validateDataset(rows) });
  }

  function extractCategories(rows) {
    const valid = validateDataset(rows);
    return Object.freeze({
      rowCategories: Object.freeze([...new Set(valid.map(row => row.studyMethod))]),
      columnCategories: Object.freeze([...new Set(valid.map(row => row.examOutcome))])
    });
  }

  function buildContingencyTable(rows) {
    const valid = validateDataset(rows);
    const { rowCategories, columnCategories } = extractCategories(valid);
    const rowIndex = new Map(rowCategories.map((value, index) => [value, index]));
    const columnIndex = new Map(columnCategories.map((value, index) => [value, index]));
    const observedCounts = rowCategories.map(() => columnCategories.map(() => 0));
    const rowTotals = rowCategories.map(() => 0);
    const columnTotals = columnCategories.map(() => 0);
    for (const row of valid) {
      const i = rowIndex.get(row.studyMethod), j = columnIndex.get(row.examOutcome);
      observedCounts[i][j]++;
      rowTotals[i]++;
      columnTotals[j]++;
    }
    const totalObservations = valid.length;
    const sum = values => values.reduce((total, count) => total + count, 0);
    if (sum(rowTotals) !== totalObservations || sum(columnTotals) !== totalObservations
        || sum(observedCounts.map(sum)) !== totalObservations
        || !observedCounts.every(row => row.every(count => Number.isSafeInteger(count) && count >= 0))) {
      throw new Error('Observed-frequency invariants failed.');
    }
    return Object.freeze({ rowCategories, columnCategories,
      observedCounts: Object.freeze(observedCounts.map(row => Object.freeze(row))),
      rowTotals: Object.freeze(rowTotals), columnTotals: Object.freeze(columnTotals), totalObservations });
  }

  // Validate externally supplied matrices as well as Step 2 output. Zero margins
  // are allowed here even though automatic category detection excludes them.
  function validateFrequencyTable(table) {
    if (!table || !Array.isArray(table.rowCategories) || !Array.isArray(table.columnCategories)
        || !table.rowCategories.length || !table.columnCategories.length
        || !Array.isArray(table.observedCounts) || !Array.isArray(table.rowTotals)
        || !Array.isArray(table.columnTotals)) throw new Error('Invalid observed-frequency table structure.');
    const { rowCategories, columnCategories, observedCounts, rowTotals, columnTotals, totalObservations } = table;
    const count = value => Number.isSafeInteger(value) && value >= 0;
    if (!count(totalObservations) || observedCounts.length !== rowCategories.length
        || rowTotals.length !== rowCategories.length || columnTotals.length !== columnCategories.length
        || !rowTotals.every(count) || !columnTotals.every(count)
        || !observedCounts.every(row => Array.isArray(row) && row.length === columnCategories.length && row.every(count))) {
      throw new Error('Observed counts and totals must be nonnegative safe integers with consistent dimensions.');
    }
    const sum = values => values.reduce((a, b) => a + b, 0);
    if (sum(rowTotals) !== totalObservations || sum(columnTotals) !== totalObservations
        || observedCounts.some((row, i) => sum(row) !== rowTotals[i])
        || columnTotals.some((total, j) => sum(observedCounts.map(row => row[j])) !== total)) {
      throw new Error('Observed-frequency totals are inconsistent.');
    }
  }

  const freezeMatrix = matrix => Object.freeze(matrix.map(row => Object.freeze(row)));

  function computeJointFrequencies(table) {
    validateFrequencyTable(table);
    const divide = value => table.totalObservations === 0 ? null : value / table.totalObservations;
    return Object.freeze({
      jointRelativeFrequencies: freezeMatrix(table.observedCounts.map(row => row.map(divide))),
      rowMarginals: Object.freeze(table.rowTotals.map(divide)),
      columnMarginals: Object.freeze(table.columnTotals.map(divide)),
      totalRelativeFrequency: divide(table.totalObservations)
    });
  }

  function computeConditionalFrequencies(table) {
    validateFrequencyTable(table);
    return Object.freeze({
      columnGivenRow: freezeMatrix(table.observedCounts.map((row, i) =>
        row.map(value => table.rowTotals[i] === 0 ? null : value / table.rowTotals[i]))),
      rowGivenColumn: freezeMatrix(table.observedCounts.map(row =>
        row.map((value, j) => table.columnTotals[j] === 0 ? null : value / table.columnTotals[j])))
    });
  }

  function computeFrequencies(table) {
    return Object.freeze({ ...computeJointFrequencies(table), ...computeConditionalFrequencies(table) });
  }

  function formatFrequency(value, mode = 'decimal') {
    if (!['decimal', 'percentage'].includes(mode)) throw new Error('Unknown relative-frequency display format.');
    if (value === null) return 'N/A';
    const roundingTolerance = 32 * Number.EPSILON;
    if (!Number.isFinite(value) || value < -roundingTolerance || value > 1 + roundingTolerance) {
      throw new Error('A relative frequency must be finite and between 0 and 1.');
    }
    // Correct only endpoint roundoff in display totals; never round stored data.
    value = Math.max(0, Math.min(1, value));
    return mode === 'percentage' ? `${(100 * value).toFixed(4)}%` : value.toFixed(6);
  }

  function computeExpectedFrequencies(table) {
    // Keep the verified frequency algorithms unchanged; validate the additional
    // label/density constraints required by this public matrix-based function.
    if (table?.rowCategories?.length > limits.categories || table?.columnCategories?.length > limits.categories) {
      throw new Error(`Expected-count tables support at most ${limits.categories} categories per variable.`);
    }
    validateFrequencyTable(table);
    for (const labels of [table.rowCategories, table.columnCategories]) {
      if (!Array.from(labels).every(label => typeof label === 'string' && label.trim()
          && label.length <= limits.labelLength) || new Set(labels).size !== labels.length) {
        throw new Error('Category labels must be unique, nonempty strings within the documented length limit.');
      }
    }
    const count = value => Number.isSafeInteger(value) && value >= 0;
    if (![table.rowTotals, table.columnTotals, ...Array.from(table.observedCounts)].every(values =>
      Array.isArray(values) && Array.from(values).every(count))) throw new Error('Sparse or invalid count arrays are not supported.');
    const { rowTotals, columnTotals, totalObservations: n } = table;
    const expectedCounts = rowTotals.map(rowTotal => columnTotals.map(columnTotal =>
      n === 0 ? null : (rowTotal * columnTotal) / n));
    const values = expectedCounts.flat();
    const cellsBelow5 = n === 0 ? null : values.filter(value => value < 5).length;
    const zeroExpectedCells = n === 0 ? null : values.filter(value => value === 0).length;
    return Object.freeze({
      status: n === 0 ? 'undefined' : 'defined',
      reason: n === 0 ? 'Expected counts are undefined when N = 0.' : null,
      expectedCounts: freezeMatrix(expectedCounts),
      rowCategories: Object.freeze([...table.rowCategories]), columnCategories: Object.freeze([...table.columnCategories]),
      rowTotals: Object.freeze([...rowTotals]), columnTotals: Object.freeze([...columnTotals]), totalObservations: n,
      diagnostics: Object.freeze({
        minExpectedCount: n === 0 ? null : Math.min(...values),
        cellsBelow5, percentageBelow5: n === 0 ? null : 100 * cellsBelow5 / values.length,
        zeroExpectedCells, hasZeroExpectedCounts: n === 0 ? null : zeroExpectedCells > 0,
        numberOfRows: rowTotals.length, numberOfColumns: columnTotals.length, totalCells: values.length
      })
    });
  }

  function compareObservedExpected(table) {
    const expected = computeExpectedFrequencies(table);
    const cells = table.observedCounts.map((row, i) => row.map((observed, j) => {
      const value = expected.expectedCounts[i][j];
      const difference = value === null ? null : observed - value;
      return Object.freeze({ observed, expected: value, difference,
        absoluteDifference: difference === null ? null : Math.abs(difference) });
    }));
    return Object.freeze({ expected, cells: freezeMatrix(cells) });
  }

  // Q(df/2, statistic/2): DLMF 8.7 (series), 8.9 (continued fraction).
  // The series is used only where the upper tail is not tiny. Right tails
  // are evaluated directly in the log domain, never by 1 - lowerCDF.
  function chiSquareSurvival(statistic, degreesOfFreedom, { maxIterations = 10000 } = {}) {
    if (!Number.isFinite(statistic) || statistic < 0) throw new Error('Chi-square must be finite and nonnegative.');
    if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom < 1 || degreesOfFreedom > 2401) {
      throw new Error('Supported degrees of freedom: integers from 1 to 2401.');
    }
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10000) throw new Error('Invalid iteration limit.');
    const result = (probability, logProbability, status, iterations, algorithm, reason = null) =>
      Object.freeze({ probability, logProbability, status, iterations, algorithm, reason });
    if (statistic === 0) return result(1, 0, 'exact-zero-statistic', 0, 'boundary');
    const a = degreesOfFreedom / 2, x = statistic / 2;
    if (x === 0) return result(1, 0, 'rounded-to-one', 0, 'boundary');
    const correction = z => {
      const inverse = 1 / z, t = inverse * inverse;
      return inverse * (1 / 12 + t * (-1 / 360 + t * (1 / 1260 + t * (-1 / 1680 + t * (1 / 1188 - t * 691 / 360360)))));
    };
    let z = a, shift = 0;
    while (z < 16) { shift += Math.log(z); z++; }
    const logGamma = (z - .5) * Math.log(z) - z + .5 * Math.log(2 * Math.PI) + correction(z) - shift;
    const ratio = x / a;
    const r = (x - a) / a;
    const logFactor = a >= 16 && ratio >= .5 && ratio <= 1.5
      ? a * (Math.log1p(r) - r) + .5 * Math.log(a / (2 * Math.PI)) - correction(a)
      : a * Math.log(x) - x - logGamma;
    const epsilon = 4 * Number.EPSILON;
    let logQ, iterations = 0, algorithm;
    if (x < a + 1) {
      algorithm = 'lower-series / upper complement with expm1';
      let term = 1 / a, sum = term, converged = false;
      for (let i = 1; i <= maxIterations; i++) {
        term *= x / (a + i);
        sum += term;
        iterations = i;
        if (!Number.isFinite(sum)) break;
        if (Math.abs(term) <= Math.abs(sum) * epsilon) { converged = true; break; }
      }
      if (!converged) return result(null, null, 'not-converged', iterations, algorithm, 'Gamma series did not converge.');
      const logP = Math.log(sum) + logFactor;
      if (!Number.isFinite(logP) || logP >= 0) return result(null, null, 'numerical-error', iterations, algorithm, 'Invalid lower-tail intermediate result.');
      const upper = -Math.expm1(logP);
      logQ = upper === 1 ? Math.log1p(-Math.exp(logP)) : Math.log(upper);
    } else {
      algorithm = 'upper continued fraction (log domain)';
      const tiny = 1e-300;
      const protect = value => Math.abs(value) < tiny ? (value < 0 ? -tiny : tiny) : value;
      let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d, converged = false;
      for (let i = 1; i <= maxIterations; i++) {
        const an = -i * (i - a);
        b += 2;
        d = 1 / protect(an * d + b);
        c = protect(b + an / c);
        const delta = d * c;
        h *= delta;
        iterations = i;
        if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(delta)) break;
        if (Math.abs(delta - 1) <= epsilon) { converged = true; break; }
      }
      if (!converged) return result(null, null, 'not-converged', iterations, algorithm, 'Gamma continued fraction did not converge.');
      logQ = logFactor + Math.log(h);
    }
    if (!Number.isFinite(logQ) || logQ > 0) return result(null, null, 'numerical-error', iterations, algorithm, 'Invalid upper-tail logarithm.');
    const probability = Math.exp(logQ);
    const status = probability === 0 ? 'underflow' : probability === 1 ? 'rounded-to-one'
      : probability < 2.2250738585072014e-308 ? 'subnormal' : 'converged';
    return result(probability, logQ, status, iterations, algorithm);
  }

  function chiSquareFromComparison(table, comparison) {
    const expected = comparison.expected, diagnostics = expected.diagnostics;
    const degreesOfFreedom = (diagnostics.numberOfRows - 1) * (diagnostics.numberOfColumns - 1);
    const nonemptyRows = table.rowTotals.filter(value => value > 0).length;
    const nonemptyColumns = table.columnTotals.filter(value => value > 0).length;
    let status = 'computed', reason = null;
    if (expected.status !== 'defined') { status = 'undefined'; reason = expected.reason; }
    else if (diagnostics.hasZeroExpectedCounts) {
      status = 'unsupported'; reason = 'Zero expected counts: division by zero is not performed and categories are not removed.';
    } else if (nonemptyRows < 2 || nonemptyColumns < 2) {
      status = 'not-applicable'; reason = 'At least two nonempty categories per variable are required for the asymptotic test.';
    }
    const computable = expected.status === 'defined' && !diagnostics.hasZeroExpectedCounts;
    let total = 0, compensation = 0;
    const contributions = comparison.cells.map(row => row.map(cell => {
      if (!computable) return null;
      const value = cell.difference * cell.difference / cell.expected;
      const adjusted = value - compensation, next = total + adjusted;
      compensation = (next - total) - adjusted;
      total = next;
      return value;
    }));
    let tail = null;
    if (computable) {
      if (!Number.isFinite(total) || !contributions.flat().every(Number.isFinite)) {
        status = 'numerical-error'; reason = 'Nonfinite Chi-square calculation.';
      } else {
        if (status === 'computed') {
          tail = chiSquareSurvival(total, degreesOfFreedom);
          if (tail.probability === null) { status = 'numerical-error'; reason = tail.reason; }
        }
      }
    }
    const warnings = [];
    if (tail && diagnostics.cellsBelow5 > 0) warnings.push('Sparse expected counts: the asymptotic p-value may be unreliable. Five is a diagnostic guideline, not an absolute validity rule.');
    if (tail?.status === 'underflow') warnings.push('The p-value underflows double precision; it is mathematically positive. Use the reported log p.');
    if (tail?.status === 'subnormal') warnings.push('The p-value is subnormal; relative precision is reduced.');
    if (tail?.status === 'rounded-to-one') warnings.push('The p-value rounds to 1 in double precision for this positive statistic.');
    return Object.freeze({
      status, reason, chiSquare: computable && Number.isFinite(total) ? total : null,
      contributions: freezeMatrix(contributions), degreesOfFreedom,
      pValue: tail?.probability ?? null, pValueDetails: tail, diagnostics,
      applicability: Object.freeze({ statisticComputable: computable && Number.isFinite(total),
        asymptoticReference: status !== 'computed' ? 'not-applicable' : diagnostics.cellsBelow5 > 0 ? 'caution-sparse' : 'no-small-expected-count-warning',
        nonemptyRows, nonemptyColumns, assumptionsVerified: false, warnings: Object.freeze(warnings) })
    });
  }

  function computeChiSquareTest(table) {
    return chiSquareFromComparison(table, compareObservedExpected(table));
  }

  function formatPValue(tail) {
    if (!tail || tail.probability === null) return 'N/A';
    const p = tail.probability;
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Invalid p-value.');
    if (p === 0) {
      if (tail.status !== 'underflow' || !Number.isFinite(tail.logProbability)) throw new Error('Zero p-value requires an explicit underflow status.');
      return `Underflow (p > 0; log p = ${tail.logProbability.toPrecision(12)})`;
    }
    if (tail.status === 'rounded-to-one') return '1 (rounded in double precision)';
    const text = p < 1e-4 ? p.toExponential(8) : p.toPrecision(12);
    return tail.status === 'subnormal' ? `${text} (subnormal; reduced precision)` : text;
  }

  function validateAlpha(alpha) {
    if (typeof alpha !== 'number' || ![.01, .05, .10].includes(alpha)) {
      throw new Error('Choose a significance level of 0.01, 0.05 or 0.10.');
    }
    return alpha;
  }

  function interpretChiSquareTest(testResult, alpha) {
    validateAlpha(alpha);
    const warnings = Array.isArray(testResult?.applicability?.warnings)
      ? testResult.applicability.warnings.filter(text => typeof text === 'string') : [];
    const sparse = (testResult?.diagnostics?.cellsBelow5 ?? 0) > 0
      || testResult?.applicability?.asymptoticReference === 'caution-sparse';
    if (sparse && testResult?.status === 'computed' && !warnings.some(text => /Sparse expected counts/.test(text))) {
      warnings.push('Sparse expected counts: the asymptotic approximation may be unreliable. This formal comparison is not a robust conclusion.');
    }
    const answer = (decision, status, basis, explanation) => Object.freeze({
      alpha, decision, status, basis, explanation,
      caution: sparse || warnings.length > 0, warnings: Object.freeze([...new Set(warnings)])
    });
    const unavailable = reason => answer('Decision unavailable', 'unavailable', null, reason);
    if (!testResult || testResult.status !== 'computed'
        || !Number.isFinite(testResult.chiSquare) || testResult.chiSquare < 0
        || !Number.isInteger(testResult.degreesOfFreedom) || testResult.degreesOfFreedom <= 0
        || testResult.applicability?.asymptoticReference === 'not-applicable') {
      return unavailable(testResult?.reason || 'The test is not applicable or its numerical result is unavailable.');
    }
    const p = testResult.pValue, tail = testResult.pValueDetails;
    if (!Number.isFinite(p) || p < 0 || p > 1
        || (tail && !['converged', 'exact-zero-statistic', 'rounded-to-one', 'subnormal', 'underflow'].includes(tail.status))
        || (tail && tail.probability !== p)) {
      return unavailable('The asymptotic p-value is unavailable, invalid or did not converge.');
    }
    let reject, basis = 'asymptotic-p-value';
    if (p === 0) {
      if (tail?.status !== 'underflow' || !Number.isFinite(tail.logProbability)
          || tail.logProbability >= 0 || Math.exp(tail.logProbability) !== 0) {
        return unavailable('A numerical zero without a consistent finite underflow log p cannot support a decision.');
      }
      reject = tail.logProbability < Math.log(alpha);
      basis = 'log-asymptotic-p-value';
      warnings.push('Numerical underflow: the formal comparison uses log p, not a mathematically exact zero probability.');
    } else {
      if (tail?.status === 'underflow') return unavailable('The p-value and its underflow status are inconsistent.');
      reject = p < alpha; // Strict comparison: equality belongs to fail-to-reject.
      if (tail?.status === 'subnormal') warnings.push('The p-value is subnormal and has reduced relative precision.');
      if (tail?.status === 'rounded-to-one') warnings.push('The p-value is rounded to 1; this does not establish population independence.');
    }
    return answer(reject ? 'Reject H₀' : 'Fail to reject H₀', 'available', basis,
      reject ? 'Formal asymptotic comparison: p < α. This decision depends on the model and sampling assumptions; it is not proof of population association or causation.'
        : 'Formal asymptotic comparison: p ≥ α. Failure to reject does not establish population independence.');
  }

  function computeCramersV(chiSquare, totalObservations, rows, columns) {
    if (!Number.isSafeInteger(totalObservations) || totalObservations < 0
        || !Number.isInteger(rows) || rows < 0 || rows > limits.categories
        || !Number.isInteger(columns) || columns < 0 || columns > limits.categories) {
      throw new Error('Cramér\'s V requires a nonnegative integer N and supported integer dimensions.');
    }
    const result = (value, status, reason, roundedToBoundary = false) => Object.freeze({ value, status, reason, roundedToBoundary });
    if (totalObservations === 0) return result(null, 'undefined', 'Cramér\'s V is undefined when N = 0.');
    if (rows < 2 || columns < 2) return result(null, 'undefined', 'Cramér\'s V requires at least two categories per variable.');
    if (chiSquare === null) return result(null, 'undefined', 'The Pearson statistic is unavailable.');
    if (!Number.isFinite(chiSquare) || chiSquare < 0) throw new Error('Cramér\'s V requires a finite, nonnegative Pearson statistic.');
    const squared = (chiSquare / totalObservations) / Math.min(rows - 1, columns - 1);
    if (!Number.isFinite(squared) || squared > 1 + 64 * Number.EPSILON) {
      return result(null, 'invalid', 'The supplied statistic exceeds the bounds for Cramér\'s V.');
    }
    return result(Math.sqrt(Math.min(1, squared)), 'defined', null, squared > 1);
  }

  const initialTable = buildContingencyTable(observations);
  const initialComparison = compareObservedExpected(initialTable);
  const initialTest = chiSquareFromComparison(initialTable, initialComparison);
  let state = Object.freeze({ activeDataset: dataset, contingencyTable: initialTable,
    frequencies: computeFrequencies(initialTable), independenceComparison: initialComparison,
    chiSquareTest: initialTest, alpha: .05,
    cramersV: computeCramersV(initialTest.chiSquare, initialTable.totalObservations, initialTable.rowCategories.length, initialTable.columnCategories.length),
    interpretation: interpretChiSquareTest(initialTest, .05), activeExperimentId: 'A', revision: 0 });
  let ui = null;

  function commit(activeDataset, contingencyTable, activeExperimentId = null) {
    const frequencies = computeFrequencies(contingencyTable);
    const independenceComparison = compareObservedExpected(contingencyTable);
    const chiSquareTest = chiSquareFromComparison(contingencyTable, independenceComparison);
    const cramersV = computeCramersV(chiSquareTest.chiSquare, contingencyTable.totalObservations,
      contingencyTable.rowCategories.length, contingencyTable.columnCategories.length);
    const interpretation = interpretChiSquareTest(chiSquareTest, state.alpha);
    state = Object.freeze({ activeDataset, contingencyTable, frequencies, independenceComparison, chiSquareTest,
      alpha: state.alpha, cramersV, interpretation, activeExperimentId, revision: state.revision + 1 });
    if (ui) render();
    // Future sections must invalidate cached results when this revision changes.
    // No future calculations or result placeholders are populated here.
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('statistical-independence:dataset-change', { detail: state }));
    }
    return state;
  }

  function setSignificanceLevel(alpha) {
    validateAlpha(alpha);
    state = Object.freeze({ ...state, alpha, interpretation: interpretChiSquareTest(state.chiSquareTest, alpha) });
    if (ui) renderInterpretation();
    return state;
  }

  function applyDataset(text, options) {
    const parsed = parseDataset(text, options);
    const table = buildContingencyTable(parsed.observations);
    const activeDataset = Object.freeze({
      title: 'User-provided paired observations', isSynthetic: false,
      description: 'User-provided data; provenance has not been verified.',
      variables: Object.freeze(Object.fromEntries(keys.map((key, i) => [key, Object.freeze({
        label: parsed.variableNames[i], categories: i === 0 ? table.rowCategories : table.columnCategories
      })]))),
      observations: parsed.observations
    });
    return commit(activeDataset, table);
  }

  function resetDataset() {
    writeDatasetEditor(dataset.observations);
    if (ui) ui.experimentSelect.value = 'A';
    return commit(dataset, buildContingencyTable(dataset.observations), 'A');
  }

  function writeDatasetEditor(rows) {
    if (!ui) return;
    ui.input.value = ['studyMethod,examOutcome', ...rows.map(row => `${row.studyMethod},${row.examOutcome}`)].join('\n');
    ui.header.checked = true;
    ui.input.removeAttribute('aria-invalid');
  }

  function loadExperiment(id) {
    const experiment = experimentById(id);
    const rows = generateExperimentObservations(id);
    const table = buildContingencyTable(rows);
    const activeDataset = id === 'A' ? dataset : Object.freeze({ ...dataset,
      title: experiment.name,
      description: `Synthetic illustrative data — ${experiment.name}; not a real student sample.`,
      observations: rows
    });
    writeDatasetEditor(rows);
    if (ui) {
      ui.experimentSelect.value = id;
      ui.feedback.textContent = 'Synthetic illustrative experiment loaded. All active statistics use its observations.';
    }
    return commit(activeDataset, table, id);
  }

  function renderTable(table, names) {
    const element = document.createElement('table');
    const caption = element.createCaption();
    caption.textContent = `Observed absolute frequencies: ${names[0]} (rows) × ${names[1]} (columns)`;
    const cell = (row, tag, value, scope) => {
      const item = document.createElement(tag);
      item.textContent = String(value);
      if (scope) item.scope = scope;
      row.append(item);
    };
    const header = element.createTHead().insertRow();
    cell(header, 'th', `${names[0]} / ${names[1]}`, 'col');
    table.columnCategories.forEach(label => cell(header, 'th', label, 'col'));
    cell(header, 'th', 'Row total', 'col');
    const body = element.createTBody();
    table.rowCategories.forEach((label, i) => {
      const row = body.insertRow();
      cell(row, 'th', label, 'row');
      table.observedCounts[i].forEach(count => cell(row, 'td', count));
      cell(row, 'td', table.rowTotals[i]);
    });
    const footer = element.createTFoot().insertRow();
    cell(footer, 'th', 'Column total', 'row');
    table.columnTotals.forEach(count => cell(footer, 'td', count));
    cell(footer, 'td', table.totalObservations);
    return element;
  }

  function render() {
    const { activeDataset, contingencyTable: table } = state;
    const names = keys.map(key => activeDataset.variables[key].label);
    ui.summary.textContent = `Observations (N): ${table.totalObservations}. ${names[0]}: ${table.rowCategories.length} categories; ${names[1]}: ${table.columnCategories.length} categories. Order: first occurrence.`;
    ui.origin.textContent = activeDataset.description;
    ui.table.replaceChildren(renderTable(table, names));
    renderFrequencies();
    renderExpectedFrequencies();
    renderChiSquare();
    renderInterpretation();
    renderExperiments();
  }

  function renderExperiments() {
    ui.experimentFeedback.textContent = '';
    const active = experimentCatalog.find(entry => entry.id === state.activeExperimentId);
    ui.activeExperiment.textContent = active
      ? `Active experiment: ${active.name}. Synthetic illustrative data.`
      : 'Active dataset: manually supplied observations, not attributed to any preset experiment. The comparison below still describes the four fixed synthetic scenarios.';
    if (!ui.experimentTable.firstChild) {
      const table = document.createElement('table');
      table.createCaption().textContent = 'Four fixed scenarios — synthetic illustrative data; computed with the existing algorithms';
      const cell = (row, tag, value, scope) => {
        const node = document.createElement(tag); node.textContent = value;
        if (scope) node.scope = scope;
        row.append(node);
      };
      const header = table.createTHead().insertRow();
      ['Scenario', 'N', 'Dimensions', 'Pearson χ²', 'df', 'Asymptotic p-value', "Cramér's V", 'Minimum expected count', 'Reliability notes']
        .forEach(label => cell(header, 'th', label, 'col'));
      const body = table.createTBody();
      getExperimentResults().forEach(entry => {
        const { contingencyTable: t, chiSquareTest: test, cramersV: v } = entry;
        const row = body.insertRow();
        cell(row, 'th', entry.name, 'row');
        [String(t.totalObservations), `${t.rowCategories.length} × ${t.columnCategories.length}`,
          test.chiSquare === null ? 'N/A' : test.chiSquare.toPrecision(12), String(test.degreesOfFreedom),
          formatPValue(test.pValueDetails), v.value === null ? 'N/A' : v.value.toPrecision(10),
          formatExpectedCount(test.diagnostics.minExpectedCount),
          test.applicability.warnings.join(' ') || 'No small-expected-count warning; sampling assumptions still require assessment.']
          .forEach(value => cell(row, 'td', value));
      });
      ui.experimentTable.replaceChildren(table);
    }
  }

  function renderInterpretation() {
    const { chiSquareTest: test, cramersV: v, interpretation: result, alpha } = state;
    const names = keys.map(key => state.activeDataset.variables[key].label);
    ui.alpha.value = String(alpha);
    ui.alphaFeedback.textContent = '';
    ui.interpretationHypotheses.textContent = `H₀: ${names[0]} and ${names[1]} are independent in the population. H₁: ${names[0]} and ${names[1]} are associated in the population.`;
    ui.interpretationDescriptive.textContent = `Observations (N): ${state.contingencyTable.totalObservations}. Cramér's V: ${v.value === null ? 'N/A' : v.value.toPrecision(10)}. ${v.reason ?? 'This describes association in the observed sample; no universal strength label is assigned.'}`;
    ui.interpretationMetrics.textContent = `Significance level α: ${alpha.toFixed(2)}. Pearson χ²: ${test.chiSquare === null ? 'N/A' : test.chiSquare.toPrecision(12)}. Degrees of freedom: ${test.degreesOfFreedom}. Asymptotic p-value: ${formatPValue(test.pValueDetails)}.`;
    ui.interpretationDecision.textContent = result.decision;
    ui.interpretationExplanation.textContent = result.explanation;
    ui.interpretationWarnings.textContent = result.warnings.length ? result.warnings.join(' ')
      : result.status === 'unavailable' ? 'No inferential decision is reported. Review the applicability conditions above.'
        : 'No small-expected-count warning. Sampling assumptions still require assessment.';
  }

  function renderChiSquare() {
    const test = state.chiSquareTest, table = state.contingencyTable;
    const names = keys.map(key => state.activeDataset.variables[key].label);
    ui.chiSummary.textContent = `Pearson Chi-square: ${test.chiSquare === null ? 'N/A' : test.chiSquare.toPrecision(12)}. Degrees of freedom (displayed dimensions): ${test.degreesOfFreedom}. Asymptotic p-value: ${formatPValue(test.pValueDetails)}. Numerical status: ${test.pValueDetails?.status ?? test.status}.`;
    const d = test.diagnostics;
    ui.chiDiagnostics.textContent = `Minimum expected count: ${formatExpectedCount(d.minExpectedCount)}. Expected cells below 5: ${d.cellsBelow5 ?? 'N/A'} (${d.percentageBelow5 === null ? 'N/A' : d.percentageBelow5.toFixed(4) + '%'}). Zero expected counts: ${d.zeroExpectedCells ?? 'N/A'}. Applicability: ${test.applicability.asymptoticReference}. Sampling assumptions are not verified by these counts.`;
    ui.chiWarnings.textContent = [test.reason, ...test.applicability.warnings].filter(Boolean).join(' ') || 'No numerical or small-expected-count warning; sampling assumptions still require assessment.';
    const element = document.createElement('table');
    element.createCaption().textContent = `Pearson cell contributions: ${names[0]} (rows) × ${names[1]} (columns)`;
    const cell = (row, tag, value, scope) => {
      const node = document.createElement(tag); node.textContent = value;
      if (scope) node.scope = scope;
      row.append(node);
    };
    const header = element.createTHead().insertRow();
    [names[0] + ' / ' + names[1], ...table.columnCategories].forEach(label => cell(header, 'th', label, 'col'));
    const body = element.createTBody(), plotted = [];
    table.rowCategories.forEach((label, i) => {
      const row = body.insertRow(); cell(row, 'th', label, 'row');
      test.contributions[i].forEach((value, j) => {
        cell(row, 'td', value === null ? 'N/A' : value.toPrecision(10));
        if (plotted.length < 50) plotted.push({ label: `${names[0]}: ${label} | ${names[1]}: ${table.columnCategories[j]}`, value });
      });
    });
    ui.chiTable.replaceChildren(element);
    ui.chiChartNote.textContent = `Showing ${plotted.length} of ${d.totalCells} cells in table row order; the table retains all contributions. Axis starts at zero. Display rounding does not affect the statistic.`;
    if (typeof Chart === 'undefined') { ui.chiChartFeedback.textContent = 'Chart unavailable: Chart.js failed to load. Results and contributions remain in the table.'; return; }
    const previous = Chart.getChart('independenceChiSquareChart');
    if (previous) previous.destroy();
    if (test.chiSquare === null) { ui.chiChartFeedback.textContent = 'Contribution chart unavailable: the test is undefined or unsupported.'; return; }
    ui.chiChartFeedback.textContent = '';
    new Chart(document.getElementById('independenceChiSquareChart'), {
      type: 'bar', data: { labels: plotted.map(entry => entry.label), datasets: [
        { label: 'Pearson cell contribution', data: plotted.map(entry => entry.value), backgroundColor: '#2563a6' }
      ] },
      options: { responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { ticks: { callback(index) { const label = this.getLabelForValue(index); return label.length > 24 ? label.slice(0, 21) + '…' : label; } } },
          y: { min: 0, beginAtZero: true, title: { display: true, text: 'Chi-square contribution' } }
        } }
    });
  }

  function formatExpectedCount(value, signed = false) {
    if (value === null) return 'N/A';
    const text = value.toFixed(6);
    if (Number(text) === 0) return '0.000000';
    return signed && value > 0 ? `+${text}` : text;
  }

  function renderExpectedFrequencies() {
    const { independenceComparison: comparison, activeDataset } = state;
    const e = comparison.expected, d = e.diagnostics;
    const names = keys.map(key => activeDataset.variables[key].label);
    const cell = (row, tag, value, scope) => {
      const item = document.createElement(tag);
      item.textContent = String(value);
      if (scope) item.scope = scope;
      row.append(item);
    };
    const expectedTable = document.createElement('table');
    expectedTable.createCaption().textContent = `Expected counts under H₀: ${names[0]} (rows) × ${names[1]} (columns); N = ${e.totalObservations}`;
    const header = expectedTable.createTHead().insertRow();
    [`${names[0]} / ${names[1]}`, ...e.columnCategories, 'Row total'].forEach(label => cell(header, 'th', label, 'col'));
    const body = expectedTable.createTBody();
    e.rowCategories.forEach((label, i) => {
      const row = body.insertRow();
      cell(row, 'th', label, 'row');
      e.expectedCounts[i].forEach(value => cell(row, 'td', formatExpectedCount(value)));
      cell(row, 'td', e.rowTotals[i]);
    });
    const footer = expectedTable.createTFoot().insertRow();
    cell(footer, 'th', 'Column total', 'row');
    [...e.columnTotals, e.totalObservations].forEach(value => cell(footer, 'td', value));
    ui.expectedTable.replaceChildren(expectedTable);

    const comparisonTable = document.createElement('table');
    comparisonTable.createCaption().textContent = 'Descriptive cell comparison: observed O, expected E and signed O − E (counts)';
    const comparisonHeader = comparisonTable.createTHead().insertRow();
    [names[0], names[1], 'Observed O', 'Expected E', 'Difference O − E'].forEach(label => cell(comparisonHeader, 'th', label, 'col'));
    const comparisonBody = comparisonTable.createTBody();
    comparison.cells.forEach((cells, i) => cells.forEach((entry, j) => {
      const row = comparisonBody.insertRow();
      cell(row, 'th', e.rowCategories[i], 'row');
      cell(row, 'td', e.columnCategories[j]);
      cell(row, 'td', entry.observed);
      cell(row, 'td', formatExpectedCount(entry.expected));
      cell(row, 'td', formatExpectedCount(entry.difference, true));
    }));
    ui.comparisonTable.replaceChildren(comparisonTable);
    ui.expectedDiagnostics.textContent = `Rows: ${d.numberOfRows}; columns: ${d.numberOfColumns}; expected cells: ${d.totalCells}. Minimum expected count: ${formatExpectedCount(d.minExpectedCount)}. Expected cells below 5: ${d.cellsBelow5 ?? 'N/A'} (${d.percentageBelow5 === null ? 'N/A' : d.percentageBelow5.toFixed(4) + '%'}). Expected cells equal to zero: ${d.zeroExpectedCells ?? 'N/A'}. ${e.reason ?? 'Descriptive diagnostics only; no test decision.'}`;

    const plotted = [];
    comparison.cells.forEach((cells, i) => cells.forEach((entry, j) => {
      if (plotted.length < 50) plotted.push({ ...entry, label: `${names[0]}: ${e.rowCategories[i]} | ${names[1]}: ${e.columnCategories[j]}` });
    }));
    ui.expectedChartNote.textContent = `Showing ${plotted.length === d.totalCells ? 'all ' : 'the first '}${plotted.length} of ${d.totalCells} cells in table row order. Both tables include all cells. Values are counts; the vertical axis starts at zero. Long axis labels are shortened; full labels are available in tooltips and tables.`;
    if (typeof Chart === 'undefined') {
      ui.expectedChartFeedback.textContent = 'Chart unavailable: Chart.js failed to load. Both tables and diagnostics remain available.';
      return;
    }
    ui.expectedChartFeedback.textContent = '';
    const previous = Chart.getChart('independenceExpectedChart');
    if (previous) previous.destroy();
    new Chart(document.getElementById('independenceExpectedChart'), {
      type: 'bar',
      data: { labels: plotted.map(entry => entry.label), datasets: [
        { label: 'Observed counts O', data: plotted.map(entry => entry.observed), backgroundColor: '#2563a6' },
        { label: 'Expected counts E', data: plotted.map(entry => entry.expected), backgroundColor: '#d97706' }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
          x: { title: { display: true, text: `${names[0]} × ${names[1]} cells (table order)` },
            ticks: { callback(index) { const label = this.getLabelForValue(index); return label.length > 24 ? label.slice(0, 21) + '…' : label; } } },
          y: { beginAtZero: true, min: 0, title: { display: true, text: 'Cell count' } }
        }
      }
    });
  }

  function renderFrequencyTable(values, names, caption, options = {}) {
    const table = state.contingencyTable;
    const element = document.createElement('table');
    element.createCaption().textContent = caption;
    const cell = (row, tag, value, scope) => {
      const item = document.createElement(tag);
      item.textContent = value;
      if (scope) item.scope = scope;
      row.append(item);
    };
    const header = element.createTHead().insertRow();
    cell(header, 'th', `${names[0]} / ${names[1]}`, 'col');
    table.columnCategories.forEach(label => cell(header, 'th', label, 'col'));
    if (options.finalColumn) cell(header, 'th', options.finalColumnTitle, 'col');
    const body = element.createTBody();
    table.rowCategories.forEach((label, i) => {
      const row = body.insertRow();
      cell(row, 'th', label, 'row');
      values[i].forEach(value => cell(row, 'td', formatFrequency(value, ui.format.value)));
      if (options.finalColumn) cell(row, 'td', formatFrequency(options.finalColumn[i], ui.format.value));
    });
    if (options.finalRow) {
      const row = element.createTFoot().insertRow();
      cell(row, 'th', options.finalRowTitle, 'row');
      options.finalRow.forEach(value => cell(row, 'td', formatFrequency(value, ui.format.value)));
      if (options.finalColumn) cell(row, 'td', formatFrequency(options.corner, ui.format.value));
    }
    return element;
  }

  function renderConditionalChart(id, labels, datasets, conditioningName) {
    const canvas = document.getElementById(id);
    const previous = Chart.getChart(canvas);
    if (previous) previous.destroy();
    new Chart(canvas, {
      type: 'bar',
      data: { labels: [...labels], datasets: datasets.map((entry, index) => ({ ...entry,
        backgroundColor: `hsl(${(index * 137.508) % 360}, 65%, 48%)` })) },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { display: datasets.length <= 10 },
          tooltip: { callbacks: { label: item => `${item.dataset.label}: ${formatFrequency(item.raw, ui.format.value)}` } }
        },
        scales: {
          x: { stacked: true, title: { display: true, text: `Conditioning variable: ${conditioningName}` },
            ticks: { callback(index) { const label = this.getLabelForValue(index); return label.length > 24 ? `${label.slice(0, 21)}…` : label; } } },
          y: { stacked: true, min: 0, max: 1,
            title: { display: true, text: ui.format.value === 'percentage' ? 'Conditional percentage' : 'Conditional proportion' },
            ticks: { callback: value => formatFrequency(value, ui.format.value) } }
        }
      }
    });
  }

  function renderFrequencies() {
    const { activeDataset, contingencyTable: table, frequencies: f } = state;
    const names = keys.map(key => activeDataset.variables[key].label);
    const unit = ui.format.value === 'percentage' ? 'percentages' : 'proportions';
    const format = value => formatFrequency(value, ui.format.value);
    ui.marginals.textContent = `${names[0]} marginal ${unit}: ${table.rowCategories.map((label, i) => `${label} = ${format(f.rowMarginals[i])}`).join('; ')}. ${names[1]} marginal ${unit}: ${table.columnCategories.map((label, i) => `${label} = ${format(f.columnMarginals[i])}`).join('; ')}.`;
    ui.joint.replaceChildren(renderFrequencyTable(f.jointRelativeFrequencies, names, `Joint relative frequencies (${unit}); denominator N = ${table.totalObservations}`, {
      finalColumn: f.rowMarginals, finalColumnTitle: 'Row marginal',
      finalRow: f.columnMarginals, finalRowTitle: 'Column marginal', corner: f.totalRelativeFrequency
    }));
    ui.columnGivenRowTitle.textContent = `${names[1]} given ${names[0]} — conditional ${unit} (each row)`;
    ui.rowGivenColumnTitle.textContent = `${names[0]} given ${names[1]} — conditional ${unit} (each column)`;
    const sumDistribution = values => values.some(value => value === null) ? null : values.reduce((a, b) => a + b, 0);
    ui.columnGivenRow.replaceChildren(renderFrequencyTable(f.columnGivenRow, names, ui.columnGivenRowTitle.textContent, {
      finalColumn: f.columnGivenRow.map(sumDistribution), finalColumnTitle: 'Row sum'
    }));
    ui.rowGivenColumn.replaceChildren(renderFrequencyTable(f.rowGivenColumn, names, ui.rowGivenColumnTitle.textContent, {
      finalRow: table.columnCategories.map((_, j) => sumDistribution(f.rowGivenColumn.map(row => row[j]))), finalRowTitle: 'Column sum'
    }));
    if (typeof Chart === 'undefined') {
      ui.chartFeedback.textContent = 'Charts unavailable: Chart.js failed to load. All frequencies are available in the tables.';
      return;
    }
    ui.chartFeedback.textContent = '';
    renderConditionalChart('independenceColumnGivenRowChart', table.rowCategories,
      table.columnCategories.map((label, j) => ({ label, data: f.columnGivenRow.map(row => row[j]) })), names[0]);
    renderConditionalChart('independenceRowGivenColumnChart', table.columnCategories,
      table.rowCategories.map((label, i) => ({ label, data: [...f.rowGivenColumn[i]] })), names[1]);
  }

  function initializeUi() {
    const input = document.getElementById('independenceDatasetInput');
    if (!input) return;
    ui = { input, header: document.getElementById('independenceHasHeader'),
      feedback: document.getElementById('independenceDatasetFeedback'),
      summary: document.getElementById('independenceDatasetSummary'),
      origin: document.getElementById('independenceDatasetOrigin'),
      table: document.getElementById('independenceTableContainer'),
      format: document.getElementById('independenceFrequencyFormat'),
      marginals: document.getElementById('independenceMarginalSummary'),
      joint: document.getElementById('independenceJointTable'),
      columnGivenRow: document.getElementById('independenceColumnGivenRowTable'),
      rowGivenColumn: document.getElementById('independenceRowGivenColumnTable'),
      columnGivenRowTitle: document.getElementById('independenceColumnGivenRowTitle'),
      rowGivenColumnTitle: document.getElementById('independenceRowGivenColumnTitle'),
      chartFeedback: document.getElementById('independenceChartFeedback'),
      expectedTable: document.getElementById('independenceExpectedTable'),
      comparisonTable: document.getElementById('independenceComparisonTable'),
      expectedDiagnostics: document.getElementById('independenceExpectedDiagnostics'),
      expectedChartNote: document.getElementById('independenceExpectedChartNote'),
      expectedChartFeedback: document.getElementById('independenceExpectedChartFeedback'),
      chiSummary: document.getElementById('independenceChiSquareSummary'),
      chiDiagnostics: document.getElementById('independenceChiSquareDiagnostics'),
      chiWarnings: document.getElementById('independenceChiSquareWarnings'),
      chiTable: document.getElementById('independenceChiSquareTable'),
      chiChartNote: document.getElementById('independenceChiSquareChartNote'),
      chiChartFeedback: document.getElementById('independenceChiSquareChartFeedback'),
      alpha: document.getElementById('independenceAlpha'),
      alphaFeedback: document.getElementById('independenceAlphaFeedback'),
      interpretationHypotheses: document.getElementById('independenceInterpretationHypotheses'),
      interpretationDescriptive: document.getElementById('independenceInterpretationDescriptive'),
      interpretationMetrics: document.getElementById('independenceInterpretationMetrics'),
      interpretationDecision: document.getElementById('independenceInterpretationDecision'),
      interpretationExplanation: document.getElementById('independenceInterpretationExplanation'),
      interpretationWarnings: document.getElementById('independenceInterpretationWarnings'),
      experimentSelect: document.getElementById('independenceExperiment'),
      experimentFeedback: document.getElementById('independenceExperimentFeedback'),
      activeExperiment: document.getElementById('independenceActiveExperiment'),
      experimentTable: document.getElementById('independenceExperimentsTable') };
    experimentCatalog.forEach(experiment => {
      const option = document.createElement('option');
      option.value = experiment.id; option.textContent = experiment.name;
      ui.experimentSelect.append(option);
    });
    document.getElementById('loadIndependenceExperiment').addEventListener('click', () => {
      try {
        loadExperiment(ui.experimentSelect.value);
      } catch (error) {
        ui.experimentSelect.value = state.activeExperimentId ?? 'A';
        ui.experimentFeedback.textContent = `${error.message} The active dataset and results are unchanged.`;
      }
    });
    ui.format.addEventListener('change', renderFrequencies);
    ui.alpha.addEventListener('change', () => {
      try {
        setSignificanceLevel(Number(ui.alpha.value));
        ui.alphaFeedback.textContent = '';
      } catch (error) {
        ui.alpha.value = String(state.alpha);
        ui.alphaFeedback.textContent = `${error.message} The previous significance level and interpretation are unchanged.`;
      }
    });
    document.getElementById('applyIndependenceDataset').addEventListener('click', () => {
      try {
        applyDataset(ui.input.value, { hasHeader: ui.header.checked });
        ui.input.removeAttribute('aria-invalid');
        ui.feedback.textContent = 'Dataset applied. Observed counts and totals updated.';
      } catch (error) {
        ui.input.setAttribute('aria-invalid', 'true');
        ui.feedback.textContent = `${error.message} The last valid dataset and table are unchanged.`;
      }
    });
    document.getElementById('resetIndependenceDataset').addEventListener('click', () => {
      resetDataset();
      ui.input.removeAttribute('aria-invalid');
      ui.feedback.textContent = 'Default synthetic illustrative dataset restored.';
    });
    writeDatasetEditor(dataset.observations);
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeUi, { once: true });
    else initializeUi();
  }

  return Object.freeze({ dataset, limits, parseDataset, validateDataset, extractCategories, buildContingencyTable,
    computeJointFrequencies, computeConditionalFrequencies, computeFrequencies, formatFrequency,
    computeExpectedFrequencies, compareObservedExpected,
    computeChiSquareTest, chiSquareSurvival, formatPValue,
    interpretChiSquareTest, computeCramersV, setSignificanceLevel,
    experimentCatalog, generateExperimentObservations, getExperimentResults, loadExperiment,
    applyDataset, resetDataset, getState: () => state });
})();
