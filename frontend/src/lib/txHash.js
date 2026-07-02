// Compute tx_hash exactly as the contract does in submit_intent.
// Validated: JS output matches Rust ground-truth byte-for-byte.
import { Address } from "@stellar/stellar-sdk";

const BN254_FR_MODULUS =
    21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function feToBytes32BE(n) {
    const out = new Uint8Array(32);
    let v = typeof n === "bigint" ? n : BigInt(n);
    for (let i = 31; i >= 0; i--) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return out;
}

export async function computeTxHashField(
    senderVaspAddress,
    receiverVaspAddress,
    beneficiaryIdHashBigInt,
) {
    const senderXdr = new Uint8Array(
        new Address(senderVaspAddress).toScVal().toXDR(),
    );
    const receiverXdr = new Uint8Array(
        new Address(receiverVaspAddress).toScVal().toXDR(),
    );
    const benefBytes = feToBytes32BE(beneficiaryIdHashBigInt);

    const payload = new Uint8Array(senderXdr.length + receiverXdr.length + 32);
    payload.set(senderXdr, 0);
    payload.set(receiverXdr, senderXdr.length);
    payload.set(benefBytes, senderXdr.length + receiverXdr.length);

    const hashBuf = await crypto.subtle.digest("SHA-256", payload);
    const masked = new Uint8Array(hashBuf);
    masked[0] = 0; // guarantee value < BN254 Fr modulus

    let n = 0n;
    for (const b of masked) n = (n << 8n) | BigInt(b);
    if (n >= BN254_FR_MODULUS)
        throw new Error(
            "txHash: masked value overflows field -- should be impossible",
        );
    return { fieldElement: n, maskedBytes: masked };
}
