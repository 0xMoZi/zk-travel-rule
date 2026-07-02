pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";

template JurisdictionCheck(levels) {

    // Private
    signal input nationality_hash;
    signal input user_secret;
    signal input siblings[levels];
    signal input old_key;
    signal input old_value;
    signal input is_old0;

    // Public
    signal input prohibited_root;
    signal input tx_hash;
    signal input sender_address;

    // Output
    signal output nullifier;

    // Step 1: Non-membership proof
    // Proof nationality_hash NOT IN the prohibited countries list
    component smt = SMTVerifier(levels);
    smt.enabled   <== 1;
    smt.root      <== prohibited_root;
    smt.key       <== nationality_hash;
    smt.value     <== 0;
    smt.fnc       <== 1;
    smt.oldKey    <== old_key;
    smt.oldValue  <== old_value;
    smt.isOld0    <== is_old0;

    for (var i = 0; i < levels; i++) {
        smt.siblings[i] <== siblings[i];
    }

    // Step 2: Nullifier
    component null_hasher = Poseidon(4);
    null_hasher.inputs[0] <== user_secret;
    null_hasher.inputs[1] <== tx_hash;
    null_hasher.inputs[2] <== sender_address;
    null_hasher.inputs[3] <== 3;
    nullifier <== null_hasher.out;
}
