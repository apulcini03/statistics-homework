// HW 2 - Toy ECC Hybrid Encryption
// secp256k1 + ECDH + HKDF-SHA256 + AES-256-GCM

const ECC_MAX_PRIVATE_KEY = 1000;
const ECC_INFO = new TextEncoder().encode(
  "Statistics HW2 Toy ECC Encryption v1"
);

let eccRecipient = null;
let eccEncryptedPackage = null;

// Convert an ArrayBuffer or Uint8Array to hex
function eccToHex(data) {
  return Array.from(new Uint8Array(data))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Derive AES-256 key from an ECDH shared secret
async function eccDeriveAesKey(sharedSecret, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    ethers.getBytes(sharedSecret),
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: ECC_INFO
    },
    material,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

// Validate and construct recipient ECC key pair
function eccGenerateRecipient() {
  const input = document.getElementById("eccPrivateKey");
  const raw = input.value.trim();
  const d = Number(raw);

  if (
    raw === "" ||
    !Number.isInteger(d) ||
    d < 1 ||
    d > ECC_MAX_PRIVATE_KEY
  ) {
    throw new Error(
      "Private key must be an integer between 1 and 1000."
    );
  }

  const privateKey = ethers.toBeHex(BigInt(d), 32);

  const publicKey = ethers.SigningKey.computePublicKey(
    privateKey,
    false
  );

  return { d, privateKey, publicKey };
}

document.addEventListener("DOMContentLoaded", () => {

  const keysButton = document.getElementById(
    "eccGenerateKeysBtn"
  );

  const encryptButton = document.getElementById(
    "eccEncryptBtn"
  );

  const decryptButton = document.getElementById(
    "eccDecryptBtn"
  );

  const keysResult = document.getElementById(
    "eccKeysResult"
  );

  const encryptResult = document.getElementById(
    "eccEncryptionResult"
  );

  const decryptResult = document.getElementById(
    "eccDecryptionResult"
  );

  // STEP 1 - Generate recipient keys
  keysButton.addEventListener("click", () => {
    try {
      eccRecipient = eccGenerateRecipient();

      // Old ciphertext should not survive a new key pair
      eccEncryptedPackage = null;
      encryptResult.textContent = "";
      decryptResult.textContent = "";

      keysResult.textContent =
        `Private scalar d: ${eccRecipient.d}\n\n` +
        `Private key (hex):\n` +
        `${eccRecipient.privateKey}\n\n` +
        `Public key Q = dG (uncompressed):\n` +
        `${eccRecipient.publicKey}`;

    } catch (error) {
      eccRecipient = null;
      eccEncryptedPackage = null;
      keysResult.textContent = error.message;
      encryptResult.textContent = "";
      decryptResult.textContent = "";
    }
  });

  // STEP 2 - Encrypt message
  encryptButton.addEventListener("click", async () => {
    encryptButton.disabled = true;

    try {
      if (!eccRecipient) {
        throw new Error(
          "Generate recipient keys before encryption."
        );
      }

      const message = document.getElementById(
        "eccMessage"
      ).value;

      if (!message.length) {
        throw new Error("Enter a message to encrypt.");
      }

      // Generate a fresh random sender ephemeral key
      const ephemeralPrivateKey =
        ethers.Wallet.createRandom().privateKey;

      const ephemeralPublicKey =
        ethers.SigningKey.computePublicKey(
          ephemeralPrivateKey,
          false
        );

      // ECDH: rQ = dR
      const senderKey = new ethers.SigningKey(
        ephemeralPrivateKey
      );

      const sharedSecret =
        senderKey.computeSharedSecret(
          eccRecipient.publicKey
        );

      // Random HKDF salt and AES-GCM nonce
      const salt = crypto.getRandomValues(
        new Uint8Array(16)
      );

      const iv = crypto.getRandomValues(
        new Uint8Array(12)
      );

      const aesKey = await eccDeriveAesKey(
        sharedSecret,
        salt
      );

      const plaintextBytes =
        new TextEncoder().encode(message);

      const ciphertextBuffer =
        await crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv: iv
          },
          aesKey,
          plaintextBytes
        );

      eccEncryptedPackage = {
        recipientPublicKey: eccRecipient.publicKey,
        ephemeralPublicKey,
        salt,
        iv,
        ciphertext: new Uint8Array(
          ciphertextBuffer
        )
      };

      encryptResult.textContent =
        `Plaintext: ${message}\n\n` +
        `Ephemeral public key:\n` +
        `${ephemeralPublicKey}\n\n` +
        `HKDF salt:\n0x${eccToHex(salt)}\n\n` +
        `AES-GCM IV:\n0x${eccToHex(iv)}\n\n` +
        `Ciphertext + authentication tag:\n` +
        `0x${eccToHex(ciphertextBuffer)}\n\n` +
        `Encryption successful.`;

      decryptResult.textContent = "";

    } catch (error) {
      eccEncryptedPackage = null;
      encryptResult.textContent = error.message;
      decryptResult.textContent = "";
      console.error(error);

    } finally {
      encryptButton.disabled = false;
    }
  });

  // STEP 3 - Decrypt message
  decryptButton.addEventListener("click", async () => {
    decryptButton.disabled = true;

    try {
      if (!eccRecipient || !eccEncryptedPackage) {
        throw new Error(
          "Generate keys and encrypt a message first."
        );
      }

      // ECDH from recipient side: dR
      const recipientKey = new ethers.SigningKey(
        eccRecipient.privateKey
      );

      const sharedSecret =
        recipientKey.computeSharedSecret(
          eccEncryptedPackage.ephemeralPublicKey
        );

      const aesKey = await eccDeriveAesKey(
        sharedSecret,
        eccEncryptedPackage.salt
      );

      const decryptedBuffer =
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: eccEncryptedPackage.iv
          },
          aesKey,
          eccEncryptedPackage.ciphertext
        );

      const recoveredMessage =
        new TextDecoder().decode(decryptedBuffer);

      decryptResult.textContent =
        `Decryption successful!\n\n` +
        `Recovered plaintext:\n${recoveredMessage}`;

    } catch (error) {
      decryptResult.textContent =
        "Decryption failed: " + error.message;
      console.error(error);

    } finally {
      decryptButton.disabled = false;
    }
  });

});



// HW 2 - Caesar Cipher Encryption and Decryption

let caesarEncryptedMessage = null;
let caesarEncryptionKey = null;

// Encrypt or decrypt using an integer shift
function caesarShift(text, shift) {
  const normalizedShift = ((shift % 26) + 26) % 26;

  return Array.from(text, char => {
    const code = char.charCodeAt(0);

    // Uppercase letters A-Z
    if (code >= 65 && code <= 90) {
      return String.fromCharCode(
        65 + ((code - 65 + normalizedShift) % 26)
      );
    }

    // Lowercase letters a-z
    if (code >= 97 && code <= 122) {
      return String.fromCharCode(
        97 + ((code - 97 + normalizedShift) % 26)
      );
    }

    // Preserve spaces, digits and punctuation
    return char;
  }).join("");
}

function getCaesarKey() {
  const input = document.getElementById("caesarKey");
  const raw = input.value.trim();
  const key = Number(raw);

  if (
    raw === "" ||
    !Number.isInteger(key) ||
    key < 0 ||
    key > 25
  ) {
    throw new Error(
      "Enter an integer shift between 0 and 25."
    );
  }

  return key;
}

document.addEventListener("DOMContentLoaded", () => {
  const messageInput =
    document.getElementById("caesarMessage");

  const encryptButton =
    document.getElementById("caesarEncryptBtn");

  const decryptButton =
    document.getElementById("caesarDecryptBtn");

  const encryptResult =
    document.getElementById("caesarEncryptResult");

  const decryptResult =
    document.getElementById("caesarDecryptResult");

  encryptButton.addEventListener("click", () => {
    try {
      const plaintext = messageInput.value;
      const key = getCaesarKey();

      if (!plaintext.length) {
        throw new Error("Enter a message to encrypt.");
      }

      const ciphertext = caesarShift(plaintext, key);

      caesarEncryptedMessage = ciphertext;
      caesarEncryptionKey = key;

      encryptResult.textContent =
        `Original plaintext:\n${plaintext}\n\n` +
        `Encryption key: ${key}\n\n` +
        `Ciphertext:\n${ciphertext}`;

      decryptResult.textContent = "";

    } catch (error) {
      caesarEncryptedMessage = null;
      caesarEncryptionKey = null;
      encryptResult.textContent = error.message;
      decryptResult.textContent = "";
    }
  });

  decryptButton.addEventListener("click", () => {
    if (
      caesarEncryptedMessage === null ||
      caesarEncryptionKey === null
    ) {
      decryptResult.textContent =
        "Encrypt a message first.";
      return;
    }

    const recoveredPlaintext = caesarShift(
      caesarEncryptedMessage,
      -caesarEncryptionKey
    );

    decryptResult.textContent =
      `Ciphertext:\n${caesarEncryptedMessage}\n\n` +
      `Decryption key: ${caesarEncryptionKey}\n\n` +
      `Recovered plaintext:\n${recoveredPlaintext}`;
  });
});




// HW 2 - Statistical Cryptanalysis of the Caesar Cipher

// Approximate English letter frequencies (A-Z), in percentages
const ENGLISH_FREQUENCIES = [
  8.17, 1.49, 2.78, 4.25, 12.70, 2.23, 2.02,
  6.09, 6.97, 0.15, 0.77, 4.03, 2.41, 6.75,
  7.51, 1.93, 0.10, 5.99, 6.33, 9.06, 2.76,
  0.98, 2.36, 0.15, 1.97, 0.07
];

const CAESAR_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

let caesarChiSquareChartInstance = null;
let caesarFrequencyChartInstance = null;

// Count occurrences of letters A-Z
function countEnglishLetters(text) {
  const counts = Array(26).fill(0);
  const normalized = text.toUpperCase();

  let total = 0;

  for (const char of normalized) {
    const index = CAESAR_ALPHABET.indexOf(char);

    if (index >= 0) {
      counts[index]++;
      total++;
    }
  }

  return { counts, total };
}

// Chi-squared goodness-of-fit score
function calculateCaesarChiSquare(text) {
  const { counts, total } = countEnglishLetters(text);

  if (total === 0) {
    return Infinity;
  }

  let chiSquare = 0;

  for (let i = 0; i < 26; i++) {
    const expected =
      total * ENGLISH_FREQUENCIES[i] / 100;

    const observed = counts[i];

    chiSquare +=
      ((observed - expected) ** 2) / expected;
  }

  return chiSquare;
}

// Try every Caesar key and rank candidate plaintexts
function recoverCaesarKey(ciphertext) {
  const candidates = [];

  for (let key = 0; key < 26; key++) {
    const plaintext = caesarShift(ciphertext, -key);

    candidates.push({
      key,
      plaintext,
      chiSquare: calculateCaesarChiSquare(plaintext)
    });
  }

  candidates.sort(
    (a, b) => a.chiSquare - b.chiSquare
  );

  return candidates;
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById(
    "caesarAttackCiphertext"
  );

  const button = document.getElementById(
    "analyzeCaesarBtn"
  );

  const summary = document.getElementById(
    "caesarAttackSummary"
  );

  const tableBody = document.getElementById(
    "caesarCandidatesBody"
  );

  // Reproducible demonstration with known shift k = 3.
  // This is only used to initialize the example input.
  const samplePlaintext =
    "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG. " +
    "THIS MESSAGE CONTAINS COMMON ENGLISH LETTERS " +
    "AND WORDS TO TEST STATISTICAL FREQUENCY ANALYSIS. " +
    "THE ENGLISH LANGUAGE HAS UNEQUAL LETTER " +
    "FREQUENCIES AND THIS LONGER SAMPLE HELPS " +
    "THE ATTACK.";

  input.value = caesarShift(samplePlaintext, 3);

  button.addEventListener("click", () => {
    const ciphertext = input.value;

    const { total } = countEnglishLetters(ciphertext);

    if (total < 1) {
      summary.textContent =
        "Enter a ciphertext containing English letters.";

      tableBody.replaceChildren();
      return;
    }

    const candidates = recoverCaesarKey(ciphertext);
    const best = candidates[0];

    summary.textContent =
      `Letters analyzed: ${total}\n` +
      `Keys tested: 26\n` +
      `Estimated key: ${best.key}\n` +
      `Minimum chi-squared: ${best.chiSquare.toFixed(2)}\n\n` +
      `Recovered plaintext:\n${best.plaintext}\n\n` +
      `Note: The estimated key is not guaranteed ` +
      `to be correct.`;

    // Table of all 26 ranked candidates
    tableBody.replaceChildren();

    candidates.forEach((candidate, index) => {
      const row = document.createElement("tr");

      const values = [
        index + 1,
        candidate.key,
        candidate.chiSquare.toFixed(2),
        candidate.plaintext.slice(0, 90)
      ];

      values.forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      if (index === 0) {
        row.classList.add("caesar-best-candidate");
      }

      tableBody.appendChild(row);
    });

    // Chart 1: chi-squared scores by candidate key
    const scoresByKey = [...candidates].sort(
      (a, b) => a.key - b.key
    );

    if (caesarChiSquareChartInstance) {
      caesarChiSquareChartInstance.destroy();
    }

    caesarChiSquareChartInstance = new Chart(
      document.getElementById("caesarChiSquareChart"),
      {
        type: "bar",
        data: {
          labels: scoresByKey.map(c => c.key),
          datasets: [{
            label: "Chi-squared score",
            data: scoresByKey.map(c => c.chiSquare),
            backgroundColor: scoresByKey.map(c =>
              c.key === best.key ? "#f59e0b" : "#2563eb"
            )
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: "Chi-Squared Scores for All 26 Keys"
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Candidate Caesar Key"
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Chi-Squared Score (lower is better)"
              }
            }
          }
        }
      }
    );

    // Chart 2: estimated plaintext frequencies
    const { counts } = countEnglishLetters(best.plaintext);

    const observed = counts.map(
      count => count / total * 100
    );

    if (caesarFrequencyChartInstance) {
      caesarFrequencyChartInstance.destroy();
    }

    caesarFrequencyChartInstance = new Chart(
      document.getElementById("caesarFrequencyChart"),
      {
        type: "bar",
        data: {
          labels: Array.from(CAESAR_ALPHABET),
          datasets: [
            {
              label: "Observed plaintext (%)",
              data: observed,
              backgroundColor: "#2563eb"
            },
            {
              label: "Expected English (%)",
              data: ENGLISH_FREQUENCIES,
              backgroundColor: "#f59e0b"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: "Observed vs Expected Letter Frequencies"
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Frequency (%)"
              }
            }
          }
        }
      }
    );
  });
});



// HW 2 - Caesar Cryptanalysis vs Ciphertext Length

const CAESAR_TEST_LENGTHS = [20, 50, 100, 200, 400, 800];

const CAESAR_TEST_CORPUS = `
Statistics helps us understand patterns in data
and measure uncertainty through mathematical models.
Large collections of observations often reveal
regularities that are difficult to identify
when only a small number of examples is available.

The English language contains many words with
different lengths, common combinations of letters,
and recognizable grammatical structures.
Readers can usually understand a message because
the language follows familiar conventions.

Cryptography studies methods for protecting
information during storage and communication.
Some classical encryption techniques change
the appearance of written text while preserving
important statistical relationships.

Frequency analysis takes advantage of the fact
that letters do not occur equally often in
natural languages. Certain vowels and consonants
appear much more frequently than others.

A substitution cipher transforms each symbol
according to a fixed rule. If the transformation
is consistent across the entire message, the
original frequency pattern may remain visible
after encryption.

Researchers compare observed measurements with
theoretical models to evaluate competing
explanations. More data can improve estimates,
although the quality and representativeness
of the sample remain important.

The Caesar cipher provides a useful educational
example because its encryption rule is simple
and its key space is extremely small.
Statistical methods may help recover its key
even without knowing the original message.

Different samples from the same language
can produce different frequency distributions.
Short passages may contain unusual words,
repeated letters or uncommon expressions.

A longer passage often gives a more stable
estimate of the underlying letter probabilities.
However, statistical estimates are never
guaranteed to match their theoretical values.

Security analysis requires careful experiments
and an understanding of the assumptions used
to interpret the results. A successful experiment
on one dataset does not prove that the same
method will always succeed on every dataset.
`;

// Keep only A-Z so sample lengths are exact
const CAESAR_CORPUS_LETTERS =
  CAESAR_TEST_CORPUS.toUpperCase()
    .replace(/[^A-Z]/g, "");

// Seeded pseudo-random generator.
// Used for reproducible experiments, not security.
function caesarExperimentRandom(seed) {
  let state = seed >>> 0;

  return function () {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Select a circular window of exactly N letters
function caesarCorpusSample(start, length) {
  let sample = "";

  for (let i = 0; i < length; i++) {
    const index =
      (start + i) % CAESAR_CORPUS_LETTERS.length;

    sample += CAESAR_CORPUS_LETTERS[index];
  }

  return sample;
}

let caesarLengthChartInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById(
    "caesarExperimentTrials"
  );

  const button = document.getElementById(
    "runCaesarLengthExperimentBtn"
  );

  const summary = document.getElementById(
    "caesarLengthSummary"
  );

  const tableBody = document.getElementById(
    "caesarLengthTableBody"
  );

  button.addEventListener("click", () => {
    const raw = input.value.trim();
    const trials = Number(raw);

    if (
      raw === "" ||
      !Number.isInteger(trials) ||
      trials < 10 ||
      trials > 100
    ) {
      summary.textContent =
        "Enter an integer between 10 and 100.";
      return;
    }

    button.disabled = true;
    summary.textContent =
      "Running statistical experiments...";

    try {
      // Same sequence for repeated runs
      const random = caesarExperimentRandom(2026);

      const results = [];

      for (const length of CAESAR_TEST_LENGTHS) {
        let successes = 0;

        for (let trial = 0; trial < trials; trial++) {
          // Random sample location in the corpus
          const start = Math.floor(
            random() * CAESAR_CORPUS_LETTERS.length
          );

          const plaintext = caesarCorpusSample(
            start,
            length
          );

          // Secret key, known to experiment only
          const trueKey = Math.floor(random() * 26);

          const ciphertext = caesarShift(
            plaintext,
            trueKey
          );

          // Statistical attack does not see trueKey
          const candidates = recoverCaesarKey(
            ciphertext
          );

          const estimatedKey = candidates[0].key;

          if (estimatedKey === trueKey) {
            successes++;
          }
        }

        results.push({
          length,
          trials,
          successes,
          successRate: successes / trials * 100
        });
      }

      // Overall statistics
      const totalTrials = trials * results.length;

      const totalCorrect = results.reduce(
        (sum, row) => sum + row.successes,
        0
      );

      const overallRate =
        totalCorrect / totalTrials * 100;

      summary.textContent =
        `English corpus size: ` +
        `${CAESAR_CORPUS_LETTERS.length} letters\n` +
        `Lengths tested: ${CAESAR_TEST_LENGTHS.join(", ")}\n` +
        `Trials per length: ${trials}\n` +
        `Total attacks: ${totalTrials}\n` +
        `Correctly recovered keys: ${totalCorrect}\n` +
        `Overall success rate: ${overallRate.toFixed(2)}%\n\n` +
        `Baseline random-key success: ${(100 / 26).toFixed(2)}%\n` +
        `Method: Chi-squared letter-frequency analysis`;

      // Results table
      tableBody.replaceChildren();

      results.forEach(row => {
        const tr = document.createElement("tr");

        const values = [
          row.length,
          row.trials,
          row.successes,
          `${row.successRate.toFixed(2)}%`
        ];

        values.forEach(value => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });

        tableBody.appendChild(tr);
      });

      // Remove old chart before drawing again
      if (caesarLengthChartInstance) {
        caesarLengthChartInstance.destroy();
      }

      caesarLengthChartInstance = new Chart(
        document.getElementById("caesarLengthChart"),
        {
          type: "line",
          data: {
            labels: results.map(row => row.length),
            datasets: [
              {
                label: "Observed Success Rate",
                data: results.map(
                  row => row.successRate
                ),
                borderColor: "#2563eb",
                backgroundColor: "#2563eb",
                pointRadius: 5,
                tension: 0.2
              },
              {
                label: "Random Guess Baseline (1/26)",
                data: results.map(() => 100 / 26),
                borderColor: "#f59e0b",
                borderDash: [6, 5],
                pointRadius: 0
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text:
                  "Caesar Key Recovery vs Ciphertext Length"
              },
              tooltip: {
                enabled: true
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: "Ciphertext Length (letters)"
                }
              },
              y: {
                min: 0,
                max: 100,
                title: {
                  display: true,
                  text: "Key Recovery Success Rate (%)"
                }
              }
            }
          }
        }
      );

    } catch (error) {
      summary.textContent =
        "Experiment failed. Check the console.";
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// HW 2 - Restricted ECC Private-Key Attack

let eccRecoveredPrivateKey = null;
let eccAttackedPackage = null;

document.addEventListener("DOMContentLoaded", () => {
  const attackButton = document.getElementById(
    "runEccAttackBtn"
  );

  const decryptButton = document.getElementById(
    "eccAttackDecryptBtn"
  );

  const attackResults = document.getElementById(
    "eccAttackResults"
  );

  const decryptResults = document.getElementById(
    "eccAttackDecryptionResults"
  );

  // STEP 1 - Exhaustive private-key recovery
  attackButton.addEventListener("click", async () => {
    attackButton.disabled = true;
    decryptButton.disabled = true;

    eccRecoveredPrivateKey = null;
    eccAttackedPackage = null;

    attackResults.textContent =
      "Searching the restricted ECC key space...";

    decryptResults.textContent = "";

    try {
      if (!eccEncryptedPackage) {
        throw new Error(
          "First generate ECC keys and encrypt " +
          "a message in Part 1."
        );
      }

      // Copy only public information from
      // the encryption package.
      const targetPublicKey =
        eccEncryptedPackage.recipientPublicKey;

      const targetPackage = {
        recipientPublicKey: targetPublicKey,
        ephemeralPublicKey:
          eccEncryptedPackage.ephemeralPublicKey,
        salt: new Uint8Array(eccEncryptedPackage.salt),
        iv: new Uint8Array(eccEncryptedPackage.iv),
        ciphertext:
          new Uint8Array(eccEncryptedPackage.ciphertext)
      };

      const startTime = performance.now();

      let recoveredScalar = null;
      let recoveredPrivateKey = null;
      let attempts = 0;

      // The attack NEVER reads eccRecipient.privateKey
      // or eccRecipient.d.
      // It uses only the known public key.

      for (let candidate = 1; candidate <= 1000; candidate++) {
        const privateKey = ethers.toBeHex(
          BigInt(candidate),
          32
        );

        const candidatePublicKey =
          ethers.SigningKey.computePublicKey(
            privateKey,
            false
          );

        attempts++;

        if (
          candidatePublicKey.toLowerCase() ===
          targetPublicKey.toLowerCase()
        ) {
          recoveredScalar = candidate;
          recoveredPrivateKey = privateKey;
          break;
        }

        // Yield periodically to keep the UI responsive.
        if (candidate % 25 === 0) {
          await new Promise(resolve =>
            setTimeout(resolve, 0)
          );
        }
      }

      const elapsedMs = performance.now() - startTime;

      if (recoveredPrivateKey === null) {
        throw new Error(
          "No matching private key was found " +
          "in the interval 1–1000."
        );
      }

      eccRecoveredPrivateKey = recoveredPrivateKey;
      eccAttackedPackage = targetPackage;

      attackResults.textContent =
        `Attack successful!\n\n` +
        `Target public key:\n${targetPublicKey}\n\n` +
        `Search interval: 1–1000\n` +
        `Candidates tested: ${attempts}\n` +
        `Recovered private scalar: ${recoveredScalar}\n\n` +
        `Recovered private key (hex):\n` +
        `${recoveredPrivateKey}\n\n` +
        `Elapsed time: ${elapsedMs.toFixed(2)} ms\n\n` +
        `The public key was sufficient to identify ` +
        `the private key within the restricted range.`;

      decryptButton.disabled = false;

    } catch (error) {
      attackResults.textContent =
        "Attack failed: " + error.message;
      console.error(error);

    } finally {
      attackButton.disabled = false;
    }
  });

  // STEP 2 - Decrypt using recovered private key
  decryptButton.addEventListener("click", async () => {
    decryptButton.disabled = true;

    try {
      if (
        !eccRecoveredPrivateKey ||
        !eccAttackedPackage
      ) {
        throw new Error(
          "Recover the private key before decryption."
        );
      }

      const recoveredSigningKey =
        new ethers.SigningKey(eccRecoveredPrivateKey);

      // Compute ECDH from recovered secret and
      // the sender's PUBLIC ephemeral key.
      const sharedSecret =
        recoveredSigningKey.computeSharedSecret(
          eccAttackedPackage.ephemeralPublicKey
        );

      const aesKey = await eccDeriveAesKey(
        sharedSecret,
        eccAttackedPackage.salt
      );

      const decryptedBuffer =
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: eccAttackedPackage.iv
          },
          aesKey,
          eccAttackedPackage.ciphertext
        );

      const plaintext =
        new TextDecoder().decode(decryptedBuffer);

      decryptResults.textContent =
        `Attack decryption successful!\n\n` +
        `Recovered plaintext:\n${plaintext}\n\n` +
        `Recovered private key:\n` +
        `${eccRecoveredPrivateKey}\n\n` +
        `The message was decrypted without reading ` +
        `the original recipient private key.`;

    } catch (error) {
      decryptResults.textContent =
        "Attack decryption failed: " + error.message;
      console.error(error);

    } finally {
      decryptButton.disabled =
        !eccRecoveredPrivateKey;
    }
  });
});
