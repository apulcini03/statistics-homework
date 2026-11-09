# Statistics for Cybersecurity

Interactive homework assignments for the  
Statistics for Cybersecurity course.

Academic Year 2026/2027

## Website

https://apulcini03.github.io/statistics-homework/

## Homework 1.1 — Elliptic Curve Cryptography

Private Key to Public Key generation using  
elliptic-curve scalar multiplication.

Toy curve: y² = x³ + 7 (mod 17)

Base point: G = (1, 5)

### Features

- Interactive public key generator
- Step-by-step scalar multiplication
- Animated elliptic curve visualization
- Coordinate frequency distributions
- Uniformity and periodicity analysis
- Binary digit distribution
- Input-output correlation analysis
- Avalanche-like behaviour experiment

[Open Homework 1.1](https://apulcini03.github.io/statistics-homework/homework-01/)

## Homework 1.2 — Ethereum Wallet Pipeline

Explore the cryptographic pipeline from  
a BIP-39 mnemonic to a checksummed Ethereum address.

### Features

- BIP-39 mnemonic-to-seed derivation
- BIP-32 and BIP-44 hierarchical key derivation
- secp256k1 public-key generation
- Ethereum address derivation with Keccak-256
- EIP-55 checksum encoding
- Multiple HD wallet address derivation
- Statistical analysis of address bits
- Hamming distance analysis
- Keccak-256, SHA3-256 and SHA-512 comparison
- Keccak-256 avalanche effect experiment
- Theoretical background and historical timeline

[Open Homework 1.2](https://apulcini03.github.io/statistics-homework/homework-02/)

## Homework 2 — ECC vs Caesar Cipher & Cryptanalysis

Compare an ECC-based hybrid encryption scheme with the classical Caesar cipher, focusing on encryption, decryption, key spaces and cryptanalytic attacks.

The ECC experiment uses the secp256k1 elliptic curve with an intentionally restricted private-key space.

### Features

- ECC encryption and decryption using ECDH, HKDF-SHA256 and AES-256-GCM
- Caesar cipher encryption and decryption
- Comparison of cryptographic procedures and key spaces
- Statistical cryptanalysis using English letter frequencies
- Automatic Caesar key recovery using chi-squared scoring
- Analysis of key-recovery effectiveness across different ciphertext lengths
- Exhaustive private-key search against restricted ECC keys
- Decryption using the recovered ECC private key
- Comparison of statistical and exhaustive attacks
- Discussion of cryptographic security limitations

[Open Homework 2](https://apulcini03.github.io/statistics-homework/homework-03/)

## Homework 3 — Stochastic Penetration Processes

Model the penetration process of multiple attackers across a sequence of systems using stochastic processes with independent and identically distributed increments.

Study the behavior of total, average and normalized penetration scores through Bernoulli and Rademacher models.

### Features

- Interactive Bernoulli and Rademacher simulations
- Configurable number of systems, attackers and success probability
- Visualization of cumulative attacker trajectories
- Total, average and normalized score distributions
- Law of Large Numbers and convergence in probability
- Empirical comparison with Chebyshev's inequality
- Central Limit Theorem and standard normal approximation
- Empirical and theoretical variance scaling analysis
- Experiments with increasing system sizes and attacker populations
- Aggregate penetration-score analysis and statistical interpretation

[Open Homework 3](https://apulcini03.github.io/statistics-homework/homework-04/)

## Homework 4 — Welford & Sampling Statistics

Derive and implement Welford's recurrence formulas
for the running mean, sum of squared deviations
and unbiased sample variance.

Apply the algorithm to stochastic penetration
scores and investigate the sampling distributions
of mean and variance estimators.

### Features

- Mathematical derivation of Welford's recurrences
- Three-line core implementation
- Interactive step-by-step algorithm demonstration
- Verification against direct computation
- Discrete uniform penetration scores from 0 to 10
- Simulation of multiple hackers and systems
- Online calculation of sample means and variances
- Sampling distributions of the two estimators
- Empirical comparison with population parameters
- Analysis of estimator variability for increasing n
- Comparison with theoretical sampling variability
- Interpretation for inferential statistics

[Open Homework 4](https://apulcini03.github.io/statistics-homework/homework-05/)



## Homework 5 — Riemann, Lebesgue & Normal CDF

Explore two practical exercises: approximate definite integrals using domain and value-range partitions, and compute the standard normal CDF numerically.

### Features

- Left, right and midpoint Riemann sums
- Lebesgue-inspired lower, upper and mid-level approximations with estimated preimage measures
- Seven functions, including explicit numerical treatment of the improper integral of 1/sqrt(x)
- Accuracy, convergence and computational-cost comparisons
- Constructed rational and irrational sampling for Dirichlet's function
- Exact fraction reduction and denominator-based visualization for Thomae's function
- Composite trapezoidal and Simpson rules, and the error-function power series
- Separate comparisons with NIST and independent erfc reference values
- Repeated benchmarks with warm-up, median, minimum and maximum times
- Tail accuracy, survival probabilities and floating-point limitations

[Open Homework 5](https://apulcini03.github.io/statistics-homework/homework-06/)

## Project Structure

```text
statistics-homework/
├── homework-01/    # HW 1.1 — Elliptic Curve Cryptography
├── homework-02/    # HW 1.2 — Ethereum Wallet Pipeline
├── homework-03/    # HW 2 — ECC vs Caesar Cipher & Cryptanalysis
├── homework-04/    # HW 3 — Stochastic Penetration Processes
├── homework-05/    # HW 4 — Welford & Sampling Statistics
├── homework-06/    # HW 5 — Riemann, Lebesgue & Normal CDF
├── css/            # Shared styles
├── js/             # Homepage scripts
├── index.html      # Homepage
└── README.md       # Project documentation
```


