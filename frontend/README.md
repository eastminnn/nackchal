# nackchal frontend

물건의 가치를 맞히고, 채팅하고, 친구에게 토마토를 던지는 경매 파티 게임의 프론트엔드 데모입니다.

사람끼리 참여하는 게임을 목표로 하며 자동 참가자와 자동 행동은 없습니다. 로그인은 백엔드와 연결되며 게임은 로컬 미리보기입니다. 방 만들기·내 캐릭터·채팅·장난 주머니를 확인할 수 있고, 다른 브라우저나 컴퓨터의 사람과 연결되지는 않습니다. 방 화면은 1280×720, 1440×900, 1920×1080에서 검증합니다.

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

## 현재 미리보기

1. 로고와 망치 인트로 뒤에 로그인 화면이 나타납니다. 이메일·비밀번호·닉네임으로 가입한 뒤 로그인하면 빈 방 목록이 나타납니다. 저장된 닉네임으로 방을 만들며, 만든 방은 이 브라우저에서만 보입니다.
2. 실제 GLB 모델로 구성한 경매장에 내 캐릭터만 입장합니다. 참가 인원은 1명으로 표시되며, 최소 2명이 필요하므로 시작 버튼은 비활성화됩니다. 시간이 지나도 경매나 보상이 자동으로 진행되지 않습니다.
3. 장난 주머니에 아이템을 최대 3개 고르고 채팅을 입력할 수 있습니다. 머리 위에는 내 이름과 7초 동안 유지되는 말풍선이 표시됩니다. 최근 30개 메시지를 보관합니다.
4. 방 목록으로 돌아가 검색·필터·재입장을 확인할 수 있습니다. 퇴장하면 방 인원은 0명이 되고 채팅은 초기화됩니다. 닉네임과 보유 아이템은 유지됩니다.

화면 확인용으로 12캐시, 토마토 2개, 깡통 1개를 지급합니다. 상점에서 추가 아이템을 살 수 있습니다. 새로고침하면 방과 보유 내역이 초기화됩니다.

## 구현 범위

- React, TypeScript, Vite와 Three.js / React Three Fiber
- 실제 동물 모델의 팔·머리 뼈대를 움직이는 입찰·투척·타격 연출
- 방 목록, 검색, 장난 상점, 아이템 장착, 채팅, 경매, 정산과 재경기
- 브라우저 메모리에서 동작하는 게임 규칙. 최소 인원·잔액·마감 검증, 동점 순위, 중복 보상 방지
- 키보드 조작, 동작 줄이기, 모델 로딩 실패 시 재시도

회원 정보는 PostgreSQL에 저장합니다. JWT access 토큰과 회전하는 refresh 토큰을 HttpOnly 쿠키로 전달하며, access 토큰 만료 시 한 번 갱신을 시도합니다. 토큰은 브라우저 저장소에 기록하지 않습니다. 로그아웃 시 로컬 게임 상태도 초기화하고 같은 출처의 다른 탭에도 반영합니다. 이메일 소유 확인과 비밀번호 재설정은 후속 범위입니다. 방 코드, 친구 초대, WebSocket, 게임 DB 저장, 네트워크 재접속은 아직 구현하지 않았습니다. 공개 서비스 배포도 하지 않았습니다.
10라운드 경매, 정산·결과 화면과 팻말·투척·피격 연출 코드는 유지합니다. 게임 규칙과 네 동물의 포즈는 명시적인 참가자 상태를 넣은 테스트로 검증하며, 미리보기에서 가짜 참가자를 추가하거나 자동 플레이를 실행하지 않습니다. 실제 사람들의 게임 진행을 확인하려면 서버 연결이 필요합니다.

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

`qa:game`은 방 생성·혼자 대기·시작 제한·채팅·퇴장·재입장을 확인합니다. `qa:paddles`와 `qa:pranks`는 실제 GLB를 읽는 포즈 단위 테스트이며 브라우저 플레이 검증이 아닙니다. 다른 사람과의 입찰·투척·결과 화면 검증은 서버 연결 후 추가해야 합니다.

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
