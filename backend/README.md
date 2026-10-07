# nackchal 백엔드

경매 판정, 실시간 방, 캐시와 아이템을 맡는 Spring Boot 서버입니다. 게임 소개는 [루트 README](../README.md), 화면은 [프론트엔드](../frontend/README.md), 운영·배포는 [운영·배포 안내](../deploy/README.md)를 보세요.

- Java 21, Spring Boot 4.1.1, Gradle Wrapper 9.7.1
- Web MVC, 네이티브 WebSocket(STOMP 없음), Spring Security(stateless JWT 쿠키), Validation, JPA(Hibernate), Flyway, Actuator
- PostgreSQL 18. 테스트도 Testcontainers의 실제 PostgreSQL을 쓴다(H2 없음).

**설계 원칙 세 가지**
1. **서버가 판정한다.** 입찰 순서·마감·숨은 가치·정산·가격은 서버만 계산하고, 요청 본문의 사용자 ID나 금액은 믿지 않는다.
2. **실시간은 메모리, 기록은 DB.** 방·채팅·진행 중인 경매는 메모리에서 잠금으로 순서를 정하고, 계정·캐시·게임 결과·아이템은 트랜잭션으로 PostgreSQL에 남긴다.
3. **잠금을 쥔 채 DB를 기다리지 않는다.** 한 방의 DB 지연이 다른 방의 타이머와 방송을 멈추지 않게 한다.

## 실행과 환경변수

전체 실행은 [운영·배포 안내](../deploy/README.md#로컬에서-전체-실행)를 따릅니다. 이 디렉토리에서는 Java 21로 실행합니다.

```sh
./gradlew bootRun
./gradlew test bootJar
```

| 환경변수 | 기본값 / 용도 |
| --- | --- |
| `DB_URL` | `jdbc:postgresql://127.0.0.1:15432/nackchal` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `nackchal` / 별도 전달 필요 |
| `SERVER_PORT` | `18080`, 컨테이너 내부는 `8080` |
| `JWT_SECRET` | 기본값 없음. 디코딩 후 32바이트 이상인 Base64 키 (`openssl rand -base64 32`) |
| `AUTH_COOKIE_SECURE` | 로컬 HTTP는 `false`, 운영 HTTPS는 `true` |
| `ROOM_ALLOWED_ORIGINS` | 쉼표로 구분한 WebSocket Origin 허용 목록. 기본값은 `127.0.0.1`·`localhost`의 `18000`, `4185`, `5173` 포트 |

`/api/health`는 서버와 DB 상태, `/api/health/liveness`는 프로세스, `/api/health/readiness`는 DB 연결까지 확인합니다. 다른 Actuator 엔드포인트와 상세 정보는 공개하지 않습니다.

## 패키지 구조

진입점은 `com.nackchal.NackchalApplication`입니다. [yufesta-server의 common/domain 구조](https://github.com/yu-festa/yufesta-server/tree/7562f479cca29058511a9baa621ebffcec7a52f0/src/main/java/com/yufesta)를 따라 공통 처리와 기능을 나눕니다.

```text
com.nackchal
├── common
│   ├── exception/          # CustomException, 전역 처리기, ErrorCode·ErrorResponse
│   └── security/           # SecurityConfig, JWT 발급·검증 필터, 쿠키, 보안 오류 응답, 인증 이벤트
└── domain
    ├── auth/               # 가입·로그인·토큰 갱신·로그아웃
    ├── user/               # 닉네임·캐릭터 프로필
    ├── room/               # 방 목록(HTTP)과 실시간 방(WebSocket), 메모리 대기실
    ├── auction/model/      # AuctionGame·AuctionRules·GameSettlement — Spring 없는 경매 규칙
    ├── game/               # 게임 시작·종료 기록, 정산 실행기, 기동 시 정리
    ├── wallet/             # 캐시 잔액·원장, GET /api/wallet
    ├── item/               # 아이템 목록·보유 수량·사용 기록, 게임 중 소모
    └── shop/               # 상점 구매
```

각 기능은 필요한 레이어만 둡니다(`controller`, `service`, `repository`, `entity`, `dto`, `event`, `websocket`, `model`). 테스트도 같은 구조를 따릅니다.

**코드 규칙**
- 생성자 주입을 씁니다. DB 서비스는 클래스에 읽기 전용 트랜잭션을 두고 쓰기 메서드에 `@Transactional`을 붙입니다.
- 엔티티를 응답으로 내보내지 않고 record DTO를 씁니다.
- 클래스 주석에는 역할을, 서비스의 업무 예외는 `@throws`로 적습니다. 본문 주석은 코드만으로 의도를 알기 어려운 이유에만 씁니다.
- 다른 기능의 데이터를 직접 고치지 않습니다. 예를 들어 캐시는 `WalletService`를 거쳐서만 바뀝니다.

## 동시성 설계

방과 진행 중인 경매는 메모리(`RoomService` → `WaitingRoom` → `AuctionGame`)에 있습니다. 여러 스레드가 같은 방을 건드리므로 순서를 잠금으로 정합니다.

| 스레드 | 하는 일 |
| --- | --- |
| WebSocket 메시지 스레드 | 연결마다 메시지를 순서대로 처리(`synchronized(connection)`), 방 명령 실행 |
| 스케줄러(100ms) | `advanceGames()`: 마감 시각이 지난 경매 단계를 넘김 |
| 스케줄러(1초) | 인증 만료·응답 없는 연결 정리, 재접속 유예(30초)가 지난 자리 정리 |
| 정산 스레드(2개) | 끝난 판의 결과·보상을 DB에 저장, 실패 시 1·3·10초 뒤 재시도 |
| HTTP 요청 스레드 | 로그인·로그아웃·구매. 이벤트로 열린 연결에 알림 |

**잠금 규칙**
- 같은 사용자의 요청은 사용자 잠금(해시로 나눈 256개)으로, 같은 방의 변경은 방 객체 잠금으로 순서를 정합니다. 항상 **사용자 잠금 → 방 잠금** 순서로 잡고, 타이머처럼 방 잠금만 잡는 경로는 사용자 잠금을 잡지 않아 교착이 생기지 않습니다.
- 방이 바뀌면 `version`을 올리고, 변경 이벤트는 **잠금을 모두 푼 뒤** 발행합니다. 이벤트를 받는 쪽이 다른 방을 조회해도 잠금이 꼬이지 않습니다.

**DB 작업은 잠금 밖에서**

DB가 필요한 작업은 모두 같은 모양입니다.

| 작업 | ① 방 잠금 안 | ② 잠금 밖 DB 트랜잭션 | ③ 결과 반영 |
| --- | --- | --- | --- |
| 게임 시작 | 조건 검사, 방을 `starting`으로 표시 | `games(RUNNING)`·참가자 저장 | 다시 잠가 경매 시작(타이머는 이때부터). 실패하면 방 복원 |
| 게임 정산 | 끝난 판의 결과를 한 번만 꺼냄(`takeSettlement`) | 정산 스레드에서 결과·보상 저장 | 같은 판일 때만 `COMPLETED`/`FAILED` 표시 |
| 아이템 던지기 | 대상·판당 3개·대상별 5초 확인 후 자리 선점 | 보유 수량 1 감소 + 사용 기록 | 성공하면 방송, 재고 없으면 선점 되돌림 |

DB 확정 전에는 결과를 내보내지 않으므로, 공짜 던지기나 저장되지 않은 보상 표시가 생기지 않습니다.

## 데이터 모델

| 마이그레이션 | 테이블 | 역할 |
| --- | --- | --- |
| V1, V2 | `users`, `email_credentials`, `refresh_tokens` | 계정, 이메일·비밀번호 해시, refresh 토큰 해시 |
| V3 | `wallets`, `cash_transactions` | 캐시 잔액과 변경 원장 |
| V3 | `games`, `game_participants`, `round_results` | 판의 시작·종료, 참가자 결과, 라운드 결과 |
| V4 | `item_catalog`, `inventories`, `shop_purchases`, `item_uses` | 아이템과 서버 가격, 보유 수량, 구매, 사용 |

**지키는 불변식**
- **잔액 = 원장 합계.** 원장은 수정·삭제하지 않습니다. 사유는 게임 보상(양수, 게임 ID)과 구매 차감(음수, 구매 ID) 두 가지뿐이며 DB `CHECK`가 강제합니다.
- **중복 처리 없음.** 같은 판의 보상은 `UNIQUE(game_id, user_id) WHERE reason='GAME_REWARD'`, 같은 구매 요청은 `UNIQUE(user_id, request_id)`로 막습니다.
- **음수 없음.** 잔액·보유 수량은 "충분할 때만 빼는" 조건부 UPDATE로 바꾸므로 동시 요청도 음수를 만들지 않습니다.
- **참조 무결성.** 보상·아이템 사용은 그 판 참가자만, 구매 원장은 같은 사용자의 구매만 참조합니다.

적용한 마이그레이션은 고치지 않고 다음 버전을 추가합니다. Hibernate는 `ddl-auto=validate`라 엔티티와 스키마가 다르면 서버가 뜨지 않습니다.

## HTTP API

| 요청 | 본문 / 응답 |
| --- | --- |
| `GET /api/auth/csrf` | `{headerName, token}`. 변경 요청 전에 받아 헤더에 싣는다 |
| `POST /api/auth/register` | `{email, password, nickname}` → `201`. 지갑(0캐시)을 같은 트랜잭션에서 만든다 |
| `POST /api/auth/login` | `{email, password}` → `204`와 access·refresh 쿠키 |
| `GET /api/auth/me` | `{id, nickname, avatarCode}` |
| `POST /api/auth/refresh` | refresh 쿠키 교체·access 재발급 → `204`. 열린 WebSocket 인증도 연장 |
| `POST /api/auth/logout` | refresh 폐기·쿠키 삭제 → `204`. 열린 WebSocket을 `4403`으로 닫고 방에서 제거 |
| `GET /api/rooms` | 열린 방 목록 |
| `GET /api/wallet` | `{balance}` (본인만) |
| `GET /api/shop` | 판매 중인 아이템과 내 보유 수량 |
| `POST /api/shop/purchases` | `{itemCode, quantity(1~10), requestId}` → `{balance, itemCode, quantity}` |

## 인증과 보안

- 닉네임은 글자·숫자·`_`·`-` 1~12자이며 중복을 허용합니다. 비밀번호는 10~128자이고 PBKDF2-HMAC-SHA256 해시만 저장합니다. 이메일은 소문자·앞뒤 공백 제거 후 유니크 제약으로 보호합니다.
- HttpSession을 쓰지 않습니다. access 토큰은 HS256 JWT(15분), refresh 토큰은 256비트 난수(최초 로그인부터 7일, 사용할 때마다 교체)이며 DB에는 해시만 둡니다.

| 쿠키 | 경로 | 역할 |
| --- | --- | --- |
| `NACKCHAL_ACCESS` | `/api` | API 인증 JWT |
| `NACKCHAL_REFRESH` | `/api/auth` | 재발급용, 한 번 쓰면 교체 |
| `NACKCHAL_CSRF` | `/` | 변경 요청의 CSRF 검증 (`X-CSRF-TOKEN` 헤더) |

- 쿠키는 HttpOnly·SameSite=Lax이며 HTTPS에서는 Secure입니다. 브라우저 저장소에는 인증 정보를 두지 않습니다.
- 로그아웃하면 refresh는 즉시 폐기되지만, 따로 복사된 access JWT는 남은 유효기간(최대 15분)까지 유효합니다(차단 목록 없음).
- CORS 전체 허용이나 CSRF 예외는 없습니다. 같은 출처의 `/api` 프록시로만 호출합니다.
- **WebSocket 핸드셰이크**: JWT 쿠키와 엄격한 Origin 허용 목록을 모두 검사합니다. 사용자 UUID는 JWT에서, 닉네임·캐릭터는 DB에서 읽습니다. 연결의 인증 만료는 `WELCOME.authExpiresAt`으로 알리고, 로그인·갱신이 성공하면 같은 계정의 열린 연결을 연장해 `AUTH_RENEWED`를 보냅니다. 갱신하지 못한 채 만료되면 `4401`로 닫습니다.

## 실시간 프로토콜

`/api/rooms/ws`의 JSON 메시지입니다. 모든 명령은 `requestId`를 가지며, 같은 `requestId` 재전송에는 이전 응답을 다시 보내고 본문이 다르면 `CONFLICT`입니다. 연결당 초당 20개까지입니다.

| 방향 | 메시지 | 내용 |
| --- | --- | --- |
| 클라이언트 → 서버 | `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM` | 방 생성, 코드로 입장, 즉시 퇴장 |
| 클라이언트 → 서버 | `SET_READY`, `SEND_CHAT`, `PING` | 준비, 채팅, 연결 확인 |
| 클라이언트 → 서버 | `START_GAME` | 방장만 |
| 클라이언트 → 서버 | `PLACE_BID` | `gameId`, `round`, `expectedBidVersion`, 최종 금액 `amount` |
| 클라이언트 → 서버 | `EMOTE` | `MIDDLE_FINGER`(3초), `SMOKE`(6초) |
| 클라이언트 → 서버 | `USE_ITEM` | 게임 중 `item`(`tomato`, `can`)을 `targetUserId`에게 |
| 서버 → 클라이언트 | `WELCOME` | 연결 ID, 참가 중인 방, 인증 만료 시각 |
| 서버 → 클라이언트 | `ROOM_LIST` | 방 목록 (증가하는 `version`) |
| 서버 → 클라이언트 | `ROOM_STATE` | 방 전체 스냅샷: 참가자·채팅·`starting`·`game`(경매 상태, 정산 상태), 최상위 `serverTime` |
| 서버 → 클라이언트 | `ACK`, `ERROR`, `LEFT`, `PONG` | 요청 결과, 오류(입찰 거절에는 현재 `auction` 포함), 퇴장 완료, 연결 확인 |
| 서버 → 클라이언트 | `AUTH_RENEWED` | 늘어난 연결 인증 만료 시각 |
| 서버 → 클라이언트 | `WALLET` | 본인 캐시 잔액 (정산·구매 후) |
| 서버 → 클라이언트 | `EMOTE`, `ITEM_EFFECT` | 같은 방에만 보내는 순간 연출 |
| 서버 → 클라이언트 | `INVENTORY` | 던진 본인에게 남은 수량과 이번 판 남은 투척 |

방 상태가 바뀌는 일은 방 전체 스냅샷(`ROOM_STATE`)으로 보내고, 모션과 던지기처럼 상태로 남길 필요 없는 연출은 같은 방에만 짧은 이벤트로 보냅니다. 연출 이벤트는 방 `version`을 올리지 않고 방 목록도 다시 보내지 않으며, 재접속 중에 놓친 것은 다시 보내지 않습니다.

## 대기실

- 방은 6자리 대문자 영숫자 코드, 최대 4명, 서버 전체 최대 1,000개입니다.
- 같은 계정의 로비 연결은 여러 개 허용하지만 방 참여는 한 방·한 활성 연결만 됩니다. 다른 탭의 입장은 거절하고 강제로 빼앗지 않습니다.
- 연결이 끊기면 자리를 30초 보관하고 준비를 해제합니다(예약 자리도 정원에 포함). 그 안의 새 연결은 같은 자리로 돌아오고, 이전 연결의 늦은 요청은 무시합니다.
- 명시적 퇴장·로그아웃은 즉시 제거합니다. 방장은 남은 참가자 중 가장 먼저 들어온 사람이 이어받고, 빈 방은 지웁니다.
- 채팅은 앞뒤 공백 제거 후 1~100 유니코드 코드 포인트, 사용자별 1초 간격, 최근 30개입니다.
- 방과 채팅은 메모리에만 있어 서버가 재시작하면 사라집니다.

## 경매

`AuctionGame`이 한 판의 규칙과 상태를 담는 순수 객체입니다. Spring과 잠금에 의존하지 않고 시각을 인자로 받아 테스트가 결정적이며, `RoomService`가 방 잠금 안에서만 호출합니다. 규칙 값은 `AuctionRules`(운영 기본값, 테스트에서 단계 시간만 줄임)에 있습니다.

- **시작**: 방장만, 연결된 참가자 2명 이상, 방장을 뺀 전원 준비. 게임 중에는 새 입장을 `ROOM_IN_GAME`으로 막고 재접속만 허용합니다.
- **단계**: `AUCTION`(20초) → `SOLD`(5초, 낙찰가 차감) → `REVEAL`(3초, 실제 가치 지급) → 다음 라운드. 10라운드 뒤 `FINISHED`, 남은 참가자가 1명 이하면 `ABORTED`.
- **입찰**: 판정 시각은 클라이언트가 아니라 잠금을 얻은 서버 시각입니다. 검사 순서는 `GAME_NOT_FOUND` → `BID_CLOSED` → `BID_STALE` → `BID_ALREADY_LEADING` → `BID_TOO_LOW` → `BID_INSUFFICIENT_BALANCE`이고, 같은 `expectedBidVersion`으로 동시에 온 입찰은 먼저 잠금을 얻은 하나만 수락합니다. 마감 3초 이내 입찰은 남은 시간을 3초로 되돌립니다(라운드당 최대 15초).
- **타이머**: 마감을 예약하지 않고 100ms마다 현재 마감 시각과 비교합니다. 연장 전의 오래된 예약이 라운드를 두 번 마감하는 문제가 없고, 다음 단계는 이전 마감 시각부터 계산해 늦게 돌아도 일정이 밀리지 않습니다.
- **숨은 정보**: 실제 등급·가치는 서버 메모리에만 있고 `REVEAL`의 `reveal`과 이후 `history`에만 실립니다.
- **이탈**: 퇴장자는 `left: true`로 남아 걸어 둔 입찰은 유지되지만 순위에서 빠집니다. 게임이 끝나면 모두의 준비를 해제합니다.

## 게임 기록과 정산

- **시작 기록**: 시작을 DB에 먼저 기록하고, 성공해야 경매를 엽니다. 실패하면 `GAME_START_FAILED`(503)입니다. 기록하는 동안 나간 참가자는 바로 이탈 처리합니다.
- **정산**: 게임이 끝나는 모든 경로(타이머, 퇴장, 로그아웃, 유예 만료, 시작 중 이탈)에서 결과를 한 번만 꺼내 정산 스레드로 넘깁니다. `GameRecordService.settle`은 게임 행을 `FOR UPDATE`로 잠그고 `RUNNING`일 때만 참가자 결과·라운드 10개·보상을 한 트랜잭션에 저장합니다. 보상은 사용자 ID 순서로 지급해 지갑 잠금 교착을 피합니다.
- **보상**: 1등 10, 2등 5, 나머지 2캐시. 동점은 같은 순위·같은 보상입니다. 중단된 판과 이탈자는 0이며 원장에 쓰지 않습니다. 가입 보상은 없습니다.
- **정산 상태**: `game.settlement`는 진행 중 `null`, 끝나면 `PENDING` → `COMPLETED` 또는 `FAILED`. 같은 판일 때만 방에 반영하므로 다음 판과 섞이지 않습니다. 지급받은 사람에게는 `WALLET`을 보냅니다.
- **서버 재시작**: 기동할 때 이번 실행 전에 시작된 `RUNNING` 판을 `ABORTED`로 정리합니다. 웹 서버가 기동 완료 이벤트보다 먼저 요청을 받으므로, 정리기가 만들어진 시각 이후에 시작한 판은 건드리지 않습니다.

## 상점과 장난 아이템

- **목록·가격**: `item_catalog`가 기준입니다(토마토 3, 깡통 2). 클라이언트가 보낸 가격은 쓰지 않습니다.
- **구매**: 구매 기록 → 원장 차감 → 잔액 차감(금액 이상일 때만) → 인벤토리 증가를 한 트랜잭션에서 처리합니다. 같은 `requestId`는 처음 결과를 돌려주고, 본문이 다르면 409입니다. 커밋 후 `WALLET`으로 다른 탭의 캐시도 갱신합니다.
- **던지기**: 장착 없이 게임 중 인벤토리에서 바로 씁니다. 진행 중인 게임에서 연결된 다른 참가자에게만, 한 판 3개까지, 같은 대상에게 5초 간격입니다([동시성 설계](#동시성-설계)의 표 참고). 판당 횟수와 간격은 그 판의 메모리에 두고 새 판이 시작되면 초기화합니다.
- **연출**: 확정된 던지기는 같은 방에 `ITEM_EFFECT`, 본인에게 `INVENTORY`로 알립니다. 장난은 입찰·돈·순위에 영향을 주지 않습니다.

## 모션

`EMOTE`로 뻐큐(3초)와 담배(6초)를 무료로 씁니다. 대기실과 게임 중 언제든 쓸 수 있고, 같은 사람은 4초와 동작 길이 중 긴 쪽이 지나야 다시 쓸 수 있습니다(`EMOTE_RATE_LIMITED`). DB는 쓰지 않으며 쿨다운은 방 메모리의 참가자 정보에 둡니다.

## 오류 응답

업무 오류는 `throw new CustomException(ErrorCode.X)`로 던지고, `ErrorCode`가 HTTP 상태·코드·안내 문구를 관리합니다. HTTP는 아래 형식으로, WebSocket은 `ERROR` 이벤트로 보냅니다.

```json
{
  "status": 400,
  "code": "INVALID_INPUT_VALUE",
  "message": "입력한 내용을 확인해 주세요.",
  "errors": [{ "field": "password", "message": "비밀번호는 10~128자로 입력해 주세요." }]
}
```

- `GlobalExceptionHandler`: MVC 입력 검증·잘못된 JSON·메서드·미디어 타입·업무 예외
- `SecurityErrorResponseHandler`: 필터에서 나는 인증·권한·CSRF 오류
- `ErrorResponseController`: 컨트롤러 밖에서 `/error`로 온 서블릿 오류

검증 실패에는 필드와 메시지만 넣고 입력값은 넣지 않습니다. 예상하지 못한 오류는 로그에 남기고 응답에는 내부 예외·SQL·스택을 노출하지 않습니다. 직접 남기는 로그 메시지에는 요청·게임·사용자 ID만 넣고 닉네임·이메일은 넣지 않습니다.

## 테스트

모든 DB 테스트는 Testcontainers의 `postgres:18-alpine`을 씁니다. Docker가 없으면 테스트가 실패합니다.

| 테스트 | 지키는 것 |
| --- | --- |
| `AuthIntegrationTests`, `AuthServiceTests` | 가입 검증·중복·해시, 지갑 생성, CSRF 거절, 토큰 갱신과 refresh 재사용 거절, 로그아웃 후 폐기, 본인 잔액만 조회 |
| `RoomServiceTests` | 가짜 시계·가짜 DB로 정원, 중복 계정, 재접속, 방장 승계, 채팅 제한, 시작 3단계와 실패 복원, 동시 입찰, 정산 1회 제출, 모션 쿨다운, 던지기 제한·선점 되돌림 |
| `AuctionGameTests` | 고정 난수로 입찰 검사 순서, 마감 연장, 낙찰·공개 정산, 동점 순위, 이탈, 정산 결과 생성 |
| `GameRecordServiceTests` | 원장 합계 = 잔액, 재정산·동시 정산 1회 지급, 실패 시 전체 롤백, 기동 정리 |
| `ShopServiceTests`, `ItemServiceTests` | 구매 반영·롤백·requestId, 동시 구매에도 음수 없음, 마지막 1개 동시 사용 1회 |
| `UserMigrationTests`, `WalletMigrationTests`, `ShopMigrationTests` | 이전 버전 데이터가 새 마이그레이션 뒤에도 유지되고 새 제약이 지켜지는지 |
| `RoomWebSocketIntegrationTests` | 실제 서버로 인증·Origin·방송 범위, 짧은 규칙으로 한 판 정산, 모션·던지기가 같은 방에만 가는지 |

## 현재 범위

**있는 것**: 이메일 가입·로그인·토큰 갱신·로그아웃, 방과 채팅, 온라인 경매와 정산, 캐시 지갑, 상점, 게임 중 아이템 던지기, 무료 모션.

**아직 없는 것**: 이메일 소유 확인, 비밀번호 재설정, 프로필(캐릭터) 변경·탈퇴, 원장·구매·지난 게임 조회 API, 서버 여러 대 구성. 서버가 재시작하면 진행 중인 방과 경매는 사라지고, 정산이 끝내 실패한 판의 보상은 지급되지 않습니다.
