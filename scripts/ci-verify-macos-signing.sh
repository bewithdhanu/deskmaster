#!/usr/bin/env bash
set -euo pipefail

verify_app() {
  local app_path="$1"
  if [ ! -d "$app_path" ]; then
    return 0
  fi

  echo "Verifying signature for $app_path"
  codesign --verify --deep --strict --verbose=2 "$app_path"
  spctl --assess --verbose --type install "$app_path"
}

verify_app "dist/mac-arm64/DeskMaster.app"
verify_app "dist/mac/DeskMaster.app"
