# Release 2.4.0 Draft

This release focuses on core protocol hardening and release-tooling improvements with constrained packaging updates.

## Core
Core changes are the highest-signal part of this range and include protocol and fuse reliability work.

- WebSocket handshake validation was tightened to reject invalid client nonce flows.
- Fuse mount cleanup behavior now checks active mount state before teardown.

## Tools
Release automation work improves deterministic payload shaping and changelog workflows.

- Payload generation now includes explicit truncation metadata and stable evidence ordering.
- CLI coverage expanded for changelog draft and payload commands.

## Notes
- Packaging changes are present but low-volume; verify downstream install scripts if your deployment depends on Debian paths.
