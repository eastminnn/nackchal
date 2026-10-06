# nackchal backend

Java 21, Spring Boot 4.1.1, Gradle Wrapper 9.7.1을 사용합니다. Web MVC, 네이티브 WebSocket, Validation, JPA, PostgreSQL, Flyway, Actuator가 설정돼 있습니다. 버전과 Java 호환 범위는 [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/system-requirements.html)를 기준으로 확인했습니다.

## 실행

전체 컨테이너 실행과 환경변수 전달 방법은 [루트 README](../README.md)를 따릅니다. 이 디렉토리에서 서버를 실행할 때는 Java 21을 선택하고 DB 환경변수를 전달합니다.

```sh
./gradlew bootRun
./gradlew test bootJar
```

| 환경변수 | 기본값 / 용도 |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://127.0.0.1:15432/nackchal` |
| `POSTGRES_USER` | `nackchal` |
| `POSTGRES_PASSWORD` | 별도 전달 필요 |
| `SERVER_PORT` | `18080`, 컨테이너 내부는 `8080` |
| `JWT_SECRET` | 기본값 없음. 디코딩 후 32바이트 이상인 Base64 서명 키, `openssl rand -base64 32`로 생성 |
| `AUTH_COOKIE_SECURE` | 로컬 HTTP는 `false`, 운영 HTTPS는 `true` |
| `ROOM_ALLOWED_ORIGINS` | 쉼표로 구분한 WebSocket Origin 허용 목록. 기본값은 `http://127.0.0.1`·`http://localhost`의 `18000`, `4185`, `5173` 포트 |

`GET /api/health`는 서버와 DB 상태를 반환합니다. `/api/health/liveness`는 프로세스 상태, `/api/health/readiness`는 요청 처리 준비 상태와 DB 연결을 확인합니다. 다른 Actuator 엔드포인트와 상세 DB 정보는 공개하지 않습니다.

## 패키지와 DB

진입점은 `com.nackchal.NackchalApplication`입니다. [yufesta-server의 common/domain 구조](https://github.com/yu-festa/yufesta-server/tree/7562f479cca29058511a9baa621ebffcec7a52f0/src/main/java/com/yufesta)를 기준으로 공통 처리와 도메인을 나눕니다.

```text
com.nackchal
├── common
│   ├── exception
│   │   ├── CustomException
│   │   ├── GlobalExceptionHandler
│   │   ├── ErrorResponseController
│   │   └── error/             # ErrorCode, ErrorResponse, ValidationError
│   └── security
│       ├── config/            # SecurityConfig, AuthProperties
│       ├── handler/           # SecurityErrorResponseHandler
│       ├── jwt/               # JwtTokenProvider, JwtAuthenticationFilter
│       └── service/           # AuthCookieService
└── domain
    ├── user
    │   ├── entity/
    │   ├── repository/
    │   └── dto/response/
    └── auth
        ├── controller/
        ├── service/
        ├── repository/
        ├── entity/
        └── dto/
            ├── request/
            └── response/
```

컨트롤러는 HTTP 입출력을 처리하고 `AuthService`가 가입·비밀번호 확인·현재 사용자 조회를 담당합니다. `AuthTokenService`는 토큰 발급·갱신·폐기, `AuthCookieService`는 쿠키 발급·삭제를 맡습니다. `user` 도메인은 닉네임과 캐릭터 프로필을 관리합니다. 엔티티를 응답으로 반환하지 않습니다. 새로운 기능은 `domain/<기능>` 아래 같은 기준으로 추가하고 필요한 레이어만 만듭니다. 테스트도 `common`과 `domain` 구조를 따릅니다.

코드 작성 방식도 참고 프로젝트를 따릅니다. 생성자로 의존성을 주입하고, DB 서비스는 클래스에 읽기 전용 트랜잭션을 선언한 뒤 쓰기 메서드에 `@Transactional`을 붙입니다. 메모리 기반 `RoomService`는 사용자별 입장 잠금과 방별 잠금으로 상태를 보호하며 DB 트랜잭션을 사용하지 않습니다. DTO는 record와 `from`·`of` 팩터리를 사용합니다. 클래스 주석에는 역할을 짧게 적고 서비스의 업무 예외는 `@throws`로 안내합니다. 본문 주석에는 동시 가입 충돌, CSRF, 오류 응답처럼 코드만으로 의도를 알기 어려운 이유를 남깁니다.

`V1__create_accounts.sql`은 기존 마이그레이션으로 유지합니다. `V2__rename_users_and_add_refresh_tokens.sql`이 `accounts`를 `users`, `email_credentials.account_id`를 `user_id`로 변경하고 `refresh_tokens`를 추가합니다. 기존 UUID·프로필·인증 정보는 유지됩니다. 가입 시 `users`와 `email_credentials`를 같은 트랜잭션에 저장하며, 이메일은 소문자·앞뒤 공백 제거 후 유니크 제약으로 보호합니다. 적용한 마이그레이션은 수정하지 않고 다음 버전을 추가합니다. Hibernate는 `ddl-auto=validate`입니다.

## 인증 API

| 요청 | 본문 / 응답 |
| --- | --- |
| `GET /api/auth/csrf` | `{headerName, token}`. 변경 요청 전에 받아 해당 헤더에 전달 |
| `POST /api/auth/register` | JSON `{email, password, nickname}` → `201`. 자동 로그인하지 않음 |
| `POST /api/auth/login` | JSON `{email, password}` → `204`와 access·refresh 쿠키 |
| `GET /api/auth/me` | `{id, nickname, avatarCode}`. 비로그인은 `401` |
| `POST /api/auth/refresh` | CSRF 헤더 필요. refresh 쿠키 교체·access 재발급 후 `204`, 만료·재사용은 `401` |
| `POST /api/auth/logout` | CSRF 헤더 필요. refresh 토큰 폐기·인증 쿠키 삭제 후 `204` |

닉네임은 글자·숫자·`_`·`-` 1~12자이며 중복을 허용합니다. 비밀번호는 10~128자이며 공백을 임의로 바꾸지 않습니다. PBKDF2-HMAC-SHA256 해시만 저장합니다. 초기 캐릭터는 `plush-bear`이며 인증 기준은 계정 UUID입니다.

Spring Security는 stateless로 설정하며 HttpSession을 사용하지 않습니다. access 토큰은 HS256으로 서명한 JWT이고 사용자 UUID를 식별자로 사용합니다. refresh 토큰은 256비트 난수이며 DB에는 SHA-256 해시만 저장합니다. 갱신은 기존 refresh 행을 폐기하고 새 행을 생성하며, 최초 로그인 때 정한 7일 만료일은 연장하지 않습니다.

| 쿠키 | 경로 | 수명 / 역할 |
| --- | --- | --- |
| `NACKCHAL_ACCESS` | `/api` | 15분, API 인증 JWT |
| `NACKCHAL_REFRESH` | `/api/auth` | 최초 로그인부터 7일, 한 번 사용하면 교체 |
| `NACKCHAL_CSRF` | `/` | 변경 요청의 CSRF 검증 |

쿠키는 HttpOnly·SameSite=Lax이며 HTTPS에서는 `AUTH_COOKIE_SECURE=true`로 Secure를 켭니다. `GET /api/auth/csrf`로 받은 토큰을 `X-CSRF-TOKEN` 헤더에 실어 가입·로그인·갱신·로그아웃을 요청합니다. 브라우저 저장소에는 인증 정보를 저장하지 않으며 API 응답도 캐시하지 않습니다. 프론트는 현재 사용자 조회가 401이면 갱신을 한 번 시도하고, 서버·네트워크 장애는 로그아웃과 구분합니다.

같은 `JWT_SECRET`과 PostgreSQL 데이터를 유지하면 서버 재시작 후에도 유효한 access JWT와 refresh 토큰을 사용할 수 있습니다. 로그아웃 시 refresh 토큰은 즉시 폐기되지만, 별도로 복사된 access JWT는 남은 유효기간(최대 15분)까지 유효합니다. access 토큰 차단 목록은 사용하지 않습니다.

Vite와 Nginx의 `/api` 프록시를 통해 같은 출처에서 호출합니다. CORS 전체 허용이나 CSRF 예외는 두지 않습니다. Nginx의 가입·로그인 요청 제한은 직접 실행한 Vite/백엔드에는 적용되지 않습니다.

## 공유 대기실 API

`domain/room`의 `controller`, `websocket`, `service`, `model`, `dto`가 방 목록과 실시간 참여를 담당합니다. `GET /api/rooms`는 인증된 방 목록 조회이며 실시간 명령은 Spring 네이티브 WebSocket `/api/rooms/ws`의 JSON으로 처리합니다. STOMP를 사용하지 않습니다.

| 방향 | 명령 / 이벤트 | 용도 |
| --- | --- | --- |
| 클라이언트 → 서버 | `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM` | 방 생성, 코드로 입장, 즉시 퇴장 |
| 클라이언트 → 서버 | `SET_READY`, `SEND_CHAT`, `PING` | 준비 변경, 채팅, 연결 확인 |
| 서버 → 클라이언트 | `WELCOME`, `ROOM_LIST`, `ROOM_STATE` | 연결 사용자, 방 목록, 전체 방 스냅샷 |
| 서버 → 클라이언트 | `ACK`, `ERROR`, `LEFT`, `PONG` | 요청 결과, 오류, 퇴장 완료, 연결 확인 응답 |
| 서버 → 클라이언트 | `AUTH_RENEWED` | 토큰 갱신으로 늘어난 연결 인증 만료 시각 |

방은 6자리 대문자 영숫자 코드로 식별하며 최대 4명, 서버 전체 최대 1,000개입니다. 향후 경매 시작 최소 인원은 2명이며 현재는 경매를 시작하지 않습니다. 같은 계정의 여러 로비 연결은 허용하지만 한 방·한 활성 연결만 참여할 수 있습니다. 동일 연결의 같은 방 재입장은 멱등이며 다른 활성 탭의 입장은 거절하고 강제 인계하지 않습니다.

서버가 연결 종료를 감지한 시점부터 30초 동안 자리를 보관하고 준비 상태를 해제합니다. 예약 자리도 정원에 포함합니다. 유예 안의 새 연결은 같은 자리에 복귀하며 이전 연결의 늦은 요청은 변경 권한이 없습니다. 명시적 퇴장·로그아웃은 즉시 제거하고, 방장은 가장 먼저 입장한 남은 참가자에게 승계하며 빈 방은 삭제합니다.

채팅은 서버가 확인한 사용자·연결·방 소속을 사용합니다. 본문은 앞뒤 공백 제거 후 1~100 유니코드 코드 포인트, 사용자별 1초 간격이며 최근 30개를 보관합니다. 상태 변경마다 방 `version`이 증가합니다. 방과 채팅은 서버 메모리에만 있고 DB 테이블·마이그레이션은 추가하지 않습니다. 재시작하면 방이 사라집니다.

핸드셰이크에서 JWT 쿠키와 엄격한 Origin 허용 목록을 검사합니다. Origin이 없거나 허용 목록과 다르면 거절합니다. 사용자 UUID는 검증한 JWT에서, 닉네임·캐릭터는 DB 프로필에서 읽습니다. 연결의 인증 만료 시각은 핸드셰이크한 access JWT의 만료 시각이며 `WELCOME.authExpiresAt`으로 알립니다. 로그인·토큰 갱신이 성공하면 같은 계정의 열린 연결을 새 만료 시각까지 연장하고 `AUTH_RENEWED`를 보냅니다. 프론트는 만료 1분 전에 갱신하므로 게임 중 연결이 끊기지 않습니다. 갱신하지 못한 채 만료되면 `4401`로 종료하며 클라이언트는 재인증 후 다시 연결합니다. 로그아웃 시 해당 계정의 기존 연결은 `4403`으로 종료하고 자리를 해제합니다. 별도 복사된 access JWT의 HTTP 유효기간은 기존 인증 정책과 같습니다.

Vite와 Nginx는 WebSocket 업그레이드를 전달합니다. 허용 목록은 실제 브라우저의 Origin으로 설정하며 운영 도메인·다른 개발 포트는 `ROOM_ALLOWED_ORIGINS`에 명시합니다.

## 공통 예외 처리

업무 오류는 `throw new CustomException(ErrorCode.EMAIL_UNAVAILABLE)`처럼 전달합니다. `ErrorCode`에서 HTTP 상태·코드·안내 문구를 관리하고 HTTP 오류는 아래 형식으로 반환합니다. WebSocket 업무 오류는 `ERROR` 이벤트로 전달합니다.

```json
{
  "status": 400,
  "code": "INVALID_INPUT_VALUE",
  "message": "입력한 내용을 확인해 주세요.",
  "errors": [
    { "field": "password", "message": "비밀번호는 10~128자로 입력해 주세요." }
  ]
}
```

일반 오류의 `errors`는 빈 배열입니다. 검증 실패 응답에는 필드·메시지만 넣고 비밀번호 등 입력값은 넣지 않습니다. 주요 코드는 `UNAUTHORIZED`(401), `INVALID_CREDENTIALS`(401), `FORBIDDEN`(403), `EMAIL_UNAVAILABLE`(409), `INVALID_REQUEST_BODY`(400), `INTERNAL_SERVER_ERROR`(500)입니다.

- `GlobalExceptionHandler`: MVC 입력 검증·잘못된 JSON·메서드·미디어 타입·업무 예외 처리. Spring의 HTTP 상태와 `Allow` 등 응답 헤더를 유지합니다.
- `SecurityErrorResponseHandler`: 필터에서 발생하는 인증 필요·권한/CSRF 오류에 같은 응답을 사용합니다. 로그인 정보 불일치는 `AuthService`의 업무 예외로, 인증 저장소 장애는 서버 오류로 처리합니다.
- `ErrorResponseController`: 컨트롤러 밖에서 발생해 `/error`로 전달된 서블릿 오류를 처리합니다.

예상하지 못한 오류는 서버 로그에 남기고 응답에는 내부 예외·SQL·스택을 노출하지 않습니다. 이메일 충돌은 SQLState `23505`와 `email_credentials_email_key` 제약이 모두 일치할 때만 409로 바꿉니다. 나머지 DB 오류는 500으로 처리합니다. Nginx 자체의 오류 응답은 이 백엔드 처리 범위 밖입니다.

## 테스트

`NackchalApplicationTests`는 Testcontainers의 `postgres:18-alpine`을 띄워 DB 연결, 실제 HTTP health·readiness 응답, 환경정보 엔드포인트 비공개를 검사합니다. H2로 대체하지 않으며 Docker가 없으면 테스트가 실패합니다. 컨테이너와 테스트용 DB는 종료 시 정리됩니다.

`RoomServiceTests`는 주입한 Clock과 동시 호출로 정원·중복 계정·재접속·퇴장·방장 승계·준비·채팅 제한을 검사합니다. WebSocket 통합 테스트는 실제 서버 연결과 인증·Origin·서버 방송을 검증합니다.

## 현재 범위

이메일 가입·로그인·토큰 갱신·로그아웃·현재 사용자 조회를 제공합니다. 이메일 소유 확인, 비밀번호 재설정, 프로필 변경·탈퇴는 아직 구현하지 않았습니다. 방 관리·준비·채팅과 WebSocket 재접속은 구현했습니다. 입찰·정산·장난 아이템·게임 경제는 미구현이며 온라인 대기실은 프론트의 `LocalGameServer` 경매를 실행하지 않습니다. 영구 캐시·인벤토리나 가입 보상을 지급하지 않습니다.

인증 테스트는 임시 PostgreSQL과 실제 HTTP를 사용합니다. 가입 검증·중복·비밀번호 해시, 현재 사용자 조회, CSRF 거절, 토큰 갱신과 refresh 재사용 거절, 로그아웃 후 refresh 폐기를 검증 대상으로 둡니다. 별도로 복사한 access JWT의 남은 유효기간도 세션 폐기와 혼동하지 않도록 구분합니다.
