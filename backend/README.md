# nackchal backend

Java 21, Spring Boot 4.1.1, Gradle Wrapper 9.7.1을 사용합니다. Web MVC, Validation, JPA, PostgreSQL, Flyway, Actuator가 설정돼 있습니다. 버전과 Java 호환 범위는 [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/system-requirements.html)를 기준으로 확인했습니다.

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

`GET /api/health`는 서버와 DB 상태를 반환합니다. `/api/health/liveness`는 프로세스 상태, `/api/health/readiness`는 요청 처리 준비 상태와 DB 연결을 확인합니다. 다른 Actuator 엔드포인트와 상세 DB 정보는 공개하지 않습니다.

## 패키지와 DB

애플리케이션 진입점은 `com.nackchal.NackchalApplication`입니다. 기능 구현 시 `com.nackchal.room`, `com.nackchal.auction`, `com.nackchal.chat`처럼 기능별로 패키지를 추가하고, 해당 기능의 API·서비스·저장소를 그 안에 둡니다. 현재는 환경 설정 단계이므로 빈 도메인 클래스나 임시 게임 테이블을 만들지 않았습니다.

DB 변경은 `src/main/resources/db/migration/V1__설명.sql` 형태의 Flyway 마이그레이션으로 관리합니다. 적용한 파일은 수정하지 않고 다음 버전 파일을 추가합니다. Hibernate는 `ddl-auto=validate`이며 테이블을 자동 생성·수정하지 않습니다. 아직 마이그레이션 파일이 없어 첫 실행에 `No migrations found` 안내가 나오는 것은 정상입니다.

## 테스트

`NackchalApplicationTests`는 Testcontainers의 `postgres:18-alpine`을 띄워 DB 연결, 실제 HTTP health·readiness 응답, 환경정보 엔드포인트 비공개를 검사합니다. H2로 대체하지 않으며 Docker가 없으면 테스트가 실패합니다. 컨테이너와 테스트용 DB는 종료 시 정리됩니다.

## 현재 범위

백엔드 환경과 상태 확인만 제공합니다. 방 관리, 입찰·정산, 채팅, 장난 아이템, 인증, WebSocket은 아직 구현하지 않았고 프론트의 `LocalGameServer`도 유지합니다.
