pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template AmountThreshold() {

    // Private
    signal input amount;
    signal input secret;

    // Public
    signal input threshold;
    signal input tx_hash;
    signal input sender_address;

    // Output
    signal output is_above_threshold;
    signal output nullifier;

    // Range check
    component amount_bits    = Num2Bits(64);
    component threshold_bits = Num2Bits(64);
    amount_bits.in    <== amount;
    threshold_bits.in <== threshold;

    // Step 2: amount >= threshold ?
    component gte = GreaterEqThan(64);
    gte.in[0] <== amount;
    gte.in[1] <== threshold;
    is_above_threshold <== gte.out;

    // Step 3: Nullifier - anti-replay
    component null_hasher = Poseidon(4);
    null_hasher.inputs[0] <== secret;
    null_hasher.inputs[1] <== tx_hash;
    null_hasher.inputs[2] <== sender_address;
    null_hasher.inputs[3] <== 4;
    nullifier <== null_hasher.out;
}
