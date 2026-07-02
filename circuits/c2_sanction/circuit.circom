pragma circom 2.0.0;

include "sanction.circom";

component main {
    public [sanctions_root, tx_hash, sender_address]
} = SanctionsCheck(20);
