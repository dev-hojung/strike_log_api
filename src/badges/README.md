# Badges 모듈

## 개요

사용자의 보링 게임 성취를 인정하는 배지 시스템과 일일 출석 streak을 관리하는 모듈입니다.
- 게임 저장 또는 시리즈 완료 직후 배지 평가 (6가지 카테고리 24개 배지)
- 현재/최장 출석 streak 계산 (연속 play_date 기준)
- 사용자별 배지 상태 조회 (획득 여부 + 획득일시)

## 엔티티

- `UserBadge` (`entities/user-badge.entity.ts`): 사용자가 획득한 배지 레코드 (user_id, badge_key 복합 UNIQUE)

## 컨트롤러 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| GET | `/badges/me` | 사용자 전체 배지 카탈로그 (잠금/해금 상태 + 획득일) |
| GET | `/badges/me/recent` | 최근 획득 배지 (limit 파라미터, 기본 5개) |
| GET | `/attendance/me/streak` | 출석 streak 요약 (현재 + 최장, 홈 카드용) |

## 서비스 책임

**BadgesService** (`src/badges/badges.service.ts`)는:
- `checkAndAward()`: 사용자의 모든 배지 평가 → 신규 획득분만 DB insert → 신규 키 목록 반환
  - 이미 획득한 배지는 재평가 생략
  - 동시성 race condition은 UNIQUE 제약으로 자동 처리
- `getStatusForUser()`: 전체 배지 + 획득 여부 조회
- `getRecentEarned()`: 최근 획득 배지 N개 조회 (earned_at desc)
- `computeCurrentStreak()`: 연속 play_date 기준 현재 streak (오늘/어제 이후만 유효)
- `computeLongestStreak()`: 전체 play_date 시퀀스에서 최장 연속 구간

## 카탈로그

`badge-catalog.ts`에 정의된 24개 배지:

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

배지 평가는 `src/games/games.service.ts`의 게임 저장/시리즈 완료 직후 호출:
- 게임 저장 후: `checkAndAward(user_id, { savedGame: {...} })`
- 시리즈 완료 후: `checkAndAward(userId, { completedSeries: {...} })`
