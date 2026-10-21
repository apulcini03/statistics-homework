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
