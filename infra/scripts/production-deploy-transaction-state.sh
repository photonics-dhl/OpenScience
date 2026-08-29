#!/usr/bin/env bash
# Shared production-deploy state machine. This file only defines functions.
# Its caller must provide the transaction_* adapter functions used below.

transaction_initialize_state() {
  TRANSACTION_PHASE=inactive
  TRANSACTION_JOURNAL_ACTIVE=0
  TRANSACTION_COMMITTED=0
}

transaction_restore_signal_traps() {
  trap 'transaction_rollback_application 129' HUP
  trap 'transaction_rollback_application 130' INT
  trap 'transaction_rollback_application 143' TERM
}

transaction_rollback_application() {
  local original_status="${1:-$?}"
  trap - ERR EXIT HUP INT TERM
  set +e
  if [ "$TRANSACTION_JOURNAL_ACTIVE" -eq 0 ] || [ "$TRANSACTION_COMMITTED" -eq 1 ]; then
    exit "$original_status"
  fi
  transaction_assert_lock || {
    echo "ROLLBACK_FAILED_LOCK_UNAVAILABLE: transaction lost inherited FD9" >&2
    exit 70
  }
  case "$TRANSACTION_PHASE" in
    prepared)
      transaction_journal_clear || exit 70
      TRANSACTION_JOURNAL_ACTIVE=0
      ;;
    migrating)
      echo "ROLLBACK_FAILED_MIGRATION_UNCERTAIN: durable journal retained for explicit recovery" >&2
      exit 70
      ;;
    switching|published)
      transaction_perform_application_rollback || {
        echo "ROLLBACK_FAILED: application recovery did not complete" >&2
        exit 70
      }
      transaction_abort_rollback_intent || {
        echo "ROLLBACK_FAILED_PENDING_INTENT_RETAINED: application recovered but rollback identity needs explicit recovery" >&2
        exit 70
      }
      transaction_journal_clear_after_rollback || {
        echo "ROLLBACK_FAILED_JOURNAL_RETAINED: application recovered but transaction needs explicit recovery" >&2
        exit 70
      }
      TRANSACTION_JOURNAL_ACTIVE=0
      ;;
    *)
      echo "ROLLBACK_FAILED_PHASE_INVALID: durable journal retained" >&2
      exit 70
      ;;
  esac
  exit "$original_status"
}

transaction_on_exit() {
  local original_status=$?
  if [ "$TRANSACTION_COMMITTED" -eq 0 ] && [ "$TRANSACTION_JOURNAL_ACTIVE" -eq 1 ]; then
    transaction_rollback_application "$original_status"
  fi
  return "$original_status"
}

transaction_install_traps() {
  trap 'transaction_rollback_application $?' ERR
  trap 'transaction_on_exit' EXIT
  transaction_restore_signal_traps
}

transaction_begin() {
  trap '' HUP INT TERM
  transaction_journal_start
  TRANSACTION_PHASE=prepared
  TRANSACTION_JOURNAL_ACTIVE=1
  transaction_restore_signal_traps
}

transaction_mark_phase() {
  local phase="$1"
  case "$phase" in migrating|switching|published) ;; *) return 64 ;; esac
  trap '' HUP INT TERM
  transaction_journal_update "$phase"
  TRANSACTION_PHASE="$phase"
  transaction_restore_signal_traps
}

transaction_complete_migration() {
  [ "$TRANSACTION_PHASE" = migrating ] || return 64
  TRANSACTION_PHASE=prepared
}

transaction_commit() {
  # Successful journal removal is the commit point. Catchable signals are
  # deferred across it so an accepted release cannot be flipped back afterward.
  trap '' HUP INT TERM
  transaction_journal_clear
  TRANSACTION_JOURNAL_ACTIVE=0
  TRANSACTION_COMMITTED=1
  trap - ERR EXIT HUP INT TERM
}

transaction_verify_already_active_release() {
  local report worker_image parser_image worker_container parser_container
  local running_worker_image running_parser_image
  run_remote "test \"\$(cat '$RELEASE_ROOT/.release-source')\" = '$RELEASE_SHA'"
  report="/opt/openscience-acceptance/document-parser/$RELEASE_SHA/report.json"
  worker_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-agent-worker:$RELEASE_SHA")"
  parser_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-document-parser:$RELEASE_SHA")"
  require_match same_sha_worker_image_id "$worker_image" '^sha256:[0-9a-f]{64}$'
  require_match same_sha_parser_image_id "$parser_image" '^sha256:[0-9a-f]{64}$'
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/verify-document-parser-acceptance.mjs' --release-root '$RELEASE_ROOT' --report '$report' --source-sha '$RELEASE_SHA' --worker-image-id '$worker_image' --parser-image-id '$parser_image'"
  worker_container="$(compose_current 'ps -q agent-worker')"
  parser_container="$(compose_current 'ps -q document-parser')"
  [[ "$worker_container" =~ ^[0-9a-f]{12,64}$ && "$parser_container" =~ ^[0-9a-f]{12,64}$ ]] || {
    echo "错误：same-SHA Worker/Parser 运行容器身份非法" >&2
    return 66
  }
  running_worker_image="$(run_remote "docker inspect --format='{{.Image}}' '$worker_container'")"
  running_parser_image="$(run_remote "docker inspect --format='{{.Image}}' '$parser_container'")"
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/production-deploy-lock.mjs' verify-state --active-sha '$ACTIVE_RELEASE_SHA' --rollback-sha '$RELEASE_SHA' --accepted-worker-image-id '$worker_image' --accepted-parser-image-id '$parser_image' --current-worker-image-id '$worker_image' --current-parser-image-id '$parser_image' --running-worker-image-id '$running_worker_image' --running-parser-image-id '$running_parser_image'"
  verify_release_capability "$REMOTE_ROOT/.release-capabilities/$RELEASE_SHA"
  if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
    compose_embedding_current "ps --status running --services | grep -qx embedding-worker"
    compose_embedding_current "run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs"
  fi
  expect_http_status https://OpenScience.428312321.xyz/ 200
  expect_http_status https://OpenScience.428312321.xyz/auth/me 401
  expect_http_status https://OpenScience.428312321.xyz/admin/ 401
  expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"
  if [ "$EMBEDDING_DEPLOY" -eq 0 ]; then
    log "same-SHA disabled：收敛残留 embedding-worker..."
    compose_embedding_current "stop embedding-worker"
    run_remote "set -euo pipefail; cd '$RELEASE_ROOT'; services=\$(XGS_RELEASE_ROOT='$RELEASE_ROOT' XGS_RELEASE_IMAGE_TAG='$RELEASE_SHA' docker compose --profile embedding --env-file '$PROD_ENV' -f '$COMPOSE_FILE' ps --status running --services); if printf '%s\n' \"\$services\" | grep -qx embedding-worker; then exit 1; fi"
  fi
}
