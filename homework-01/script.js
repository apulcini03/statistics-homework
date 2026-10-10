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

// 6. Execute the experiment
const publicKey = scalarMultiply(privateKey, G);

console.log("Private Key:", privateKey);
console.log("Toy Public Key:", publicKey);
