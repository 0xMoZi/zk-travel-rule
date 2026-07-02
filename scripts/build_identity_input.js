const { buildEddsa, buildBabyjub } = require("circomlibjs");

async function main() {
    const eddsa = await buildEddsa();
    const babyJub = await buildBabyjub();
    const F = babyJub.F;

    // Simulate VASP keypair
    const privKey = Buffer.from("1".padStart(64, "0"), "hex");
    const pubKey = eddsa.prv2pub(privKey);

    // Hash PII
    const { buildPoseidon } = require("circomlibjs");
    const poseidon = await buildPoseidon();
    const name_hash = poseidon([BigInt("111")]);
    const dob_hash = poseidon([BigInt("222")]);
    const nat_hash = poseidon([BigInt("360")]); // ID country code

    const credential_hash = poseidon([
        F.toObject(name_hash),
        F.toObject(dob_hash),
        F.toObject(nat_hash),
    ]);

    // VASP sign credential_hash
    const sig = eddsa.signPoseidon(privKey, credential_hash);

    const input = {
        name_hash: F.toObject(name_hash).toString(),
        dob_hash: F.toObject(dob_hash).toString(),
        nationality_hash: F.toObject(nat_hash).toString(),
        user_secret: "999",
        sig_R8x: F.toObject(sig.R8[0]).toString(),
        sig_R8y: F.toObject(sig.R8[1]).toString(),
        sig_S: sig.S.toString(),
        vasp_Ax: F.toObject(pubKey[0]).toString(),
        vasp_Ay: F.toObject(pubKey[1]).toString(),
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/c1_identity.json",
        JSON.stringify(input, null, 2),
    );
    console.log("Input written to inputs/c1_identity.json");
}

main().catch(console.error);
