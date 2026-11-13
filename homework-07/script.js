'use strict';

// Data and observed absolute frequencies only; no inferential calculations.
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

  let state = Object.freeze({ activeDataset: dataset, contingencyTable: buildContingencyTable(observations), revision: 0 });
  let ui = null;

  function commit(activeDataset, contingencyTable) {
    state = Object.freeze({ activeDataset, contingencyTable, revision: state.revision + 1 });
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
  }

  function initializeUi() {
    const input = document.getElementById('independenceDatasetInput');
    if (!input) return;
    ui = { input, header: document.getElementById('independenceHasHeader'),
      feedback: document.getElementById('independenceDatasetFeedback'),
      summary: document.getElementById('independenceDatasetSummary'),
      origin: document.getElementById('independenceDatasetOrigin'),
      table: document.getElementById('independenceTableContainer') };
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
    applyDataset, resetDataset, getState: () => state });
})();
