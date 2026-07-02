pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";

template SanctionsCheck(levels) {

    // Private
    signal input identity_hash;
    signal input user_secret;
    signal input siblings[levels];
    signal input old_key;
    signal input old_value;
    signal input is_old0;

    // Public
    signal input sanctions_root;
    signal input tx_hash;
    signal input sender_address;

    // Output
    signal output nullifier;

    // Non-membership proof
    component smt = SMTVerifier(levels);
    smt.enabled   <== 1;
    smt.root      <== sanctions_root;
    smt.key       <== identity_hash;
    smt.value     <== 0;
    smt.fnc       <== 1;
    smt.oldKey    <== old_key;
    smt.oldValue  <== old_value;
    smt.isOld0    <== is_old0;

    for (var i = 0; i < levels; i++) {
        smt.siblings[i] <== siblings[i];
    }

    // Nullifier
    component null_hasher = Poseidon(4);
    null_hasher.inputs[0] <== user_secret;
    null_hasher.inputs[1] <== tx_hash;
    null_hasher.inputs[2] <== sender_address;
    null_hasher.inputs[3] <== 2;
    nullifier <== null_hasher.out;
}
