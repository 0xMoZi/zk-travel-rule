const ERRORS = {
    1: {
        name: "InvalidCoreProof",
        msg: "Core proof (identity/amount/VASP) failed on-chain verification.",
    },
    2: {
        name: "InvalidSmtProof",
        msg: "SMT proof failed — sender nationality may be in prohibited jurisdiction list.",
    },
    3: {
        name: "NullifierUsed",
        msg: "This proof has already been submitted (replay detected).",
    },
    4: {
        name: "BadPublicInputs",
        msg: "Wrong number of public signals in proof.",
    },
    5: {
        name: "Unauthorized",
        msg: "Transaction signer is not authorized for this action.",
    },
    6: {
        name: "RootMismatch",
        msg: "Proof roots do not match current on-chain registry/sanctions/prohibited roots.",
    },
    7: {
        name: "TxHashMismatch",
        msg: "tx_hash mismatch between Core and SMT proofs.",
    },
    8: {
        name: "SenderMismatch",
        msg: "sender_address mismatch between Core and SMT proofs.",
    },
    9: {
        name: "NotInitialized",
        msg: "Contract not fully initialized (VK or roots missing).",
    },
    10: { name: "IntentNotFound", msg: "Intent not found." },
    11: {
        name: "IntentWrongStatus",
        msg: "Intent is not in the expected status for this action.",
    },
    12: { name: "IntentExpired", msg: "Intent has expired (TTL exceeded)." },
    13: {
        name: "IntentAlreadyExists",
        msg: "An intent with this tx_hash already exists.",
    },
    14: {
        name: "InvalidTxHashCommitment",
        msg: "tx_hash commitment mismatch — proof does not match sender/receiver/beneficiary.",
    },
};

export function describeError(err) {
    const raw = err?.message ?? String(err);
    const m = raw.match(/Error\(Contract,\s*#(\d+)\)/);
    if (m) {
        const code = parseInt(m[1]);
        return ERRORS[code] ?? { name: `ContractError#${code}`, msg: raw };
    }
    return { name: "Error", msg: raw };
}
