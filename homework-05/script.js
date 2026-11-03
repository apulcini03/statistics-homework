
// HW 4 - Welford & Sampling Statistics
// Statistics for Cybersecurity

// Exercise 1 - Interactive Welford Algorithm

// Create the initial state of Welford's algorithm.
function createWelfordState() {
  return {
    count: 0,
    mean: 0,
    M2: 0
  };
}

// Update running statistics with one observation.
function updateWelford(state, x) {
  state.count++;

  // Welford's three-line core
  const delta = x - state.mean;
  state.mean += delta / state.count;
  state.M2 += delta * (x - state.mean);

  return {
    count: state.count,
    observation: x,
    delta,
    mean: state.mean,
    M2: state.M2,
    variance: state.count > 1
      ? state.M2 / (state.count - 1)
      : null
  };
}

// Parse and validate the input sequence.
function parseWelfordObservations(text) {
  const values = text.split(",").map(
    value => value.trim()
  );

  if (
    values.length === 0 ||
    values.length > 100 ||
    values.some(value => value === "")
  ) {
    throw new Error(
      "Enter between 1 and 100 " +
      "comma-separated observations."
    );
  }

  const numbers = values.map(Number);

  if (
    numbers.some(value => !Number.isFinite(value))
  ) {
    throw new Error(
      "All observations must be valid numbers. " +
      "Use a dot for decimal values."
    );
  }

  return numbers;
}

// Direct calculation, used only for verification.
function directWelfordStatistics(values) {
  const n = values.length;

  if (n === 0) {
    return null;
  }

  const mean = values.reduce(
    (sum, x) => sum + x,
    0
  ) / n;

  const M2 = values.reduce(
    (sum, x) => sum + (x - mean) ** 2,
    0
  );

  return {
    mean,
    M2,
    variance: n > 1 ? M2 / (n - 1) : null
  };
}

// Format values for the interactive tables.
function formatWelfordNumber(value) {
  if (value === null) {
    return "Undefined";
  }

  return Number(value.toFixed(6)).toString();
}

// Compare floating-point results with tolerance.
function welfordAlmostEqual(a, b) {
  if (a === null || b === null) {
    return a === b;
  }

  const tolerance =
    1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

  return Math.abs(a - b) <= tolerance;
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById(
    "welfordObservations"
  );

  const nextButton = document.getElementById(
    "welfordNextBtn"
  );

  const runAllButton = document.getElementById(
    "welfordRunAllBtn"
  );

  const resetButton = document.getElementById(
    "welfordResetBtn"
  );

  const summary = document.getElementById(
    "welfordSummary"
  );

  const tableBody = document.getElementById(
    "welfordStepsBody"
  );

  const verification = document.getElementById(
    "welfordVerification"
  );

  let state = createWelfordState();
  let observations = [];
  let processedValues = [];
  let initialized = false;

  function updateButtons() {
    const finished =
      initialized &&
      state.count >= observations.length;

    nextButton.disabled = finished;
    runAllButton.disabled = finished;
  }

  function resetExperiment() {
    state = createWelfordState();
    observations = [];
    processedValues = [];
    initialized = false;

    tableBody.replaceChildren();

    summary.textContent =
      "Enter a sequence and start the algorithm.";

    verification.textContent =
      "No observations processed yet.";

    nextButton.disabled = false;
    runAllButton.disabled = false;
  }

  function initializeSequence() {
    if (initialized) {
      return true;
    }

    try {
      observations = parseWelfordObservations(
        input.value
      );

      initialized = true;

      summary.textContent =
        `Sequence contains ` +
        `${observations.length} observations.\n` +
        `Ready to process.`;

      return true;

    } catch (error) {
      summary.textContent = error.message;
      return false;
    }
  }

  function addStepToTable(result) {
    const row = document.createElement("tr");

    const values = [
      result.count,
      formatWelfordNumber(result.observation),
      formatWelfordNumber(result.delta),
      formatWelfordNumber(result.mean),
      formatWelfordNumber(result.M2),
      formatWelfordNumber(result.variance)
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }

  function updateVerification() {
    const direct = directWelfordStatistics(
      processedValues
    );

    const welfordVariance = state.count > 1
      ? state.M2 / (state.count - 1)
      : null;

    const meanMatches = welfordAlmostEqual(
      state.mean,
      direct.mean
    );

    const m2Matches = welfordAlmostEqual(
      state.M2,
      direct.M2
    );

    const varianceMatches = welfordAlmostEqual(
      welfordVariance,
      direct.variance
    );

    const allMatch =
      meanMatches && m2Matches && varianceMatches;

    verification.textContent =
      `Welford vs Direct Calculation\n\n` +
      `Mean:\n` +
      `Welford = ${formatWelfordNumber(state.mean)}\n` +
      `Direct  = ${formatWelfordNumber(direct.mean)}\n\n` +
      `Sum of Squares (M2):\n` +
      `Welford = ${formatWelfordNumber(state.M2)}\n` +
      `Direct  = ${formatWelfordNumber(direct.M2)}\n\n` +
      `Sample Variance:\n` +
      `Welford = ` +
      `${formatWelfordNumber(welfordVariance)}\n` +
      `Direct  = ` +
      `${formatWelfordNumber(direct.variance)}\n\n` +
      `Verification: ` +
      `${allMatch ? "PASS" : "CHECK"}`;
  }

  function processNextObservation() {
    if (!initializeSequence()) {
      return;
    }

    if (state.count >= observations.length) {
      updateButtons();
      return;
    }

    const x = observations[state.count];

    const result = updateWelford(state, x);

    // History is stored only by the demonstration.
    processedValues.push(x);

    addStepToTable(result);

    const remaining =
      observations.length - state.count;

    const variance = state.count > 1
      ? state.M2 / (state.count - 1)
      : null;

    summary.textContent =
      `Processed observations: ` +
      `${state.count}/${observations.length}\n` +
      `Remaining: ${remaining}\n\n` +
      `Latest observation: ` +
      `${formatWelfordNumber(x)}\n` +
      `Running mean: ` +
      `${formatWelfordNumber(state.mean)}\n` +
      `Sum of Squares (M2): ` +
      `${formatWelfordNumber(state.M2)}\n` +
      `Sample variance: ` +
      `${formatWelfordNumber(variance)}\n\n` +
      (
        remaining === 0
          ? "Sequence completed."
          : "Ready for the next observation."
      );

    updateVerification();
    updateButtons();
  }

  nextButton.addEventListener(
    "click",
    processNextObservation
  );

  runAllButton.addEventListener("click", () => {
    if (!initializeSequence()) {
      return;
    }

    while (state.count < observations.length) {
      processNextObservation();
    }
  });

  resetButton.addEventListener(
    "click",
    resetExperiment
  );

  // Changing input starts a new sequence.
  input.addEventListener("input", resetExperiment);
});
