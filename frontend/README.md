# nackchal 프론트엔드

인형 경매장을 그리는 React·Three.js 화면입니다. 게임 소개는 [루트 README](../README.md), 서버 설계는 [백엔드](../backend/README.md), 운영·배포는 [운영·배포 안내](../deploy/README.md)를 보세요.

- React 19, TypeScript, Vite, React Three Fiber(Three.js), Zod, ky, Biome, Vitest
- 화면은 **서버가 보낸 상태를 그리기만** 합니다. 입찰 판정, 마감, 가치, 정산, 가격은 모두 서버가 정하고, 화면은 명령을 보낸 뒤 서버 응답으로 바뀝니다.
- 방 화면은 PC 기준입니다.

## 실행

Node.js 24와 pnpm 11.19.0을 사용합니다. 아래 명령은 `frontend/`에서 실행하며, 저장소 루트에서는 `pnpm -C frontend …`로 같은 명령을 씁니다. 백엔드가 `http://127.0.0.1:18080`에 떠 있어야 로그인부터 할 수 있습니다(주소는 `.env.local`의 `BACKEND_URL`).

```sh
pnpm install --frozen-lockfile
pnpm dev          # 개발 서버 (/api와 WebSocket을 백엔드로 프록시)
pnpm check        # 타입 검사 + 린트 + 단위 테스트
pnpm build        # 배포 빌드
pnpm preview      # 배포 빌드 미리보기
```

## 화면 구성

| 화면 | 내용 |
| --- | --- |
| 로그인 | 이메일 가입·로그인, 가입할 때 네 캐릭터 중 하나 고르기. 인증 정보는 HttpOnly 쿠키로만 다루고 브라우저 저장소에 두지 않는다 |
| 로비 | 내 캐릭터와 캐릭터 바꾸기(다른 탭에도 반영), 서버의 열린 방 목록, 방 만들기·입장, 상단의 캐시 잔액과 장난 상점. 뒤쪽에는 3D 경매장 배경 |
| 장난 상점 | 토마토·깡통의 가격과 보유 수량, 1~10개 수량 선택, 캐시가 모자라면 구매 비활성 |
| 대기실 | 3D 경매장에 참가자가 앉고, 준비하기, 방장의 경매 시작, 채팅과 모션 버튼 |
| 경매 HUD | 라운드·타이머, 물건과 등급 힌트, 현재가·최고 입찰자, 입찰 버튼(+$1·+$5·+$10), 가치 공개, 아이템 바와 던질 상대 선택 |
| 결과 | 최종 순위와 보상, 캐시 정산 상태(정산 중·지급 완료·실패), 중단된 판 안내 |

## 서버 상태를 화면으로

```text
RoomSocket ──(Zod로 검증한 메시지)──▶ RoomClient ──(스냅샷)──▶ waitingView ──▶ 화면·3D 장면
 연결·재연결·하트비트·토큰 갱신        방·목록·캐시·상점·연출 보관       서버 상태를 화면용 RoomState로
```

- **`rooms/RoomSocket`**: 네이티브 WebSocket `/api/rooms/ws` 연결. 끊기면 지수 백오프(최대 10초)로 다시 연결하고, 다시 연결하기 전에 인증 쿠키를 확인·갱신합니다. 연결 인증이 만료되기 1분 전에 토큰을 미리 갱신해서 게임 중에 끊기지 않습니다.
- **`rooms/protocol.ts`**: 서버가 보내는 모든 메시지의 Zod 스키마입니다. 모르는 메시지나 형식이 틀린 메시지는 받아들이지 않고 연결을 다시 맺습니다.
- **`rooms/RoomClient`**: 받은 메시지를 하나의 스냅샷으로 보관하고 `useSyncExternalStore`로 구독합니다.
  - 오래된 `version`의 방 상태와 방 목록은 버립니다.
  - `serverTime`으로 서버와 브라우저의 시계 차이(`clockOffset`)를 구해, 단계 마감·모션·던지기 시각을 브라우저 시계로 바꿉니다. 그래서 모두가 거의 같은 순간에 같은 연출을 봅니다.
  - 캐시(`GET /api/wallet` + `WALLET`)와 상점·보유 수량(`GET /api/shop` + `INVENTORY`)은 연결할 때마다 다시 읽어 끊긴 동안 놓친 변화를 메웁니다.
  - 모션과 던지기 연출은 끝날 때까지만 보관하고 지웁니다.
  - 새로고침했을 때 원래 방으로 돌아갈 수 있게, 사용자별 sessionStorage에 방 코드만 기록합니다.
- **`rooms/view.ts`**: 서버 방 상태를 화면과 3D 장면이 쓰는 `RoomState`로 바꿉니다. 참가자 UUID는 그대로 두고, 이 어댑터에서만 내 계정을 `me`로 바꿉니다.
- **명령**: 모든 명령에 `requestId`를 붙여 보내고, `ACK`/`ERROR`가 올 때까지 기다립니다(10초 안에 답이 없으면 실패). 입찰은 마지막으로 본 `bidVersion`과 최종 금액을 보내고, 거절되면 서버가 함께 보낸 현재가로 바로 갱신됩니다.

## 3D 장면

`scene/`이 경매장과 인형을 그립니다. 장면은 필요할 때만 다시 그리고(`frameloop="demand"`), 움직이는 동안에만 다음 프레임을 요청합니다.

- **경매장과 물건**: `AuctionInterior`, `LotModel`, `ModelAsset`. 모델은 처음 필요할 때 불러오고, 불러오는 중에도 대기실 조작은 됩니다.
- **인형 자세**: `modelPose.seatedModel`이 모델 뼈를 조정해 의자에 앉힙니다. **오른팔**은 입찰 패들(`BidPaddle`)을 들고 최고 입찰자일 때 올라가고, **왼팔**은 던지기와 모션에 씁니다. 그래서 입찰과 모션이 겹치지 않습니다.
- **던지기·피격**: `prankMotion`과 `PrankEffect`가 왼팔 투척, 날아가는 궤적, 맞은 인형의 움찔·토마토 홍조(`plushBlush`)를 그립니다. 서버의 `ITEM_EFFECT`를 기존 `Effect` 데이터로 바꿔 넘깁니다.
- **모션**: `emoteMotion`이 시각별 팔 진행도·담배 끝 밝기·연기 시점을 계산하는 순수 함수이고, `EmoteProps`가 손 소품(가운뎃손가락, 담배)과 연기를 그립니다. 인형 손은 둥근 장갑이라, 소품이 모델별 손 두께보다 길게 나오는지 실제 GLB로 테스트합니다.
- **이름표·말풍선**: `CharacterLabels`가 머리 위 이름과 채팅 말풍선을 화면 좌표에 겹치지 않게 놓습니다.

## 로컬 미리보기

`game/LocalGameServer`는 서버 없이 브라우저 안에서 경매 규칙을 돌리는 미리보기입니다. 지금은 로비 배경 연출과 "장난 주머니 · 미리보기", 그리고 규칙·연출 단위 테스트에서만 씁니다. 온라인 방의 상태와는 섞이지 않습니다.

## 코드 구조

```text
frontend/
├── src/
│   ├── main.tsx           # 브라우저 진입점
│   ├── app/               # 앱 상태 연결, 화면 전환, 상단 메뉴, 상점·규칙 모달
│   ├── auth/              # 인증·지갑·상점 API, 응답 검증, 로그인 상태
│   ├── rooms/             # WebSocket 연결, 프로토콜 스키마, RoomClient, 화면용 변환
│   ├── pages/             # 로비, 대기실·경매 HUD, 결과
│   ├── components/
│   │   ├── ui/            # 버튼, 배지, 모달 등 공통 UI
│   │   ├── art/           # 캐릭터 초상·물건 그림
│   │   ├── brand/         # 로고와 시작 연출
│   │   └── game/          # 채팅, 참가자, 상점, 모션 버튼, 타이머
│   ├── game/              # 화면 상태 타입, 로컬 미리보기 규칙과 테스트
│   ├── scene/             # Three.js 장면, 모델, 포즈, 던지기·모션 연출
│   ├── data/              # 방 정보 타입, 캐릭터 모델 목록
│   ├── hooks/             # 효과음
│   ├── styles/            # index.css에서 순서대로 불러오는 스타일
│   └── dev/               # ?showcase=1 컴포넌트 쇼케이스
├── public/                # 모델, 이미지, 출처·라이선스
├── assets/brand/          # 로고 망치 원본과 피벗 좌표
└── scripts/
    ├── assets/            # GLB 정리, 로비 초상 렌더링
    └── qa/                # 브라우저 검증
```

## 브라우저 검증

Playwright와 설치된 Chrome으로 실제 서버에 붙어 검증합니다. 검증 스크립트는 `qa-<UUID>@example.test` 같은 테스트 계정을 만들며, 계정은 연결된 DB에 남습니다. 결과와 스크린샷은 `.qa/`(일부는 `../.omo/evidence/`)에 저장됩니다.

```sh
pnpm build && pnpm preview --port 4185 --strictPort
# 다른 터미널에서
NACKCHAL_URL=http://127.0.0.1:4185 pnpm qa:auction
```

| 명령 | 확인하는 것 |
| --- | --- |
| `qa:auth` | 가입·로그인·JWT 갱신·탭 간 동시 갱신·로그아웃과 오류 복구 |
| `qa:rooms` | 공유 목록, 네 자리 제한과 다섯 번째 거절, 중복 탭 거절, 준비·채팅 동기화, 새로고침 복귀, 퇴장·방장 이전, 탭 간 로그아웃 |
| `qa:game` | 방 생성, 혼자 대기(시작 버튼 비활성), 채팅, 마지막 퇴장 시 방 삭제 |
| `qa:auction` | 두 계정으로 로비 캐시, 시작, 입찰 방송, 낙찰·가치 공개, 다음 라운드, 모션 표시, 퇴장으로 인한 중단 (실제 시간으로 약 40초) |
| `qa:items` | **로컬 Compose 전용.** SQL로 시험용 캐시를 넣고 상점 구매 → 게임 → 던지기, 보유 수량·남은 투척 감소. 운영 주소에는 실행하지 않는다 |
| `qa:avatar` | 가입 때 고른 캐릭터, 로비에서 바꾸기와 다른 탭 반영, 방 안에서 바꾸기 거절 |
| `qa:chat` | 실제 서버의 1초 제한과 말풍선 만료 |
| `qa:lobby` | 실제 공유 방으로 검색·필터·입장 |
| `qa:models`, `qa:animals` | 모델 로딩 중 조작, 모델 복구, 새로고침 시 같은 방 복귀 |
| `qa:paddles`, `qa:pranks` | 실제 GLB로 패들·투척 자세 확인 (단위 수준) |
| `qa:brand`, `qa:performance` | 로고 연출, 비로그인 진입 화면 성능 |

`?showcase=1` 주소는 공통 컴포넌트 확인용입니다. React Grab/Scan은 개발 모드에서만 로드되며 `VITE_DISABLE_REACT_DEVTOOLS=1 pnpm dev`로 끌 수 있습니다.

## 모델과 글꼴

| 자산 | 제작자 | 라이선스 |
| --- | --- | --- |
| [Animal Plushies](https://moraazul.itch.io/animal-plushies) | MoraAzul | CC BY, 버전 미표기 |
| [Paddles With Numbers](https://www.thingiverse.com/thing:4577011) | jumimo | CC BY 4.0 |
| [Tiny Treats Bakery Interior](https://tinytreats.itch.io/bakery-interior) | Isa Lousberg / Tiny Treats | CC0 |
| [DynaPuff](https://github.com/googlefonts/dynapuff) | Toshi Omagari | SIL OFL 1.1 |

가공 내역은 [출처 화면](public/credits.html), 라이선스 원문은 [라이선스 폴더](public/models/licenses)에 있습니다. 변환본이 포함돼 있어 앱 실행에 Blender는 필요 없습니다. 원본을 다시 변환할 때는 다음 명령을 씁니다.

```sh
blender -b --factory-startup --python scripts/assets/convert-plushies.py -- '<Animal Plushies 폴더>'
node scripts/assets/prepare-paddle.mjs '<Paddle_0.stl 경로>'
pnpm assets:prepare '<Tiny_Treats_Bakery_Interior_1.1_FREE 폴더>'
pnpm assets:portraits
blender -b --factory-startup --python scripts/assets/make-brand-gavel.py
```

로고 망치는 직접 모델링했습니다. GLB 원본과 피벗 좌표는 `assets/brand/`, 화면에서 쓰는 투명 렌더 이미지는 `public/art/brand/`에 두며 원본은 배포 빌드에 포함하지 않습니다.
