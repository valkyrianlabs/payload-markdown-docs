#!/usr/bin/env bash
# Install homebrew/Formula/pmdocs.rb from a throwaway local tap, pointing it at a source archive of
# this checkout (the tracked files, like the release's source archive), then run its test block.
# Proves the formula's dependencies, build and tests on macOS before a release reaches the tap.
set -euo pipefail

version="$(cat VERSION)"
work="$(mktemp -d)"
archive="$work/pmdocs-${version}.tar.gz"
git archive --format=tar.gz --prefix="pmdocs-${version}/" -o "$archive" HEAD
sha256="$(shasum -a 256 "$archive" | cut -d' ' -f1)"

# Start from an empty Homebrew trust store (it lives under $XDG_CONFIG_HOME/homebrew) so the
# install below proves the documented flow: a fully qualified install needs no `brew trust`.
export XDG_CONFIG_HOME="$work/config"

tap="pmdocs-ci/local"
brew untap "$tap" >/dev/null 2>&1 || true
brew tap-new --no-git "$tap"
tap_formula="$(brew --repository "$tap")/Formula/pmdocs.rb"

# Style-check the formula as published (release URL, real checksum), as a tap formula.
sed -E "s#^  sha256 \".*\"#  sha256 \"${sha256}\"#" homebrew/Formula/pmdocs.rb > "$tap_formula"
brew style "$tap/pmdocs"

# Then install it from the local archive and run its test block.
sed -i '' -E "s#^  url \".*\"#  url \"file://${archive}\"#" "$tap_formula"

export HOMEBREW_NO_INSTALL_FROM_API=1 HOMEBREW_NO_AUTO_UPDATE=1
brew install --build-from-source "$tap/pmdocs"
# The fully qualified install recorded trust for the formula, so the short name loads too
# (`brew upgrade pmdocs` and `brew upgrade` depend on that).
brew info --formula pmdocs >/dev/null
brew test "$tap/pmdocs"
"$(brew --prefix)/bin/pmdocs" --version
brew uninstall --formula "$tap/pmdocs"
brew untap "$tap"
