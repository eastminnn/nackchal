# nackchal frontend

물건의 가치를 맞히고, 채팅하고, 친구에게 토마토를 던지는 경매 파티 게임의 프론트엔드 데모입니다.

로그인한 최대 4명이 같은 방 목록과 대기실을 공유합니다. 참가자 이름·캐릭터·준비 상태·채팅과 경매 진행·정산은 서버 상태를 따릅니다. 자동 참가자는 없습니다. 상점·주머니는 명시된 로컬 미리보기입니다. 방 화면은 PC 기준입니다.

## 실행

Node.js 24와 pnpm 11을 사용합니다.

이 문서의 명령은 `frontend/`에서 실행합니다. 저장소 루트에서는 `pnpm -C frontend`로 같은 명령을 실행할 수 있습니다. 백엔드와 전체 컨테이너 실행은 [루트 안내](../README.md)를 참고합니다.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

터미널에 표시되는 로컬 주소를 엽니다. 사용 중인 포트가 있으면 Vite가 다음 포트를 선택합니다.

```sh
pnpm run build
pnpm run preview
pnpm check
```

## 공유 대기실

1. 로그인하면 서버의 열린 방 목록을 받습니다. 방 만들기 또는 입장으로 최대 4명까지 참여합니다.
2. 같은 계정은 한 방·한 활성 탭에서만 참여할 수 있습니다. 다른 탭은 목록을 볼 수 있지만 중복 입장은 거절됩니다. 강제 접속 인계는 없습니다.
3. 준비하기/취소와 채팅은 같은 방에 방송됩니다. 채팅은 100자·1초 간격이며 최근 30개를 보관합니다. 방장은 다른 참가자가 모두 준비하면 경매를 시작합니다.
4. 새로고침·연결 끊김 시 준비는 해제되고 30초 동안 자리만 유지합니다. 사용자별 sessionStorage에는 복귀할 방 코드만 기록합니다. 명시적 퇴장은 즉시 자리를 비우며 방장은 가장 먼저 들어온 남은 참가자로 바뀝니다.
5. 로그아웃하면 서버가 해당 계정의 방 참여를 해제합니다. 토큰은 HttpOnly 쿠키로만 전달하며 브라우저 저장소에 기록하지 않습니다.

`src/rooms`는 네이티브 WebSocket `/api/rooms/ws`와 Zod 경계 파서를 사용합니다. 재접속 전 인증 쿠키를 확인·갱신하고, 연결 종료를 UI에 표시합니다. 참가자 UUID는 서버 상태에서 보존하고 3D 표시 어댑터에서만 내 ID를 `me`로 바꿉니다.

경매가 시작되면 같은 화면이 입찰 HUD로 바뀝니다. 입찰 버튼은 현재가에 1·5·10달러를 더한 최종 금액과 마지막으로 본 `bidVersion`을 보내고, 타이머는 `ROOM_STATE.serverTime`으로 계산한 시계 차이를 보정해 표시합니다. 게임이 끝나거나 중단되면 결과 창을 보여 주고 다시 준비하게 합니다. 기존 `LocalGameServer` 경매·정산 코드는 규칙·연출 테스트용으로 유지합니다. 방 화면 채팅 머리의 🖕·🚬 버튼은 무료 모션입니다. 같은 방 모두에게 보이며, 입찰 패들을 들지 않는 왼팔로 해서 입찰 동작과 겹치지 않습니다. 뻐큐는 팔을 앞으로 뻗고 손 위로 가운뎃손가락이 솟고, 담배는 손을 입으로 두 번 가져가 끝이 밝아지고 연기가 올라갑니다. 소품은 코드로 만든 단순 도형이며 모델별 손 두께보다 길게 나오는지 테스트합니다. 버튼은 쿨다운 동안 남은 초를 보여 줍니다. 로비 상단의 캐시는 서버 지갑(`GET /api/wallet`, `WALLET` 이벤트)이고, 결과 창은 캐시 정산 중·지급 완료·실패를 구분합니다. 상단 "장난 상점"은 서버 상점이며(`GET /api/shop`, `POST /api/shop/purchases`) 아이템별로 1~10개를 골라 삽니다. 게임 중에는 HUD 아래 아이템 바에 보유 수량과 이번 판 남은 투척(최대 3)이 보이고, 아이템을 고른 뒤 상대를 고르면 `USE_ITEM`을 보냅니다. 받은 `ITEM_EFFECT`는 기존 투척·피격 연출로 재생합니다.

## 공유 대기실 검증

실행 중인 백엔드와 WebSocket 프록시가 필요합니다. 테스트는 임의 이메일의 계정 5개를 등록하며 각 계정은 독립 브라우저 컨텍스트를 사용합니다.

```sh
NACKCHAL_URL=http://127.0.0.1:4185 pnpm qa:rooms
NACKCHAL_URL=http://127.0.0.1:4185 pnpm qa:auction
```

`qa:auction`은 두 계정으로 시작·입찰 방송·낙찰·가치 공개·다음 라운드·퇴장으로 인한 중단을 확인합니다. 낙찰 연출을 실제 시간으로 기다려 약 40초가 걸립니다.

결과 기본 위치: `../.omo/evidence/rooms-frontend/report.json`, `waiting-four-1440x900.png`, `waiting-four-1280x720.png`. `NACKCHAL_ROOMS_EVIDENCE`로 현재 검증 디렉터리를 지정할 수 있습니다. 공유 목록, 네 자리 제한과 다섯 번째 거절, 중복 탭 거절, 준비·채팅 동기화, 새로고침 복귀, 퇴장·방장 이전, 탭 간 로그아웃을 검증합니다.

## 코드 구조

```text
frontend/
├── src/
│   ├── main.tsx           # 브라우저 진입점
│   ├── app/               # 앱 상태 연결, 화면 전환, 공통 메뉴
│   ├── auth/              # 인증 API, 응답 검증, 로그인 상태
│   ├── pages/             # 로비, 경매, 결과 화면
│   ├── components/
│   │   ├── ui/            # 버튼, 배지, 모달 등 공통 UI
│   │   ├── art/           # 캐릭터 초상·물건 그림
│   │   ├── brand/         # 로고와 시작 연출
│   │   └── game/          # 채팅, 참가자, 상점·장착, 타이머
│   ├── game/              # 게임 규칙, 상태·명령 타입, 로컬 서버, 단위 테스트
│   ├── data/              # 방 정보 타입과 캐릭터 모델 목록
│   ├── hooks/             # React 훅 (효과음)
│   ├── scene/             # Three.js 장면, 모델, 팻말·포즈
│   ├── styles/            # index.css에서 순서대로 불러오는 스타일
│   └── dev/               # 개발용 컴포넌트 쇼케이스
├── public/                # 모델, 이미지, 라이선스 등 정적 파일
├── assets/brand/           # 망치 제작 원본과 피벗 좌표
├── scripts/
│   ├── assets/            # GLB 정리, 로비 초상 렌더링
│   └── qa/                # 현재 브라우저 검증
└── README.md
```

저장소 루트의 `docs/`는 로컬 기획·작업 문서로 Git에서 제외합니다. `node_modules/`, `dist/`, `.qa/`, IDE 설정과 환경변수 파일도 저장소에 포함하지 않습니다.

게임 규칙은 `src/game/`에 모여 있습니다. 화면은 `GameTransport` 인터페이스를 통해 명령을 보내고 상태를 구독합니다. 실제 서버 연결 시 이 구현을 교체해야 하며, 현재 데모는 브라우저 밖에서 상태를 검증하지 않습니다.

## 브라우저 검증

백엔드를 먼저 실행해야 합니다. `qa:auth`는 실제 가입·로그인·JWT 갱신·탭 간 동시 갱신·로그아웃과 오류 복구를 검증합니다. 게임 검증 스크립트는 `qa-<UUID>@example.test` 테스트 계정을 생성해 사용하며, 계정은 연결된 개발 DB에 남습니다. `qa:performance`는 비로그인 진입 화면을 측정합니다.

배포 빌드를 먼저 실행한 다음 Chrome이 설치된 환경에서 확인합니다.

```sh
pnpm run build
pnpm run preview --port 4185
pnpm qa:rooms
pnpm qa:game
pnpm qa:auth
pnpm qa:chat
pnpm qa:lobby
pnpm qa:brand
pnpm qa:paddles
pnpm qa:pranks
pnpm qa:models
pnpm qa:animals
pnpm qa:performance --desktop-only
```

`qa:game`은 공유 방 생성·혼자 대기(시작 버튼 비활성)·채팅·마지막 퇴장 시 방 삭제·새 방 생성을 확인합니다. 장난 주머니는 로비의 로컬 미리보기에서 검사합니다. `qa:chat`은 실제 서버의 1초 제한과 말풍선 만료를 실제 시간으로 기다려 검사하며 가상 시계로 서버 시간을 바꾸지 않습니다. `qa:lobby`는 별도 계정이 유지하는 실제 공유 방으로 검색·필터·입장을 확인합니다. `qa:models`와 `qa:animals`는 모델 로딩 중에도 대기실 조작이 가능하고 혼자서는 경매를 시작할 수 없는 상태, 모델 복구, 새로고침 시 같은 방 복귀를 검사합니다. `qa:paddles`와 `qa:pranks`는 실제 GLB를 읽는 포즈 단위 테스트이며 브라우저 플레이 검증이 아닙니다. 다른 사람과의 입찰·결과 화면과 모션은 `qa:auction`이 검사합니다. `qa:items`는 **로컬 Compose 전용**으로, 새 계정에 SQL로 시험용 캐시를 넣은 뒤 상점에서 사고 게임 중 상대에게 던져 보유 수량과 남은 투척이 줄어드는지 확인합니다. 운영 주소에는 실행하지 않습니다.

스크린샷과 결과는 `.qa/`에 저장됩니다. `?showcase=1` 주소는 기본 컴포넌트 확인용입니다. React Grab/Scan은 개발 모드에서만 로드됩니다. `VITE_DISABLE_REACT_DEVTOOLS=1 pnpm run dev`로 개발 도구 표시를 끌 수 있습니다.

명령은 `frontend/`에서 실행합니다. 미리보기 서버를 실행한 채 다른 터미널에서 검증 명령을 순서대로 실행합니다. `pnpm check`는 타입 검사·린트·단위 테스트를 함께 실행합니다.

## 모델과 글꼴

| 자산 | 제작자 | 라이선스 |
| --- | --- | --- |
| [Animal Plushies](https://moraazul.itch.io/animal-plushies) | MoraAzul | CC BY, 버전 미표기 |
| [Paddles With Numbers](https://www.thingiverse.com/thing:4577011) | jumimo | CC BY 4.0 |
| [Tiny Treats Bakery Interior](https://tinytreats.itch.io/bakery-interior) | Isa Lousberg / Tiny Treats | CC0 |
| [DynaPuff](https://github.com/googlefonts/dynapuff) | Toshi Omagari | SIL OFL 1.1 |

가공 내역은 [출처 화면](public/credits.html), 라이선스 원문은 [라이선스 폴더](public/models/licenses)에 포함돼 있습니다. 외부 자산의 라이선스는 각 파일의 조건을 따릅니다.

모델과 초상은 변환본이 포함돼 있어 앱 실행에 Blender가 필요하지 않습니다. 원본을 다시 변환할 때는 다음 명령을 사용합니다.

```sh
blender -b --factory-startup --python scripts/assets/convert-plushies.py -- '<Animal Plushies 폴더>'
node scripts/assets/prepare-paddle.mjs '<Paddle_0.stl 경로>'
pnpm assets:prepare '<Tiny_Treats_Bakery_Interior_1.1_FREE 폴더>'
pnpm assets:portraits
blender -b --factory-startup --python scripts/assets/make-brand-gavel.py
```

로고 망치는 직접 모델링했습니다. GLB 원본과 피벗 좌표는 `assets/brand/`, 화면에서 쓰는 투명 렌더 이미지는 `public/art/brand/`에 둡니다. 원본은 배포 빌드에 포함하지 않습니다.
