// Run with: node scripts/build_demo_data.mjs
import { buildPoseidon, buildBabyjub, newMemEmptyTrie } from "circomlibjs";
import fs from "fs";
import path from "path";

const OUT_DIR = "scripts";

// Country codes (ISO numeric)
const PROHIBITED_CODES = [364n, 408n, 760n, 192n, 643n];

async function main() {
    const poseidon = await buildPoseidon();
    const babyJub = await buildBabyjub();
    const F = babyJub.F;

    // ── C5: VASP registry tree ──────────────────────────────────────────
    const registryTree = await newMemEmptyTrie();
    const vaspASecret = 42n;
    const vaspBSecret = 43n;
    const vaspAKey = F.toObject(poseidon([vaspASecret]));
    const vaspBKey = F.toObject(poseidon([vaspBSecret]));

    await registryTree.insert(vaspAKey, 1n);
    await registryTree.insert(vaspBKey, 1n);

    const registryRoot = F.toObject(registryTree.root);

    // ── C2: Sanctions tree ────────────────────────────────────────────────
    const sanctionsTree = await newMemEmptyTrie();
    const sanctionedEntries = [
        [111n, 19800101n, 999001n],
        [222n, 19750515n, 999002n],
    ];
    for (const [n, d, doc] of sanctionedEntries) {
        await sanctionsTree.insert(F.toObject(poseidon([n, d, doc])), 1n);
    }
    const sanctionsRoot = F.toObject(sanctionsTree.root);

    // ── C3: Jurisdiction tree ─────────────────────────────────────────────
    const jurisdictionTree = await newMemEmptyTrie();
    for (const code of PROHIBITED_CODES) {
        await jurisdictionTree.insert(F.toObject(poseidon([code])), 1n);
    }
    const prohibitedRoot = F.toObject(jurisdictionTree.root);

    // ── Write output ───
    fs.mkdirSync(OUT_DIR, { recursive: true });

    fs.writeFileSync(
        path.join(OUT_DIR, "roots.json"),
        JSON.stringify(
            {
                registry_root: registryRoot.toString(),
                sanctions_root: sanctionsRoot.toString(),
                prohibited_root: prohibitedRoot.toString(),
            },
            null,
            2,
        ),
    );

    console.log(
        "Succed! roots.json has been written to the directory:",
        OUT_DIR,
    );
    console.log("registry_root:  ", registryRoot.toString());
    console.log("sanctions_root: ", sanctionsRoot.toString());
    console.log("prohibited_root:", prohibitedRoot.toString());
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
