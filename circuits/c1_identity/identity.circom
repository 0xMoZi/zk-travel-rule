pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/eddsaposeidon.circom";

template IdentityCredential() {

    // Private
    signal input name_hash;
    signal input dob_hash;
    signal input nationality_hash;
    signal input user_secret;       // dedicated secret for nullifier
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    // Public
    signal input vasp_Ax;
    signal input vasp_Ay;
    signal input tx_hash;
    signal input sender_address;

    // Output
    signal output credential_hash;
    signal output nullifier;

    // Step 1: Hash PII -> one field element
    component hasher = Poseidon(3);
    hasher.inputs[0] <== name_hash;
    hasher.inputs[1] <== dob_hash;
    hasher.inputs[2] <== nationality_hash;
    credential_hash <== hasher.out;

    // Step 2: Verify EdDSA signature for credential_hash
    // VASP signs credential_hash with its private key
    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.M       <== credential_hash;
    verifier.Ax      <== vasp_Ax;
    verifier.Ay      <== vasp_Ay;
    verifier.R8x     <== sig_R8x;
    verifier.R8y     <== sig_R8y;
    verifier.S       <== sig_S;

    // Step 3: Nullifier from user_secret + tx_hash
    // user_secret is different per user -> nullifier is unique per user per transaction
    component null_hasher = Poseidon(4);
    null_hasher.inputs[0] <== user_secret;
    null_hasher.inputs[1] <== tx_hash;
    null_hasher.inputs[2] <== sender_address;
    null_hasher.inputs[3] <== 1;  // circuit ID: 1 = identity
    nullifier <== null_hasher.out;
}
