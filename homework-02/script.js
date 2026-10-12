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


