pragma circom 2.0.0;

include "../c1_identity/identity.circom";
include "../c4_amount/amount.circom";
include "../c5_vasp/vasp.circom";

template TravelRuleCore(levels) {

    // C1 signals
    signal input name_hash;
    signal input dob_hash;
    signal input nationality_hash;
    signal input user_secret;
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    // C4 signals
    signal input amount;

    // C5 signals
    signal input vasp_secret;
    signal input vasp_siblings[levels];

    // Public
    signal input vasp_Ax;
    signal input vasp_Ay;
    signal input vasp_key;
    signal input registry_root;
    signal input threshold;
    signal input tx_hash;
    signal input sender_address;

    // Outputs
    signal output credential_hash;
    signal output is_above_threshold;
    signal output nullifier_c1;
    signal output nullifier_c4;
    signal output nullifier_c5;

    // C1
    component c1 = IdentityCredential();
    c1.name_hash         <== name_hash;
    c1.dob_hash          <== dob_hash;
    c1.nationality_hash  <== nationality_hash;
    c1.user_secret       <== user_secret;
    c1.sig_R8x           <== sig_R8x;
    c1.sig_R8y           <== sig_R8y;
    c1.sig_S             <== sig_S;
    c1.vasp_Ax           <== vasp_Ax;
    c1.vasp_Ay           <== vasp_Ay;
    c1.tx_hash           <== tx_hash;
    c1.sender_address    <== sender_address;
    credential_hash      <== c1.credential_hash;
    nullifier_c1         <== c1.nullifier;

    // C4
    component c4 = AmountThreshold();
    c4.amount            <== amount;
    c4.secret            <== user_secret;
    c4.threshold         <== threshold;
    c4.tx_hash           <== tx_hash;
    c4.sender_address    <== sender_address;
    is_above_threshold   <== c4.is_above_threshold;
    nullifier_c4         <== c4.nullifier;

    // C5
    component c5 = VASPAuthorization(levels);
    c5.vasp_secret       <== vasp_secret;
    c5.vasp_key          <== vasp_key;
    c5.registry_root     <== registry_root;
    c5.tx_hash           <== tx_hash;
    c5.sender_address    <== sender_address;

    for (var i = 0; i < levels; i++) {
        c5.siblings[i]   <== vasp_siblings[i];
    }

    // Output diakses setelah semua input assigned
    nullifier_c5         <== c5.nullifier;
}

component main {
    public [vasp_Ax, vasp_Ay, vasp_key, registry_root, threshold, tx_hash, sender_address]
} = TravelRuleCore(20);
