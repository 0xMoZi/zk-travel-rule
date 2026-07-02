import "./buffer-polyfill.js";

import { groth16 } from "snarkjs";
import { Client } from "@stellar/stellar-sdk/contract";
import { Address, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { proofToSoroban, pubToU256Array } from "./proofFormat.js";
import { describeError } from "./errors.js";
import {
    buildInputs,
    computeTxHash,
    feToBytes32BE,
    CUSTOMERS,
    THRESHOLD,
} from "./prover.js";

let ENV = null;

function log(side, msg, status = "done") {
    postMessage({
        type: `log_${side.toLowerCase()}`,
        payload: { msg, status },
    });
}
function phase(p) {
    postMessage({ type: "phase", payload: p });
}

async function prove(label, side, input, wasmPath, zkeyPath) {
    log(side, `Generating ${label} proof…`, "running");
    const t = Date.now();
    const { proof, publicSignals } = await groth16.fullProve(
        input,
        wasmPath,
        zkeyPath,
    );
    log(side, `${label} proof done (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    return { proof, publicSignals };
}

async function getClient(publicKey) {
    return Client.from({
        contractId: ENV.contractId,
        rpcUrl: ENV.rpcUrl,
        networkPassphrase: ENV.networkPassphrase,
        publicKey,
    });
}

function makeSigner(keypair) {
    return async (xdrString) => {
        const tx = TransactionBuilder.fromXDR(xdrString, ENV.networkPassphrase);
        tx.sign(keypair);
        return tx.toXDR();
    };
}

async function sendTx(assembledTx, keypair) {
    const client = await getClient(keypair.publicKey());
    const server = client.options.server;
    const rawTx = assembledTx.built;
    if (!rawTx) throw new Error("assembledTx.built is undefined");
    const preparedTx = await server.prepareTransaction(rawTx);
    preparedTx.sign(keypair);
    const sendResp = await server.sendTransaction(preparedTx);
    if (sendResp.status === "ERROR")
        throw new Error(
            `sendTransaction failed: ${JSON.stringify(sendResp.errorResultXdr)}`,
        );
    let result = await server.getTransaction(sendResp.hash);
    let attempts = 0;
    while (result.status === "NOT_FOUND" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 1000));
        result = await server.getTransaction(sendResp.hash);
        attempts++;
    }
    if (result.status === "FAILED")
        throw new Error("Transaction failed on-chain");
    return sendResp.hash;
}

// submit_intent (VASP_A)
async function doSubmitIntent(senderKey, receiverKey, amountBigInt) {
    if (!ENV?.vaspASecret)
        throw new Error(
            "VITE_VASP_A_SECRET is not defined — check frontend/.env",
        );

    const isCarol = senderKey === "carol";
    phase("proving_a");
    log("a", "Computing circuit inputs…", "running");

    // 1. Compute receiver credential hash (needed for tx_hash commitment)
    const { credentialHash: receiverCredHash } = await buildInputs(
        receiverKey,
        amountBigInt,
        0n,
        ENV,
    );

    // 2. Compute tx_hash from real VASP addresses + receiver credential hash
    const txHash = await computeTxHash(
        ENV.vaspAAddress,
        ENV.vaspBAddress,
        receiverCredHash,
    );
    log("a", `tx_hash computed`);

    // 3. Build sender inputs
    const { coreInput, smtInput } = await buildInputs(
        senderKey,
        amountBigInt,
        txHash,
        ENV,
    );

    // 4. Generate proofs
    let coreProof, corePub;
    try {
        const r = await prove(
            "Core",
            "a",
            coreInput,
            "/circuits/core_js/core.wasm",
            "/circuits/core_final.zkey",
        );
        coreProof = r.proof;
        corePub = r.publicSignals;
    } catch (e) {
        throw new Error("Core proof failed: " + e.message);
    }

    let smtProof, smtPub;
    try {
        const r = await prove(
            "SMT",
            "a",
            smtInput,
            "/circuits/smt_js/smt.wasm",
            "/circuits/smt_final.zkey",
        );
        smtProof = r.proof;
        smtPub = r.publicSignals;
    } catch (e) {
        if (isCarol) {
            throw Object.assign(
                new Error(
                    "SMT proof failed — sender nationality is in the prohibited jurisdiction list (C3 constraint unsatisfiable).",
                ),
                { name: "InvalidSmtProof" },
            );
        }
        throw new Error("SMT proof failed: " + e.message);
    }

    log("a", "Signing and submitting to Soroban…", "running");
    phase("submitting_a");

    const keypairA = Keypair.fromSecret(ENV.vaspASecret);
    const client = await getClient(ENV.vaspAAddress);
    const benefBytes = feToBytes32BE(receiverCredHash);

    // Generate unique noncw (u64 / BigInt) based on time
    const uniqueNonce = BigInt(Date.now());

    const txHash_ = await sendTx(
        await client.submit_intent({
            sender_vasp: new Address(ENV.vaspAAddress),
            receiver_vasp: new Address(ENV.vaspBAddress),
            beneficiary_id_hash: benefBytes,
            nonce: uniqueNonce,
            core_proof: proofToSoroban(coreProof),
            core_pub: pubToU256Array(corePub),
            smt_proof: proofToSoroban(smtProof),
            smt_pub: pubToU256Array(smtPub),
        }),
        keypairA,
    );

    log("a", "submit_intent confirmed ✓");
    postMessage({ type: "tx_a", payload: txHash_ });

    // Syncronized INTENT_ID with RUST (u64 / 8 Byte)
    const txHashBytes = feToBytes32BE(BigInt(corePub[10])); // 32 byte hash ZK

    // Change uniqueNonce (BigInt) into pure buffer 8 byte (Big Endian u64)
    const nonceBytes8 = new Uint8Array(8);
    let tempNonce = uniqueNonce;
    for (let i = 7; i >= 0; i--) {
        nonceBytes8[i] = Number(tempNonce & 0xffn);
        tempNonce >>= 8n;
    }

    const combinedPayload = new Uint8Array(32 + 8);
    combinedPayload.set(txHashBytes, 0);
    combinedPayload.set(nonceBytes8, 32);

    const intentHashBuf = await crypto.subtle.digest(
        "SHA-256",
        combinedPayload,
    );
    const intentId = Array.from(new Uint8Array(intentHashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    postMessage({ type: "intent_id", payload: intentId });
    postMessage({ type: "tx_hash_field", payload: txHash.toString() });
    log("b", "Intent received — waiting for approval", "pending");
    phase("pending_b");
}

// counter_sign (VASP_B)
async function doCounterSign(intentId, receiverKey, amountBigInt, txHashField) {
    if (!ENV?.vaspBSecret)
        throw new Error("VITE_VASP_B_SECRET is not defined.");

    phase("proving_b");
    log("b", "Computing circuit inputs…", "running");

    const txHash = BigInt(txHashField);
    const { coreInput, smtInput } = await buildInputs(
        receiverKey,
        amountBigInt,
        txHash,
        ENV,
    );

    const { proof: coreProof, publicSignals: corePub } = await prove(
        "Core",
        "b",
        coreInput,
        "/circuits/core_js/core.wasm",
        "/circuits/core_final.zkey",
    );

    const { proof: smtProof, publicSignals: smtPub } = await prove(
        "SMT",
        "b",
        smtInput,
        "/circuits/smt_js/smt.wasm",
        "/circuits/smt_final.zkey",
    );

    log("b", "Signing and submitting counter_sign…", "running");
    phase("submitting_b");

    const keypairB = Keypair.fromSecret(ENV.vaspBSecret);
    const client = await getClient(ENV.vaspBAddress);
    const intentBuf = new Uint8Array(
        intentId.match(/.{2}/g).map((h) => parseInt(h, 16)),
    );

    const txHash_ = await sendTx(
        await client.counter_sign({
            receiver_vasp: new Address(ENV.vaspBAddress),
            intent_id: intentBuf,
            core_proof: proofToSoroban(coreProof),
            core_pub: pubToU256Array(corePub),
            smt_proof: proofToSoroban(smtProof),
            smt_pub: pubToU256Array(smtPub),
        }),
        keypairB,
    );

    log("b", "counter_sign confirmed — intent Cleared ✓");
    postMessage({ type: "tx_b", payload: txHash_ });
    phase("cleared");
}

// reject_intent (VASP_B)
async function doRejectIntent(intentId) {
    if (!ENV?.vaspBSecret)
        throw new Error("VITE_VASP_B_SECRET is not defined.");
    const keypairB = Keypair.fromSecret(ENV.vaspBSecret);
    const client = await getClient(ENV.vaspBAddress);
    const intentBuf = new Uint8Array(
        intentId.match(/.{2}/g).map((h) => parseInt(h, 16)),
    );
    await sendTx(
        await client.reject_intent({
            receiver_vasp: new Address(ENV.vaspBAddress),
            intent_id: intentBuf,
        }),
        keypairB,
    );
    phase("rejected");
}

// Message router
self.onmessage = async ({ data }) => {
    try {
        if (data.env) ENV = data.env;
        if (data.type === "submit_intent") {
            await doSubmitIntent(
                data.senderKey,
                data.receiverKey,
                BigInt(data.amount),
            );
        }
        if (data.type === "counter_sign") {
            await doCounterSign(
                data.intentId,
                data.receiverKey,
                BigInt(data.amount),
                data.txHashField,
            );
        }
        if (data.type === "reject_intent") {
            await doRejectIntent(data.intentId);
        }
    } catch (err) {
        console.error("[flow.worker]", err);
        postMessage({ type: "error", payload: describeError(err) });
    }
};
