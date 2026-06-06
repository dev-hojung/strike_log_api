# challenges 모듈

주간 챌린지 도메인. 정적 카탈로그 + 실시간 집계 방식이라 별도 사용자 진행 테이블이 없다.

## 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| GET | `/challenges/me/weekly` | 내 이번 주(KST 월~일) 챌린지 진행률 (3개) |

응답 예시:

```json
[
  {
    "key": "weekly_games_5",
    "name": "5게임 도전",
    "description": "이번 주 게임 5판 이상 기록",
    "target": 5,
    "unit": "게임",
    "current": 3,
    "percent": 60,
    "achieved": false,
    "week_start": "2026-06-01T00:00:00.000Z",
    "week_end": "2026-06-07T14:59:59.999Z"
  }
]
```

## 카탈로그

`challenge-catalog.ts`에 정적으로 정의된 3개 챌린지를 매주 자동 반복.

- `weekly_games_5` — 이번 주 게임 5판
- `weekly_avg_180` — 이번 주 평균 180점 (3게임 이상)
- `weekly_strikes_30` — 이번 주 스트라이크 30개

새 챌린지 추가 시 `WeeklyChallengeKey` enum + `WEEKLY_CHALLENGES` 배열 + `ChallengesService.getMyWeekly()` switch에 케이스를 같이 더한다.

## 주 경계

`_kstWeekRangeUtc()`가 현재 시각이 속한 KST 주의 월요일 00:00 ~ 일요일 23:59:59.999를 UTC Date로 반환. Railway가 UTC로 도는 환경 가정.

## 의존

- `games.Game`, `games.Frame` (TypeORM forFeature) — 진행률 집계용
- 사용자 진행 저장소 없음 → 매 호출 시 게임 데이터 재집계
