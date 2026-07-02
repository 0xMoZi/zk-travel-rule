pragma circom 2.0.0;

include "vasp.circom";

component main {
    public [vasp_key, registry_root, tx_hash, sender_address]
} = VASPAuthorization(20);
