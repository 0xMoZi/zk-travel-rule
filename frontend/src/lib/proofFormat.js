// Convert snarkjs Groth16 output to Soroban Bn254G1Affine / Bn254G2Affine byte layout.
// Validated against soroban-sdk 26.1.0 source (bn254.rs) and round-trip tested.
//
// G1 (64 bytes): be(X) || be(Y)
// G2 (128 bytes): be(X.c1) || be(X.c0) || be(Y.c1) || be(Y.c0)  <-- c1 BEFORE c0

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

function concat(...bufs) {
    const len = bufs.reduce((s, b) => s + b.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const b of bufs) {
        out.set(b, off);
        off += b.length;
    }
    return out;
}

export function g1ToBytes(point) {
    return concat(feToBytes32BE(point[0]), feToBytes32BE(point[1]));
}

export function g2ToBytes([[xC0, xC1], [yC0, yC1]]) {
    return concat(
        feToBytes32BE(xC1),
        feToBytes32BE(xC0),
        feToBytes32BE(yC1),
        feToBytes32BE(yC0),
    );
}

export function proofToSoroban(proof) {
    return {
        a: g1ToBytes(proof.pi_a),
        b: g2ToBytes(proof.pi_b),
        c: g1ToBytes(proof.pi_c),
    };
}

export function pubToU256Array(signals) {
    return signals.map((s) => BigInt(s));
}
