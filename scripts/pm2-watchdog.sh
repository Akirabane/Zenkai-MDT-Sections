#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_PREFIX="[pm2-watchdog]"
CHECK_INTERVAL="${PM2_WATCHDOG_INTERVAL:-2}"
RESTART_COOLDOWN="${PM2_WATCHDOG_RESTART_COOLDOWN:-15}"
STATE_DIR="${PM2_WATCHDOG_STATE_DIR:-/tmp/pm2-watchdog}"
SERVICES_RAW="${PM2_WATCHDOG_SERVICES:-police-status police-konoha data-guard police-backup}"
ECOSYSTEM_FILE="${PM2_WATCHDOG_ECOSYSTEM:-$ROOT_DIR/ecosystem.config.js}"
PM2_BIN="${PM2_BIN:-pm2}"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

log() {
  printf '%s %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$LOG_PREFIX" "$*"
}

parse_services() {
  local normalized
  normalized="$(printf '%s' "$SERVICES_RAW" | tr ',' ' ')"
  read -r -a SERVICES <<< "$normalized"
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
}

restart_stamp_path() {
  local service="$1"
  local safe_name
  safe_name="$(printf '%s' "$service" | tr '/: ' '___')"
  printf '%s/%s.restart' "$STATE_DIR" "$safe_name"
}

mark_restart_attempt() {
  local service="$1"
  date +%s > "$(restart_stamp_path "$service")"
}

seconds_since_last_restart() {
  local service="$1"
  local stamp_file
  local last_attempt
  local now_ts

  stamp_file="$(restart_stamp_path "$service")"
  if [[ ! -f "$stamp_file" ]]; then
    printf '%s' 999999
    return
  fi

  last_attempt="$(cat "$stamp_file" 2>/dev/null || printf '0')"
  now_ts="$(date +%s)"

  if [[ ! "$last_attempt" =~ ^[0-9]+$ ]]; then
    printf '%s' 999999
    return
  fi

  printf '%s' "$((now_ts - last_attempt))"
}

pm2_jlist() {
  "$PM2_BIN" jlist 2>/dev/null || return 1
}

pm2_status_for() {
  local service="$1"
  local json="$2"
  local status

  status="$(node -e "const service = process.argv[1]; const payload = process.argv[2] || '[]'; let list = []; try { list = JSON.parse(payload); } catch (error) { process.exit(2); } const row = Array.isArray(list) ? list.find((item) => item && item.name === service) : null; if (!row || !row.pm2_env) { process.stdout.write('missing'); process.exit(0); } process.stdout.write(String(row.pm2_env.status || 'unknown').trim().toLowerCase());" "$service" "$json" 2>/dev/null)" || {
    printf 'unknown'
    return
  }

  status="$(trim "$status")"
  if [[ -z "$status" ]]; then
    printf 'unknown'
    return
  fi

  printf '%s' "$status"
}

restart_service() {
  local service="$1"

  log "restart demande pour $service"
  mark_restart_attempt "$service"

  if "$PM2_BIN" restart "$service" --update-env >/dev/null 2>&1; then
    log "$service relance via pm2 restart"
    return 0
  fi

  if [[ -f "$ECOSYSTEM_FILE" ]] && "$PM2_BIN" start "$ECOSYSTEM_FILE" --only "$service" --env production >/dev/null 2>&1; then
    log "$service relance via ecosystem"
    return 0
  fi

  log "echec de relance pour $service"
  return 1
}

should_restart() {
  local status="$1"

  case "$status" in
    stopped|errored)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

wait_for_pm2() {
  until "$PM2_BIN" ping >/dev/null 2>&1; do
    log "PM2 indisponible, nouvelle tentative dans ${CHECK_INTERVAL}s"
    sleep "$CHECK_INTERVAL"
  done
}

main_loop() {
  local pm2_snapshot
  local status_value
  local since_restart

  parse_services
  ensure_state_dir

  if [[ "${#SERVICES[@]}" -eq 0 ]]; then
    log "aucun service configure, arret"
    exit 1
  fi

  log "watchdog actif pour: ${SERVICES[*]}"

  while true; do
    wait_for_pm2

    if ! pm2_snapshot="$(pm2_jlist)"; then
      log "impossible de lire pm2 jlist, nouvelle tentative dans ${CHECK_INTERVAL}s"
      sleep "$CHECK_INTERVAL"
      continue
    fi

    for service in "${SERVICES[@]}"; do
      status_value="$(pm2_status_for "$service" "$pm2_snapshot")"

      if ! should_restart "$status_value"; then
        continue
      fi

      since_restart="$(seconds_since_last_restart "$service")"
      if [[ "$since_restart" -lt "$RESTART_COOLDOWN" ]]; then
        log "$service encore en etat '$status_value', cooldown actif (${since_restart}s/${RESTART_COOLDOWN}s)"
        continue
      fi

      log "$service detecte en etat '$status_value'"
      restart_service "$service"
    done

    sleep "$CHECK_INTERVAL"
  done
}

main_loop
