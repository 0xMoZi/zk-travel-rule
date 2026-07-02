// Builds circuit inputs dynamically in-browser from a preset customer + free-form amount.
// Every unique amount produces a unique tx_hash → unique nullifiers → no NullifierUsed revert.
//
// EdDSA key derivation: Keypair.fromSecret(stellarSecret).rawSecretKey().slice(0, 32)
// This matches build_demo_data.mjs exactly, confirmed against vasp_keys.json output.

import {
    buildEddsa,
    buildBabyjub,
    buildPoseidon,
    newMemEmptyTrie,
} from "circomlibjs";
import { Keypair, Address } from "@stellar/stellar-sdk";

const PROHIBITED_CODES = [364n, 408n, 760n, 192n, 643n];
const VASP_A_SECRET_INT = 42n; // vasp_secret used in C5 Merkle proof (not the Stellar secret)
const VASP_B_SECRET_INT = 43n;
export const THRESHOLD = 10_000_000_000n; // $1,000 in demo scale

export const CUSTOMERS = {
    alice: {
        nameRaw: 111n,
        dobRaw: 19950101n,
        nationalityCode: 360n,
        userSecret: 999n,
        signingVasp: "A",
        willFail: false,
    },
    bob: {
        nameRaw: 777n,
        dobRaw: 19900515n,
        nationalityCode: 702n,
        userSecret: 888n,
        signingVasp: "B",
        willFail: false,
    },
    carol: {
        nameRaw: 555n,
        dobRaw: 19850220n,
        nationalityCode: 364n,
        userSecret: 777n,
        signingVasp: "A",
        willFail: true,
    },
};

// Singleton: init once, reuse across calls
let _ctx = null;

async function getCtx(env) {
    if (_ctx) return _ctx;

    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();
    const babyJub = await buildBabyjub();
    const F = babyJub.F;

    // Derive EdDSA keys from Stellar secrets
    function deriveEdDSA(stellarSecret) {
        const kp = Keypair.fromSecret(stellarSecret);
        const privKey = Buffer.from(kp.rawSecretKey().slice(0, 32));
        const pubKey = eddsa.prv2pub(privKey);
        return {
            privKey,
            Ax: F.toObject(pubKey[0]),
            Ay: F.toObject(pubKey[1]),
        };
    }

    const eddsaA = deriveEdDSA(env.vaspASecret);
    const eddsaB = deriveEdDSA(env.vaspBSecret);

    // Rebuild registry tree
    const registryTree = await newMemEmptyTrie();
    const vaspAKey = F.toObject(poseidon([VASP_A_SECRET_INT]));
    const vaspBKey = F.toObject(poseidon([VASP_B_SECRET_INT]));
    await registryTree.insert(vaspAKey, 1n);
    await registryTree.insert(vaspBKey, 1n);

    // Rebuild sanctions tree
    const sanctionsTree = await newMemEmptyTrie();
    for (const [n, d, doc] of [
        [111n, 19800101n, 999001n],
        [222n, 19750515n, 999002n],
    ]) {
        await sanctionsTree.insert(F.toObject(poseidon([n, d, doc])), 1n);
    }

    // Rebuild jurisdiction tree
    const jurisdictionTree = await newMemEmptyTrie();
    for (const code of PROHIBITED_CODES) {
        await jurisdictionTree.insert(F.toObject(poseidon([code])), 1n);
    }

    _ctx = {
        poseidon,
        eddsa,
        F,
        eddsaA,
        eddsaB,
        registryTree,
        sanctionsTree,
        jurisdictionTree,
        vaspAKey,
        vaspBKey,
    };
    return _ctx;
}

async function membershipSiblings(tree, key, F) {
    const proof = await tree.find(key);
    if (!proof.found) throw new Error(`Membership proof failed for key ${key}`);
    const s = proof.siblings.map((x) => F.toObject(x));
    while (s.length < 20) s.push(0n);
    return s;
}

async function nonMembershipProof(tree, key, F) {
    const proof = await tree.find(key);
    const s = proof.siblings.map((x) => F.toObject(x));
    while (s.length < 20) s.push(0n);
    return {
        siblings: s,
        old_key: proof.notFoundKey ? F.toObject(proof.notFoundKey) : 0n,
        old_value: proof.notFoundValue ? F.toObject(proof.notFoundValue) : 0n,
        is_old0: proof.isOld0 ? 1n : 0n,
    };
}

export function feToBytes32BE(n) {
    const bn = typeof n === "bigint" ? n : BigInt(n);
    const out = new Uint8Array(32);
    let v = bn;
    for (let i = 31; i >= 0; i--) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return out;
}

export async function computeTxHash(
    senderVaspAddr,
    receiverVaspAddr,
    beneficiaryBigInt,
) {
    const sXdr = new Uint8Array(new Address(senderVaspAddr).toScVal().toXDR());
    const rXdr = new Uint8Array(
        new Address(receiverVaspAddr).toScVal().toXDR(),
    );
    const bBytes = feToBytes32BE(beneficiaryBigInt);
    const payload = new Uint8Array(sXdr.length + rXdr.length + 32);
    payload.set(sXdr, 0);
    payload.set(rXdr, sXdr.length);
    payload.set(bBytes, sXdr.length + rXdr.length);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
    hash[0] = 0; // mask MSB to fit BN254 Fr field
    let n = 0n;
    for (const b of hash) n = (n << 8n) | BigInt(b);
    return n;
}

/**
 * Build core + SMT circuit inputs for one party.
 *
 * @param {string}  customerKey  - "alice" | "bob" | "carol"
 * @param {bigint}  amount       - transfer amount (must be > THRESHOLD for is_above_threshold=1)
 * @param {bigint}  txHash       - pre-computed tx_hash field element
 * @param {object}  env          - { vaspASecret, vaspBSecret, vaspAAddress, vaspBAddress }
 * @returns {{ coreInput, smtInput, credentialHash: bigint }}
 */
export async function buildInputs(customerKey, amount, txHash, env) {
    const ctx = await getCtx(env);
    const {
        poseidon,
        eddsa,
        F,
        eddsaA,
        eddsaB,
        registryTree,
        sanctionsTree,
        jurisdictionTree,
        vaspAKey,
        vaspBKey,
    } = ctx;

    const c = CUSTOMERS[customerKey];
    if (!c) throw new Error(`Unknown customer: ${customerKey}`);

    const nameHash = F.toObject(poseidon([c.nameRaw]));
    const dobHash = F.toObject(poseidon([c.dobRaw]));
    const natHash = F.toObject(poseidon([c.nationalityCode]));
    const credHash = poseidon([nameHash, dobHash, natHash]);

    // Sign with the VASP that owns this customer
    const eddsaVasp = c.signingVasp === "A" ? eddsaA : eddsaB;
    const sig = eddsa.signPoseidon(eddsaVasp.privKey, credHash);

    const vaspSecretInt =
        c.signingVasp === "A" ? VASP_A_SECRET_INT : VASP_B_SECRET_INT;
    const vaspKey = c.signingVasp === "A" ? vaspAKey : vaspBKey;
    const vaspSiblings = await membershipSiblings(registryTree, vaspKey, F);

    // Use nameRaw + amount as mock sender_address (unique per customer, stable across runs)
    const senderAddress = c.nameRaw + amount;

    // SMT non-membership proofs
    const identityHash = F.toObject(
        poseidon([c.nameRaw, c.dobRaw, BigInt(`${c.nameRaw}001`)]),
    );
    const sanctionsP = await nonMembershipProof(sanctionsTree, identityHash, F);
    const jurisdictionP = await nonMembershipProof(
        jurisdictionTree,
        natHash,
        F,
    );
    const registryRoot = F.toObject(registryTree.root);
    const sanctionsRoot = F.toObject(sanctionsTree.root);
    const prohibitedRoot = F.toObject(jurisdictionTree.root);

    const coreInput = {
        name_hash: nameHash.toString(),
        dob_hash: dobHash.toString(),
        nationality_hash: natHash.toString(),
        user_secret: c.userSecret.toString(),
        sig_R8x: F.toObject(sig.R8[0]).toString(),
        sig_R8y: F.toObject(sig.R8[1]).toString(),
        sig_S: sig.S.toString(),
        amount: amount.toString(),
        vasp_secret: vaspSecretInt.toString(),
        vasp_siblings: vaspSiblings.map((s) => s.toString()),
        vasp_Ax: eddsaVasp.Ax.toString(),
        vasp_Ay: eddsaVasp.Ay.toString(),
        vasp_key: vaspKey.toString(),
        registry_root: registryRoot.toString(),
        threshold: THRESHOLD.toString(),
        tx_hash: txHash.toString(),
        sender_address: senderAddress.toString(),
    };

    const smtInput = {
        user_secret: c.userSecret.toString(),
        identity_hash: identityHash.toString(),
        sanctions_siblings: sanctionsP.siblings.map((s) => s.toString()),
        sanctions_old_key: sanctionsP.old_key.toString(),
        sanctions_old_value: sanctionsP.old_value.toString(),
        sanctions_is_old0: sanctionsP.is_old0.toString(),
        nationality_hash: natHash.toString(),
        jurisdiction_siblings: jurisdictionP.siblings.map((s) => s.toString()),
        jurisdiction_old_key: jurisdictionP.old_key.toString(),
        jurisdiction_old_value: jurisdictionP.old_value.toString(),
        jurisdiction_is_old0: jurisdictionP.is_old0.toString(),
        sanctions_root: sanctionsRoot.toString(),
        prohibited_root: prohibitedRoot.toString(),
        tx_hash: txHash.toString(),
        sender_address: senderAddress.toString(),
    };

    return { coreInput, smtInput, credentialHash: F.toObject(credHash) };
}
