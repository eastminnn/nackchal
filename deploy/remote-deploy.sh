#!/usr/bin/env bash
# 운영 서버에서 실행하는 배포 스크립트. Deploy 워크플로가 배포할 커밋의 이 파일을 SSH로 넘겨 실행한다.
# 표준 입력으로 받은 소스 tar(git archive)를 ~/nackchal에 반영하고 다시 빌드한다.
# 서버의 .env와 Docker volume(DB, 인증서)은 그대로 둔다.
set -euo pipefail

app_dir="$HOME/nackchal"
compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

# 배포가 겹치면 앞선 배포가 끝날 때까지 기다린다.
exec 9>"$HOME/.nackchal-deploy.lock"
flock -w 900 9

incoming=$(mktemp -d)
trap 'rm -rf "$incoming"' EXIT
tar -x -C "$incoming"
if [[ ! -f "$incoming/docker-compose.prod.yml" ]]; then
  echo "archive is missing docker-compose.prod.yml" >&2
  exit 1
fi

# 레포에서 지운 파일도 서버에서 지운다. 서버에만 있는 .env는 남긴다.
rsync -a --delete --exclude .env "$incoming"/ "$app_dir"/
cd "$app_dir"
"${compose[@]}" up -d --build --wait --wait-timeout 300 --remove-orphans
docker image prune -f >/dev/null
echo "deployed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
