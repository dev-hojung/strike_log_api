# Notifications 모듈

## 개요

앱 내부 알림(DB 저장) + Firebase Cloud Messaging(FCM) 푸시 알림 기능을 제공합니다.

- **앱 내부 알림**: 사용자별 알림 이력을 DB(`notifications` 테이블)에 저장하고 조회/읽음 처리
- **FCM 푸시**: 등록된 FCM 토큰으로 실시간 푸시 발송 (안드로이드: high priority 채널, iOS: 기본 사운드)

---

## 엔티티

### `Notification` (`src/notifications/entities/notification.entity.ts`)
- DB 알림 레코드 (userId, type, title, body, targetId, actorId, actorNickname, isRead, createdAt)
- 지원 타입: `CLUB_GAME_CREATED`, `CLUB_JOIN_REQUEST`, `CLUB_JOIN_APPROVED`, `CLUB_JOIN_REJECTED`, `CLUB_CREATION_REQUEST`, `CLUB_CREATION_APPROVED`, `CLUB_CREATION_REJECTED`, `CLUB_TRIAL_EXPIRING_SOON`, `CLUB_TRIAL_EXPIRED`, `NEW_BEST_SCORE`, `BADGE_EARNED`, `CLUB_KICKED`

### `FcmToken` (`src/notifications/entities/fcm-token.entity.ts`)
- FCM 디바이스 토큰 저장 (token PK, userId, platform, createdAt, updatedAt)
- 기기 전환/계정 전환 시 upsert 처리

---

## 컨트롤러 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/notifications/me` | 현재 사용자의 알림 목록 조회 (최신순) |
| GET | `/notifications/me/unread-count` | 읽지 않은 알림 수 조회 |
| POST | `/notifications/:id/read` | 알림 단건 읽음 처리 |
| POST | `/notifications/me/read-all` | 현재 사용자의 모든 알림 읽음 처리 |
| POST | `/notifications/me/fcm-token` | FCM 디바이스 토큰 등록 |
| DELETE | `/notifications/me/fcm-token` | FCM 디바이스 토큰 삭제 (로그아웃 등) |

모든 엔드포인트는 Bearer 토큰 필수 (`@CurrentUser` 데코레이터로 userId 추출).

---

## NotificationsService 책임

**DB 알림 관리**

- `create(userId, type, title, body, ...)`: 단일 사용자에게 알림 생성 → DB 저장 후 FCM 푸시 발송
- `createBulk(userIds[], type, title, body, ...)`: 여러 사용자에게 동시 알림 생성 (클럽 게임 생성 시 사용)
- `findByUser(userId)`: 사용자별 알림 목록 조회 (최신순)
- `getUnreadCount(userId)`: 읽지 않은 알림 수
- `markAsRead(id)`: 단건 읽음 처리
- `markAllAsRead(userId)`: 전체 읽음 처리

**FCM 토큰 관리**

- `registerFcmToken(userId, token, platform)`: 토큰 등록 (upsert, 소유권 이전 지원)
- `deleteFcmToken(userId, token)`: 토큰 삭제
- `getTokensForUser(userId)`: 사용자의 등록된 토큰 목록 조회

---

## PushService 책임

**Firebase Admin SDK 초기화** (`src/notifications/push.service.ts`)

- 우선순위: `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` 환경변수 → `FIREBASE_SERVICE_ACCOUNT_PATH` 폴백 → `GOOGLE_APPLICATION_CREDENTIALS`
- 초기화 실패 시 `enabled=false`로 설정되어 푸시 발송은 no-op (개발 환경 안정성)

**FCM 푸시 전송**

- `sendToUser(userId, payload)`: 단일 사용자에게 푸시 발송
- `sendToUsers(userIds[], payload)`: 여러 사용자에게 푸시 발송

**무효 토큰 정리**

- FCM 응답에서 `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`, `messaging/invalid-argument` 에러 감지 → 해당 토큰 DB에서 삭제

**안드로이드 최적화**

- `channelId: 'strike_log_default_v2'` (클라이언트 high-importance 채널과 일치)
- `priority: 'high'` (백그라운드 푸시도 heads-up으로 표시)
- `tag: 'strike_log_default_v2'` (동일 tag로 신규 알림이 기존 알림 대체, 4개 이상 누적 시 Android 자동 그룹화 방지)

---

## Firebase 초기화 설정

`.env` 또는 환경변수 설정:

```
# 방법 1: 환경변수로 직접 지정 (우선순위 1순위)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
# 주의: 개행(\n)은 리터럴 \n이 아닌 실제 개행으로 복원됨

# 방법 2: JSON 파일 경로 (우선순위 2순위)
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json

# 방법 3: 기본 Google 크리덴셜 (우선순위 3순위)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

---

## 트리거 지점

다른 모듈에서 알림을 생성하는 흐름:

1. **그룹(클럽) 게임 생성** (`src/games/games.service.ts`)
   - 게임 생성 후 클럽원들에게 `CLUB_GAME_CREATED` 알림 발송

2. **클럽 가입 신청/승인/거부** (`src/groups/groups.service.ts`)
   - 가입 신청: 클럽 관리자에게 `CLUB_JOIN_REQUEST` 알림
   - 승인: 신청자에게 `CLUB_JOIN_APPROVED` 알림
   - 거부: 신청자에게 `CLUB_JOIN_REJECTED` 알림
   - 클럽 생성 신청: 관리자에게 `CLUB_CREATION_REQUEST` 알림
   - 승인/거부: 신청자에게 `CLUB_CREATION_APPROVED` / `CLUB_CREATION_REJECTED` 알림

3. **클럽 체험 기간 만료** (`src/groups/trial-reminder.service.ts`)
   - 체험 기간 만료 임박: 클럽원에게 `CLUB_TRIAL_EXPIRING_SOON` 알림
   - 체험 기간 만료: 클럽원에게 `CLUB_TRIAL_EXPIRED` 알림

4. **점수 및 뱃지** (예정)
   - 새 최고 점수: `NEW_BEST_SCORE` 알림
   - 뱃지 획득: `BADGE_EARNED` 알림

---

## 모듈 구조

- `notifications.module.ts`: TypeOrmModule 등록, 컨트롤러/서비스 제공
- `notifications.controller.ts`: HTTP 엔드포인트
- `notifications.service.ts`: DB 알림 관리, FCM 토큰 관리
- `push.service.ts`: Firebase Admin SDK 초기화, FCM 푸시 전송
- `entities/notification.entity.ts`: 알림 엔티티
- `entities/fcm-token.entity.ts`: FCM 토큰 엔티티
