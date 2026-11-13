'use strict';

// Descriptive observed frequencies only; no inferential calculations.
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

  const initialTable = buildContingencyTable(observations);
  let state = Object.freeze({ activeDataset: dataset, contingencyTable: initialTable,
    frequencies: computeFrequencies(initialTable), independenceComparison: compareObservedExpected(initialTable), revision: 0 });
  let ui = null;

  function commit(activeDataset, contingencyTable) {
    const frequencies = computeFrequencies(contingencyTable);
    const independenceComparison = compareObservedExpected(contingencyTable);
    state = Object.freeze({ activeDataset, contingencyTable, frequencies, independenceComparison, revision: state.revision + 1 });
    if (ui) render();
    // Future sections must invalidate cached results when this revision changes.
    // No future calculations or result placeholders are populated here.
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('statistical-independence:dataset-change', { detail: state }));
    }
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
    return commit(dataset, buildContingencyTable(dataset.observations));
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
      expectedChartFeedback: document.getElementById('independenceExpectedChartFeedback') };
    ui.format.addEventListener('change', renderFrequencies);
    const showDefaultInput = () => {
      ui.input.value = ['studyMethod,examOutcome', ...dataset.observations.map(row => `${row.studyMethod},${row.examOutcome}`)].join('\n');
      ui.header.checked = true;
    };
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
      showDefaultInput();
      resetDataset();
      ui.input.removeAttribute('aria-invalid');
      ui.feedback.textContent = 'Default synthetic illustrative dataset restored.';
    });
    showDefaultInput();
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeUi, { once: true });
    else initializeUi();
  }

  return Object.freeze({ dataset, limits, parseDataset, validateDataset, extractCategories, buildContingencyTable,
    computeJointFrequencies, computeConditionalFrequencies, computeFrequencies, formatFrequency,
    computeExpectedFrequencies, compareObservedExpected,
    applyDataset, resetDataset, getState: () => state });
})();
