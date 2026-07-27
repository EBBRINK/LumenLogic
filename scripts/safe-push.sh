#!/usr/bin/env bash
#
# safe-push.sh — de enige veilige manier om naar productie te pushen.
#
# WAAROM DIT BESTAAT. `main` deployt bij elke push automatisch naar productie, en
# `git push origin main` stuurt ÉLKE commit op de lokale main mee — ook die van een
# parallelle sessie die in dezelfde werkdirectory commit. In week 1 ging dat vier keer
# mis: één keer een race tussen akkoord en push, één keer omdat `git push <sha>:main`
# toch alle vóórouders meestuurt (git kent geen "alleen deze commit"), en één keer een
# `git reset` die ongepusht werk van de branch haalde.
#
# WAT DIT SCRIPT GARANDEERT. Het pusht UITSLUITEND de opgegeven commit(s), in de
# opgegeven volgorde, rebased op de ACTUELE origin/main — via een wegwerp-worktree.
# Het raakt je werkdirectory en je lokale main nooit aan. Een conflict of een lege
# selectie stopt het script vóór de push (fail closed).
#
# GEBRUIK
#   bash scripts/safe-push.sh                 # pusht HEAD
#   bash scripts/safe-push.sh <sha> [<sha>…]  # pusht exact deze commits, in deze volgorde
#   DRY_RUN=1 bash scripts/safe-push.sh <sha>  # toont wat er zou gaan, pusht NIET
#
# De pre-push-hook (scripts/hooks/pre-push) blokkeert de kale `git push origin main`;
# dit script zet LUMENLOGIC_SAFE_PUSH=1 en mag daarom wél pushen.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Commits die naar productie mogen. Zonder argument: HEAD.
if [ "$#" -eq 0 ]; then
  SHAS=("$(git rev-parse HEAD)")
else
  SHAS=()
  for ref in "$@"; do
    if ! sha="$(git rev-parse --verify --quiet "${ref}^{commit}")"; then
      echo "✗ Geen geldige commit: ${ref}" >&2
      exit 1
    fi
    SHAS+=("$sha")
  done
fi

echo "→ git fetch origin"
git fetch origin --quiet

WT="$(git rev-parse --git-common-dir)/safe-push-wt"
cleanup() { git worktree remove --force "$WT" >/dev/null 2>&1 || true; git worktree prune >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup  # ruim een eventuele restant-worktree van een afgebroken run eerst op

git worktree add --quiet --detach "$WT" origin/main

for sha in "${SHAS[@]}"; do
  if git -C "$WT" cherry-pick "$sha" >/dev/null 2>&1; then
    continue
  fi
  # Cherry-pick faalde. Twee heel verschillende oorzaken:
  conflict="$(git -C "$WT" diff --name-only --diff-filter=U | tr '\n' ' ')"
  if [ -z "$conflict" ]; then
    # Geen unmerged bestanden → de commit is al in origin/main en wordt leeg. Geen fout.
    git -C "$WT" cherry-pick --quit >/dev/null 2>&1 || true
    echo "• ${sha:0:8} staat al op origin/main — overgeslagen." >&2
    continue
  fi
  # Wél unmerged bestanden → een echt conflict met de actuele origin/main.
  git -C "$WT" cherry-pick --abort >/dev/null 2>&1 || true
  echo "✗ Cherry-pick van ${sha:0:8} botst met de actuele origin/main: ${conflict}" >&2
  echo "  Niets gepusht. Los het conflict op je lokale main op en probeer opnieuw." >&2
  exit 1
done

RANGE="$(git -C "$WT" log --oneline origin/main..HEAD)"
if [ -z "$RANGE" ]; then
  echo "• Niets te pushen — deze commit(s) staan al op origin/main." >&2
  exit 0
fi

echo
echo "Gaat naar PRODUCTIE (origin/main):"
echo "$RANGE" | sed 's/^/    /'
echo
echo "Bestanden:"
git -C "$WT" diff --stat origin/main..HEAD | sed 's/^/    /'
echo

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "DRY_RUN=1 → niet gepusht."
  LUMENLOGIC_SAFE_PUSH=1 git -C "$WT" push --dry-run origin HEAD:main
  exit 0
fi

LUMENLOGIC_SAFE_PUSH=1 git -C "$WT" push origin HEAD:main
echo "✓ Gepusht. origin/main staat nu op $(git -C "$WT" rev-parse --short HEAD)."
