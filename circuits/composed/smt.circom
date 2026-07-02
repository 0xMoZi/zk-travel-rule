pragma circom 2.0.0;

include "../c2_sanction/sanction.circom";
include "../c3_jurisdiction/jurisdiction.circom";

template TravelRuleSMT(levels) {

    // ── Private ───────────────────────────────────────────────────────────
    signal input user_secret;           // satu secret untuk C2 dan C3
    signal input identity_hash;
    signal input sanctions_siblings[levels];
    signal input sanctions_old_key;
    signal input sanctions_old_value;
    signal input sanctions_is_old0;

    signal input nationality_hash;
    signal input jurisdiction_siblings[levels];
    signal input jurisdiction_old_key;
    signal input jurisdiction_old_value;
    signal input jurisdiction_is_old0;

    // ── Public ────────────────────────────────────────────────────────────
    signal input sanctions_root;
    signal input prohibited_root;
    signal input tx_hash;
    signal input sender_address;

    // ── Outputs ───────────────────────────────────────────────────────────
    signal output nullifier_c2;
    signal output nullifier_c3;

    // ── C2 ────────────────────────────────────────────────────────────────
    component c2 = SanctionsCheck(levels);
    c2.identity_hash  <== identity_hash;
    c2.user_secret    <== user_secret;
    c2.sanctions_root <== sanctions_root;
    c2.tx_hash        <== tx_hash;
    c2.sender_address <== sender_address;
    c2.old_key        <== sanctions_old_key;
    c2.old_value      <== sanctions_old_value;
    c2.is_old0        <== sanctions_is_old0;

    for (var i = 0; i < levels; i++) {
        c2.siblings[i] <== sanctions_siblings[i];
    }

    nullifier_c2 <== c2.nullifier;

    // ── C3 ────────────────────────────────────────────────────────────────
    component c3 = JurisdictionCheck(levels);
    c3.nationality_hash <== nationality_hash;
    c3.user_secret      <== user_secret;
    c3.prohibited_root  <== prohibited_root;
    c3.tx_hash          <== tx_hash;
    c3.sender_address   <== sender_address;
    c3.old_key          <== jurisdiction_old_key;
    c3.old_value        <== jurisdiction_old_value;
    c3.is_old0          <== jurisdiction_is_old0;

    for (var i = 0; i < levels; i++) {
        c3.siblings[i] <== jurisdiction_siblings[i];
    }

    nullifier_c3 <== c3.nullifier;
}

component main {
    public [sanctions_root, prohibited_root, tx_hash, sender_address]
} = TravelRuleSMT(20);
