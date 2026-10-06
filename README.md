# nackchal

물건의 가치를 맞히고, 채팅하고, 친구에게 토마토를 던지는 경매 파티 게임입니다.

이메일·비밀번호 인증과 최대 4명의 공유 대기실을 Spring Boot에 연결했습니다. 방 목록·입장·준비·채팅과 10라운드 경매(입찰·낙찰·가치 공개·순위)는 서버 상태를 공유하고, 끝까지 남은 참가자는 순위에 따라 계정 캐시를 받습니다. 상점과 장난 아이템은 아직 온라인으로 제공하지 않습니다.

## 공유 대기실

인증된 `GET /api/rooms`와 Spring 네이티브 WebSocket JSON `/api/rooms/ws`를 사용합니다. 같은 계정의 로비 연결은 여러 개 허용하지만 방 참여는 한 방·한 활성 연결만 허용하며, 다른 탭이 기존 연결을 빼앗을 수 없습니다.

- 방 정원은 4명입니다. 연결된 참가자 2명 이상이고 방장을 뺀 전원이 준비하면 방장이 경매를 시작합니다. 게임 중에는 새 참가자가 들어올 수 없고 재접속만 허용합니다.
- 연결 종료를 서버가 감지하면 자리를 30초 보관하고 준비 상태를 해제합니다. 예약 자리도 정원에 포함하며, 유예가 끝나면 정리합니다. 명시적 퇴장은 즉시 반영합니다.
- 방장은 남아 있는 참가자 중 가장 먼저 입장한 사람에게 승계합니다. 빈 방은 삭제합니다.
- 채팅은 앞뒤 공백 제거 후 1~100 유니코드 코드 포인트, 사용자별 1초 간격이며 최근 30개를 공유합니다.
- 방·준비·연결·채팅과 진행 중인 경매는 서버 메모리에만 저장합니다. 방 DB 테이블과 서버 재시작 후 방 복원은 없습니다. 게임 시작·결과와 캐시 원장·잔액은 PostgreSQL에 저장합니다. 상점과 주머니는 탭 내 미리보기입니다.

WebSocket은 JWT 쿠키와 허용된 Origin을 모두 검사합니다. `ROOM_ALLOWED_ORIGINS`는 쉼표로 구분한 출처 목록이며 기본값은 `127.0.0.1`·`localhost`의 HTTP 포트 `18000`, `4185`, `5173`입니다. 다른 포트나 운영 도메인은 명시적으로 추가합니다. 프론트는 연결 인증이 만료되기 1분 전에 토큰을 갱신하고 서버는 열린 연결을 연장합니다. 갱신하지 못하고 만료되면 `4401`로 연결을 종료하고 재인증 후 재접속합니다. 로그아웃 시 기존 연결을 `4403`으로 닫고 해당 계정의 자리를 즉시 제거합니다.

Vite와 Nginx는 같은 출처의 `/api/rooms/ws` 연결도 프록시합니다. 명령과 응답 계약은 [백엔드 안내](backend/README.md)를 참고합니다.

## 디렉토리

```text
nackchal/
├── frontend/                 # React·TypeScript·Vite
│   ├── src/                  # 화면, 공통 UI, 게임 규칙, 3D 장면
│   ├── public/               # 모델·이미지·라이선스
│   ├── assets/brand/         # 망치 모델 원본
│   ├── scripts/              # 자산 변환과 브라우저 검증
│   └── Dockerfile            # 프론트 빌드 + Nginx
├── backend/                  # Java 21·Spring Boot·Gradle
│   ├── src/main/java/com/nackchal/
│   ├── src/main/resources/   # 환경 설정과 DB 마이그레이션
│   ├── src/test/             # 실제 PostgreSQL 통합 테스트
│   ├── gradle/wrapper/
│   └── Dockerfile
├── infra/nginx/              # 정적 파일·API 프록시 설정
├── .github/                  # PR 템플릿
├── .env.example              # 로컬 환경변수 예시
└── docker-compose.yml        # Nginx·Spring·PostgreSQL
```

게임 화면·모델 제작은 [프론트엔드 안내](frontend/README.md), 서버 구조·설정은 [백엔드 안내](backend/README.md)를 참고합니다. `docs/`와 `backend/docs/`는 로컬 문서로 유지하며 Git에 포함하지 않습니다.

## 전체 환경 실행

Docker와 Docker Compose가 필요합니다. 최초 실행 때만 환경변수 파일을 복사합니다. 이미 `.env`가 있으면 덮어쓰지 않습니다.

```sh
cp -n .env.example .env
openssl rand -base64 32
```

출력된 값을 `.env`의 `JWT_SECRET=` 뒤에 넣습니다. 디코딩한 길이가 32바이트 이상인 Base64 키가 필수이며 기본값은 없습니다. 기존 로그인 유지를 위해 서버를 재시작하거나 배포할 때도 같은 키를 사용합니다.

```sh
docker compose up -d --build --wait
```

| 대상 | 주소 |
| --- | --- |
| 프론트엔드 | http://127.0.0.1:18000 |
| Nginx를 통한 서버 상태 | http://127.0.0.1:18000/api/health |
| 백엔드 직접 연결 | http://127.0.0.1:18080/api/health |
| PostgreSQL | 127.0.0.1:15432 |

`/api/health/readiness`는 DB 연결도 확인합니다. DB가 준비된 뒤 백엔드가 시작되고, 백엔드가 준비된 뒤 Nginx가 시작됩니다. 로컬 포트는 `.env`에서 변경할 수 있습니다.

```sh
docker compose logs -f backend
docker compose down
```

`down` 후에도 PostgreSQL 데이터는 named volume에 남습니다. 예시 비밀번호와 loopback 포트는 로컬 개발용입니다. 공개 배포는 아래 [운영 배포](#운영-배포)를 따릅니다.

첫 화면에서 가입한 뒤 로그인합니다. `user`는 프로필, `auth`는 가입·로그인·토큰 갱신을 담당합니다. 인증에는 서버 세션 대신 HttpOnly 쿠키로 전달하는 JWT access 토큰(15분)과 refresh 토큰(최초 로그인부터 7일)을 사용합니다. refresh 토큰은 갱신할 때마다 교체되며 DB에는 해시만 저장합니다. 갱신해도 최초 만료일은 늘어나지 않습니다. 같은 `JWT_SECRET`과 DB를 유지하면 서버 재시작 후에도 로그인 상태를 복구할 수 있습니다.

로그아웃은 refresh 토큰을 폐기하고 브라우저 쿠키를 지웁니다. 별도로 복사된 access JWT는 즉시 폐기되지 않으며 남은 유효기간(최대 15분) 동안 사용할 수 있습니다. HTTPS 배포 시 `AUTH_COOKIE_SECURE=true`를 설정합니다. Nginx는 가입·로그인 요청을 IP별 분당 10회, 초과분 20회까지 순간 허용하며 초과 시 429를 반환합니다. 외부 요청은 Nginx로만 받고 백엔드 포트는 공개하지 않습니다.

프론트만 수정한 경우 다음 명령은 프론트 컨테이너만 다시 만듭니다.

```sh
docker compose up -d --build --no-deps frontend
```

## 운영 배포

운영 주소는 https://nackchal.duckdns.org 입니다. Oracle Cloud 오사카 리전의 ARM VM(Ubuntu 24.04) 한 대에서 `docker-compose.yml`과 `docker-compose.prod.yml`을 함께 실행합니다. DNS는 DuckDNS가 서버 공인 IP를 가리킵니다.

- `docker-compose.prod.yml`이 Caddy를 추가합니다. 외부에는 Caddy의 80·443만 열리고, Let's Encrypt 인증서를 자동으로 받고 갱신합니다. HTTP는 HTTPS로 넘깁니다. PostgreSQL·백엔드·Nginx 포트는 서버의 127.0.0.1에만 열립니다.
- Nginx는 Docker 내부망에서 온 `X-Forwarded-For`를 실제 클라이언트 IP로 사용합니다. 그래서 가입·로그인 빈도 제한이 Caddy 뒤에서도 사용자 IP별로 동작합니다.
- Oracle 보안 목록과 서버 iptables에서 TCP 80·443을 허용합니다. iptables 규칙은 `netfilter-persistent`로 저장돼 재부팅 후에도 유지됩니다.
- 서버의 `~/nackchal/.env`는 서버에서만 만들고 권한은 600입니다. 항목은 [`deploy/production.env.example`](deploy/production.env.example)에 있으며 로컬용 `.env.example`과 값이 다릅니다. `POSTGRES_PASSWORD`와 `JWT_SECRET`은 서버에서 `openssl`로 생성했고 레포·로컬에는 없습니다. 운영 값은 `AUTH_COOKIE_SECURE=true`, `ROOM_ALLOWED_ORIGINS=https://nackchal.duckdns.org`, `SITE_DOMAIN=nackchal.duckdns.org`입니다.

`main`에 들어온 커밋은 CI가 통과하면 `.github/workflows/deploy.yml`이 자동으로 배포합니다. 소스를 `git archive`로 묶어 SSH로 보내고, 같은 커밋의 `deploy/remote-deploy.sh`를 서버에서 실행합니다. 스크립트는 `.env`를 남긴 채 소스를 동기화하고(레포에서 지운 파일은 서버에서도 지움) 다시 빌드한 뒤, 컨테이너가 정상 상태가 될 때까지 기다립니다. 마지막으로 워크플로가 `/api/health/readiness`를 확인합니다. GitHub Secrets에는 서버 SSH 개인키(`DEPLOY_SSH_KEY`)와 호스트 키(`DEPLOY_KNOWN_HOSTS`)만 있고 DB 비밀번호와 `JWT_SECRET`은 서버 `.env`에만 있습니다. Actions 화면에서 Deploy 워크플로를 `main`으로 직접 실행할 수도 있습니다.

수동으로 배포할 때는 아래처럼 실행합니다. `.env`와 Docker volume(DB 데이터, Caddy 인증서)은 그대로 유지됩니다.

```sh
script=$(base64 < deploy/remote-deploy.sh | tr -d '\n')
git archive main | ssh -i ~/.ssh/oracle.key ubuntu@161.33.13.111 "bash -c \"\$(echo $script | base64 -d)\""
curl https://nackchal.duckdns.org/api/health
```

백엔드 재시작 시 진행 중인 경매는 사라지며, 이전 실행에서 끝내지 못한 판은 보상 없이 중단으로 기록됩니다.

### DB 백업

서버 cron이 매일 03:00(한국 시간)에 `deploy/backup.sh`를 실행합니다. `pg_dump` custom 형식(압축)으로 DB 전체를 뽑아 서버 `~/backups`에 최근 3개를 남기고, OCI Object Storage 버킷 `nackchal-backups`(오사카, 비공개)에 올린 뒤 14일이 지난 원격 백업을 지웁니다. 실행 기록은 `~/backups/backup.log`에 남습니다.

업로드는 인스턴스 주체로 인증합니다. 동적 그룹 `nackchal-server`(이 인스턴스만 포함)와 정책 `nackchal-backup`이 이 버킷의 읽기·쓰기만 허용하므로 서버에 OCI API 키가 없습니다. OCI CLI는 `ghcr.io/oracle/oci-cli` 컨테이너로 실행합니다.

`deploy/restore-check.sh`는 버킷의 최신 백업(또는 지정한 백업)을 임시 PostgreSQL 컨테이너에 되살려 운영 DB와 행 수를 비교하고 지웁니다. 운영 DB는 읽기만 합니다. 실제 복원은 서비스를 멈추고 실행합니다.

```sh
ssh -i ~/.ssh/oracle.key ubuntu@161.33.13.111 '~/nackchal/deploy/restore-check.sh'
# 실제 복원 (운영 DB를 백업 시점으로 되돌림)
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < ~/backups/<백업 파일>
docker compose -f docker-compose.yml -f docker-compose.prod.yml start backend
```

## 로컬 개발

프론트엔드는 Node.js 24와 pnpm 11.19.0을 사용합니다.

```sh
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend dev
```

개발 서버의 `/api` 요청은 기본적으로 `http://127.0.0.1:18080`으로 전달됩니다. 백엔드 주소를 바꾸려면 `frontend/.env.example`을 `frontend/.env.local`로 복사하고 `BACKEND_URL`을 변경합니다. 비밀번호를 프론트 환경변수에 넣지 않습니다.

백엔드는 Java 21이 필요합니다. PostgreSQL만 Docker로 실행하고 서버는 IDE나 Gradle로 실행할 수 있습니다. `.env`는 Compose가 읽으며, 직접 실행하는 Spring 프로세스에는 아래처럼 전달합니다.

```sh
docker compose up -d --wait postgres
set -a
. ./.env
set +a
export DB_URL="jdbc:postgresql://127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
export SERVER_PORT="$BACKEND_PORT"
./backend/gradlew -p backend bootRun
```

이미 Compose의 백엔드를 실행 중이라면 `docker compose stop backend`로 해당 서버만 멈춘 후 로컬 서버를 실행합니다. Gradle은 Wrapper를 사용하므로 별도 설치할 필요가 없습니다.

## 검증

```sh
pnpm -C frontend check
pnpm -C frontend build
./backend/gradlew -p backend test bootJar
```

백엔드 테스트는 Docker가 실행 중이어야 합니다. Testcontainers가 임시 PostgreSQL과 무작위 HTTP 포트를 사용하므로 개발 DB나 다른 프로젝트의 포트를 공유하지 않습니다.

GitHub Actions(`.github/workflows/ci.yml`)는 `main` 대상 PR과 `main` 푸시마다 위 명령과 같은 백엔드 테스트·프론트 검사·빌드를 실행하고, 백엔드·프론트 Docker 이미지가 빌드되는지 확인합니다. 이미지를 레지스트리에 올리거나 배포하지는 않습니다. 백엔드 테스트가 실패하면 테스트 리포트를 실행 결과의 아티팩트로 7일간 보관합니다.

브라우저 검증은 `frontend/`에서 실행하며 결과도 `frontend/.qa/`에 저장됩니다.

```sh
pnpm -C frontend preview --port 4185 --strictPort
# 다른 터미널에서 실행
pnpm -C frontend qa:game
pnpm -C frontend qa:auth
NACKCHAL_URL=http://127.0.0.1:4185 pnpm -C frontend qa:rooms
pnpm -C frontend qa:chat
pnpm -C frontend qa:models
```

## 모델과 라이선스

Animal Plushies, Paddles With Numbers, Tiny Treats Bakery Interior, DynaPuff를 사용합니다. [출처 화면](frontend/public/credits.html)과 [라이선스 원문](frontend/public/models/licenses)을 함께 포함합니다. 모델 변환본이 있어 앱 실행에 Blender는 필요하지 않습니다.
