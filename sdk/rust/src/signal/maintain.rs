//! Idempotent key-bundle maintenance.
//!
//! Reconciles an agent's *published* pre-key bundle (on the relay) with the
//! private material in its [`SessionStore`], generating and uploading keys ONLY
//! when the relay actually needs them.
//!
//! This is the anti-orphan invariant. Blindly republishing a fresh bundle on
//! every start leaves the relay advertising one-time pre-keys whose private
//! halves a rotated or wiped store can no longer back, so a peer's X3DH against
//! that bundle fails with a MAC error and its first message is silently dropped.
//! Storing the private material locally *before* uploading, and skipping the
//! upload entirely when the store already backs a healthy published set,
//! guarantees the relay never serves a key this agent cannot answer.

use std::time::{SystemTime, UNIX_EPOCH};

use crate::api::keys::KeysApi;
use crate::error::Result;
use crate::signal::keys::{generate_pre_keys, generate_signed_pre_key, serialize_pre_key};
use crate::signal::store::SessionStore;
use crate::signer::Signer;
use crate::types::{PreKeysRequest, SignedPreKeyRequest};

/// Tuning for [`maintain_keys`].
#[derive(Debug, Clone)]
pub struct MaintainPolicy {
    /// How many one-time pre-keys to (re)publish in a batch when the pool needs
    /// filling.
    pub one_time_batch: usize,
}

impl Default for MaintainPolicy {
    fn default() -> Self {
        Self { one_time_batch: 20 }
    }
}

/// What [`maintain_keys`] did on a call.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct KeyMaintenance {
    /// The store already held a signed pre-key and the relay's one-time pool was
    /// healthy, so nothing was published — the common restart path.
    pub was_healthy: bool,
    /// A fresh signed pre-key was generated and rotated on the relay.
    pub rotated_signed: bool,
    /// How many one-time pre-keys were generated and uploaded.
    pub uploaded_one_time: usize,
}

/// Idempotently reconcile `agent_id`'s published key bundle with the relay.
///
/// Safe to call on every boot and periodically — it publishes only when the
/// relay actually needs it:
///
/// - **No-op** when the store already holds a signed pre-key AND the relay
///   reports a non-empty, not-low one-time pool. *Not* republishing here is what
///   prevents orphaning.
/// - **(Re)publish** on first boot, a store that lost its keys, or a low/empty
///   relay pool: generate a signed pre-key plus `policy.one_time_batch` one-time
///   pre-keys, store the private halves locally, then rotate + upload the public
///   parts.
///
/// `identity_key_base64` is the agent's base64 Ed25519 identity key; the relay
/// verifies each published key's signature against it.
///
/// # Errors
///
/// Returns the underlying error if key generation, a store write, the signed
/// pre-key rotation, or the one-time upload fails. A failed *health* check is
/// treated as "cannot confirm healthy" and falls through to a (re)publish rather
/// than erroring, so a transient relay blip never leaves the agent unpublished.
pub async fn maintain_keys(
    keys: &KeysApi,
    store: &dyn SessionStore,
    signer: &dyn Signer,
    agent_id: &str,
    identity_key_base64: &str,
    policy: &MaintainPolicy,
) -> Result<KeyMaintenance> {
    // A signed pre-key in the store means we've published before and can back
    // what the relay serves. If the relay's one-time pool is also healthy, there
    // is nothing to do — and NOT republishing is precisely what avoids orphaning.
    if store.active_signed_pre_key().await.is_ok() {
        if let Ok(health) = keys.health(agent_id).await {
            if !health.low_one_time_pre_keys && health.one_time_pre_key_count > 0 {
                return Ok(KeyMaintenance {
                    was_healthy: true,
                    ..Default::default()
                });
            }
        }
    }

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Signed pre-key: (re)generate, store the private half, then rotate on the
    // relay so peers pick up the new public half.
    let spk = generate_signed_pre_key(signer, &format!("spk_{now_secs}")).await?;
    store.store_signed_pre_key(spk.clone()).await?;
    keys.rotate_signed_pre_key(
        agent_id,
        &SignedPreKeyRequest {
            identity_key: Some(identity_key_base64.to_string()),
            signed_pre_key: serialize_pre_key(&spk),
        },
    )
    .await?;

    // One-time pre-keys: generate a batch, store the private halves BEFORE upload
    // so the relay never advertises a key the store cannot back, then upload the
    // public parts.
    let one_time = generate_pre_keys(signer, now_secs, policy.one_time_batch).await?;
    for key in &one_time {
        store.store_pre_key(key.clone()).await?;
    }
    keys.upload_pre_keys(
        agent_id,
        &PreKeysRequest {
            identity_key: Some(identity_key_base64.to_string()),
            pre_keys: one_time.iter().map(serialize_pre_key).collect(),
        },
    )
    .await?;

    Ok(KeyMaintenance {
        was_healthy: false,
        rotated_signed: true,
        uploaded_one_time: one_time.len(),
    })
}
