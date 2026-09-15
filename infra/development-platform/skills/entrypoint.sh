#!/bin/sh
set -eu

# The upstream empty-query interactive find can eventually call runAdd. Expose
# only default project list and a nonempty query, without any interactive stdin.
case "${1:-}" in
  list)
    [ "$#" = 1 ] || { printf '%s\n' 'Usage: list' >&2; exit 64; }
    exec node /opt/skills/node_modules/skills/bin/cli.mjs list </dev/null
    ;;
  find)
    [ "$#" = 2 ] || { printf '%s\n' 'Usage: find "search terms"' >&2; exit 64; }
    case "$2" in
      ''|-*) printf '%s\n' 'Use nonempty search terms, not CLI options.' >&2; exit 64 ;;
    esac
    [ "${#2}" -le 200 ] || { printf '%s\n' 'Search terms must fit in 200 characters.' >&2; exit 64; }
    exec node --use-env-proxy /opt/skills/node_modules/skills/bin/cli.mjs find "$2" </dev/null
    ;;
  *) printf '%s\n' 'Supported operations: list; find "search terms".' >&2; exit 64 ;;
esac
