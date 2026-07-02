# zk-Travel Rule

A privacy-preserving Travel Rule compliance system built on Stellar/Soroban using zero-knowledge proofs (Groth16, BN254). Two VASPs can prove regulatory compliance to each other — and to an on-chain verifier — without revealing any customer personal data.

> **ZK is load-bearing:** every compliance check is enforced cryptographically on-chain. There is no trusted intermediary, no shared KYC database, and no raw personal data transmitted between parties.

---
  
## What is the Travel Rule?

FATF Recommendation 16 requires Virtual Asset Service Providers (VASPs) to collect and transmit sender and receiver identity information for transactions above a threshold (typically $1,000). In traditional finance this is handled by sharing KYC data directly between institutions. In crypto, this creates a fundamental tension: the data is sensitive, the counterparty VASP is often unknown, and the information could be intercepted or misused.

**This project resolves that tension with zero-knowledge proofs.** Each VASP generates a ZK proof that their customer satisfies all Travel Rule requirements. The proof is verified on-chain by a Soroban smart contract. No personal data ever leaves either VASP.

---

## How it works

**VASP_A** (sender side) and **VASP_B** (receiver side, represented by Bob) each generate a Groth16 proof about their own customer. Both proofs are verified on-chain. Only after both parties prove compliance does the intent reach `Cleared` status.

### The five compliance checks

Each submission bundles five independent ZK checks across two circuits:

**TravelRuleCore — C1 + C4 + C5**
- **C1 — Identity Credential:** The VASP has issued a valid EdDSA-signed credential over `Poseidon(name, DOB, nationality)`. The EdDSA signature is verified inside the circuit — raw PII is never exposed.
- **C4 — Amount Threshold:** The transfer amount is above the $1,000 threshold, proven without revealing the exact amount.
- **C5 — VASP Authorization:** The VASP is registered in a Sparse Merkle Tree registry, proven via an SMT membership proof.

**TravelRuleSMT — C2 + C3**
- **C2 — Sanctions Check:** The customer's identity hash is NOT present in a Sparse Merkle Tree of sanctioned individuals (OFAC-style), proven via SMT non-membership.
- **C3 — Jurisdiction Check:** The customer's nationality is NOT in a list of prohibited countries (Iran, North Korea, Syria, Cuba, Russia), also via SMT non-membership.

Both circuits share the same `tx_hash` and `sender_address` as public inputs, binding both proofs to a specific transaction and preventing cross-transaction reuse.

### Anti-replay via nullifiers

Each proof produces five unique **nullifiers** — `Poseidon(user_secret, circuit_id, tx_hash)`. All five are recorded on-chain after a successful verification. Submitting the same proof again triggers `NullifierUsed`.

### Intent state machine

```
VASP_A                    Contract (Soroban)              VASP_B
  │                             │                            │
  ├── submit_intent ──────────>│                            │
  │   (sender ZK proof)        │── verify Core + SMT ──────│
  │                             │── store intent             │
  │                             │── status: SenderSigned     │
  │                             │                            │
  │                             │── emit IntentSubmitted ──>│
  │                             │                            │
  │                             │<── counter_sign ──────────┤
  │                             │    (receiver ZK proof)    │
  │                             │── verify Core + SMT       │
  │                             │── binding check (tx_hash) │
  │                             │── store nullifiers        │
  │                             │── status: Cleared         │
  │                             │                            │
  │                             │── emit IntentCleared ────>│
```

The contract enforces that both proofs reference the same `tx_hash`, preventing a valid proof from one transaction being substituted into another.

---

## Project structure

```
zk-travel-rule/
│
├── circuits/
│   ├── c1_identity/
│   │   ├── identity.circom          # IdentityCredential: EdDSA verify + Poseidon hash
│   │   └── circuit.circom
│   ├── c2_sanction/
│   │   ├── sanction.circom          # SanctionsCheck: SMT non-membership proof
│   │   └── circuit.circom
│   ├── c3_jurisdiction/
│   │   ├── jurisdiction.circom      # JurisdictionCheck: SMT non-membership proof
│   │   └── circuit.circom
│   ├── c4_amount/
│   │   ├── amount.circom            # AmountThreshold: GreaterEqThan(64) comparator
│   │   └── circuit.circom
│   ├── c5_vasp/
│   │   ├── vasp.circom              # VASPAuthorization: SMT membership proof
│   │   └── circuit.circom
│   ├── composed/
│   │   ├── core.circom              # TravelRuleCore: C1 + C4 + C5 combined
│   │   └── smt.circom               # TravelRuleSMT: C2 + C3 combined
│   └── build/                       # Compiled: .r1cs, .wasm, .zkey, _vk.json
│       ├── core/
│       └── smt/
│
├── contracts/
│   └── travel-rule-verifier/
│       ├── src/
│       │   ├── lib.rs               # Main contract: submit_intent, counter_sign, reject_intent
│       │   └── test.rs              # Unit tests
│       ├── Cargo.toml
│       └── Makefile
│
├── scripts/
│   ├── build_core_input.js          # Build Core circuit test input
│   ├── build_identity_input.js      # Build C1 identity circuit test input
│   ├── build_jurisdiction_input.js  # Build C3 jurisdiction circuit test input
│   ├── build_sanction_input.js      # Build C2 sanctions circuit test input
│   ├── build_smt_input.js           # Build SMT circuit test input
│   ├── build_vasp_registry.js       # Build VASP registry SMT
│   ├── compute_roots.mjs            # Compute roots for setup_contract.mjs
│   └── setup_contract.mjs           # Upload VK + roots to deployed contract
│
├── inputs/                          # Per-circuit test input JSON files
│   ├── c1_identity.json
│   ├── c2_sanctions.json
│   ├── c3_jurisdiction.json
│   ├── c4_above.json
│   ├── c4_below.json
│   ├── c5_vasp.json
│   ├── core.json
│   └── smt.json
│
├── frontend/
│   ├── .env
│   ├── public/
│   │   └── circuits/                # .wasm + .zkey served statically for in-browser proving
│   │       ├── core_js/core.wasm
│   │       ├── smt_js/smt.wasm
│   │       ├── core_final.zkey
│   │       └── smt_final.zkey
│   └── src/
│       ├── lib/
│       │   ├── prover.js            # In-browser circuit input builder (circomlibjs SMT)
│       │   ├── flow.worker.js       # Web Worker: proving + contract calls off main thread
│       │   ├── proofFormat.js       # Groth16 → Soroban Bn254G1/G2Affine byte layout
│       │   ├── txHash.js            # sha256 commitment (byte-validated against Rust)
│       │   ├── scenarios.js         # Preset customer definitions
│       │   └── errors.js            # Contract error code → human-readable message
│       └── components/
│           ├── VaspPanel.jsx        # Per-VASP log + action panel
│           ├── StatusBadge.jsx      # Phase indicator
│           └── ResultPanel.jsx      # Final outcome + explorer links
│
├── Makefile                         # Full automation: keys → build → deploy → dev
├── .env                             # Runtime config (not committed)
└── README.md
```

---

## Demo scenarios

The frontend has a **Sender dropdown** (Alice or Carol) and a free-form **Amount (USD)** input. Changing the amount changes the circuit's `sender_address` field (`nameRaw + amount`), producing unique nullifiers every run so the same intent can never be submitted twice to the same contract.

| Sender | Receiver | Amount | Expected outcome | Reason |
|---|---|---|---|---|
| Alice (Indonesia) | Bob (Singapore) | > $1,000 | **Cleared** | All checks pass, VASP_B approves |
| Alice (Indonesia) | Bob (Singapore) | > $1,000 | **Rejected** | All checks pass, VASP_B clicks Reject |
| Carol (Iran) | Bob (Singapore) | any | **Failed** | C3 jurisdiction check: Iran is in the prohibited list — the SMT non-membership proof cannot be generated because the key is actually present in the tree. The Circom `ForceEqualIfEnabled` constraint fails during witness generation in-browser, before any transaction is submitted. |

---

## ZK stack

| Component | Technology |
|---|---|
| Proof system | Groth16 |
| Curve | BN254 (bn128) |
| Hash function | Poseidon (circomlib) |
| Merkle structure | Sparse Merkle Tree (circomlibjs) |
| Circuit language | Circom 2.0 |
| On-chain pairing | Soroban native BN254 host functions |
| In-browser proving | snarkjs `groth16.fullProve` in a Web Worker |

### On-chain Groth16 verifier

The contract implements the full pairing check using `env.crypto().bn254()` host functions:

```
e(−A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
```

where `vk_x = IC[0] + Σ pub[i] · IC[i+1]` is computed via `g1_add` and `g1_mul` over the BN254 curve.

### Public inputs

**TravelRuleCore (12 signals, order confirmed from `witness.json`):**

| Index | Signal | Notes |
|---|---|---|
| 0 | `credential_hash` | `Poseidon(name_hash, dob_hash, nationality_hash)` |
| 1 | `is_above_threshold` | 1 if amount ≥ threshold |
| 2 | `nullifier_c1` | Anti-replay for C1 |
| 3 | `nullifier_c4` | Anti-replay for C4 |
| 4 | `nullifier_c5` | Anti-replay for C5 |
| 5 | `vasp_Ax` | VASP EdDSA pubkey x |
| 6 | `vasp_Ay` | VASP EdDSA pubkey y |
| 7 | `vasp_key` | `Poseidon(vasp_secret)` |
| 8 | `registry_root` | VASP Merkle root |
| 9 | `threshold` | Minimum amount |
| 10 | `tx_hash` | Transaction binding |
| 11 | `sender_address` | Mock user identifier |

**TravelRuleSMT (6 signals):**

| Index | Signal | Notes |
|---|---|---|
| 0 | `nullifier_c2` | Anti-replay for C2 |
| 1 | `nullifier_c3` | Anti-replay for C3 |
| 2 | `sanctions_root` | SMT root of sanctioned identities |
| 3 | `prohibited_root` | SMT root of prohibited nationalities |
| 4 | `tx_hash` | Must match Core `tx_hash` |
| 5 | `sender_address` | Must match Core `sender_address` |

### tx_hash encoding

The contract computes:
```
tx_hash = sha256(sender_vasp_xdr ‖ receiver_vasp_xdr ‖ beneficiary_id_hash_raw)
```

where `sender_vasp` and `receiver_vasp` are encoded as full XDR `ScVal` (44 bytes each: 4-byte ScVal tag + 4-byte sub-tag + 4-byte padding + 32-byte ed25519 pubkey), and `beneficiary_id_hash` is appended as raw 32 bytes (no XDR wrapping).

SHA-256 outputs 256 bits; BN254 Fr is ~254 bits. To guarantee every output fits as a field element, both the contract and the frontend zero out byte `[0]` (the most significant byte) before use. Verified empirically: 1,000/1,000 random SHA-256 outputs with MSB zeroed all fall below the BN254 Fr modulus.

The `Address::to_xdr()` byte layout was confirmed by a Rust unit test that prints the exact bytes, then reproduced identically in JS using `new Address(str).toScVal().toXDR()`.

### Bn254 point encoding

Soroban's `Bn254G1Affine` is `BytesN<64>`: `be(X) ‖ be(Y)`, each 32 bytes big-endian.

Soroban's `Bn254G2Affine` is `BytesN<128>`: `be(X.c1) ‖ be(X.c0) ‖ be(Y.c1) ‖ be(Y.c0)` — imaginary component **before** real component per coordinate, opposite of the snarkjs `[[c0, c1], [c0, c1]]` order.

---

## Quick start (Makefile)

```bash
# 1. Generate and fund two testnet VASP accounts
make generate-keys
# Copy the printed ADDRESS and SECRET values into .env

# 2. Install Node dependencies
make install-deps

# 3. Compile ZK circuits + Soroban contract
make build-all

# 4. Deploy contract to Stellar testnet
make deploy-contract
# Copy the printed CONTRACT_ID into .env as VITE_CONTRACT_ID

# 5. Upload verification keys + Merkle roots on-chain
make init-contract

# 6. Launch frontend
make dev
# Open http://localhost:5173
```

---

## Environment variables

```bash
VITE_CONTRACT_ID=C...                        # Deployed contract address
VITE_RPC_URL=https://...                     # Soroban RPC endpoint
VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_VASP_A_ADDRESS=G...                     # VASP_A Stellar public key
VITE_VASP_B_ADDRESS=G...                     # VASP_B Stellar public key
VITE_VASP_A_SECRET=S...                      # VASP_A signing key (testnet only)
VITE_VASP_B_SECRET=S...                      # VASP_B signing key (testnet only)
```

> **Note:** `VITE_VASP_A_SECRET` and `VITE_VASP_B_SECRET` are bundled into the frontend JS at build time. This is acceptable for a testnet demo where the frontend acts as both VASPs. In production, each VASP would hold their own key in a secure backend and sign independently.

---

## Smart contract API

| Function | Caller | Description |
|---|---|---|
| `initialize(admin)` | Admin | Set contract admin (one-time) |
| `set_vk_core(vk)` | Admin | Upload Groth16 verification key for Core circuit |
| `set_vk_smt(vk)` | Admin | Upload Groth16 verification key for SMT circuit |
| `update_registry_root(root)` | Admin | Update VASP registry Merkle root |
| `update_sanctions_root(root)` | Admin | Update sanctions SMT root |
| `update_prohibited_root(root)` | Admin | Update prohibited jurisdictions SMT root |
| `submit_intent(sender_vasp, receiver_vasp, beneficiary_id_hash, nonce, core_proof, core_pub, smt_proof, smt_pub)` | VASP_A | Submit sender ZK proof, create intent with unique nonce |
| `counter_sign(receiver_vasp, intent_id, core_proof, core_pub, smt_proof, smt_pub)` | VASP_B | Submit receiver ZK proof, clear intent |
| `reject_intent(receiver_vasp, intent_id)` | VASP_B | Reject a pending intent |
| `expire_intent(intent_id)` | Anyone | Mark intent as expired after TTL (1 day) |
| `get_intent(intent_id)` | Anyone | Read full intent state |
| `is_cleared(intent_id)` | Anyone | Check cleared status |

---

## What is real vs mock

**Real:**
- All ZK proofs (Groth16 on BN254, generated in-browser via snarkjs in a Web Worker)
- On-chain Groth16 verification (Soroban BN254 pairing host functions)
- Nullifier recording and replay prevention (on-chain persistent storage)
- SMT non-membership proofs for sanctions and jurisdiction checks
- EdDSA credential signing (VASP signs customer credential with a key derived from a real Stellar keypair)
- Intent lifecycle state machine on Stellar testnet (Pending → Cleared / Rejected / Expired)
- `tx_hash` commitment binding both proofs to a specific sender/receiver/beneficiary tuple

**Simplified for demo:**
- Customer PII is represented as small integers (`name_raw = 111`, `dob_raw = 19950101`) rather than real identity documents
- The VASP registry, sanctions list, and prohibited jurisdiction list are small in-memory SMTs. In production these would be maintained by a trusted oracle with governance
- `sender_address` in the circuit is a mock numeric identifier derived from `customer.nameRaw + amount`, not a real verified user address
- Both VASP keypairs are held by the same frontend for demo purposes. In production each VASP would have a separate secure backend
- The `nonce` in `submit_intent` uses `Date.now()` to ensure uniqueness per submission

---

## Deployed contract (Stellar testnet)

`CB33RJNYOLRI7TFRNS7XAAFLCITP6YC523SJBEYOOZD7263QQO6LOW3Z`

---

## Acknowledgements

- [circomlib](https://github.com/iden3/circomlib) — Poseidon, EdDSA, SMT, comparator circuits
- [snarkjs](https://github.com/iden3/snarkjs) — Groth16 proving in-browser
- [Stellar / Soroban](https://stellar.org) — BN254 host functions, smart contract platform
- FATF Recommendation 16 — the compliance standard this project addresses
