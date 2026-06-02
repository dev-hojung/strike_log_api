# Strike Log API

Strike Log 앱(Flutter)의 NestJS 백엔드. 볼링 점수/시리즈/클럽/알림/배지 도메인을 제공.

## 기술 스택

- **Framework**: NestJS 11
- **Language**: TypeScript
- **ORM**: TypeORM 0.3 (마이그레이션 자동 실행 `migrationsRun: true`)
- **DB**: MySQL 8 (운영: Railway)
- **인증**: JWT (Bearer 토큰, `@Public()` 데코레이터로 무인증 라우트 지정)
- **실시간**: Socket.IO (클럽 게임 점수 공유)
- **푸시**: Firebase Admin SDK (FCM)
- **스케줄**: `@nestjs/schedule` (체험판 만료 리마인더 등)

## 디렉터리 구조

```
src/
├── main.ts                — 부트스트랩, CORS, PORT
├── app.module.ts          — TypeOrm + 모든 도메인 모듈 + 전역 JwtAuthGuard
├── data-source.ts         — TypeORM CLI(마이그레이션)용 DataSource
├── auth/                  — JwtAuthGuard, @Public, @CurrentUser
├── users/                 — 회원/프로필/인증
├── email/                 — 이메일 OTP
├── games/                 — Game·Frame·GameSeries (핵심)
├── groups/                — 클럽·멤버·가입/생성 신청·체험판
├── notifications/         — 인앱 알림 + FCM 송신 + 토큰 관리
├── badges/                — 배지 카탈로그 + 검출 + 출석 streak
├── game-rooms/            — 클럽 게임 Socket.IO 방
└── migrations/            — TypeORM 마이그레이션 파일
```

각 모듈에는 상세 `README.md`가 있음.

## 도메인 ERD (요약)

```mermaid
erDiagram
    users ||--o{ games : "plays"
    users ||--o{ game_series : "owns"
    games ||--o{ frames : "records"
    games }o--|| game_series : "belongs to"
    users ||--o{ group_members : "joins"
    groups ||--o{ group_members : "has"
    groups ||--o{ group_join_requests : "receives"
    users ||--o{ group_creation_requests : "submits"
    users ||--o{ notifications : "receives"
    users ||--o{ fcm_tokens : "owns"
    users ||--o{ user_badges : "earns"
```

## 빌드 & 실행

```bash
npm install
npm run start:dev          # 개발 모드 (watch + .env 로드)
npm run build && npm run start:prod
```

### 환경변수 (`.env`)

```
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=...
DB_DATABASE=strike_log
JWT_SECRET=...                  # openssl rand -base64 48
PORT=3001
SENTRY_DSN=...                  # (선택)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
TYPEORM_SYNCHRONIZE=false       # 기본 false. 개발에서만 true
```

## 마이그레이션

```bash
npm run migration:show         # 적용 상태 확인
npm run migration:run          # 실행
npm run migration:revert       # 가장 최근 1개 롤백
npm run migration:generate src/migrations/<Name>
```

NestJS 런타임에서는 `app.module.ts`의 `migrationsRun: true`로 부팅 시 자동 적용.

### 적용된 마이그레이션
1. `1776754037207-InitBaseline` — 기본 스키마 (users, games, frames, groups, group_members, notifications, fcm_tokens, email_auths)
2. `1779000000000-AddGameSeries` — `game_series` + `games.series_id/series_index`
3. `1780000000000-AddNewBestScoreNotificationType` — enum 확장
4. `1781000000000-CreateUserBadges` — `user_badges`
5. `1782000000000-AddBadgeEarnedNotificationType` — enum 확장

## API 권한 메모

- 전역 `JwtAuthGuard` 적용 → 기본 인증 필요
- `@Public()` 라우트: `/users/login`, `/users/signup`, `/users/sync`, `/email/*`
- 컨트롤러에서 `@CurrentUser('id') userId: string`로 토큰의 user id 주입
- 일부 라우트(`/groups/creation-requests` 관리자, `/groups/:id/join-requests` 클럽장)는 서비스 레이어에서 권한 검증

## 출시 인프라

- Railway All-in-one (백엔드 + MySQL 같은 프로젝트)
- 도메인: `api.strikelog.xyz` (Cloudflare DNS, Railway TLS)
- 푸시: Firebase Spark
- 마이그레이션은 부팅 시 자동
