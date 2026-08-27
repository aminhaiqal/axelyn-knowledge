#!/usr/bin/env bash

set -Eeuo pipefail

umask 027

readonly DEPLOY_ROOT="/opt/axelyn-knowledge"
readonly ACTIVE_SOURCE="${DEPLOY_ROOT}/source"
readonly ENV_FILE="${DEPLOY_ROOT}/.env"
readonly BACKUP_DIR="${DEPLOY_ROOT}/backups"
readonly RELEASE_DIR="${DEPLOY_ROOT}/releases"
readonly BIN_DIR="${DEPLOY_ROOT}/bin"
readonly REPOSITORY_CACHE="${DEPLOY_ROOT}/repository.git"
readonly DEPLOY_LOCK="${DEPLOY_ROOT}/deploy.lock"
readonly REPOSITORY_URL="https://github.com/aminhaiqal/axelyn-knowledge.git"
readonly LOCAL_READY_URL="http://127.0.0.1:3001/health/ready"

release=""
stage_source=""
rollback_required=0
rollback_source=""
rollback_release=""
environment_backup=""
deployment_timestamp=""

log_event() {
  local event="$1"
  printf '{"time":"%s","component":"github-deploy","event":"%s","release":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$event" \
    "${release:-none}"
}

fail() {
  log_event "$1" >&2
  exit 1
}

read_active_release() {
  sed -n 's/^AXELYN_KNOWLEDGE_RELEASE=//p' "$ENV_FILE" | tail -n 1
}

compose_for() {
  local source_directory="$1"
  local image_release="$2"
  shift 2

  AXELYN_KNOWLEDGE_RELEASE="$image_release" docker compose \
    --env-file "$ENV_FILE" \
    -f "${source_directory}/deploy/compose.production.yaml" \
    "$@"
}

check_ready() {
  curl --fail --silent --show-error --max-time 15 "$LOCAL_READY_URL"
}

write_active_release() {
  local next_release="$1"
  local temporary_environment

  temporary_environment="$(mktemp "${DEPLOY_ROOT}/.env.XXXXXXXX")"
  awk -v release_value="$next_release" '
    BEGIN { found = 0 }
    /^AXELYN_KNOWLEDGE_RELEASE=/ {
      print "AXELYN_KNOWLEDGE_RELEASE=" release_value
      found = 1
      next
    }
    { print }
    END {
      if (!found) {
        print "AXELYN_KNOWLEDGE_RELEASE=" release_value
      }
    }
  ' "$ENV_FILE" >"$temporary_environment"
  chmod 0600 "$temporary_environment"
  mv "$temporary_environment" "$ENV_FILE"
}

preserve_failed_stage() {
  if [[ -n "$stage_source" && -d "$stage_source" ]]; then
    local failed_stage="${RELEASE_DIR}/failed-${release}-${deployment_timestamp}"
    mv "$stage_source" "$failed_stage"
    stage_source=""
    log_event "failed_stage_preserved" >&2
  fi
}

rollback_application() {
  local failed_source="${RELEASE_DIR}/failed-${release}-${deployment_timestamp}"
  local rollback_ok=1

  set +e
  log_event "rollback_started" >&2

  if [[ -d "$ACTIVE_SOURCE" ]]; then
    mv "$ACTIVE_SOURCE" "$failed_source" || rollback_ok=0
  fi

  if [[ -d "$rollback_source" ]]; then
    mv "$rollback_source" "$ACTIVE_SOURCE" || rollback_ok=0
  else
    rollback_ok=0
  fi

  if [[ -f "$environment_backup" ]]; then
    install -m 0600 "$environment_backup" "$ENV_FILE" || rollback_ok=0
  else
    rollback_ok=0
  fi

  if [[ "$rollback_ok" -eq 1 ]]; then
    compose_for "$ACTIVE_SOURCE" "$rollback_release" up -d --wait --no-deps knowledge || rollback_ok=0
  fi

  if [[ "$rollback_ok" -eq 1 ]]; then
    log_event "rollback_completed" >&2
  else
    log_event "rollback_failed_manual_intervention_required" >&2
  fi
}

handle_exit() {
  local exit_status=$?
  trap - EXIT

  if [[ "$exit_status" -ne 0 ]]; then
    if [[ "$rollback_required" -eq 1 ]]; then
      rollback_application
    else
      preserve_failed_stage
    fi
    log_event "deployment_failed" >&2
  fi

  exit "$exit_status"
}

show_health() {
  [[ -f "$ENV_FILE" ]] || fail "environment_missing"
  release="$(read_active_release)"
  [[ "$release" =~ ^[0-9a-f]{12,40}$ ]] || fail "active_release_invalid"
  check_ready
  printf '\n'
}

deploy_release() {
  local requested_release="$1"
  local main_release
  local previous_destination

  [[ "$requested_release" =~ ^[0-9a-f]{40}$ ]] || fail "release_sha_invalid"
  release="$requested_release"
  deployment_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

  [[ -f "$ENV_FILE" ]] || fail "environment_missing"
  [[ -d "$ACTIVE_SOURCE" ]] || fail "active_source_missing"
  [[ -f "${ACTIVE_SOURCE}/deploy/compose.production.yaml" ]] || fail "active_compose_missing"

  install -d -m 0700 "$BACKUP_DIR"
  install -d -m 0750 "$RELEASE_DIR" "$BIN_DIR"
  exec 9>"$DEPLOY_LOCK"
  flock --wait 900 9 || fail "deployment_lock_timeout"

  rollback_release="$(read_active_release)"
  [[ "$rollback_release" =~ ^[0-9a-f]{12,40}$ ]] || fail "active_release_invalid"

  if [[ "$rollback_release" == "$release" ]]; then
    log_event "release_already_active"
    check_ready
    printf '\n'
    return
  fi

  if [[ ! -d "${REPOSITORY_CACHE}/objects" ]]; then
    git init --bare "$REPOSITORY_CACHE" >/dev/null
  fi

  if git --git-dir="$REPOSITORY_CACHE" remote get-url origin >/dev/null 2>&1; then
    git --git-dir="$REPOSITORY_CACHE" remote set-url origin "$REPOSITORY_URL"
  else
    git --git-dir="$REPOSITORY_CACHE" remote add origin "$REPOSITORY_URL"
  fi

  log_event "fetching_main"
  git --git-dir="$REPOSITORY_CACHE" fetch \
    --force \
    --prune \
    --no-tags \
    --depth=1 \
    origin \
    refs/heads/main:refs/remotes/origin/main

  main_release="$(git --git-dir="$REPOSITORY_CACHE" rev-parse refs/remotes/origin/main)"
  [[ "$main_release" == "$release" ]] || fail "release_is_not_current_main"

  stage_source="$(mktemp -d "${DEPLOY_ROOT}/.source-${release}.XXXXXXXX")"
  git --git-dir="$REPOSITORY_CACHE" archive "$release" |
    tar --extract --file=- --directory "$stage_source"

  [[ -f "${stage_source}/Dockerfile" ]] || fail "release_dockerfile_missing"
  [[ -f "${stage_source}/deploy/compose.production.yaml" ]] || fail "release_compose_missing"
  [[ -f "${stage_source}/deploy/github-deploy.sh" ]] || fail "release_deployer_missing"

  log_event "building_images"
  docker build \
    --pull \
    --label "org.opencontainers.image.revision=${release}" \
    --label "org.opencontainers.image.source=${REPOSITORY_URL}" \
    --target migrator \
    --tag "axelyn-knowledge-migrator:${release}" \
    "$stage_source"
  docker build \
    --pull \
    --label "org.opencontainers.image.revision=${release}" \
    --label "org.opencontainers.image.source=${REPOSITORY_URL}" \
    --target runner \
    --tag "axelyn-knowledge-app:${release}" \
    "$stage_source"

  log_event "running_migrations"
  compose_for "$stage_source" "$release" --profile tools run --rm --no-deps migrate

  environment_backup="${BACKUP_DIR}/.env.before-${release}-${deployment_timestamp}"
  install -m 0600 "$ENV_FILE" "$environment_backup"

  previous_destination="${RELEASE_DIR}/${rollback_release}"
  if [[ -e "$previous_destination" ]]; then
    previous_destination="${RELEASE_DIR}/${rollback_release}-${deployment_timestamp}"
  fi

  log_event "switching_release"
  mv "$ACTIVE_SOURCE" "$previous_destination"
  rollback_source="$previous_destination"
  rollback_required=1
  mv "$stage_source" "$ACTIVE_SOURCE"
  stage_source=""
  write_active_release "$release"

  compose_for "$ACTIVE_SOURCE" "$release" up -d --wait --no-deps knowledge
  check_ready
  printf '\n'

  rollback_required=0
  install -m 0750 "${ACTIVE_SOURCE}/deploy/github-deploy.sh" "${BIN_DIR}/github-deploy.next"
  mv "${BIN_DIR}/github-deploy.next" "${BIN_DIR}/github-deploy"
  log_event "deployment_completed"
}

main() {
  local request="${SSH_ORIGINAL_COMMAND:-}"
  local operation=""
  local requested_release=""
  local unexpected=""

  if [[ -z "$request" && "$#" -gt 0 ]]; then
    request="$*"
  fi

  IFS=' ' read -r operation requested_release unexpected <<<"$request"
  [[ -z "$unexpected" ]] || fail "command_rejected"

  case "$operation" in
    health)
      [[ -z "$requested_release" ]] || fail "command_rejected"
      show_health
      ;;
    deploy)
      [[ -n "$requested_release" ]] || fail "command_rejected"
      deploy_release "$requested_release"
      ;;
    *)
      fail "command_rejected"
      ;;
  esac
}

trap handle_exit EXIT
main "$@"
