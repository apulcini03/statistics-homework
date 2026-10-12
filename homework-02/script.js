"use strict";

// Homework 02 - Ethereum Wallet Pipeline
// BIP-39 mnemonic to seed derivation

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon " +
  "abandon abandon abandon abandon abandon " +
  "abandon about";

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function mnemonicToSeed(mnemonic, passphrase = "") {
  // BIP-39 uses Unicode NFKD normalization
  const normalizedMnemonic = mnemonic.normalize("NFKD");
  const normalizedPassphrase = passphrase.normalize("NFKD");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizedMnemonic),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const seed = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode("mnemonic" + normalizedPassphrase),
      iterations: 2048,
      hash: "SHA-512"
    },
    keyMaterial,
    512
  );

  return toHex(seed);
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("generateSeedBtn");
  const result = document.getElementById("seedResult");

  button.addEventListener("click", async () => {
    button.disabled = true;
    result.textContent = "Generating seed...";

    try {
      const seed = await mnemonicToSeed(TEST_MNEMONIC);

      result.textContent =
        `BIP-39 Seed (512 bits):\n${seed}`;

      console.log("BIP-39 seed generated successfully");
    } catch (error) {
      result.textContent = "Seed generation failed.";
      console.error(error);
    } finally {
      button.disabled = false;
    }
  });
});


// Step 2 - BIP-32 / BIP-44 private key derivation

const DERIVATION_PATH = "m/44'/60'/0'/0/0";

document.addEventListener("DOMContentLoaded", () => {

  const deriveBtn =
    document.getElementById("deriveKeyBtn");

  const result =
    document.getElementById("privateKeyResult");

  deriveBtn.addEventListener("click", async () => {

    deriveBtn.disabled = true;
    result.textContent = "Deriving private key...";

    try {
      // Generate the same deterministic BIP-39 seed
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);

      // Convert the hexadecimal seed into bytes
      const seedBytes = ethers.getBytes("0x" + seedHex);

      // Generate the BIP-32 master node
      const masterNode =
        ethers.HDNodeWallet.fromSeed(seedBytes);

      // Derive the child key using the BIP-44 path
      const derivedWallet =
        masterNode.derivePath(DERIVATION_PATH);

      result.textContent =
        `Derivation Path: ${DERIVATION_PATH}\n` +
        `Private Key (256 bits):\n` +
        derivedWallet.privateKey;

    } catch (error) {
      result.textContent =
        "Private key derivation failed. Check the console.";
      console.error(error);

    } finally {
      deriveBtn.disabled = false;
    }
  });
});


// Step 3 - secp256k1 public key generation

document.addEventListener("DOMContentLoaded", () => {

  const publicKeyBtn =
    document.getElementById("generatePublicKeyBtn");

  const result =
    document.getElementById("publicKeyResult");

  publicKeyBtn.addEventListener("click", async () => {

    publicKeyBtn.disabled = true;
    result.textContent = "Generating public key...";

    try {
      // Recreate the deterministic test seed
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);
      const seedBytes = ethers.getBytes("0x" + seedHex);

      // Derive the private key
      const masterNode =
        ethers.HDNodeWallet.fromSeed(seedBytes);

      const derivedWallet =
        masterNode.derivePath(DERIVATION_PATH);

      // Compute the uncompressed secp256k1 public key
      const publicKey = ethers.SigningKey.computePublicKey(
        derivedWallet.privateKey,
        false
      );

      result.textContent =
        `Uncompressed Public Key (65 bytes):\n` +
        `${publicKey}`;

    } catch (error) {
      result.textContent = "Public key generation failed.";
      console.error(error);

    } finally {
      publicKeyBtn.disabled = false;
    }
  });
});



// Step 4 - Keccak-256 Ethereum address derivation

document.addEventListener("DOMContentLoaded", () => {

  const addressBtn =
    document.getElementById("generateAddressBtn");

  const result =
    document.getElementById("addressResult");

  addressBtn.addEventListener("click", async () => {

    addressBtn.disabled = true;
    result.textContent = "Generating Ethereum address...";

    try {
      // Derive the same deterministic test private key
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);
      const seedBytes = ethers.getBytes("0x" + seedHex);

      const masterNode =
        ethers.HDNodeWallet.fromSeed(seedBytes);

      const wallet =
        masterNode.derivePath(DERIVATION_PATH);

      // Generate the 65-byte uncompressed public key
      const publicKey = ethers.SigningKey.computePublicKey(
        wallet.privateKey,
        false
      );

      // Remove the first byte (04 prefix).
      // Hash only the 64 bytes of X and Y coordinates.
      const coordinates = "0x" + publicKey.slice(4);

      const hash = ethers.keccak256(coordinates);

      // Last 20 bytes = last 40 hexadecimal digits
      const address = "0x" + hash.slice(-40);

      // Independent consistency check
      const expected = ethers.computeAddress(
        wallet.privateKey
      );

      if (address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error("Address verification failed");
      }

      result.textContent =
        `Keccak-256 Hash (32 bytes):\n${hash}\n\n` +
        `Ethereum Address (20 bytes):\n${address}`;

    } catch (error) {
      result.textContent =
        "Ethereum address generation failed.";
      console.error(error);

    } finally {
      addressBtn.disabled = false;
    }
  });
});



// Step 5 - EIP-55 checksum encoding

document.addEventListener("DOMContentLoaded", () => {

  const checksumBtn =
    document.getElementById("checksumBtn");

  const result =
    document.getElementById("checksumResult");

  checksumBtn.addEventListener("click", async () => {

    checksumBtn.disabled = true;
    result.textContent = "Generating checksum...";

    try {
      // Derive the wallet from the public test mnemonic
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);
      const seedBytes = ethers.getBytes("0x" + seedHex);

      const masterNode =
        ethers.HDNodeWallet.fromSeed(seedBytes);

      const wallet =
        masterNode.derivePath(DERIVATION_PATH);

      // Derive the Ethereum address
      const publicKey = ethers.SigningKey.computePublicKey(
        wallet.privateKey,
        false
      );

      const coordinates = "0x" + publicKey.slice(4);
      const hash = ethers.keccak256(coordinates);

      const address = "0x" + hash.slice(-40);

      // Apply EIP-55 checksum encoding
      const checksummedAddress = ethers.getAddress(address);

      // Verify that the underlying address is unchanged
      if (checksummedAddress.toLowerCase() !== address) {
        throw new Error("Checksum verification failed");
      }

      result.textContent =
        `Original Address:\n${address}\n\n` +
        `EIP-55 Checksummed Address:\n` +
        `${checksummedAddress}\n\n` +
        `Checksum Validation: PASSED`;

    } catch (error) {
      result.textContent =
        "Checksum generation failed.";
      console.error(error);

    } finally {
      checksumBtn.disabled = false;
    }
  });
});



// Step 6 - Multiple HD wallet address derivation

document.addEventListener("DOMContentLoaded", () => {
  const button =
    document.getElementById("deriveAccountsBtn");

  const input =
    document.getElementById("accountCount");

  const summary =
    document.getElementById("accountsSummary");

  const tableBody =
    document.getElementById("accountsTableBody");

  button.addEventListener("click", async () => {
    const count = Number(input.value);

    if (
      input.value.trim() === "" ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 10
    ) {
      summary.textContent =
        "Please enter an integer between 1 and 10.";
      tableBody.replaceChildren();
      return;
    }

    button.disabled = true;
    summary.textContent = "Deriving addresses...";
    tableBody.replaceChildren();

    try {
      // Derive one seed and one BIP-32 master node
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);

      const master = ethers.HDNodeWallet.fromSeed(
        ethers.getBytes("0x" + seedHex)
      );

      const addresses = new Set();

      for (let i = 0; i < count; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = master.derivePath(path);

        addresses.add(wallet.address.toLowerCase());

        const row = document.createElement("tr");

        for (const value of [
          i,
          path,
          wallet.address
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        }

        tableBody.appendChild(row);
      }

      summary.textContent =
        `Seed: unchanged | ` +
        `Addresses derived: ${count} | ` +
        `Unique addresses: ${addresses.size}`;

    } catch (error) {
      summary.textContent =
        "Address derivation failed.";
      tableBody.replaceChildren();
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// Step 7 - Ethereum address statistical exploration

let walletBitChartInstance = null;
let walletHammingChartInstance = null;

// Number of 1 bits in a hexadecimal string
function countOneBits(hex) {
  const digits = hex.replace(/^0x/i, "");
  let ones = 0;

  for (const digit of digits) {
    const value = parseInt(digit, 16);

    if (Number.isNaN(value)) {
      throw new Error("Invalid hexadecimal value");
    }

    for (let bit = 0; bit < 4; bit++) {
      ones += (value >> bit) & 1;
    }
  }

  return ones;
}

// Hamming distance between two Ethereum addresses
function addressHammingDistance(a, b) {
  const hexA = a.slice(2).toLowerCase();
  const hexB = b.slice(2).toLowerCase();

  if (hexA.length !== 40 || hexB.length !== 40) {
    throw new Error("Expected 160-bit addresses");
  }

  let distance = 0;

  for (let i = 0; i < 40; i++) {
    const difference =
      parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);

    distance += countOneBits(
      difference.toString(16)
    );
  }

  return distance;
}

document.addEventListener("DOMContentLoaded", () => {

  const button =
    document.getElementById("runWalletStatsBtn");

  const input =
    document.getElementById("statsAccountCount");

  const results =
    document.getElementById("walletStatsResults");

  button.addEventListener("click", async () => {
    const N = Number(input.value);

    if (
      input.value.trim() === "" ||
      !Number.isInteger(N) ||
      N < 2 ||
      N > 100
    ) {
      results.textContent =
        "Please enter an integer between 2 and 100.";
      return;
    }

    button.disabled = true;
    results.textContent = "Running statistical analysis...";

    try {
      const seedHex = await mnemonicToSeed(TEST_MNEMONIC);

      const master = ethers.HDNodeWallet.fromSeed(
        ethers.getBytes("0x" + seedHex)
      );

      const addresses = [];

      for (let i = 0; i < N; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        addresses.push(
          master.derivePath(path).address
        );
      }

      // Bit frequency analysis
      const totalBits = N * 160;

      const ones = addresses.reduce(
        (sum, address) => sum + countOneBits(address),
        0
      );

      const zeros = totalBits - ones;

      // Hamming distances between consecutive addresses
      const distances = [];

      for (let i = 1; i < N; i++) {
        distances.push(
          addressHammingDistance(
            addresses[i - 1],
            addresses[i]
          )
        );
      }

      const mean = distances.reduce(
        (sum, value) => sum + value, 0
      ) / distances.length;

      const min = Math.min(...distances);
      const max = Math.max(...distances);

      results.textContent =
        `Addresses analyzed: ${N}\n` +
        `Total bits: ${totalBits}\n` +
        `Bit 0: ${zeros}\n` +
        `Bit 1: ${ones}\n` +
        `Bit 1 percentage: ${(ones / totalBits * 100).toFixed(2)}%\n` +
        `Consecutive comparisons: ${distances.length}\n` +
        `Mean Hamming distance: ${mean.toFixed(2)} / 160\n` +
        `Minimum Hamming distance: ${min}\n` +
        `Maximum Hamming distance: ${max}`;

      // Remove previous charts before recreating them
      if (walletBitChartInstance) {
        walletBitChartInstance.destroy();
      }

      if (walletHammingChartInstance) {
        walletHammingChartInstance.destroy();
      }

      // Chart 1: bit frequencies
      walletBitChartInstance = new Chart(
        document.getElementById("walletBitChart"),
        {
          type: "bar",
          data: {
            labels: ["Bit 0", "Bit 1"],
            datasets: [{
              label: "Frequency",
              data: [zeros, ones],
              backgroundColor: ["#2563eb", "#f59e0b"],
              hoverBackgroundColor: ["#1d4ed8", "#d97706"]
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: true },
              title: {
                display: true,
                text: "Address Bit Frequencies"
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { precision: 0 }
              }
            }
          }
        }
      );

      // Chart 2: consecutive Hamming distances
      walletHammingChartInstance = new Chart(
        document.getElementById("walletHammingChart"),
        {
          type: "line",
          data: {
            labels: distances.map(
              (_, i) => `${i} → ${i + 1}`
            ),
            datasets: [
              {
                label: "Observed Hamming Distance",
                data: distances,
                borderColor: "#2563eb",
                backgroundColor: "#2563eb",
                tension: 0.2,
                pointRadius: 4
              },
              {
                label: "Theoretical Mean (80 bits)",
                data: Array(distances.length).fill(80),
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
              tooltip: { enabled: true }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: "Consecutive Derivation Indices"
                }
              },
              y: {
                min: 0,
                max: 160,
                title: {
                  display: true,
                  text: "Different Bits (out of 160)"
                }
              }
            }
          }
        }
      );

    } catch (error) {
      results.textContent =
        "Statistical analysis failed. Check the console.";
      console.error(error);
    } finally {
      button.disabled = false;
    }
  });
});
