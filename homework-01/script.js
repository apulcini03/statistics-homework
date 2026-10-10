"use strict";

// Homework 01 - Elliptic Curve Cryptography
// Toy curve: y² = x³ + 7 (mod 17)

// 1. Curve parameters
const p = 17;
const G = { x: 1, y: 5 };
const privateKey = 6;

// 2. Modular arithmetic
function mod(n, p) {
  return ((n % p) + p) % p;
}

// 3. Modular multiplicative inverse
function modInverse(a, p) {
  a = mod(a, p);

  for (let i = 1; i < p; i++) {
    if (mod(a * i, p) === 1) {
      return i;
    }
  }

  throw new Error("Modular inverse does not exist");
}

// 4. Point addition
function pointAdd(P, Q) {

  // Point at infinity (identity element)
  if (P === null) return Q;
  if (Q === null) return P;

  // Opposite points: P + (-P) = O
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0) {
    return null;
  }

  let lambda;

  if (P.x === Q.x && P.y === Q.y) {

    // Point doubling: P + P
    const numerator = 3 * P.x * P.x;
    const denominator = 2 * P.y;

    lambda = mod(
      numerator * modInverse(denominator, p),
      p
    );

  } else {

    // Addition of two distinct points
    const numerator = Q.y - P.y;
    const denominator = Q.x - P.x;

    lambda = mod(
      numerator * modInverse(denominator, p),
      p
    );
  }

  // Coordinates of the resulting point
  const x3 = mod(lambda * lambda - P.x - Q.x, p);
  const y3 = mod(lambda * (P.x - x3) - P.y, p);

  return { x: x3, y: y3 };
}

// 5. Scalar multiplication
function scalarMultiply(k, G) {
  let result = null;

  for (let i = 0; i < k; i++) {
    result = pointAdd(result, G);

    console.log(`${i + 1}G =`, result);
  }

  return result;
}


// 6. Interactive public key generator
const generateBtn = document.getElementById("generateBtn");

generateBtn.addEventListener("click", () => {

  const input = document.getElementById("privateKey");
  const k = Number(input.value);

  const resultDiv = document.getElementById("result");
  const stepsDiv = document.getElementById("steps");

  resultDiv.textContent = "";
  stepsDiv.innerHTML = "";

  // Validate the private key
  if (
    input.value.trim() === "" ||
    !Number.isInteger(k) ||
    k < 1 ||
    k > 1000
  ) {
    resultDiv.textContent =
      "Please enter an integer between 1 and 1000.";
    return;
  }

  // Compute all intermediate points
  let currentPoint = null;

  for (let i = 1; i <= k; i++) {

    currentPoint = pointAdd(currentPoint, G);

    const step = document.createElement("p");

    step.textContent = currentPoint === null
      ? `${i}G = O (Point at Infinity)`
      : `${i}G = (${currentPoint.x}, ${currentPoint.y})`;

    stepsDiv.appendChild(step);
  }

  // Display the final public key
  resultDiv.textContent = currentPoint === null
    ? "Toy Public Key: O (Point at Infinity)"
    : `Toy Public Key: (${currentPoint.x}, ${currentPoint.y})`;

});



// 7. Animated elliptic curve visualization

const canvas = document.getElementById("curveCanvas");
const ctx = canvas.getContext("2d");
const animateBtn = document.getElementById("animateBtn");
const animationStatus = document.getElementById("animationStatus");

const margin = 45;
const scale = (canvas.width - 2 * margin) / 16;
let animationTimer = null;

// Convert mathematical coordinates to canvas coordinates
function canvasPosition(P) {
  return {
    x: margin + P.x * scale,
    y: canvas.height - margin - P.y * scale
  };
}

// Draw all valid finite points of the curve
function drawCurve(highlight = null) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 16; i++) {
    const pos = margin + i * scale;

    ctx.beginPath();
    ctx.moveTo(pos, margin);
    ctx.lineTo(pos, canvas.height - margin);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margin, pos);
    ctx.lineTo(canvas.width - margin, pos);
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = "11px Arial";
    ctx.fillText(i, pos - 4, canvas.height - 18);
    ctx.fillText(i, 15, canvas.height - pos + 4);
  }

  // Find and draw all points satisfying the equation
  for (let x = 0; x < p; x++) {
    for (let y = 0; y < p; y++) {
      if (mod(y * y - x * x * x - 7, p) === 0) {
        const pos = canvasPosition({ x, y });

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#2563eb";
        ctx.fill();
      }
    }
  }

  // Highlight the current point
  if (highlight !== null) {
    const pos = canvasPosition(highlight);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 9, 0, 2 * Math.PI);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 14px Arial";
    ctx.fillText(
      `(${highlight.x}, ${highlight.y})`,
      pos.x + 12,
      pos.y - 12
    );
  }
}

// Start animation
animateBtn.addEventListener("click", () => {
  clearInterval(animationTimer);

  const input = document.getElementById("privateKey");
  const k = Number(input.value);

  if (
    input.value.trim() === "" ||
    !Number.isInteger(k) ||
    k < 1 ||
    k > 1000
  ) {
    animationStatus.textContent =
      "Enter an integer between 1 and 1000.";
    return;
  }

  let current = null;
  let step = 0;

  animateBtn.disabled = true;
  drawCurve();

  animationStatus.textContent = "Starting animation...";

  animationTimer = setInterval(() => {
    current = pointAdd(current, G);
    step++;

    drawCurve(current);

    animationStatus.textContent = current === null
      ? `${step}G = O (Point at Infinity)`
      : `${step}G = (${current.x}, ${current.y})`;

    if (step >= k) {
      clearInterval(animationTimer);
      animationTimer = null;
      animateBtn.disabled = false;
      animationStatus.textContent += " — Completed!";
    }
  }, 700);
});

// Initial curve rendering
drawCurve();



 
// 8. Statistical exploration: coordinate frequencies

const statisticsBtn =
  document.getElementById("statisticsBtn");


// Chart.js instances
const histogramCharts = {};

function drawHistogram(canvasId, frequencies, title) {

  // Destroy the previous chart before drawing a new one
  if (histogramCharts[canvasId]) {
    histogramCharts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);

  histogramCharts[canvasId] = new Chart(canvas, {
    type: "bar",

    data: {
      labels: Array.from(
        { length: 17 },
        (_, i) => i.toString()
      ),

      datasets: [{
        label: "Frequency",
        data: frequencies,
        backgroundColor: "#2563eb",
        hoverBackgroundColor: "#f59e0b",
        borderRadius: 4
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 700
      },

      plugins: {
        title: {
          display: true,
          text: title
        },

        tooltip: {
          enabled: true,
          callbacks: {
            title: (items) =>
              `Coordinate: ${items[0].label}`,

            label: (item) =>
              `Frequency: ${item.raw}`
          }
        },

        legend: {
          display: false
        }
      },

      scales: {
        x: {
          title: {
            display: true,
            text: "Coordinate value"
          }
        },

        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          },
          title: {
            display: true,
            text: "Frequency"
          }
        }
      }
    }
  });
}


// Run the statistical experiment
statisticsBtn.addEventListener("click", () => {

  const input = document.getElementById("sampleSize");
  const N = Number(input.value);

  const results =
    document.getElementById("statisticsResults");

  if (
    input.value.trim() === "" ||
    !Number.isInteger(N) ||
    N < 1 ||
    N > 10000
  ) {
    results.textContent =
      "Enter an integer between 1 and 10000.";
    return;
  }

  const xFrequencies = Array(17).fill(0);
  const yFrequencies = Array(17).fill(0);

  let point = null;
  let infinityCount = 0;

  for (let k = 1; k <= N; k++) {

    point = pointAdd(point, G);

    // The point at infinity has no coordinates
    if (point === null) {
      infinityCount++;
      continue;
    }

    xFrequencies[point.x]++;
    yFrequencies[point.y]++;
  }

  const finiteCount = N - infinityCount;

  results.textContent =
    `Keys tested: ${N} | ` +
    `Finite points: ${finiteCount} | ` +
    `Points at infinity: ${infinityCount}`;

  drawHistogram(
    "xChart",
    xFrequencies,
    "X Coordinate Frequencies"
  );

  drawHistogram(
    "yChart",
    yFrequencies,
    "Y Coordinate Frequencies"
  );
});
