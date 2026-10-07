# 운영·배포 안내

nackchal을 로컬에서 통째로 띄우는 방법, 운영 서버 구성, 자동 배포, DB 백업, CI를 정리합니다. 게임 소개는 [루트 README](../README.md), 서버 설계는 [백엔드](../backend/README.md), 화면 설계는 [프론트엔드](../frontend/README.md)를 보세요.

## 구성 한눈에

```text
브라우저 ──HTTPS──▶ Caddy (운영만, 443) ──▶ Nginx (frontend) ──/api──▶ Spring Boot (backend) ──▶ PostgreSQL
                    인증서 자동 발급         정적 파일 제공                방·경매는 메모리,
                                             /api·WebSocket 프록시          계정·캐시·기록은 DB
```

| 파일 | 역할 |
| --- | --- |
| `docker-compose.yml` | 로컬과 운영 공통. PostgreSQL, 백엔드, 프론트(Nginx). 포트는 모두 127.0.0.1에만 연다. |
| `docker-compose.prod.yml` | 운영 추가분. Caddy가 80·443을 받아 HTTPS로 Nginx에 넘긴다. |
| `infra/nginx/default.conf` | 정적 파일, `/api` 프록시, WebSocket 업그레이드, 가입·로그인 빈도 제한, 실제 클라이언트 IP |
| `deploy/Caddyfile` | `SITE_DOMAIN`의 모든 요청을 Nginx로 전달 |
| `deploy/remote-deploy.sh` | 운영 서버에서 소스를 동기화하고 다시 빌드 |
| `deploy/backup.sh`, `deploy/restore-check.sh` | DB 백업과 복원 확인 |
| `deploy/production.env.example` | 운영 `.env` 항목 예시 |

## 로컬에서 전체 실행

Docker와 Docker Compose가 필요합니다. 최초 실행 때만 환경변수 파일을 복사합니다. 이미 `.env`가 있으면 덮어쓰지 않습니다.

```sh
cp -n .env.example .env
openssl rand -base64 32
```

출력된 값을 `.env`의 `JWT_SECRET=` 뒤에 넣습니다. 디코딩한 길이가 32바이트 이상인 Base64 키가 필수이며 기본값은 없습니다. 같은 키를 유지해야 재시작 후에도 로그인 상태가 이어집니다.

```sh
docker compose up -d --build --wait
```

| 대상 | 주소 |
| --- | --- |
| 게임 | http://127.0.0.1:18000 |
| Nginx를 통한 서버 상태 | http://127.0.0.1:18000/api/health |
| 백엔드 직접 연결 | http://127.0.0.1:18080/api/health |
| PostgreSQL | 127.0.0.1:15432 |

`/api/health/readiness`는 DB 연결까지 확인합니다. DB가 준비된 뒤 백엔드가, 백엔드가 준비된 뒤 Nginx가 시작됩니다. 로컬 포트는 `.env`에서 바꿀 수 있습니다.

```sh
docker compose logs -f backend
docker compose up -d --build --no-deps frontend   # 프론트만 다시 빌드
docker compose down                               # 데이터는 named volume에 남는다
```

`.env.example`의 비밀번호와 loopback 포트는 로컬 개발용입니다.

### 개발 서버로 실행

프론트엔드는 Node.js 24와 pnpm 11.19.0을 사용합니다. 개발 서버의 `/api` 요청은 기본으로 `http://127.0.0.1:18080`으로 전달됩니다. 주소를 바꾸려면 `frontend/.env.example`을 `frontend/.env.local`로 복사해 `BACKEND_URL`을 고칩니다.

```sh
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend dev
```

백엔드는 Java 21이 필요합니다. PostgreSQL만 Docker로 띄우고 서버는 IDE나 Gradle Wrapper로 실행할 수 있습니다. Compose의 백엔드가 떠 있다면 `docker compose stop backend`로 먼저 멈춥니다.

```sh
docker compose up -d --wait postgres
set -a; . ./.env; set +a
export DB_URL="jdbc:postgresql://127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
export SERVER_PORT="$BACKEND_PORT"
./backend/gradlew -p backend bootRun
```

### 검증

```sh
pnpm -C frontend check
pnpm -C frontend build
./backend/gradlew -p backend test bootJar
```

백엔드 테스트는 Docker가 실행 중이어야 합니다. Testcontainers가 임시 PostgreSQL과 무작위 포트를 쓰므로 개발 DB를 건드리지 않습니다. 브라우저 검증 명령은 [프론트엔드 안내](../frontend/README.md#브라우저-검증)에 있습니다.

## 운영 서버

운영 주소는 https://nackchal.duckdns.org 입니다.

| 항목 | 값 |
| --- | --- |
| 서버 | Oracle Cloud 오사카 리전 ARM VM 한 대 (Ubuntu 24.04, Always Free) |
| 도메인 | DuckDNS `nackchal.duckdns.org` → 서버 공인 IP |
| HTTPS | Caddy가 Let's Encrypt 인증서를 자동 발급·갱신. HTTP는 HTTPS로 리다이렉트 |
| 열린 포트 | 80·443만. PostgreSQL·백엔드·Nginx는 서버 내부(127.0.0.1)에만 열림 |
| 실행 | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |

- **방화벽**: Oracle 보안 목록과 서버 iptables에서 TCP 80·443을 허용합니다. iptables 규칙은 `netfilter-persistent`로 저장돼 재부팅 후에도 유지됩니다.
- **실제 사용자 IP**: Caddy 뒤에서는 모든 요청이 Caddy IP로 보이므로, Nginx가 Docker 내부망에서 온 `X-Forwarded-For`를 실제 클라이언트 IP로 씁니다. 그래서 가입·로그인 빈도 제한(IP별 분당 10회)이 사용자별로 동작합니다.
- **비밀값**: 서버의 `~/nackchal/.env`는 서버에서만 만들고 권한은 600입니다. 항목은 [`production.env.example`](production.env.example)에 있으며 로컬 `.env.example`과 값이 다릅니다. `POSTGRES_PASSWORD`와 `JWT_SECRET`은 서버에서 `openssl`로 생성했고 레포·로컬·GitHub에는 없습니다. 운영 값은 `AUTH_COOKIE_SECURE=true`, `ROOM_ALLOWED_ORIGINS=https://nackchal.duckdns.org`, `SITE_DOMAIN=nackchal.duckdns.org`입니다.

## 자동 배포

`main`에 들어온 커밋은 CI가 통과하면 `.github/workflows/deploy.yml`이 자동으로 배포합니다.

```text
main 푸시 → CI 성공 → 소스를 git archive로 묶어 SSH로 전송
         → 서버에서 같은 커밋의 deploy/remote-deploy.sh 실행
         → .env를 남기고 소스 동기화(레포에서 지운 파일은 서버에서도 삭제) → 다시 빌드 → 정상 상태 대기
         → /api/health/readiness 확인
```

- 배포는 한 번에 하나씩 실행하고 진행 중인 배포를 취소하지 않습니다. 서버 호스트 키를 고정합니다.
- GitHub Secrets에는 서버 SSH 개인키(`DEPLOY_SSH_KEY`)와 호스트 키(`DEPLOY_KNOWN_HOSTS`)만 있습니다.
- Actions 화면에서 Deploy 워크플로를 `main`으로 직접 실행할 수도 있습니다.
- **배포하면 백엔드가 재시작돼 진행 중인 경매가 끊깁니다.** 그 판은 보상 없이 중단으로 기록되므로, 사람들이 게임 중일 때는 머지를 피합니다.

수동으로 배포할 때는 아래처럼 실행합니다. `.env`와 Docker volume(DB 데이터, Caddy 인증서)은 그대로 유지됩니다.

```sh
script=$(base64 < deploy/remote-deploy.sh | tr -d '\n')
git archive main | ssh -i ~/.ssh/oracle.key ubuntu@161.33.13.111 "bash -c \"\$(echo $script | base64 -d)\""
curl https://nackchal.duckdns.org/api/health
```

## DB 백업

서버 cron이 매일 03:00(한국 시간)에 `deploy/backup.sh`를 실행합니다.

1. `pg_dump` custom 형식(압축)으로 DB 전체를 뽑아 서버 `~/backups`에 최근 3개를 남깁니다.
2. OCI Object Storage 버킷 `nackchal-backups`(오사카, 비공개)에 올립니다.
3. 14일이 지난 원격 백업을 지웁니다. 실행 기록은 `~/backups/backup.log`에 남습니다.

업로드는 **인스턴스 주체**로 인증합니다. 동적 그룹 `nackchal-server`(이 인스턴스만 포함)와 정책 `nackchal-backup`이 이 버킷의 읽기·쓰기만 허용하므로 서버에 OCI API 키가 없습니다. OCI CLI는 `ghcr.io/oracle/oci-cli` 컨테이너로 실행합니다.

`deploy/restore-check.sh`는 버킷의 최신 백업(또는 지정한 백업)을 임시 PostgreSQL 컨테이너에 되살려 운영 DB와 행 수를 비교하고 지웁니다. 운영 DB는 읽기만 합니다. 실제 복원은 서비스를 멈추고 실행합니다.

```sh
ssh -i ~/.ssh/oracle.key ubuntu@161.33.13.111 '~/nackchal/deploy/restore-check.sh'

# 실제 복원 (운영 DB를 백업 시점으로 되돌림)
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ~/backups/<백업 파일>
docker compose -f docker-compose.yml -f docker-compose.prod.yml start backend
```

## CI

`.github/workflows/ci.yml`은 `main` 대상 PR과 `main` 푸시마다 세 작업을 병렬로 실행합니다.

| 작업 | 내용 |
| --- | --- |
| Backend test | Java 21, `./gradlew test bootJar`. Testcontainers가 러너의 Docker로 PostgreSQL을 띄운다. 실패하면 테스트 리포트를 7일 보관 |
| Frontend check | Node 24, pnpm 11.19.0, `install --frozen-lockfile` → `check` → `build` |
| Docker image build | 백엔드·프론트 이미지가 빌드되는지 확인 (레지스트리에 올리지 않음) |

권한은 `contents: read`만 쓰고, 같은 브랜치에 새 커밋이 오면 이전 실행을 취소합니다.
