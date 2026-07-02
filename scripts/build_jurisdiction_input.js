const { newMemEmptyTrie, buildPoseidon } = require("circomlibjs");

async function main() {
    const poseidon = await buildPoseidon();
    const tree = await newMemEmptyTrie();
    const F = tree.F;

    // list prohibited countrys
    // Iran=364, North Korea=408, Syria=760, Cuba=192, Russia=643
    const prohibited = [364n, 408n, 760n, 192n, 643n];

    for (const code of prohibited) {
        const key = F.toObject(poseidon([code]));
        await tree.insert(key, 1n);
    }

    const root = F.toObject(tree.root).toString();
    console.log("Prohibited Root:", root);

    // User nationality: Indonesia=360
    const user_nationality = 360n;
    const nationality_hash = F.toObject(
        poseidon([user_nationality]),
    ).toString();
    console.log("Nationality hash (ID):", nationality_hash);

    // Non-membership proof
    const proof = await tree.find(BigInt(nationality_hash));
    console.log("Found (harus false):", proof.found);

    const siblings = proof.siblings.map((s) => F.toObject(s).toString());
    while (siblings.length < 20) siblings.push("0");

    const input = {
        nationality_hash: nationality_hash,
        user_secret: "777",
        siblings: siblings,
        old_key: proof.notFoundKey
            ? F.toObject(proof.notFoundKey).toString()
            : "0",
        old_value: proof.notFoundValue
            ? F.toObject(proof.notFoundValue).toString()
            : "0",
        is_old0: proof.isOld0 ? "1" : "0",
        prohibited_root: root,
        tx_hash: "123456789",
        sender_address: "999888777",
    };

    require("fs").writeFileSync(
        "inputs/c3_jurisdiction.json",
        JSON.stringify(input, null, 2),
    );

    console.log("Input written to inputs/c3_jurisdiction.json");
}

main().catch(console.error);
