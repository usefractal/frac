#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./publish.sh VERSION [--tag TAG] [--otp OTP] [--dry-run] [--skip-validation]

Publishes the npm packages in dependency order:
  1. @usefractal/frac
  2. @usefractal/create-frac

The script temporarily:
  - sets both package versions to VERSION
  - pins template dependencies from workspace:* to ^VERSION
  - copies the root README into packages/frac through prepublishOnly

Local file mutations are restored before the script exits.

Options:
  --tag TAG           npm dist-tag, defaults to latest
  --otp OTP           npm two-factor one-time password
  --dry-run           run npm publish in dry-run mode
  --skip-validation   skip install, test, and build
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

version_ge() {
  node - "$1" "$2" <<'NODE'
const actual = process.argv[2].replace(/^v/, "").split(".").map(Number);
const required = process.argv[3].replace(/^v/, "").split(".").map(Number);
for (let i = 0; i < Math.max(actual.length, required.length); i += 1) {
  const a = actual[i] || 0;
  const r = required[i] || 0;
  if (a > r) process.exit(0);
  if (a < r) process.exit(1);
}
process.exit(0);
NODE
}

VERSION=""
TAG="latest"
OTP=""
DRY_RUN=0
SKIP_VALIDATION=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:-}"
      [[ -n "$TAG" ]] || die "--tag requires a value"
      shift 2
      ;;
    --otp)
      OTP="${2:-}"
      [[ -n "$OTP" ]] || die "--otp requires a value"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      die "unknown option: $1"
      ;;
    *)
      [[ -z "$VERSION" ]] || die "unexpected argument: $1"
      VERSION="$1"
      shift
      ;;
  esac
done

[[ -n "$VERSION" ]] || {
  usage
  exit 1
}

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  die "invalid version '$VERSION'. Expected X.Y.Z."

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

REQUIRED_NODE="$(node -p 'require("./package.json").engines.node.replace(/^>=/, "")')"
CURRENT_NODE="$(node -v)"
version_ge "$CURRENT_NODE" "$REQUIRED_NODE" ||
  die "Node $REQUIRED_NODE or newer is required; current version is $CURRENT_NODE"

git diff --quiet || die "tracked working tree changes exist; commit or stash them first"
git diff --cached --quiet || die "staged changes exist; commit or unstage them first"

npm whoami >/dev/null || die "npm is not logged in; run npm login first"

if [[ "$DRY_RUN" -eq 0 ]]; then
  npm view "@usefractal/frac@$VERSION" version >/dev/null 2>&1 &&
    die "@usefractal/frac@$VERSION already exists on npm"
  npm view "@usefractal/create-frac@$VERSION" version >/dev/null 2>&1 &&
    die "@usefractal/create-frac@$VERSION already exists on npm"
fi

TMP_DIR="$(mktemp -d)"
FILES_TO_RESTORE=(
  "packages/frac/package.json"
  "packages/create-frac/package.json"
  "packages/create-frac/templates/blank/package.json"
)

for file in "${FILES_TO_RESTORE[@]}"; do
  mkdir -p "$TMP_DIR/$(dirname "$file")"
  cp "$file" "$TMP_DIR/$file"
done

FRAC_README_EXISTED=0
if [[ -e packages/frac/README.md ]]; then
  FRAC_README_EXISTED=1
  mkdir -p "$TMP_DIR/packages/frac"
  cp packages/frac/README.md "$TMP_DIR/packages/frac/README.md"
fi

cleanup() {
  local exit_code=$?
  for file in "${FILES_TO_RESTORE[@]}"; do
    cp "$TMP_DIR/$file" "$file"
  done
  if [[ "$FRAC_README_EXISTED" -eq 1 ]]; then
    cp "$TMP_DIR/packages/frac/README.md" packages/frac/README.md
  else
    rm -f packages/frac/README.md
  fi
  rm -rf "$TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT

if [[ "$SKIP_VALIDATION" -eq 0 ]]; then
  pnpm install --frozen-lockfile
  pnpm test
  pnpm build
fi

(cd packages/frac && pnpm pkg set "version=$VERSION")
(cd packages/create-frac && pnpm pkg set "version=$VERSION")

rm -rf \
  packages/create-frac/templates/blank/node_modules

PUBLISH_ARGS=(--tag "$TAG" --access public --no-git-checks)
ACTION="Publishing"
RESULT="Published"
if [[ "$DRY_RUN" -eq 1 ]]; then
  PUBLISH_ARGS+=(--dry-run)
  ACTION="Dry-running publish of"
  RESULT="Dry run completed for"
fi
if [[ -n "$OTP" ]]; then
  PUBLISH_ARGS+=(--otp "$OTP")
fi

echo "$ACTION @usefractal/frac@$VERSION with tag '$TAG'"
(cd packages/frac && pnpm publish "${PUBLISH_ARGS[@]}")

(cd packages/create-frac/templates/blank &&
  pnpm pkg set "dependencies.@usefractal/frac=^$VERSION")

echo "$ACTION @usefractal/create-frac@$VERSION with tag '$TAG'"
(cd packages/create-frac && pnpm publish "${PUBLISH_ARGS[@]}")

echo "$RESULT @usefractal/frac@$VERSION and @usefractal/create-frac@$VERSION"
