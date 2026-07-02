// Initialize the deployed TravelRuleVerifier contract:
//   1. set_vk_core  -- Groth16 verification key for the Core circuit
//   2. set_vk_smt   -- Groth16 verification key for the SMT circuit
//   3. update_registry_root
//   4. update_sanctions_root
//   5. update_prohibited_root
//
// Run with: node --env-file=.env scripts/setup_contract.mjs
// Requires: all VITE_* vars in .env, plus demo-data must already exist
//   (run build_demo_data.mjs first).

import { Client, basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { Keypair } from "@stellar/stellar-sdk";
import fs from "fs";

// Env vars
const CONTRACT_ID = process.env.VITE_CONTRACT_ID;
const RPC_URL = process.env.VITE_RPC_URL;
const NETWORK_PASSPHRASE = process.env.VITE_NETWORK_PASSPHRASE;
const ADMIN_SECRET = process.env.VITE_VASP_A_SECRET; // admin was initialized as VASP_A

if (!CONTRACT_ID || !RPC_URL || !NETWORK_PASSPHRASE || !ADMIN_SECRET) {
    throw new Error("Missing required env vars. Check .env file.");
}

const adminKeypair = Keypair.fromSecret(ADMIN_SECRET);
const adminPublicKey = adminKeypair.publicKey();

// Load demo-data outputs
const roots = JSON.parse(fs.readFileSync("scripts/roots.json", "utf8"));
const coreVk = JSON.parse(
    fs.readFileSync("circuits/build/core/core_vk.json", "utf8"),
);
const smtVk = JSON.parse(
    fs.readFileSync("circuits/build/smt/smt_vk.json", "utf8"),
);

// Convert snarkjs vk.json -> JS object matching Soroban VerificationKey
//
// VerificationKey struct:
//   alpha: Bn254G1Affine   (BytesN<64>)
//   beta:  Bn254G2Affine   (BytesN<128>)
//   gamma: Bn254G2Affine   (BytesN<128>)
//   delta: Bn254G2Affine   (BytesN<128>)
//   ic:    Vec<Bn254G1Affine>
//
// Soroban Bn254G1Affine  = BytesN<64>:  be(X) || be(Y)
// Soroban Bn254G2Affine  = BytesN<128>: be(X.c1) || be(X.c0) || be(Y.c1) || be(Y.c0)
//   IMPORTANT: c1 (imaginary) before c0 (real) per coordinate, opposite of snarkjs order.
//
// Client.from() with Spec.nativeToScVal will handle the Uint8Array -> BytesN
// conversion automatically because Bn254G1Affine is BytesN<64> at the XDR level
// (confirmed from soroban-sdk source: #[repr(transparent)] over BytesN<N>).

function feToBytes32BE(value) {
    const n = typeof value === "bigint" ? value : BigInt(value);
    const out = new Uint8Array(32);
    let v = n;
    for (let i = 31; i >= 0; i--) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return out;
}

function g1ToBytes(point) {
    // snarkjs G1: [x, y, "1"]
    return Buffer.concat([feToBytes32BE(point[0]), feToBytes32BE(point[1])]);
}

function g2ToBytes(point) {
    // snarkjs G2: [[xC0, xC1], [yC0, yC1], ["1","0"]]
    // Soroban wants: c1 || c0 per coordinate
    const [[xC0, xC1], [yC0, yC1]] = point;
    return Buffer.concat([
        feToBytes32BE(xC1),
        feToBytes32BE(xC0), // X: c1 first, then c0
        feToBytes32BE(yC1),
        feToBytes32BE(yC0), // Y: c1 first, then c0
    ]);
}

function vkToSoroban(vk) {
    return {
        alpha: g1ToBytes(vk.vk_alpha_1),
        beta: g2ToBytes(vk.vk_beta_2),
        gamma: g2ToBytes(vk.vk_gamma_2),
        delta: g2ToBytes(vk.vk_delta_2),
        ic: vk.IC.map((point) => g1ToBytes(point)),
    };
}

// BytesN<32> for roots: plain Uint8Array 32 bytes
function rootToBytes(rootDecimalStr) {
    return Buffer.from(feToBytes32BE(BigInt(rootDecimalStr)));
}

// Helper: sign + simulate + send, with logging
async function callAndSend(label, txPromise) {
    console.log(`\n[${label}] Simulating...`);
    const tx = await txPromise;
    await tx.simulate();
    console.log(`[${label}] Signing and sending...`);
    const signer = basicNodeSigner(adminKeypair, NETWORK_PASSPHRASE);
    const result = await tx.signAndSend({
        signTransaction: signer.signTransaction,
    });
    console.log(
        `[${label}] Done. Hash: ${result.sendTransactionResponse?.hash ?? "(no hash)"}`,
    );
    return result;
}

// Main
async function main() {
    console.log("Connecting to contract:", CONTRACT_ID);
    const client = await Client.from({
        contractId: CONTRACT_ID,
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: adminPublicKey,
    });

    const coreVkSoroban = vkToSoroban(coreVk);
    const smtVkSoroban = vkToSoroban(smtVk);

    console.log(
        "Core VK IC length:",
        coreVkSoroban.ic.length,
        "(expect 13 for nPublic=12)",
    );
    console.log(
        "SMT  VK IC length:",
        smtVkSoroban.ic.length,
        "(expect 7 for nPublic=6)",
    );

    // 1. set_vk_core
    await callAndSend("set_vk_core", client.set_vk_core({ vk: coreVkSoroban }));

    // 2. set_vk_smt
    await callAndSend("set_vk_smt", client.set_vk_smt({ vk: smtVkSoroban }));

    // 3. update_registry_root
    await callAndSend(
        "update_registry_root",
        client.update_registry_root({ root: rootToBytes(roots.registry_root) }),
    );

    // 4. update_sanctions_root
    await callAndSend(
        "update_sanctions_root",
        client.update_sanctions_root({
            root: rootToBytes(roots.sanctions_root),
        }),
    );

    // 5. update_prohibited_root
    await callAndSend(
        "update_prohibited_root",
        client.update_prohibited_root({
            root: rootToBytes(roots.prohibited_root),
        }),
    );

    console.log("\nContract fully initialized. Ready for submit_intent.");
}

main().catch((err) => {
    console.error("Setup failed:", err?.message ?? err);
    if (err?.response)
        console.error("RPC response:", JSON.stringify(err.response, null, 2));
    process.exit(1);
});
