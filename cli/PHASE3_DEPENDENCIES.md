# Phase 3 Dependency Plan

This document locks the dependency and implementation plan for native `pmdocs`
Phase 3 before protocol work starts. Phase 3 adds `keygen`, signed `push`, HTTP
transport, endpoint validation, and GitHub OIDC support.

## Dependency Stack

Use this stack by default:

- `libcurl` for HTTP and URL parsing/validation.
- OpenSSL 3 for SHA-256, Ed25519 key generation, Ed25519 signing, PEM
  parsing/serialization, base64 helpers where useful, and random/key material
  handling.
- Existing `nlohmann_json` for JSON.
- Existing `CLI11` for command parsing.
- Existing `doctest` for tests.

Do not add Boost, cpr, curlpp, cpp-httplib, Poco, Qt, Botan, yaml-cpp,
libsodium, or other dependencies unless there is a specific reviewed reason.

## Package Names

Debian/Ubuntu development packages:

```bash
sudo apt install -y libcurl4-openssl-dev libssl-dev
```

Homebrew development packages:

```bash
brew install curl openssl@3
```

On Homebrew systems, `curl` and `openssl@3` may be keg-only. If Meson cannot
discover them locally, use `pkg-config` paths from Homebrew rather than
hardcoded prefixes:

```bash
export PKG_CONFIG_PATH="$(brew --prefix curl)/lib/pkgconfig:$(brew --prefix openssl@3)/lib/pkgconfig:$PKG_CONFIG_PATH"
```

Formulae should express these as dependencies instead of relying on user shell
state.

## Meson

Phase 3 has started. The native Meson build now detects these dependencies:

```meson
curl_dep = dependency('libcurl', required: true)
openssl_dep = dependency('openssl', required: true)
```

Keep any macOS/Homebrew detection adjustments localized and documented. Do not
vendor libcurl or OpenSSL.

## OpenSSL Rules

Use OpenSSL EVP APIs. Do not use low-level deprecated crypto APIs.

Use OpenSSL for:

- SHA-256 body hashing.
- Ed25519 key generation.
- Ed25519 signing.
- Ed25519 verification test vectors.
- PEM private/public key read/write.
- Base64 conversion if useful.

Ed25519 signing with OpenSSL EVP signs the canonical message directly. Do not
pre-hash the canonical signing string unless the existing TypeScript/server
protocol explicitly does that.

Expected signing flow:

1. Build request body JSON.
2. Compute `body_sha256` over the exact request body bytes.
3. Build the canonical signing string using method, path, timestamp, nonce, key
   id, and body hash.
4. Sign the canonical signing string bytes with Ed25519.
5. Send the request body plus signature headers.

The request body hash is signed metadata. It is separate from Ed25519 signing.
Do not change the server protocol.

## libcurl Rules

Use libcurl directly with small RAII wrappers. Do not shell out to `curl`.

Use libcurl for:

- Strict endpoint URL parsing.
- Rejecting unsupported schemes.
- Enforcing `https://` by default unless a local/dev flag explicitly allows
  `http://localhost`.
- GET requests for nonce/OIDC flows if required by the current protocol.
- POST requests for sync/push.
- Status code handling.
- Response body capture.
- Timeout configuration.

Use libcurl's URL API where practical for endpoint parsing and canonicalization.
Do not wrap libcurl in a third-party C++ HTTP client unless direct libcurl
becomes genuinely painful.

## RAII Wrappers

Create small RAII wrappers or `std::unique_ptr<T, Deleter>` aliases for:

- `CURL*`
- `CURLU*`
- `curl_slist*`
- `EVP_PKEY*`
- `EVP_PKEY_CTX*`
- `EVP_MD_CTX*`
- `BIO*` if needed

No raw owning pointers. No manual cleanup scattered across command handlers.

## Explicit Non-Goals

Do not choose libsodium by default. It is acceptable only if review determines
that raw Ed25519 keys/signatures are a better match for the server protocol than
PEM/OpenSSL EVP. If chosen, document why OpenSSL was rejected and do not use both
OpenSSL and libsodium for Ed25519 in the first Phase 3 pass.

Do not choose Boost by default. Boost is acceptable only if it solves a concrete
problem better than the lighter stack. Do not add Boost.Beast or Boost.Asio for
a CLI that performs a few HTTP requests.

## Testing Order

Before real network `push`, add test vectors in this order:

1. SHA-256 body hash vectors matching TypeScript output.
2. Canonical signing string construction tests.
3. Ed25519 keygen format tests.
4. Ed25519 signature test vectors.
5. PEM private key parse/sign tests.
6. Base64 key parse/sign tests, if base64 keys are supported.
7. Invalid key and malformed PEM errors.
8. Endpoint URL validation tests.
9. Mutually exclusive auth flag tests.

Only after signing/key tests pass should real HTTP push be wired.

## OIDC

For GitHub OIDC, read the standard GitHub Actions environment variables used by
the v1 sync workflow. Do not invent a new OIDC flow.

Keep OIDC retrieval isolated behind a small function so it can be tested with
mocked environment variables and fixture HTTP responses.

## Dry-Run Safety

Keep `push` dry-run safe while Phase 3 is under construction.

Dry-run output should show:

- endpoint
- docs root
- delete behavior
- auth mode
- body hash
- planned operation summary
- whether the request would be signed
- whether the request would be sent

Do not allow an incomplete implementation to publish or mutate remote docs.

## Packaging Posture

Do not turn Phase 3 into packaging work. Update Debian/Homebrew dependency
declarations only enough to reflect new Phase 3 dependencies when those
dependencies are actually added to Meson.

Release/package validation remains deferred unless a task explicitly asks for
it.

## Feature Order

1. Dependency detection.
2. Hashing test vectors.
3. Signing test vectors.
4. `keygen`.
5. Endpoint validation.
6. HTTP client wrapper.
7. OIDC retrieval.
8. Signed push dry-run.
9. Signed push against a test/local server.
10. Docs and packaging metadata updates.
