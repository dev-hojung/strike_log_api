# Badges 모듈

## 개요

사용자의 보링 게임 성취를 인정하는 배지 시스템과 일일 출석 streak을 관리하는 모듈입니다.
- 게임 저장 또는 시리즈 완료 직후 배지 평가 (6가지 카테고리 25개 배지)
- 현재/최장 출석 streak 계산 (**앱 접속일** 기준 — `attendance_logs.ymd_kst` 시퀀스)
- 사용자별 배지 상태 조회 (획득 여부 + 획득일시)

## 엔티티

- `UserBadge` (`entities/user-badge.entity.ts`): 사용자가 획득한 배지 레코드 (user_id, badge_key 복합 UNIQUE)
- `AttendanceLog` (`entities/attendance-log.entity.ts`): 일일 출석 로그. PK (user_id, ymd_kst)로 같은 날 중복 호출 idempotent

## 컨트롤러 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| GET | `/badges/me` | 사용자 전체 배지 카탈로그 (잠금/해금 상태 + 획득일) |
| GET | `/badges/me/recent` | 최근 획득 배지 (limit 파라미터, 기본 5개) |
| GET | `/attendance/me/streak` | 출석 streak 요약 (현재 + 최장, 홈 카드용) |
| POST | `/attendance/me/check-in` | 오늘 출석 기록 (앱 시작/로그인 시 호출, idempotent) |

## 서비스 책임

**BadgesService** (`src/badges/badges.service.ts`)는:
- `checkAndAward()`: 사용자의 모든 배지 평가 → 신규 획득분만 DB insert → 신규 키 목록 반환
  - 이미 획득한 배지는 재평가 생략
  - 동시성 race condition은 UNIQUE 제약으로 자동 처리
- `loadStatsForEvaluation()`: 평가에 필요한 사용자 통계 일괄 로드
  - 시리즈 평균은 `game_series`에 점수 컬럼이 없으므로 자식 `games`를 SUM해서 계산
  - `loadStrikesStats()`로 이력 전체 한 게임 최대 스트라이크/최장 연속 추출 (이력 평가 보장)
  - `target_game_count=3`인 완주 시리즈 카운트를 별도 집계 → `series_3_full` 평가에 사용
- `getStatusForUser()`: 전체 배지 + 획득 여부 조회
- `getRecentEarned()`: 최근 획득 배지 N개 조회 (earned_at desc)
- `recordAttendance()`: 오늘 KST 날짜를 attendance_logs에 INSERT IGNORE. 신규 출석이면 streak 배지 재평가.
- `computeCurrentStreak()` / `computeLongestStreak()`: `attendance_logs.ymd_kst` distinct 시퀀스 기반.
  - **KST(Asia/Seoul) 기준** ymdToday/ymd 사용. Railway 호스트가 UTC라도 한국 자정 경계에서 어긋나지 않음.

## 카탈로그

`badge-catalog.ts`에 정의된 25개 배지:

| 카테고리 | 배지 | 조건 |
|---------|------|------|
| **마일스톤** | first_game | 첫 게임 |
| | games_10, games_50, games_100, games_500 | 누적 경기 수 |
| **점수** | score_100, score_150, score_200, score_250, score_perfect(300) | 한 게임 최고점 |
| **스트라이크** | strikes_5, strikes_8, strikes_10+ | 한 게임 스트라이크 개수 |
| | strikes_consecutive_5 | 한 게임 스트라이크 5연속 |
| **시리즈** | series_first, series_3_full | 시리즈 완주 조건 |
| | series_avg_180, series_avg_200 | 시리즈 평균 점수 |
| **출석** | streak_3, streak_7, streak_30, streak_100 | 연속 일수 |
| **클럽** | club_joined, club_game_first, club_game_win | 클럽 활동 이정표 |

## 트리거 지점

배지 평가는 다음 시점에 fire-and-forget 또는 동기로 호출:
- 게임 저장 후 (`games.service.ts`): `checkAndAward(user_id, { savedGame: {...} })` — 동기, 응답에 `newly_earned_badges` 동봉
- 시리즈 완료 후 (`game-series.service.ts`): `evaluateBadgesAndNotify(userId, { completedSeries })`
- 클럽 신규 멤버십 발생 시 (`groups.service.ts`):
  - 클럽 생성 직후 본인이 ADMIN으로 등록될 때
  - 가입 신청 승인으로 멤버 추가될 때
  - → `club_joined` 활성화를 위해 비동기 호출

신규 배지 인서트 후 매 키에 대해 `notificationsService.create({ type: BADGE_EARNED })` 호출 → 앱 알림함 + FCM 푸시.
