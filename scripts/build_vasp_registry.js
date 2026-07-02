const { newMemEmptyTrie, buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    const tree = await newMemEmptyTrie();
    const F = tree.F;

    const vasps = [{ secret: 42n }, { secret: 100n }, { secret: 200n }];

    for (const vasp of vasps) {
        const key = F.toObject(poseidon([vasp.secret]));
        await tree.insert(key, 1n);
    }

    const root = F.toObject(tree.root).toString();
    console.log("Registry Root:", root);

    const vasp_secret = 42n;
    const vasp_key = F.toObject(poseidon([vasp_secret])).toString();
    console.log("vasp_key (Poseidon(42)):", vasp_key);

    const proof = await tree.find(BigInt(vasp_key));
    console.log("Found:", proof.found);

    const siblings = proof.siblings.map((s) => F.toObject(s).toString());
    while (siblings.length < 20) siblings.push("0");

    const input = {
        vasp_secret: vasp_secret.toString(),
        siblings: siblings,
        vasp_key: vasp_key,
        registry_root: root,
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/c5_vasp.json",
        JSON.stringify(input, null, 2),
    );

    console.log("Input written to inputs/c5_vasp.json");
}

main().catch(console.error);
