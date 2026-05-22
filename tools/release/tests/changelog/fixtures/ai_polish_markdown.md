# Release 2.4.0 Draft

This release tightens core protocol reliability and improves release-tooling determinism, with limited low-volume packaging impact.

## Core
Core remains the highest-signal area in this range, focused on safer protocol and fuse behavior.

- WebSocket handshake validation now rejects invalid client nonce flows earlier.
- Fuse mount cleanup logic now checks active mount state before teardown.

## Tools
Release tooling changes improve deterministic changelog generation quality.

- Payload shaping now includes explicit truncation metadata and stable evidence ordering.
- CLI changelog workflow tests were expanded to cover output paths and stage wiring.

## Notes
- Packaging updates in this range are low-volume and should not be overstated.
