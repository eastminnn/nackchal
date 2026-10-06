#!/usr/bin/env bash
# 운영 서버에서 cron으로 매일 실행하는 DB 백업.
# pg_dump(custom 형식, 압축)를 ~/backups에 최근 3개 남기고 Object Storage 버킷에 올린 뒤, 보관 기간이 지난 원격 백업을 지운다.
# 업로드는 인스턴스 주체(instance principal)로 인증하므로 서버에 OCI API 키를 두지 않는다.
# 복원: docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < 파일
set -euo pipefail

app_dir="$HOME/nackchal"
backup_dir="$HOME/backups"
bucket="${NACKCHAL_BACKUP_BUCKET:-nackchal-backups}"
keep_days="${NACKCHAL_BACKUP_KEEP_DAYS:-14}"
name="nackchal-$(date -u +%Y%m%dT%H%M%SZ).dump"
oci=(docker run --rm --network host -v "$backup_dir:/backups" ghcr.io/oracle/oci-cli:latest --auth instance_principal)

mkdir -p "$backup_dir"
cd "$app_dir"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/$name.tmp"
mv "$backup_dir/$name.tmp" "$backup_dir/$name"
"${oci[@]}" os object put --bucket-name "$bucket" --file "/backups/$name" --name "$name" --force >/dev/null

# 서버에는 최근 3개만 남긴다.
ls -1t "$backup_dir"/nackchal-*.dump | tail -n +4 | xargs -r rm --

# 이름의 UTC 시각으로 보관 기간이 지난 원격 백업을 고른다.
cutoff=$(date -u -d "-$keep_days days" +%Y%m%dT%H%M%SZ)
"${oci[@]}" os object list --bucket-name "$bucket" --prefix nackchal- --all \
    | python3 -c 'import json, sys; [print(o["name"]) for o in json.load(sys.stdin).get("data", []) if o["name"][9:25] < sys.argv[1]]' "$cutoff" \
    | while read -r old; do "${oci[@]}" os object delete --bucket-name "$bucket" --object-name "$old" --force; done

echo "backup $name uploaded at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
