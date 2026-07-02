const {
    buildEddsa,
    buildBabyjub,
    buildPoseidon,
    newMemEmptyTrie,
} = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    const eddsa = await buildEddsa();
    const babyJub = await buildBabyjub();
    const F = babyJub.F;

    // C5: Build VASP registry
    const tree = await newMemEmptyTrie();
    const vasp_secret = 42n;
    const vasp_key = F.toObject(poseidon([vasp_secret]));

    await tree.insert(vasp_key, 1n);
    await tree.insert(F.toObject(poseidon([100n])), 1n);
    await tree.insert(F.toObject(poseidon([200n])), 1n);

    const registry_root = F.toObject(tree.root).toString();
    const vasp_proof = await tree.find(vasp_key);
    const vasp_siblings = vasp_proof.siblings.map((s) =>
        F.toObject(s).toString(),
    );
    while (vasp_siblings.length < 20) vasp_siblings.push("0");

    // C1: EdDSA keypair dan sign credential
    const privKey = Buffer.from("1".padStart(64, "0"), "hex");
    const pubKey = eddsa.prv2pub(privKey);

    const name_hash = F.toObject(poseidon([111n]));
    const dob_hash = F.toObject(poseidon([222n]));
    const nat_hash = F.toObject(poseidon([360n]));
    const cred_hash = poseidon([name_hash, dob_hash, nat_hash]);
    const sig = eddsa.signPoseidon(privKey, cred_hash);

    // Build input
    const input = {
        // C1
        name_hash: name_hash.toString(),
        dob_hash: dob_hash.toString(),
        nationality_hash: nat_hash.toString(),
        user_secret: "999",
        sig_R8x: F.toObject(sig.R8[0]).toString(),
        sig_R8y: F.toObject(sig.R8[1]).toString(),
        sig_S: sig.S.toString(),

        // C4
        amount: "15000000000",

        // C5
        vasp_secret: vasp_secret.toString(),
        vasp_siblings: vasp_siblings,

        // Public
        vasp_Ax: F.toObject(pubKey[0]).toString(),
        vasp_Ay: F.toObject(pubKey[1]).toString(),
        vasp_key: vasp_key.toString(),
        registry_root: registry_root,
        threshold: "10000000000",
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/core.json",
        JSON.stringify(input, null, 2),
    );
    console.log("Input written to inputs/core.json");
    console.log("registry_root:", registry_root);
    console.log("vasp_key:", vasp_key.toString());
}

main().catch(console.error);
