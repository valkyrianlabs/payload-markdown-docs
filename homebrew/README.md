# Homebrew Tap Notes

The eventual public tap can live at `valkyrianlabs/homebrew-tap`. Homebrew tap
repositories commonly keep formulae under a top-level `Formula/` directory.

Expected tap layout:

```text
homebrew-tap/
  Formula/
    pmdocs.rb
```

Users can install directly with:

```bash
brew install valkyrianlabs/tap/pmdocs
```

or explicitly tap first:

```bash
brew tap valkyrianlabs/tap
brew install pmdocs
```

Release checklist:

1. Tag a release in `valkyrianlabs/payload-markdown-docs`.
2. Publish a source archive or use the GitHub tag archive URL.
3. Compute the archive checksum with `curl -L <url> | shasum -a 256`.
4. Stage the release formula:

   ```bash
   python3 -m tools.release prepare-homebrew-formula \
     --output-dir release \
     --archive-url <url> \
     --sha256 <sha256>
   ```

5. Copy `release/homebrew/Formula/pmdocs.rb` into
   `valkyrianlabs/homebrew-tap/Formula/pmdocs.rb`.
6. Confirm the formula dependencies are available: `meson`, `ninja`, `pkgconf`,
   `cmake`, `cli11`, `curl`, `openssl@3`, `nlohmann-json`, and `doctest`.
7. The formula builds with `-Dinstall_skill_data=true -Dcompanion_skill_data=auto`:
   the tag archive contains `skills/payload-markdown-docs` but no
   `node_modules`, so the npm companion `payload-markdown` skill is skipped and
   `pmdocs install skill` installs the bundled skill. `brew test` runs
   `pmdocs doctor` and `pmdocs install skill --agent codex --dry-run`.
8. Test the formula before publishing:

   ```bash
   brew install --build-from-source ./release/homebrew/Formula/pmdocs.rb
   brew test pmdocs
   ```

9. After copying the formula into the tap and replacing the release URL and
   checksum, test the published path:

   ```bash
   brew install --build-from-source valkyrianlabs/tap/pmdocs
   brew test pmdocs
   ```

10. Commit and push the formula to the tap.

The release workflow performs formula staging, syntax validation, and tap commit
publication when
`HOMEBREW_TAP_PUBLISH_MODE=tap`, `HOMEBREW_TAP_REPOSITORY`,
`HOMEBREW_TAP_BRANCH`, and `HOMEBREW_TAP_TOKEN` are configured in the protected
Production environment. Formula install smoke tests still need a runner with
Homebrew available, preferably protected macOS CI before v1.

The Homebrew formula should run native Meson tests only. TypeScript checks
(including the TypeScript half of the shared `contracts/vectors/` suite) need
repository dev dependencies and stay in repository CI, not in the formula build.

References:

- https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap
- https://docs.brew.sh/Formula-Cookbook
