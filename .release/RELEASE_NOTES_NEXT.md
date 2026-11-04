<!--
vl-release staged release notes: the user-facing story of the NEXT release.
Maintained continuously while working; `vlr prepare` promotes it into the release notes
history (and the GitHub release) and resets this file to this template.

Format: the first line is "# <release title>" WITHOUT a version number (vlr adds it).
Everything after the title is the Markdown release body. Describe the resulting behavior
for users and operators; keep it representative of what actually ships.
-->
# Homebrew installs on macOS 15, without a tap trust step

## Builds on macOS 15 Sequoia

`brew install valkyrianlabs/tap/pmdocs` builds pmdocs from source, and on macOS 15 the build
failed: that SDK's C++ library has no floating-point `std::from_chars`, which pmdocs used to read
numeric frontmatter such as `order`. pmdocs now parses those numbers with the C library in the "C"
locale and builds with the macOS 15 SDK on Apple silicon and Intel. Parsed values are unchanged on
every platform. CI now builds the formula on macOS 15 as well as the latest macOS.

## Invalid `stack.toml` reported properly on macOS

On macOS, `pmdocs validate` (and `plan`, `manifest` and `push`) stopped with a bare toml++ message
such as "Error while parsing table header: expected ']', saw '\n'" when `docs/stack.toml` had a
syntax error. It now reports the problem like Linux always did, as a validation error with its
position: `stack.toml: stack.toml is not valid TOML (line 1, column 19): …`. CI now runs the full
native test suite on macOS 15 and the latest macOS as well as Linux.

## No tap trust step

Current Homebrew refuses to load formulae from a third-party tap that you have not trusted. The
install instructions used to say `brew tap valkyrianlabs/tap` and then `brew install pmdocs`, and on
current Homebrew that fails with "Refusing to load formula valkyrianlabs/tap/pmdocs from untrusted
tap". The README and the installation and CLI reference pages now give a single command:

```bash
brew install valkyrianlabs/tap/pmdocs
```

The full name taps `valkyrianlabs/tap` when needed and trusts only the `pmdocs` formula. You don't
run `brew tap` or `brew trust`, and later `brew upgrade` (or `brew upgrade pmdocs`) keeps it
current.

If you installed with `brew tap` and the short name before Homebrew required tap trust, `brew upgrade`
now skips `pmdocs`. Run `brew upgrade valkyrianlabs/tap/pmdocs` once and it is trusted from then
on. In a `Brewfile`, use `brew "valkyrianlabs/tap/pmdocs", trusted: true`.
