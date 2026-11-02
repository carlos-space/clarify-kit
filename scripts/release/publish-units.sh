#!/usr/bin/env bash
# Publish released package units to their registry, at every stage of a train. publish.yml calls it;
# release-please.yml dispatches publish.yml with the train's stage after each release.
#
# This repository's copy differs from the template in one place: a package that publishes to the public
# npm registry (registry.npmjs.org, publishConfig.registry unset or that URL) really uploads, with
# `npm publish --access public --tag <dist-tag> --registry https://registry.npmjs.org`, the way fact-kit's copy does.
# The template only uploads GitHub Packages packages and dry-runs everything else. Both units here,
# clarify-kit and the facts aggregate clarify-kit-facts, are public npmjs packages.
#
# The registry follows from the file the unit carries:
#   package.json    npm        dist-tag is the stage (alpha | beta | rc), latest at ga: latest must
#                              only ever point at a GA. pnpm packs (it rewrites workspace: ranges) and
#                              the npm CLI publishes the tarball: npm refuses a prerelease without
#                              --tag where pnpm publish does not, and npm is the client that does the
#                              Trusted Publishing token exchange (npm 11.5.1 or later).
#   pyproject.toml  PyPI       the SemVer version is written by release-please as is (2.0.0-alpha.1);
#                              the build backend normalizes it to PEP 440 (2.0.0a1), and the version
#                              published is read back from the built wheel, not converted here. PyPI
#                              has no dist-tags: pip skips pre-releases unless asked (--pre).
#   Cargo.toml      crates.io  SemVer as is; cargo skips pre-releases unless the requirement names one.
# Public npmjs packages authenticate with Trusted Publishing (OIDC, npm >= 11.5.1, publish.yml's id-token: write);
# no token is read. When that version is already on npmjs it is skipped, so a re-run is safe.
# A package with a publishConfig.registry on GitHub Packages and a repository field that names the
# repository this run is in (GITHUB_REPOSITORY) also really uploads. Any other package, and
# the same package in a mirror repository, stays a dry run, so a mirror that rebuilds its tags and releases never meets a version it cannot delete. When
# that version is already on the registry, the already published dist/**/index.json are compared with the
# ones just built: the same content is skipped, different content stops the run for the user to decide.
# The upload takes its token from NODE_AUTH_TOKEN only, which publish.yml sets on that step alone.
# Every unit's version must belong to <stage> (version_stage in scripts/lib/release-stages.sh), so a
# dispatch with the wrong stage stops instead of publishing a prerelease under latest. A version that
# is already on the registry is skipped, so a re-run is safe.
#
# usage: publish-units.sh <alpha|beta|rc|ga> <path>...
#        publish-units.sh --registries <path>...   print npm=true / pypi=true / crates=true for the
#                                                   registries the paths need ($GITHUB_OUTPUT format)
#   PUBLISH_OUT      where packages are built (default tmp/publish): npm tarballs in npm/, Python wheels and
#                    sdists in pypi/. Keep the two apart: the PyPI upload checks every file in its directory.
#   PUBLISH_DRY_RUN  1 makes every npm upload `npm publish --dry-run`, so the run writes no registry
set -euo pipefail
source "$(dirname "$0")/../lib/common.sh"
cd "$REPO_ROOT"
usage() { die "usage: publish-units.sh <alpha|beta|rc|ga> <path>... | publish-units.sh --registries <path>..."; }

registry() { # registry <path> → npm | pypi | crates
  unit_registry "$1" || die "$1 沒有 package.json、pyproject.toml 或 Cargo.toml，不知道要發布到哪個註冊中心"
}

toml_get() { # toml_get <file> <table> <key>
  python3 -c 'import sys, tomllib; print(tomllib.load(open(sys.argv[1], "rb"))[sys.argv[2]][sys.argv[3]])' "$@"
}

npm_dist_tag() { if [[ "$1" == ga ]]; then printf '%s\n' latest; else printf '%s\n' "$1"; fi; }

summary() { [[ -z "${GITHUB_STEP_SUMMARY:-}" ]] || printf '%s\n' "- $*" >> "$GITHUB_STEP_SUMMARY"; }

# The unit's own file must carry the manifest version: release-please writes both in one commit, and
# a broken updater would otherwise publish a version the manifest never released.
check_file_version() { # check_file_version <path> <file> <version in file> <manifest version>
  [[ "$3" == "$4" ]] || die "$1：manifest 是 $4，但 $2 是 ${3:-（空）}；release-please 沒有更新到這個檔"
}

# A publish that failed after its tag was made can be dispatched again from the release branch once the
# fix lands there (docs/environments.md, 套件發布). That is only safe while the unit's own files still
# equal the tag: otherwise one version number would name two different packages. publish.yml's checkout
# is shallow and carries no tags, so a shallow clone fetches the tag first; a unit without a tag has
# nothing to compare.
check_same_as_tag() { # check_same_as_tag <path> <version>
  local t; t="$(unit_component "$1")/v$2"
  if ! git rev-parse -q --verify "refs/tags/$t" >/dev/null; then
    [[ "$(git rev-parse --is-shallow-repository)" == true ]] || return 0
    git fetch -q --depth=1 origin "refs/tags/$t:refs/tags/$t" 2>/dev/null || return 0
  fi
  git diff --quiet "$t" HEAD -- "$1" \
    || die "$1 的內容和 tag $t 不同。修正動到套件本身時，要推進到下一個序號重發，不能用同一個版號"
}

github_packages_registry() { # github_packages_registry <path> → the registry URL, when the package really uploads there
  local reg repo here
  reg="$(jq -r '.publishConfig.registry // empty' "$1/package.json")"
  [[ "$reg" == https://npm.pkg.github.com* ]] || return 1
  # owner/repo of the repository field, lower-cased: GitHub names ignore case, and the field may be an
  # https, git+https, ssh or git@ URL or the owner/repo shorthand
  repo="$(jq -r '(.repository | if type == "object" then .url else . end) // empty' "$1/package.json" \
    | sed -E 's#^(git\+)?(https?|ssh)://([^@/]+@)?github\.com/##; s#^git@github\.com:##; s#\.git$##' | tr 'A-Z' 'a-z')"
  here="$(printf '%s' "${GITHUB_REPOSITORY:-}" | tr 'A-Z' 'a-z')"
  if [[ -z "$repo" || "$repo" != "$here" ]]; then
    printf '%s\n' "  $1：repository 不符（package.json 是「${repo:-空}」，這次在「${here:-空}」），改 dry-run" >&2
    return 1
  fi
  printf '%s\n' "$reg"
}

# whether the dist/**/index.json of the published <name>@<ver> are the same files, in the same places, as the
# ones built in <path>
published_indexes_match() { # published_indexes_match <path> <name> <version> <registry>
  local p="$1" dir f
  dir="$(mktemp -d "$PUBLISH_OUT/compare.XXXXXX")"
  ( cd "$dir" && npm pack "$2@$3" --registry "$4" --silent >/dev/null && tar -xzf ./*.tgz ) \
    || { rm -rf "$dir"; die "$2@$3 的已發布內容取不下來，無法比對 dist/**/index.json"; }
  diff <(cd "$dir/package" && find dist -name index.json | sort) <(cd "$p" && find dist -name index.json | sort) >/dev/null \
    || { rm -rf "$dir"; return 1; }
  while IFS= read -r f; do
    cmp -s "$dir/package/$f" "$p/$f" || { rm -rf "$dir"; return 1; }
  done < <(cd "$p" && find dist -name index.json | sort)
  rm -rf "$dir"
}

NPMJS="https://registry.npmjs.org"
dry_run() { [[ "${PUBLISH_DRY_RUN:-0}" == 1 ]]; }

# npmjs_registry <path> → the registry URL, when the package publishes to the public npm registry
# (publishConfig.registry unset or npmjs). Any other registry is not handled here.
npmjs_registry() {
  local reg
  reg="$(jq -r '.publishConfig.registry // empty' "$1/package.json")"
  [[ -z "$reg" || "${reg%/}" == "$NPMJS" ]] || return 1
  printf '%s\n' "$NPMJS"
}

publish_npm() { # publish_npm <path> <version> <stage>
  local p="$1" ver="$2" name tag tgz reg="" public="" note=""
  local -a dry=()
  name="$(jq -r .name "$p/package.json")"
  check_file_version "$p" "$p/package.json" "$(jq -r .version "$p/package.json")" "$ver"
  tag="$(npm_dist_tag "$3")"
  mkdir -p "$PUBLISH_OUT"
  dry_run && { dry=(--dry-run); note="（dry-run）"; }
  if reg="$(npmjs_registry "$p")"; then
    # public npm package: Trusted Publishing, no published-content comparison (dist/**/index.json only exists in facts)
    public=1
    if npm view "$name@$ver" version --registry "$reg" 2>/dev/null | grep -qx "$ver"; then
      info "npm：$name@$ver 已在 ${reg}，略過"; summary "npm \`$name@$ver\` 已在 ${reg}，略過"; return 0
    fi
    log "npm：${name}@${ver} → dist-tag ${tag}，上傳到 ${reg}${note}"
  elif reg="$(github_packages_registry "$p")"; then
    # a version that is not there is the normal case, so the error text goes to a file and is only shown when it holds something
    if npm view "$name@$ver" version --registry "$reg" 2>"$PUBLISH_OUT/npm-view.err" | grep -qx "$ver"; then
      if published_indexes_match "$p" "$name" "$ver" "$reg"; then
        info "npm：$name@$ver 已在 ${reg}，dist/**/index.json 相同，略過"; return 0
      fi
      die "$name@$ver 已在 ${reg}，但已發布的 dist/**/index.json 和這次建置的不同。同一個版號不能發兩份內容：請使用者決定，改發下一個版號，或先確認是誰動了這個版號"
    fi
    [[ ! -s "$PUBLISH_OUT/npm-view.err" ]] || { info "npm view 的訊息："; sed 's/^/    /' "$PUBLISH_OUT/npm-view.err" >&2; }
    log "npm：${name}@${ver} → dist-tag ${tag}，上傳到 ${reg}${note}"
  elif npm view "$name@$ver" version 2>/dev/null | grep -qx "$ver"; then
    info "npm：$name@$ver 已發布，略過"; return 0
  else
    reg=""
    log "npm：${name}@${ver} → dist-tag ${tag}（dry-run）"
  fi
  mkdir -p "$PUBLISH_OUT/npm"
  tgz="$(pnpm --filter "./$p" pack --pack-destination "$PUBLISH_OUT/npm" --json | jq -r .filename)"
  # npm reads a bare relative path such as artifacts/x.tgz as a GitHub owner/repo shorthand and fails
  # with exit 128. pnpm reports an absolute filename today; keep a relative one explicit anyway.
  [[ "$tgz" == /* || "$tgz" == ./* ]] || tgz="./$tgz"
  if [[ -n "$public" ]]; then
    info "npm publish ${tgz} --access public --tag $tag --registry $reg${dry[*]:+ ${dry[*]}}"
    npm publish "$tgz" --access public --tag "$tag" --registry "$reg" ${dry[@]+"${dry[@]}"}
    summary "npm \`$name@$ver\` → dist-tag \`$tag\`（上傳到 ${reg}）${note}"
  elif [[ -n "$reg" ]]; then
    npm publish "$tgz" --tag "$tag" --registry "$reg" ${dry[@]+"${dry[@]}"}
    summary "npm \`$name@$ver\` → dist-tag \`$tag\`（上傳到 ${reg}）${note}"
  else
    npm publish "$tgz" --dry-run --tag "$tag"
    summary "npm \`$name@$ver\` → dist-tag \`$tag\`（模擬）"
  fi
}

publish_pypi() { # publish_pypi <path> <version>
  local p="$1" ver="$2" name build out pyver
  name="$(toml_get "$p/pyproject.toml" project name)"
  check_file_version "$p" "$p/pyproject.toml" "$(toml_get "$p/pyproject.toml" project version)" "$ver"
  build="$PUBLISH_OUT/build/$(unit_component "$p")" out="$PUBLISH_OUT/pypi"
  rm -rf "$build"; mkdir -p "$build" "$out"
  uv build --quiet --sdist --wheel --out-dir "$build" "$p"
  pyver="$(python3 - "$build" <<'PY'
import pathlib, sys, zipfile
wheel = next(pathlib.Path(sys.argv[1]).glob("*.whl"))
with zipfile.ZipFile(wheel) as z:
    meta = next(n for n in z.namelist() if n.endswith(".dist-info/METADATA"))
    print(next(l for l in z.read(meta).decode().splitlines() if l.startswith("Version: "))[9:])
PY
)"
  if curl -fsS -o /dev/null "https://pypi.org/pypi/$name/$pyver/json" 2>/dev/null; then
    info "PyPI：$name $pyver 已發布，略過"; return 0
  fi
  mv "$build"/* "$out"/
  log "PyPI：${name} ${ver} → ${pyver}（PEP 440，取自建置出的 wheel）"
  summary "PyPI \`${name} ${pyver}\`（版號 ${ver}，模擬）"
}

# One upload for every Python unit of the run, from a directory that holds nothing but their wheels and
# sdists. --check-url skips files PyPI already has. The simulation keeps Trusted Publishing off so the
# dry run never asks PyPI for a token; the real upload drops --dry-run and sets --trusted-publishing
# always, which takes the job's OIDC token.
upload_pypi() {
  local out="$PUBLISH_OUT/pypi"
  compgen -G "$out/*" >/dev/null || return 0
  log "PyPI：上傳 $(find "$out" -type f | wc -l | tr -d ' ') 個檔（dry-run）"
  uv publish --dry-run --trusted-publishing never --check-url https://pypi.org/simple/ "$out/"*
}

publish_crates() { # publish_crates <path> <version>
  local p="$1" ver="$2" name
  name="$(toml_get "$p/Cargo.toml" package name)"
  check_file_version "$p" "$p/Cargo.toml" "$(toml_get "$p/Cargo.toml" package version)" "$ver"
  if curl -fsS -o /dev/null -A "git-flow-template publish check" "https://crates.io/api/v1/crates/$name/$ver" 2>/dev/null; then
    info "crates.io：$name $ver 已發布，略過"; return 0
  fi
  log "crates.io：${name} ${ver}（dry-run）"
  cargo publish --dry-run --locked --manifest-path "$p/Cargo.toml"
  summary "crates.io \`$name $ver\`（模擬）"
}

[[ $# -ge 2 ]] || usage
if [[ "$1" == --registries ]]; then
  shift
  regs=()
  for p in "$@"; do r="$(registry "${p%/}")"; regs+=("$r=true"); done
  printf '%s\n' "${regs[@]}" | sort -u
  exit 0
fi

stage="$1"; shift
is_stage "$stage" || die "階段「${stage}」不是 ${RELEASE_STAGES[*]} 之一"
PUBLISH_OUT="${PUBLISH_OUT:-$REPO_ROOT/tmp/publish}"
rm -rf "$PUBLISH_OUT/npm" "$PUBLISH_OUT/pypi"
for p in "$@"; do
  p="${p%/}"
  ver="$(manifest_version "$p")"
  [[ -n "$ver" ]] || die "$p 不在 $MANIFEST"
  vs="$(version_stage "$ver")" || die "$p 的版號 $ver 不是 X.Y.Z 或 X.Y.Z-<alpha|beta|rc>.N，無法決定發布階段"
  [[ "$vs" == "$stage" ]] || die "$p 的版號 $ver 屬於 ${vs}，但這次發布的階段是 ${stage}"
  check_same_as_tag "$p" "$ver"
  reg="$(registry "$p")"
  case "$reg" in
    npm) publish_npm "$p" "$ver" "$stage" ;;
    pypi) publish_pypi "$p" "$ver" ;;
    crates) publish_crates "$p" "$ver" ;;
  esac
done
upload_pypi
