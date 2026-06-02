# Groups 모듈

## 개요

**클럽(그룹) 도메인**을 담당하는 모듈. 사용자들이 볼링 클럽을 생성, 가입, 관리하고 클럽별 랭킹을 조회할 수 있게 지원합니다.

- 클럽 생성 신청 → 관리자 승인 플로우
- 클럽 가입 신청 → 클럽장 승인 플로우
- 클럽 리더보드 (평균 점수 기반 순위)
- 체험판 자동 관리 및 만료 알림 스케줄러

## 엔티티

| 엔티티 | 설명 |
|--------|------|
| `Group` | 클럽 정보 (이름, 설명, 커버 이미지, 구독 상태, 체험판 일정) |
| `GroupMember` | 클럽-사용자 관계 (역할: ADMIN/MEMBER, 가입 일시) |
| `GroupJoinRequest` | 클럽 가입 신청 (상태: pending/approved/rejected) |
| `GroupCreationRequest` | 클럽 생성 신청 (상태: pending/approved/rejected/cancelled, 반려 사유 기록) |

## DTO

| DTO | 설명 |
|-----|------|
| `CreateGroupDto` | 클럽 생성 (현재 비어있음, 요청 본문은 인라인 정의) |
| `UpdateGroupDto` | 클럽 수정 (미사용) |
| `CreateJoinRequestDto` | 가입 신청 생성 (user_id, 선택적 message) |

## 컨트롤러 엔드포인트

### 클럽 관리

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/groups` | 새 클럽 생성 (플랫폼 관리자 전용) |
| `GET` | `/groups` | 전체 클럽 목록 조회 |
| `GET` | `/groups/me` | 내가 속한 클럽 목록 조회 |
| `GET` | `/groups/:id` | 클럽 상세 정보 조회 |
| `GET` | `/groups/:id/leaderboard` | 클럽 리더보드 (평균 점수 순) |

### 클럽 생성 신청

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/groups/creation-requests` | 클럽 생성 신청 (일반 사용자) |
| `GET` | `/groups/creation-requests/me` | 내 클럽 생성 신청 목록 |
| `GET` | `/groups/creation-requests` | 클럽 생성 신청 목록 조회 (관리자 전용) |
| `POST` | `/groups/creation-requests/:id/approve` | 클럽 생성 신청 승인 (관리자) |
| `POST` | `/groups/creation-requests/:id/reject` | 클럽 생성 신청 반려 (관리자) |
| `POST` | `/groups/creation-requests/:id/cancel` | 클럽 생성 신청 취소 (신청자) |

### 클럽 가입 신청

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/groups/:id/join-requests` | 클럽 가입 신청 생성 |
| `GET` | `/groups/:id/join-requests` | 가입 신청 목록 조회 (클럽장 전용) |
| `POST` | `/groups/:id/join-requests/:requestId/approve` | 가입 신청 승인 (클럽장) |
| `POST` | `/groups/:id/join-requests/:requestId/reject` | 가입 신청 거절 (클럽장) |

### 클럽 멤버

| HTTP | 경로 | 설명 |
|------|------|------|
| `GET` | `/groups/:id/members` | 클럽 멤버 목록 조회 |
| `GET` | `/groups/:id/members-with-stats` | 클럽 멤버 목록 + 평균 점수 |

## 서비스 책임

**GroupsService** (`src/groups/groups.service.ts`):

- **클럽 생성 신청**
  - 신청 생성 → 플랫폼 관리자들에게 푸시 알림
  - 중복 신청 차단 (PENDING 상태 기존 신청 있으면 거절)

- **관리자 승인/반려**
  - 승인 시 새로운 Group 레코드 생성 + 신청자를 ADMIN 권한으로 자동 가입 + 신청자에게 알림
  - 반려 시 반려 사유(부적절한 이름, 중복, 정보 불완전, 기타) 기록

- **클럽 생성 정책**
  - 플랫폼 관리자 생성: 즉시 `active` 상태
  - 일반 사용자 생성: `trial` 상태, 7일 체험판 자동 설정

- **체험판 만료 관리**
  - 서비스 부팅 시 기존 TRIAL 클럽의 만료 일정 역산 및 상태 보정
  - 읽기 경로에서 만료 여부를 확인해 필요 시 `expired` 상태로 전환 (지연 일관성)

- **클럽 리더보드**
  - 멤버 전원의 누적 평균/최고 점수/경기 수 집계
  - 평균 점수 내림차순 정렬
  - 경기가 있는 멤버 우선, 동률 시 최고 점수로 구분
  - 요청자는 자신의 순위(`myRank`) 포함하여 조회

- **가입 신청 승인제**
  - 가입 신청 생성 시 클럽장에게 알림
  - 승인 시 GroupMember 레코드 생성 + 신청자에게 알림
  - 거절 시 신청자에게 알림

- **멤버 조회**
  - 멤버 목록 (역할/가입일 정렬)
  - 멤버 목록 + 각 멤버의 평균 점수

## TrialReminderService

**역할**: 클럽 체험판 만료 예정 알림을 자동으로 발송하는 스케줄러 (`src/groups/trial-reminder.service.ts`)

- **실행 주기**: 매일 오전 9시 (서버 타임존)

- **알림 타이밍**
  - D-3 (만료 3일 전): "체험판 만료 임박" 알림
  - D-1 (만료 1일 전): "체험판이 내일 만료됩니다" 알림
  - D-0 (만료 당일): "체험판 만료" 알림 + Group의 subscription_status를 EXPIRED로 전환

- **중복 발송 방지**
  - Group 엔티티의 `reminder_d3_sent`, `reminder_d1_sent`, `reminder_expired_sent` 플래그 사용
  - 각 알림은 1회만 발송

- **대상**: 클럽 ADMIN(클럽장)에게만 알림 발송

## 권한 검증

### 클럽 생성 신청 (Creation Request)
- **일반 사용자**: `POST /groups/creation-requests` 사용 (신청 생성)
- **플랫폼 관리자**: 
  - `POST /groups` (직접 생성 가능)
  - `GET /groups/creation-requests` (관리자 목록 조회)
  - `POST /groups/creation-requests/:id/approve` (승인)
  - `POST /groups/creation-requests/:id/reject` (반려)

### 클럽 가입 신청 (Join Request)
- **모든 사용자**: `POST /groups/:id/join-requests` (가입 신청)
- **클럽장 (ADMIN)**: 
  - `GET /groups/:id/join-requests` (신청 목록 조회 — assertAdmin 검증)
  - `POST /groups/:id/join-requests/:requestId/approve` (승인 — assertAdmin 검증)
  - `POST /groups/:id/join-requests/:requestId/reject` (거절 — assertAdmin 검증)

### 리더보드 조회
- **클럽 멤버** 또는 **플랫폼 관리자**: `GET /groups/:id/leaderboard` 접근 가능
- 클럽 멤버가 아닌 일반 사용자는 ForbiddenException (403) 반환

### 인증
- 모든 엔드포인트는 Bearer 토큰 필수 (`@ApiBearerAuth('access-token')`)
- `@CurrentUser('id')` 데코레이터로 요청자 ID 추출 및 권한 검증

## 중요 동작 정리

1. **클럽 생성 플로우** (일반 사용자)
   - 신청 → 관리자 심사 → 승인 시 클럽 생성 + 신청자 자동 ADMIN 가입

2. **클럽 가입 플로우**
   - 가입 신청 → 클럽장 심사 → 승인 시 멤버 추가 (MEMBER 역할)

3. **체험판 자동 관리**
   - 생성 시: 일반 사용자 → TRIAL (7일), 관리자 → ACTIVE
   - 매일 9시: 만료 일정 알림 (D-3, D-1, D-0)
   - 읽기 시: 만료 여부 확인 후 자동으로 EXPIRED 상태 전환

4. **리더보드 집계**
   - 해당 클럽 멤버 전원의 게임 기록을 조회해 메모리에서 집계
   - N+1 쿼리 방지 위해 모든 게임을 한 번에 조회

---

**참고**: 직접 클럽 가입(`POST /groups/:id/join`)은 폐기됨 (GoneException). `join-requests` 플로우 사용 필수.
