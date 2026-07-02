pragma circom 2.0.0;

include "jurisdiction.circom";

component main {
    public [prohibited_root, tx_hash, sender_address]
} = JurisdictionCheck(20);
