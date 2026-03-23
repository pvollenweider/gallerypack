#!/usr/bin/env bash
# ── scripts/deploy-gh-pages.sh ────────────────────────────────────────────────
# Deploy the contents of dist/ to the gh-pages branch using a Git worktree.
#
# A worktree is a second checkout of the repo at a temporary path.  It is
# completely isolated from the main working tree — no branch switching, no
# touching of source files.  Safe to run at any time.
#
# Usage:
#   npm run deploy
#   ./scripts/deploy-gh-pages.sh
#   ./scripts/deploy-gh-pages.sh "Custom commit message"
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
BRANCH="gh-pages"
REMOTE="origin"
MESSAGE="${1:-"deploy: $(date -u '+%Y-%m-%d %H:%M UTC')"}"
WORKTREE_DIR="$REPO_ROOT/.gh-pages-worktree"

# ── Preflight ──────────────────────────────────────────────────────────────────
if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR")" ]; then
  echo "  ✗  dist/ is empty or missing — run 'npm run build:all' first"
  exit 1
fi

# Remove any leftover worktree from a previous failed run.
if [ -d "$WORKTREE_DIR" ]; then
  git worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
  git worktree prune 2>/dev/null || true
fi

# ── Set up worktree ────────────────────────────────────────────────────────────
echo "  →  Setting up isolated worktree at .gh-pages-worktree/"

# Ensure the branch exists on the remote; create it if needed.
if git ls-remote --exit-code "$REMOTE" "$BRANCH" > /dev/null 2>&1; then
  git fetch "$REMOTE" "$BRANCH" --quiet
  git worktree add "$WORKTREE_DIR" "$BRANCH" --quiet
else
  # First deploy: create an orphan gh-pages branch inside the worktree.
  git worktree add --no-checkout "$WORKTREE_DIR" --quiet 2>/dev/null || \
    git worktree add "$WORKTREE_DIR" --detach --quiet
  cd "$WORKTREE_DIR"
  git checkout --orphan "$BRANCH"
  git rm -rf . --quiet 2>/dev/null || true
  cd "$REPO_ROOT"
fi

# ── Copy dist/ into worktree ───────────────────────────────────────────────────
echo "  →  Copying dist/ into worktree…"
# Clear previous content (tracked files only), then copy fresh dist.
cd "$WORKTREE_DIR"
git rm -rf . --quiet 2>/dev/null || true
cp -r "$DIST_DIR"/. .

# ── Commit and push ────────────────────────────────────────────────────────────
git add -A
if git diff --cached --quiet; then
  echo "  →  Nothing to deploy — dist/ is already up to date."
else
  git commit -m "$MESSAGE" --quiet
  git push "$REMOTE" "$BRANCH" --force --quiet
  echo "  ✓  Deployed to gh-pages: $MESSAGE"
fi

# ── Cleanup ────────────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
git worktree remove "$WORKTREE_DIR" --force
git worktree prune --quiet 2>/dev/null || true
echo "  ✓  Worktree cleaned up — main working tree untouched."
