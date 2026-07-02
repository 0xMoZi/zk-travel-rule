const { newMemEmptyTrie, buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    const F = (await newMemEmptyTrie()).F;

    // C2: Sanctions tree
    const sanctions_tree = await newMemEmptyTrie();
    const sanctioned = [
        [111n, 19800101n, 999001n],
        [222n, 19750515n, 999002n],
        [333n, 19901230n, 999003n],
    ];
    for (const [name, dob, doc] of sanctioned) {
        const key = F.toObject(poseidon([name, dob, doc]));
        await sanctions_tree.insert(key, 1n);
    }
    const sanctions_root = F.toObject(sanctions_tree.root).toString();
    const identity_hash = F.toObject(
        poseidon([777n, 19950101n, 888001n]),
    ).toString();
    const s_proof = await sanctions_tree.find(BigInt(identity_hash));
    const s_siblings = s_proof.siblings.map((s) => F.toObject(s).toString());
    while (s_siblings.length < 20) s_siblings.push("0");

    // C3: Jurisdiction tree
    const jurisdiction_tree = await newMemEmptyTrie();
    const prohibited = [364n, 408n, 760n, 192n, 643n];
    for (const code of prohibited) {
        const key = F.toObject(poseidon([code]));
        await jurisdiction_tree.insert(key, 1n);
    }
    const prohibited_root = F.toObject(jurisdiction_tree.root).toString();
    const nationality_hash = F.toObject(poseidon([360n])).toString();
    const j_proof = await jurisdiction_tree.find(BigInt(nationality_hash));
    const j_siblings = j_proof.siblings.map((s) => F.toObject(s).toString());
    while (j_siblings.length < 20) j_siblings.push("0");

    const input = {
        user_secret: "555",

        // C2
        identity_hash: identity_hash,
        sanctions_siblings: s_siblings,
        sanctions_old_key: s_proof.notFoundKey
            ? F.toObject(s_proof.notFoundKey).toString()
            : "0",
        sanctions_old_value: s_proof.notFoundValue
            ? F.toObject(s_proof.notFoundValue).toString()
            : "0",
        sanctions_is_old0: s_proof.isOld0 ? "1" : "0",

        // C3
        nationality_hash: nationality_hash,
        jurisdiction_siblings: j_siblings,
        jurisdiction_old_key: j_proof.notFoundKey
            ? F.toObject(j_proof.notFoundKey).toString()
            : "0",
        jurisdiction_old_value: j_proof.notFoundValue
            ? F.toObject(j_proof.notFoundValue).toString()
            : "0",
        jurisdiction_is_old0: j_proof.isOld0 ? "1" : "0",

        // Public
        sanctions_root: sanctions_root,
        prohibited_root: prohibited_root,
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/smt.json",
        JSON.stringify(input, null, 2),
    );
    console.log("Input written to inputs/smt.json");
    console.log("sanctions_root:", sanctions_root);
    console.log("prohibited_root:", prohibited_root);
}

main().catch(console.error);
