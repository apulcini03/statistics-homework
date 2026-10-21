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
