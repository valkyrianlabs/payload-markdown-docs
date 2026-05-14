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
4. Copy `homebrew/Formula/pmdocs.rb` into `valkyrianlabs/homebrew-tap/Formula/pmdocs.rb`.
5. Replace the `url` and `sha256` placeholders.
6. Confirm the formula dependencies are available: `meson`, `ninja`, `pkgconf`,
   `cmake`, `cli11`, `curl`, `openssl@3`, `nlohmann-json`, and `doctest`.
7. Test the formula before publishing:

   ```bash
   brew install --build-from-source --HEAD ./homebrew/Formula/pmdocs.rb
   brew test pmdocs
   ```

8. After copying the formula into the tap and replacing the release URL and
   checksum, test the published path:

   ```bash
   brew install --build-from-source valkyrianlabs/tap/pmdocs
   brew test pmdocs
   ```

9. Commit and push the formula to the tap.

The Homebrew formula should run native Meson tests only. The npm parity harness
requires repository dev dependencies and should stay in repository CI, not in
the formula build.

References:

- https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap
- https://docs.brew.sh/Formula-Cookbook
