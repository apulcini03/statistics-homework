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
