//! Coverage for idempotent key-bundle maintenance
//! ([`tinyplace::signal::maintain::maintain_keys`]): it (re)publishes on first
//! boot / a depleted pool, and is a no-op when the store already backs a healthy
//! published set — the anti-orphan invariant.

mod common;

use common::{all_requests, client_for, test_signer};
use serde_json::json;
use wiremock::matchers::method;
use wiremock::{Mock, MockServer, ResponseTemplate};

use tinyplace::signal::crypto::generate_x25519_keypair;
use tinyplace::signal::maintain::{maintain_keys, MaintainPolicy};
use tinyplace::signal::memory_store::MemorySessionStore;
use tinyplace::Signer;

/// A relay mock whose `GET /health` reports `one_time_count` one-time pre-keys,
/// and whose `PUT`s (rotate signed pre-key / upload one-time) return `null`.
async fn relay_with_health(one_time_count: i64) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "agentId": "x",
            "oneTimePreKeyCount": one_time_count,
            "lowOneTimePreKeys": one_time_count < 5,
        })))
        .mount(&server)
        .await;
    Mock::given(method("PUT"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!(null)))
        .mount(&server)
        .await;
    server
}

#[tokio::test]
async fn maintain_keys_publishes_once_then_no_ops_when_healthy() {
    let server = relay_with_health(20).await;
    let client = client_for(&server);
    let signer = test_signer();
    let store = MemorySessionStore::new(generate_x25519_keypair());
    let agent_id = signer.agent_id();
    let policy = MaintainPolicy::default();

    // First call: empty store → (re)publish a full bundle.
    let first = maintain_keys(
        &client.keys,
        &store,
        signer.as_ref(),
        &agent_id,
        "identity-key",
        &policy,
    )
    .await
    .unwrap();
    assert!(!first.was_healthy);
    assert!(first.rotated_signed);
    assert_eq!(first.uploaded_one_time, 20);

    // Second call: the store now holds a signed pre-key AND the relay pool is
    // healthy → NO-OP. Not republishing is what avoids orphaning served keys.
    let second = maintain_keys(
        &client.keys,
        &store,
        signer.as_ref(),
        &agent_id,
        "identity-key",
        &policy,
    )
    .await
    .unwrap();
    assert!(second.was_healthy);
    assert_eq!(second.uploaded_one_time, 0);

    // On the wire: exactly ONE one-time upload across both calls.
    let uploads = all_requests(&server)
        .await
        .into_iter()
        .filter(|r| r.method.as_str() == "PUT" && r.url.path().ends_with("/prekeys"))
        .count();
    assert_eq!(uploads, 1, "idempotent maintain uploads only once");
}

#[tokio::test]
async fn maintain_keys_refills_a_depleted_pool() {
    // The relay reports an empty pool (every one-time key consumed by peers).
    let server = relay_with_health(0).await;
    let client = client_for(&server);
    let signer = test_signer();
    let store = MemorySessionStore::new(generate_x25519_keypair());
    let agent_id = signer.agent_id();
    let policy = MaintainPolicy::default();

    maintain_keys(
        &client.keys,
        &store,
        signer.as_ref(),
        &agent_id,
        "identity-key",
        &policy,
    )
    .await
    .unwrap();

    // Store now holds a signed pre-key, but the relay pool is empty → republish
    // rather than no-op, so new peers can still complete a full X3DH.
    let again = maintain_keys(
        &client.keys,
        &store,
        signer.as_ref(),
        &agent_id,
        "identity-key",
        &policy,
    )
    .await
    .unwrap();
    assert!(!again.was_healthy);
    assert_eq!(again.uploaded_one_time, 20);
}
