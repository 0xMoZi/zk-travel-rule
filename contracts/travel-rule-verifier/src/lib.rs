#![no_std]

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    panic_with_error, Address, Bytes, BytesN, Env, Vec,
};

// ========================================
// TTL Constants
// ========================================
const LEDGER_DAY: u32 = 17_280;
const TTL_INSTANCE: u32 = 30 * LEDGER_DAY; // 30 days: VK, roots, admin
const TTL_NULLIFIER: u32 = 365 * LEDGER_DAY; // 1 year: nullifiers
const TTL_INTENT: u32 = LEDGER_DAY; // 1 day: intent

// ========================================
// Error types
// ========================================
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TravelRuleError {
    InvalidCoreProof = 1,
    InvalidSmtProof = 2,
    NullifierUsed = 3,
    BadPublicInputs = 4,
    Unauthorized = 5,
    RootMismatch = 6,
    TxHashMismatch = 7,
    SenderMismatch = 8,
    NotInitialized = 9,
    IntentNotFound = 10,
    IntentWrongStatus = 11,
    IntentExpired = 12,
    IntentAlreadyExists = 13,
    InvalidTxHashCommitment = 14,
}

// ========================================
// Types
// ========================================
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

#[contracttype]
#[derive(Clone)]
pub struct VerificationKey {
    pub alpha: Bn254G1Affine,
    pub beta: Bn254G2Affine,
    pub gamma: Bn254G2Affine,
    pub delta: Bn254G2Affine,
    pub ic: Vec<Bn254G1Affine>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IntentStatus {
    Pending,      // created, doesn't have a proof yet
    SenderSigned, // VASP_A submit + user_x proof valid
    Cleared,      // VASP_B counter-sign + user_y proof valid
    Rejected,     // VASP_B rejected
    Expired,      // Exceeded sequence time limit
}

#[contracttype]
#[derive(Clone)]
pub struct Intent {
    pub sender_vasp: Address,
    pub receiver_vasp: Address,
    pub tx_hash: BytesN<32>,
    pub beneficiary_id_hash: BytesN<32>,
    pub status: IntentStatus,
    pub expires_at: u32,
    pub core_proof_hash: BytesN<32>,
    pub registry_root: BytesN<32>,
    pub sanctions_root: BytesN<32>,
    pub prohibited_root: BytesN<32>,
}
// ========================================
// Storage
// ========================================
#[contracttype]
pub enum DataKey {
    Admin,
    VkCore,
    VkSmt,
    SanctionsRoot,
    ProhibitedRoot,
    RegistryRoot,
    Nullifier(BytesN<32>),
    Intent(BytesN<32>), // intent_id -> Intent
}

// ========================================
// Events
// ========================================
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentSubmittedEvent {
    #[topic]
    pub intent_id: BytesN<32>,
    pub sender_vasp: Address,
    pub receiver_vasp: Address,
    pub tx_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentClearedEvent {
    #[topic]
    pub intent_id: BytesN<32>,
    pub tx_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntentRejectedEvent {
    #[topic]
    pub intent_id: BytesN<32>,
}

// ========================================
// Contract Impl
// ========================================
#[contract]
pub struct TravelRuleVerifier;

#[contractimpl]
impl TravelRuleVerifier {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, TravelRuleError::Unauthorized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    pub fn set_vk_core(env: Env, vk: VerificationKey) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::VkCore, &vk);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    pub fn set_vk_smt(env: Env, vk: VerificationKey) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::VkSmt, &vk);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    pub fn update_sanctions_root(env: Env, root: BytesN<32>) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::SanctionsRoot, &root);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    pub fn update_prohibited_root(env: Env, root: BytesN<32>) {
        Self::require_admin(&env);
        env.storage()
            .instance()
            .set(&DataKey::ProhibitedRoot, &root);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    pub fn update_registry_root(env: Env, root: BytesN<32>) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::RegistryRoot, &root);
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);
    }

    // ========================================
    // Intent: VASP_A submit
    // ========================================
    pub fn submit_intent(
        env: Env,
        sender_vasp: Address,
        receiver_vasp: Address,
        beneficiary_id_hash: BytesN<32>,
        nonce: u64,
        core_proof: Proof,
        core_pub: Vec<Bn254Fr>,
        smt_proof: Proof,
        smt_pub: Vec<Bn254Fr>,
    ) -> Result<BytesN<32>, TravelRuleError> {
        sender_vasp.require_auth();

        let active_registry: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::RegistryRoot)
            .ok_or(TravelRuleError::NotInitialized)?;
        let active_sanctions: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::SanctionsRoot)
            .ok_or(TravelRuleError::NotInitialized)?;
        let active_prohibited: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::ProhibitedRoot)
            .ok_or(TravelRuleError::NotInitialized)?;

        let tx_hash_bytes = Self::verify_proof_internal(
            &env,
            &core_proof,
            &core_pub,
            &smt_proof,
            &smt_pub,
            active_registry.clone(),
            active_sanctions.clone(),
            active_prohibited.clone(),
        )?;

        let mut commitment_payload = Bytes::new(&env);
        commitment_payload.append(&sender_vasp.clone().to_xdr(&env));
        commitment_payload.append(&receiver_vasp.clone().to_xdr(&env));
        commitment_payload.append(&Bytes::from_array(&env, &beneficiary_id_hash.to_array()));

        let raw_tx_hash: BytesN<32> = env.crypto().sha256(&commitment_payload).into();
        // Mask the most significant byte to guarantee the value fits within the
        // BN254 scalar field (~254 bits), since the circuit's tx_hash public
        // input is a field element and cannot represent the full 256-bit sha256
        // output. This must exactly match the masking applied client-side when
        // the proof's tx_hash public input was computed.
        let mut masked_bytes = raw_tx_hash.to_array();
        masked_bytes[0] = 0;
        let computed_tx_hash: BytesN<32> = BytesN::from_array(&env, &masked_bytes);

        if computed_tx_hash != tx_hash_bytes {
            return Err(TravelRuleError::InvalidTxHashCommitment);
        }

        let mut intent_payload = Bytes::new(&env);
        intent_payload.append(&tx_hash_bytes.clone().into());
        intent_payload.append(&Bytes::from_array(&env, &nonce.to_be_bytes())); // Gabungkan nonce di sini

        // intent_id sekarang dijamin unik setiap kali disubmit, walaupun proof ZK-nya sama!
        let intent_id: BytesN<32> = env.crypto().sha256(&intent_payload).into();

        if env
            .storage()
            .persistent()
            .has(&DataKey::Intent(intent_id.clone()))
        {
            return Err(TravelRuleError::IntentAlreadyExists);
        }

        let core_proof_bytes = core_proof.to_xdr(&env);
        let real_core_proof_hash: BytesN<32> = env.crypto().sha256(&core_proof_bytes).into();

        let intent = Intent {
            sender_vasp: sender_vasp.clone(),
            receiver_vasp: receiver_vasp.clone(),
            tx_hash: tx_hash_bytes.clone(),
            beneficiary_id_hash: beneficiary_id_hash.clone(),
            status: IntentStatus::SenderSigned,
            expires_at: env.ledger().sequence() + TTL_INTENT,
            core_proof_hash: real_core_proof_hash,
            registry_root: active_registry,
            sanctions_root: active_sanctions,
            prohibited_root: active_prohibited,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Intent(intent_id.clone()), &intent);
        env.storage().persistent().extend_ttl(
            &DataKey::Intent(intent_id.clone()),
            TTL_INTENT,
            TTL_INTENT,
        );

        env.events().publish_event(&IntentSubmittedEvent {
            intent_id: intent_id.clone(),
            sender_vasp,
            receiver_vasp,
            tx_hash: tx_hash_bytes,
        });

        Ok(intent_id)
    }

    // ========================================
    // Intent: VASP_B Counter-Sign
    // ========================================
    pub fn counter_sign(
        env: Env,
        receiver_vasp: Address,
        intent_id: BytesN<32>,
        core_proof: Proof,
        core_pub: Vec<Bn254Fr>,
        smt_proof: Proof,
        smt_pub: Vec<Bn254Fr>,
    ) -> Result<bool, TravelRuleError> {
        receiver_vasp.require_auth();

        let mut intent: Intent = env
            .storage()
            .persistent()
            .get(&DataKey::Intent(intent_id.clone()))
            .ok_or(TravelRuleError::IntentNotFound)?;

        if intent.status != IntentStatus::SenderSigned {
            return Err(TravelRuleError::IntentWrongStatus);
        }
        if env.ledger().sequence() > intent.expires_at {
            return Err(TravelRuleError::IntentExpired);
        }
        if intent.receiver_vasp != receiver_vasp {
            return Err(TravelRuleError::Unauthorized);
        }

        let beneficiary_tx_hash = Self::verify_proof_internal(
            &env,
            &core_proof,
            &core_pub,
            &smt_proof,
            &smt_pub,
            intent.registry_root.clone(),
            intent.sanctions_root.clone(),
            intent.prohibited_root.clone(),
        )?;

        if beneficiary_tx_hash != intent.tx_hash {
            return Err(TravelRuleError::TxHashMismatch);
        }

        if core_pub.get(0).unwrap().to_bytes() != intent.beneficiary_id_hash {
            return Err(TravelRuleError::Unauthorized);
        }

        intent.status = IntentStatus::Cleared;
        env.storage()
            .persistent()
            .set(&DataKey::Intent(intent_id.clone()), &intent);
        env.storage().persistent().extend_ttl(
            &DataKey::Intent(intent_id.clone()),
            TTL_INTENT,
            TTL_INTENT,
        );
        env.storage()
            .instance()
            .extend_ttl(TTL_INSTANCE, TTL_INSTANCE);

        env.events().publish_event(&IntentClearedEvent {
            intent_id,
            tx_hash: intent.tx_hash,
        });

        Ok(true)
    }

    // ========================================
    // Intent: VASP_B Reject
    // ========================================
    pub fn reject_intent(
        env: Env,
        receiver_vasp: Address,
        intent_id: BytesN<32>,
    ) -> Result<(), TravelRuleError> {
        receiver_vasp.require_auth();

        let mut intent: Intent = env
            .storage()
            .persistent()
            .get(&DataKey::Intent(intent_id.clone()))
            .ok_or(TravelRuleError::IntentNotFound)?;

        if intent.status != IntentStatus::SenderSigned {
            return Err(TravelRuleError::IntentWrongStatus);
        }
        if intent.receiver_vasp != receiver_vasp {
            return Err(TravelRuleError::Unauthorized);
        }

        intent.status = IntentStatus::Rejected;
        env.storage()
            .persistent()
            .set(&DataKey::Intent(intent_id.clone()), &intent);

        env.events()
            .publish_event(&IntentRejectedEvent { intent_id });

        Ok(())
    }

    // ========================================
    // View Functions
    // ========================================

    pub fn get_intent(env: Env, intent_id: BytesN<32>) -> Option<Intent> {
        env.storage().persistent().get(&DataKey::Intent(intent_id))
    }

    pub fn is_cleared(env: Env, intent_id: BytesN<32>) -> bool {
        match env
            .storage()
            .persistent()
            .get::<DataKey, Intent>(&DataKey::Intent(intent_id))
        {
            Some(intent) => intent.status == IntentStatus::Cleared,
            None => false,
        }
    }

    pub fn expire_intent(env: Env, intent_id: BytesN<32>) -> Result<(), TravelRuleError> {
        let mut intent: Intent = env
            .storage()
            .persistent()
            .get(&DataKey::Intent(intent_id.clone()))
            .ok_or(TravelRuleError::IntentNotFound)?;

        if intent.status != IntentStatus::SenderSigned {
            return Err(TravelRuleError::IntentWrongStatus);
        }
        if env.ledger().sequence() <= intent.expires_at {
            return Err(TravelRuleError::IntentWrongStatus);
        }

        intent.status = IntentStatus::Expired;
        env.storage()
            .persistent()
            .set(&DataKey::Intent(intent_id), &intent);
        Ok(())
    }

    // ========================================
    // Internal Functions
    // ========================================

    // core_pub layout (12 elements):
    //   [0]  credential_hash
    //   [1]  is_above_threshold
    //   [2]  nullifier_c1
    //   [3]  nullifier_c4
    //   [4]  nullifier_c5
    //   [5]  vasp_Ax
    //   [6]  vasp_Ay
    //   [7]  vasp_key
    //   [8]  registry_root
    //   [9]  threshold
    //   [10] tx_hash
    //   [11] sender_address
    //
    // smt_pub layout (6 elements):
    //   [0]  nullifier_c2
    //   [1]  nullifier_c3
    //   [2]  sanctions_root
    //   [3]  prohibited_root
    //   [4]  tx_hash
    //   [5]  sender_address
    fn verify_proof_internal(
        env: &Env,
        core_proof: &Proof,
        core_pub: &Vec<Bn254Fr>,
        smt_proof: &Proof,
        smt_pub: &Vec<Bn254Fr>,
        expected_registry: BytesN<32>,
        expected_sanctions: BytesN<32>,
        expected_prohibited: BytesN<32>,
    ) -> Result<BytesN<32>, TravelRuleError> {
        if core_pub.len() != 12 || smt_pub.len() != 6 {
            return Err(TravelRuleError::BadPublicInputs);
        }

        let tx_hash_fr = core_pub.get(10).unwrap();
        let sender_fr = core_pub.get(11).unwrap();

        // Cross-signal matching
        if tx_hash_fr != smt_pub.get(4).unwrap() {
            return Err(TravelRuleError::TxHashMismatch);
        }
        if sender_fr != smt_pub.get(5).unwrap() {
            return Err(TravelRuleError::SenderMismatch);
        }

        if core_pub.get(8).unwrap().to_bytes() != expected_registry
            || smt_pub.get(2).unwrap().to_bytes() != expected_sanctions
            || smt_pub.get(3).unwrap().to_bytes() != expected_prohibited
        {
            return Err(TravelRuleError::RootMismatch);
        }

        let nullifier_keys: [BytesN<32>; 5] = [
            core_pub.get(2).unwrap().to_bytes(),
            core_pub.get(3).unwrap().to_bytes(),
            core_pub.get(4).unwrap().to_bytes(),
            smt_pub.get(0).unwrap().to_bytes(),
            smt_pub.get(1).unwrap().to_bytes(),
        ];

        for key in &nullifier_keys {
            if env
                .storage()
                .persistent()
                .has(&DataKey::Nullifier(key.clone()))
            {
                return Err(TravelRuleError::NullifierUsed);
            }
        }

        let vk_core: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::VkCore)
            .ok_or(TravelRuleError::NotInitialized)?;
        if !Self::groth16_verify(env, core_proof, core_pub, &vk_core) {
            return Err(TravelRuleError::InvalidCoreProof);
        }

        let vk_smt: VerificationKey = env
            .storage()
            .instance()
            .get(&DataKey::VkSmt)
            .ok_or(TravelRuleError::NotInitialized)?;
        if !Self::groth16_verify(env, smt_proof, smt_pub, &vk_smt) {
            return Err(TravelRuleError::InvalidSmtProof);
        }

        for key in &nullifier_keys {
            let storage_key = DataKey::Nullifier(key.clone());

            env.storage().persistent().set(&storage_key, &true);

            env.storage()
                .persistent()
                .extend_ttl(&storage_key, TTL_NULLIFIER, TTL_NULLIFIER);
        }

        Ok(tx_hash_fr.to_bytes())
    }

    fn groth16_verify(
        env: &Env,
        proof: &Proof,
        pub_signals: &Vec<Bn254Fr>,
        vk: &VerificationKey,
    ) -> bool {
        if vk.ic.len() != pub_signals.len() + 1 {
            return false;
        }

        let bn = env.crypto().bn254();
        let mut vk_x = match vk.ic.get(0) {
            Some(p) => p,
            None => return false,
        };

        for (s, v) in pub_signals.iter().zip(vk.ic.iter().skip(1)) {
            let prod = bn.g1_mul(&v, &s);
            vk_x = bn.g1_add(&vk_x, &prod);
        }

        let neg_a = -proof.a.clone();
        let g1 = soroban_sdk::vec![env, neg_a, vk.alpha.clone(), vk_x, proof.c.clone()];
        let g2 = soroban_sdk::vec![
            env,
            proof.b.clone(),
            vk.beta.clone(),
            vk.gamma.clone(),
            vk.delta.clone(),
        ];

        bn.pairing_check(g1, g2)
    }

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, TravelRuleError::NotInitialized));
        admin.require_auth();
    }
}

mod test;
