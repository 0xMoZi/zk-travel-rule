pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";

template VASPAuthorization(levels) {

    // Private
    signal input vasp_secret;
    signal input siblings[levels];

    // Public
    signal input vasp_key;
    signal input registry_root;
    signal input tx_hash;
    signal input sender_address;

    // Output
    signal output nullifier;

    // Step 1: Binding vasp_key to vasp_secret
    // Prevents the use of a vasp_key belonging to another VASP
    component key_derivation = Poseidon(1);
    key_derivation.inputs[0] <== vasp_secret;
    vasp_key === key_derivation.out;

    // Step 2: SMT Inclusion Proof
    component smt = SMTVerifier(levels);
    smt.enabled   <== 1;
    smt.root      <== registry_root;
    smt.key       <== vasp_key;
    smt.value     <== 1;
    smt.fnc       <== 0;
    smt.oldKey    <== 0;
    smt.oldValue  <== 0;
    smt.isOld0    <== 0;

    for (var i = 0; i < levels; i++) {
        smt.siblings[i] <== siblings[i];
    }

    // Step 3: Nullifier
    component null_hasher = Poseidon(4);
    null_hasher.inputs[0] <== vasp_secret;
    null_hasher.inputs[1] <== tx_hash;
    null_hasher.inputs[2] <== sender_address;
    null_hasher.inputs[3] <== 5;
    nullifier <== null_hasher.out;
}
