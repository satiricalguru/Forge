#!/bin/bash
# Patch spdlog's bundled fmt for Xcode 26+ (Apple Clang 21 consteval strictness).
# Run after npm install on macOS if @vscode/spdlog fails to compile.

set -euo pipefail

FMT_CORE="node_modules/@vscode/spdlog/deps/spdlog/include/spdlog/fmt/bundled/core.h"

if [[ ! -f "$FMT_CORE" ]]; then
  echo "spdlog not installed yet — skipping patch"
  exit 0
fi

if grep -q 'Apple clang 13+ (Xcode 26)' "$FMT_CORE"; then
  echo "spdlog fmt patch already applied"
  exit 0
fi

sed -i '' \
  's/(defined(__cpp_consteval) &&                                       \\/(defined(__cpp_consteval) \&\& !defined(__apple_build_version__) \&\&  \\/' \
  "$FMT_CORE"

sed -i '' \
  's|// consteval is broken in MSVC before VS2022 and Apple clang 13.|// consteval is broken in MSVC before VS2022 and Apple clang 13+ (Xcode 26).|' \
  "$FMT_CORE"

echo "Applied spdlog fmt patch for Xcode 26+"
