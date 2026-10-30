# Homebrew Tap Notes

The formula is published to the `valkyrianlabs/homebrew-tap` repository (tap
name `valkyrianlabs/tap`), which keeps formulae under a top-level `Formula/`
directory.

Expected tap layout:

```text
homebrew-tap/
  Formula/
    pmdocs.rb
```

Users install with the fully qualified name, and nothing else:

```bash
brew install valkyrianlabs/tap/pmdocs
```

Homebrew 6 and later refuse to load formulae from a non-official tap unless the
tap or the formula is trusted (<https://docs.brew.sh/Tap-Trust>). Installing a
fully qualified name taps `valkyrianlabs/tap` if needed and records
`valkyrianlabs/tap/pmdocs` in the user's trust store, so it needs no `brew tap`
or `brew trust` step, and `brew upgrade`, `brew upgrade pmdocs` and
`brew doctor` keep working afterwards. Do not document `brew tap` followed by
`brew install pmdocs`: the short name fails with "Refusing to load formula
valkyrianlabs/tap/pmdocs from untrusted tap" until the user runs `brew trust`.
Users who installed that way before tap trust existed run
`brew upgrade valkyrianlabs/tap/pmdocs` once to trust it.

In a `Brewfile`, `brew bundle` trusts the entry before loading it:

```ruby
brew "valkyrianlabs/tap/pmdocs", trusted: true
```

Releases render and publish the formula with vl-release (`release.toml`
`[homebrew]`); nothing is copied by hand:

1. `vlr source-archive` writes `release/pmdocs-<version>.tar.gz` from the
   prepared tree. It is attached to the GitHub release and is the formula's
   source; it contains both bundled skills (`skills/payload-markdown-docs` and
   the vendored `skills/payload-markdown`), so the formula needs no npm
   resource.
2. `vlr homebrew formula` renders `release/homebrew/pmdocs.rb` from
   `homebrew/Formula/pmdocs.rb` with that archive's URL and sha256.
3. After the GitHub release, `vlr homebrew publish --tap-dir homebrew-tap`
   downloads the archive, verifies its sha256 and commits the formula to
   `valkyrianlabs/homebrew-tap` (secret `HOMEBREW_TAP_TOKEN`). Re-runs skip an
   identical formula and refuse to change a published one.

Release CI also builds pmdocs from the source archive with the formula's Meson
options and checks that `pmdocs install skill` plans both skills. To test the
formula on a Mac before a release:

```bash
brew install --build-from-source ./release/homebrew/pmdocs.rb
brew test pmdocs
```

The formula's version is a vl-release version target (`vlr version bump`), so
never edit its `url` or `sha256` by hand.

The Homebrew formula should run native Meson tests only. TypeScript checks
(including the TypeScript half of the shared `contracts/vectors/` suite) need
repository dev dependencies and stay in repository CI, not in the formula build.

References:

- https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap
- https://docs.brew.sh/Formula-Cookbook
