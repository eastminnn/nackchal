# nackchal

물건의 가치를 맞히고, 채팅하고, 친구에게 토마토를 던지는 경매 파티 게임입니다.

프론트엔드는 로컬 미리보기이며, 백엔드는 Spring Boot와 PostgreSQL의 개발 환경까지 구성돼 있습니다. 게임 상태는 아직 브라우저 메모리에 있습니다. 실제 사람끼리 하는 입찰·채팅, 로그인, WebSocket, DB 저장은 다음 단계에서 연결합니다.

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

게임 화면·모델 제작은 [프론트엔드 안내](frontend/README.md), 서버 구조·설정은 [백엔드 안내](backend/README.md)를 참고합니다. `docs/`는 로컬 문서로 유지하며 Git에 포함하지 않습니다.

## 전체 환경 실행

Docker와 Docker Compose가 필요합니다. 최초 실행 때만 환경변수 파일을 복사합니다. 이미 `.env`가 있으면 덮어쓰지 않습니다.

```sh
cp -n .env.example .env
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

`down` 후에도 PostgreSQL 데이터는 named volume에 남습니다. 예시 비밀번호와 loopback 포트는 로컬 개발용입니다. Oracle 배포 전에 도메인·HTTPS·운영 비밀번호·외부 포트 정책을 따로 적용해야 합니다. 현재 설정은 공개 배포가 아닙니다.

프론트만 수정한 경우 다음 명령은 프론트 컨테이너만 다시 만듭니다.

```sh
docker compose up -d --build --no-deps frontend
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

브라우저 검증은 `frontend/`에서 실행하며 결과도 `frontend/.qa/`에 저장됩니다.

```sh
pnpm -C frontend preview --port 4185 --strictPort
# 다른 터미널에서 실행
pnpm -C frontend qa:game
pnpm -C frontend qa:chat
pnpm -C frontend qa:models
```

## 모델과 라이선스

Animal Plushies, Paddles With Numbers, Tiny Treats Bakery Interior, DynaPuff를 사용합니다. [출처 화면](frontend/public/credits.html)과 [라이선스 원문](frontend/public/models/licenses)을 함께 포함합니다. 모델 변환본이 있어 앱 실행에 Blender는 필요하지 않습니다.
