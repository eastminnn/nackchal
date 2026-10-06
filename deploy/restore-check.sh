#!/usr/bin/env bash
# 백업이 실제로 복원되는지 확인한다. 버킷의 백업을 임시 PostgreSQL 컨테이너에 되살려 운영 DB와 행 수를 비교하고 지운다.
# 운영 DB는 읽기만 한다. 사용: deploy/restore-check.sh [백업 이름] (생략하면 버킷의 최신 백업)
set -euo pipefail

bucket="${NACKCHAL_BACKUP_BUCKET:-nackchal-backups}"
work=$(mktemp -d)
# OCI CLI 컨테이너는 root가 아닌 사용자로 실행되므로 내려받을 임시 폴더에 쓰기 권한을 준다. 끝나면 지운다.
chmod 777 "$work"
container="nackchal-restore-check"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
oci=(docker run --rm --network host -v "$work:/restore" ghcr.io/oracle/oci-cli:latest --auth instance_principal)

name="${1:-$("${oci[@]}" os object list --bucket-name "$bucket" --prefix nackchal- --all \
    | python3 -c 'import json, sys; print(max(o["name"] for o in json.load(sys.stdin)["data"]))')}"
"${oci[@]}" os object get --bucket-name "$bucket" --name "$name" --file "/restore/$name" >/dev/null

docker run -d --name "$container" -e POSTGRES_USER=nackchal -e POSTGRES_DB=nackchal \
    -e POSTGRES_PASSWORD=restore-check postgres:18-alpine >/dev/null
until docker exec "$container" pg_isready -U nackchal -d nackchal -q; do sleep 1; done
sleep 2
docker exec -i "$container" pg_restore -U nackchal -d nackchal --no-owner < "$work/$name"

counts="SELECT (SELECT count(*) FROM users) || ' users, ' || (SELECT count(*) FROM wallets) || ' wallets, '
  || (SELECT count(*) FROM games) || ' games, ' || (SELECT count(*) FROM cash_transactions) || ' ledger, schema v'
  || (SELECT max(version) FROM flyway_schema_history WHERE success)"
restored=$(docker exec "$container" psql -U nackchal -d nackchal -Atc "$counts")
production=$(cd "$HOME/nackchal" && docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<< "$counts")
echo "backup:     $name"
echo "restored:   $restored"
echo "production: $production"
