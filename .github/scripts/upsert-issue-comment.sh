#!/usr/bin/env bash
# Crea o actualiza un comentario del bot en un issue. El comentario se identifica por un
# marcador HTML invisible en la primera línea, así cada ejecución edita su propio comentario
# en lugar de añadir uno nuevo.
#
# Uso: upsert-issue-comment.sh <issue_number> <marker> <body_file>
# Requiere: GH_TOKEN y GITHUB_REPOSITORY en el entorno.
set -euo pipefail

ISSUE="$1"
MARKER="$2"
BODY_FILE="$3"

TMP="$(mktemp)"
{ echo "$MARKER"; echo; cat "$BODY_FILE"; } > "$TMP"

COMMENT_ID="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${ISSUE}/comments" --paginate \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"${MARKER}\"))) | .id" \
  | tail -n 1)"

if [ -n "$COMMENT_ID" ]; then
  gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${COMMENT_ID}" -F "body=@${TMP}" > /dev/null
  echo "Comentario ${COMMENT_ID} actualizado."
else
  gh issue comment "$ISSUE" --repo "$GITHUB_REPOSITORY" --body-file "$TMP"
fi
