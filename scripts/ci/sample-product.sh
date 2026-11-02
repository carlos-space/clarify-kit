#!/usr/bin/env bash
# One round of the sample product (examples/sample-product): build, pin, read by version. Everything runs on a copy
# in a scratch directory under tmp/, so the committed sources are never rewritten by `pin`, and the script checks
# that the working tree is the same after the run as before it.
#
#   1. copy examples/sample-product (without node_modules and dist) and link what the copy needs
#   2. build both packages, assert the two index.json files and the npm pack list
#   3. read by version: head sees `next`, the pinned version does not
#   4. `fact-kit pin` and `clarify-kit pin` turn `next` into the new version, build again
#   5. read by the new version and the old one, and by the pending label
#
# usage: sample-product.sh [--old <version>] [--new <version>]   (defaults 0.1.0 and 0.2.0)
# Needs: pnpm install and pnpm build already done (the clarify-kit CLI is read from packages/clarify-kit/dist), jq, npm.
# Exit status: 0 every assertion holds and the working tree is unchanged, 1 otherwise, 2 wrong usage.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
cd "$REPO_ROOT"

OLD=0.1.0 NEW=0.2.0
while (( $# > 0 )); do
  case "$1" in
    --old) OLD="${2:?--old needs a version}"; shift 2 ;;
    --new) NEW="${2:?--new needs a version}"; shift 2 ;;
    *) warn "未知參數：$1"; exit 2 ;;
  esac
done

SRC="$REPO_ROOT/examples/sample-product"
CLARIFY_CLI="$REPO_ROOT/packages/clarify-kit/dist/cli.js"
CLARIFY_INDEX="$REPO_ROOT/packages/clarify-kit/dist/index.js"
FACT_KIT_DIR="$(cd -P "$REPO_ROOT/packages/clarify-kit/node_modules/fact-kit" && pwd)"
[[ -f "$CLARIFY_CLI" ]] || die "找不到 ${CLARIFY_CLI}，先跑 pnpm build"
[[ -d "$SRC/sample-product-docs/node_modules" ]] || die "樣本套件還沒安裝，先跑 pnpm install"

mkdir -p "$REPO_ROOT/tmp"
WORK="$(mktemp -d "$REPO_ROOT/tmp/sample-product.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
before="$(git status --short)"

link_dependencies() { # link_dependencies <package dir name>: the copy's node_modules points at the real packages
  local name="$1" entry target
  mkdir -p "$WORK/copy/$name/node_modules"
  for entry in "$SRC/$name/node_modules"/* "$SRC/$name/node_modules"/@*/*; do
    [[ -e "$entry" ]] || continue
    target="$WORK/copy/$name/node_modules/${entry#"$SRC/$name/node_modules/"}"
    mkdir -p "$(dirname "$target")"
    ln -s "$(cd -P "$entry" && pwd)" "$target"
  done
}

log "1. 複製樣本到 ${WORK#"$REPO_ROOT"/}"
mkdir -p "$WORK/copy"
tar -C "$SRC" --exclude node_modules --exclude dist -cf - . | tar -C "$WORK/copy" -xf -
link_dependencies sample-product-facts
link_dependencies sample-product-docs
rm -f "$WORK/copy/sample-product-docs/node_modules/sample-product-facts"
ln -s "$WORK/copy/sample-product-facts" "$WORK/copy/sample-product-docs/node_modules/sample-product-facts"
FACTS="$WORK/copy/sample-product-facts" DOCS="$WORK/copy/sample-product-docs"

# The reader is a project that installed both packages, the way a consumer would.
mkdir -p "$WORK/reader/node_modules"
ln -s "$FACTS" "$WORK/reader/node_modules/sample-product-facts"
ln -s "$DOCS" "$WORK/reader/node_modules/sample-product-docs"

fact_kit_cli() { node "$FACT_KIT_DIR/dist/bin.js" "$@"; }
read_round() { node "$REPO_ROOT/scripts/ci/sample-product-read.mjs" "$1" "$WORK/reader" "$CLARIFY_INDEX" "$FACT_KIT_DIR/dist/index.js" "$OLD" "$NEW"; }
build_both() {
  fact_kit_cli build --cwd "$FACTS"
  (cd "$DOCS" && node "$CLARIFY_CLI" build)
}
assert_packages() { # the index.json of both packages, and what npm pack would ship
  local pkg index
  for pkg in "$FACTS" "$DOCS"; do
    index="$pkg/dist/shop/index.json"
    jq -e '.formatVersion | type == "string"' "$index" >/dev/null || die "$index 的頂層沒有 formatVersion"
    jq -e '.private == null' "$pkg/package.json" >/dev/null || die "$pkg/package.json 有 private"
    npm pack --dry-run --json --ignore-scripts --prefix "$pkg" "$pkg" 2>/dev/null | jq -e '[.[0].files[].path] | index("dist/shop/index.json")' >/dev/null \
      || die "$(basename "$pkg") 的 npm pack 清單沒有 dist/shop/index.json"
    info "$(basename "$pkg"): formatVersion $(jq -r .formatVersion "$index"), no private, pack lists dist/shop/index.json"
  done
}

log "2. build，檢查 index.json 與 npm pack 清單"
build_both
(cd "$DOCS" && node "$CLARIFY_CLI" check)
fact_kit_cli check --cwd "$FACTS"
assert_packages

log "3. pin 前依版號讀取"
read_round before

log "4. pin 成 $NEW 再 build"
fact_kit_cli pin --version "$NEW" --cwd "$FACTS"
(cd "$DOCS" && node "$CLARIFY_CLI" pin --version "$NEW")
grep -q "since: '$NEW'" "$FACTS/facts/shop/cart/discount.facts.ts" || die "facts 的 next 沒有被釘成 $NEW"
grep -q "since: '$NEW'" "$DOCS/docs/shop/cart/discount.requirement.doc.ts" || die "文件的 next 沒有被釘成 $NEW"
if grep -rq "since: 'next'" "$FACTS/facts" "$DOCS/docs/shop/cart/discount.requirement.doc.ts"; then die "pin 後還有 since: 'next'"; fi
build_both
(cd "$DOCS" && node "$CLARIFY_CLI" check)
assert_packages

log "5. pin 後依新舊版號讀取"
read_round after

log "6. 倉庫沒有變更"
after="$(git status --short)"
if [[ "$before" != "$after" ]]; then
  warn "跑完後 git status --short 與跑之前不同"
  diff <(printf '%s\n' "$before") <(printf '%s\n' "$after") >&2 || true
  exit 1
fi
info "git status --short 與跑之前相同：${after:-（空）}"
log "樣本產品跑完一輪"
