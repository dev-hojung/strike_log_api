# Games 모듈

볼링 게임 기록과 시리즈(게임 묶음) 관리를 담당하는 도메인 모듈입니다.

## 개요

- 개인 및 클럽 게임 기록 저장
- 프레임별 투구 데이터 추적
- 게임 시리즈(3게임, 6게임 등) 관리
- 사용자별 통계 조회 (평균, 최고점, 월별 트렌드)
- 프레임 통계 (스트라이크, 스페어, 오픈, 올커버)

## 엔티티

- `Game` (`src/games/entities/game.entity.ts`): 볼링 게임 1회 기록 (총점, 플레이 날짜, 위치, 클럽 게임 여부, 시리즈 ID)
- `Frame` (`src/games/entities/frame.entity.ts`): 게임 내 프레임 상세 기록 (프레임번호, 1~3차 투구 점수)
- `GameSeries` (`src/games/entities/game-series.entity.ts`): 게임 묶음 (목표 게임 수, 시작/종료 시각)

## DTO

- `CreateGameDto` (`src/games/dto/create-game.dto.ts`): 빈 DTO (요청 바디는 컨트롤러에서 직접 정의)
- `UpdateGameDto` (`src/games/dto/update-game.dto.ts`): CreateGameDto 부분 확장 (사용 중심 없음)

## 컨트롤러 엔드포인트

### GamesController

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/games` | 새로운 게임 기록 생성 (frames, 총점, 위치, 클럽 게임 여부 등) |
| `GET` | `/games/club/:room_id` | 같은 방 코드로 저장된 클럽 게임 참가자 전원 기록 조회 |
| `GET` | `/games/users/:user_id/statistics` | 유저 통계 조회 (평균, 최고점, 최근 10게임, 월별 트렌드) — 본인/관리자만 |
| `GET` | `/games/users/:user_id/recent` | 최근 게임 1건 상세 조회 — 본인/관리자만 |
| `GET` | `/games/me` | 내 게임 기록 목록 조회 (최신순) |
| `GET` | `/games/users/:user_id/monthly-frame-stats` | 이번 달 프레임 통계 (스트라이크/스페어/오픈/올커버 게임 수) — 본인/관리자만 |
| `GET` | `/games/:id/detail` | 게임 상세 기록 조회 (프레임 포함) — 본인만 |

### GameSeriesController

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/game-series` | 시리즈 시작 (목표 게임 수, 시작 시각 선택) |
| `POST` | `/game-series/:id/complete` | 시리즈 종료 (completed_at 기록, 배지 평가 트리거) |
| `GET` | `/game-series/:id` | 시리즈 단건 조회 (게임 목록 + 통합 통계 포함) — 본인만 |
| `GET` | `/game-series/users/:userId/recent` | 사용자 최근 시리즈 목록 (limit 파라미터, 기본 10개) — 본인/관리자만 |
| `GET` | `/game-series/users/:userId/best` | 사용자 베스트 시리즈 (완주 기준 총점 최고) — 본인/관리자만 |

## 서비스 책임

### GamesService (`src/games/games.service.ts`)

- **게임 저장**: 총점, 프레임 데이터, 플레이 날짜, 위치, 클럽/개인 구분
- **클럽 게임 검증**: 사용자 소속 클럽 체험판 만료 여부 확인 (전부 EXPIRED면 GoneException)
- **알림 발송 (비동기)**:
  - 클럽 게임 생성 시 같은 클럽 멤버 전원에게 알림 (`NotificationsService.createBulk`)
  - 개인 최고점 갱신 시 알림 (첫 게임은 제외)
  - 배지 획득 시 알림
- **배지 평가 (동기/비동기)**:
  - 게임 저장 시 동기로 평가해 응답에 `newly_earned_badges` 동봉
  - 배지 획득 알림은 fire-and-forget
- **통계 조회**:
  - 평균 점수, 최고점, 최근 10게임 트렌드
  - 월별 현황 (이번 달 vs 지난달 평균, 상승/하락율)
  - 월별 프레임 통계 (스트라이크, 스페어, 오픈, 올커버 게임 수)
- **게임 상세 조회**: 권한 검증 (본인만 조회 가능)

### GameSeriesService (`src/games/game-series.service.ts`)

- **시리즈 라이프사이클**:
  1. `createSeries` → started_at 기록, completed_at=null
  2. 게임 저장 시 series_id/series_index 함께 전달
  3. `completeSeries` → completed_at 기록, 배지 평가 트리거 (비동기)
- **자동 완료 정책**: target_game_count만큼 저장되어도 자동 종료하지 않음 (클라이언트 명시적 호출)
- **시리즈 조회**:
  - 게임 목록 + 통합 통계 (총점, 평균, 스트라이크/스페어/오픈/최장연속스트라이크)
  - 최근 시리즈 목록 (N+1 회피를 위해 메모리 그룹화)
  - 베스트 시리즈 (완주만, 총점 최고)
- **통계 계산**: 프레임 데이터로부터 볼링 규칙 적용 (10프레임 보너스 포함)

## 다른 모듈 트리거

### NotificationsModule

- 게임 저장 시:
  - `CLUB_GAME_CREATED`: 같은 클럽 멤버들 (생성자 제외)
  - `NEW_BEST_SCORE`: 개인 최고점 갱신
  - `BADGE_EARNED`: 배지 획득 (동기 평가 후)
- 시리즈 종료 시:
  - `BADGE_EARNED`: 시리즈 완주 관련 배지 (비동기)

### BadgesModule

- 게임 저장 시: `badgesService.checkAndAward(userId, { savedGame })` (동기, 결과는 응답에 동봉)
- 시리즈 종료 시: `gamesService.evaluateBadgesAndNotify(userId, { completedSeries })` (비동기)
- 배지 정의는 `BADGE_BY_KEY` 카탈로그에서 조회

## 권한 검증

- 본인 또는 플랫폼 관리자만 다른 user_id 자원 접근 가능 (보수적 정책)
- `assertSelfOrAdmin()`: user_id 기반 권한 체크
- 게임 상세 조회, 통계 조회, 시리즈 조회 모두 적용
