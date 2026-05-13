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
   `cmake`, `cli11`, `nlohmann-json`, and `doctest`.
7. Test with `brew install --build-from-source valkyrianlabs/tap/pmdocs`.
8. Commit and push the formula to the tap.

References:

- https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap
- https://docs.brew.sh/Formula-Cookbook
