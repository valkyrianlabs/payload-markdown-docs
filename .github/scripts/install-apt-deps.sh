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

if ! sudo -n true >/dev/null 2>&1; then
  runner_user="$(id -un)"
  echo "::error::Missing apt packages: ${missing[*]}"
  echo "::error::Passwordless sudo is unavailable for runner user '${runner_user}'."
  echo "::error::Run the Actions service as the sudoers NOPASSWD user, or add '${runner_user} ALL=(ALL) NOPASSWD:ALL' under /etc/sudoers.d and validate it with visudo."
  exit 1
fi

sudo -n apt-get update
sudo -n apt-get install -y "${missing[@]}"
