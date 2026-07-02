pragma circom 2.0.0;

include "amount.circom";

component main {
    public [threshold, tx_hash, sender_address]
} = AmountThreshold();
