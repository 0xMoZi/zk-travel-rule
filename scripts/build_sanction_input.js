const { newMemEmptyTrie, buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    const tree = await newMemEmptyTrie();
    const F = tree.F;

    // Sanctioned individuals (dummy data)
    const sanctioned = [
        [111n, 19800101n, 999001n], // Person A
        [222n, 19750515n, 999002n], // Person B
        [333n, 19901230n, 999003n], // Person C
        [444n, 19650420n, 999004n], // Person D
        [555n, 19851111n, 999005n], // Person E
    ];

    for (const [name, dob, doc] of sanctioned) {
        const key = F.toObject(poseidon([name, dob, doc]));
        await tree.insert(key, 1n);
    }

    const root = F.toObject(tree.root).toString();
    console.log("Sanctions Root:", root);

    const user_name = 777n;
    const user_dob = 19950101n;
    const user_doc = 888001n;
    const identity_hash = F.toObject(
        poseidon([user_name, user_dob, user_doc]),
    ).toString();
    console.log("Identity hash:", identity_hash);

    const proof = await tree.find(BigInt(identity_hash));
    console.log("Found (harus false):", proof.found);

    const siblings = proof.siblings.map((s) => F.toObject(s).toString());
    while (siblings.length < 20) siblings.push("0");

    const input = {
        identity_hash: identity_hash,
        user_secret: "555",
        siblings: siblings,
        old_key: proof.notFoundKey
            ? F.toObject(proof.notFoundKey).toString()
            : "0",
        old_value: proof.notFoundValue
            ? F.toObject(proof.notFoundValue).toString()
            : "0",
        is_old0: proof.isOld0 ? "1" : "0",
        sanctions_root: root,
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/c2_sanctions.json",
        JSON.stringify(input, null, 2),
    );

    console.log("Input written to inputs/c2_sanctions.json");
}

main().catch(console.error);
