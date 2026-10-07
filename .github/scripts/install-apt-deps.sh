#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "::error::No apt packages were requested."
  exit 2
fi

if ! command -v dpkg-query >/dev/null 2>&1; then
  echo "::error::This dependency installer requires a Debian/Ubuntu runner with dpkg-query."
  exit 2
fi

missing=()
for package in "$@"; do
  if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx "install ok installed"; then
    missing+=("$package")
  fi
done

if [ "${#missing[@]}" -eq 0 ]; then
  echo "All requested apt packages are already installed."
  exit 0
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "::error::Missing apt packages: ${missing[*]}"
  echo "::error::sudo is not installed on this self-hosted runner."
  exit 1
fi

# Refresh the package lists only when a missing package has no install candidate in them: the
# self-hosted runner keeps its lists, and a slow upstream mirror should not be waited on for
# nothing. apt-get (not apt) matches the runner's sudoers policy.
unknown=()
for package in "${missing[@]}"; do
  candidate="$(apt-cache policy "$package" 2>/dev/null | sed -n 's/^ *Candidate: //p')"
  if [ -z "$candidate" ] || [ "$candidate" = "(none)" ]; then
    unknown+=("$package")
  fi
done

if [ "${#unknown[@]}" -gt 0 ]; then
  echo "No install candidate for ${unknown[*]}; refreshing the package lists."
  if ! sudo -n apt-get update; then
    echo "::error::Missing apt packages: ${missing[*]}"
    echo "::error::The runner could not run 'apt-get update' through non-interactive sudo."
    exit 1
  fi
fi

if ! sudo -n apt-get install -y --no-install-recommends "${missing[@]}"; then
  echo "::error::The runner could not install missing apt packages through non-interactive sudo: ${missing[*]}"
  exit 1
fi
