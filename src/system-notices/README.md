# system-notices 모듈

운영자가 모든 사용자(로그아웃 디바이스 포함)에게 띄우는 시스템 공지. 모달 노출 + 푸시 broadcast + 매일 반복 푸시.

## 엔드포인트

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/system-notices/active` | Public | **모달 대상** 공지만. 푸시 발송된 공지는 제외 |
| POST | `/system-notices` | `X-Admin-Token` 헤더 = `ADMIN_API_KEY` | 공지 등록 + (옵션) 즉시 전체 디바이스 푸시 |

## 모달 vs 푸시 (배타적)

같은 공지를 푸시 + 모달로 동시 노출하면 중복이라 한쪽만 가게 한다.

- `last_pushed_at IS NULL` → 푸시 안 됐음 → /active에 포함 → 앱에서 모달
- `last_pushed_at IS NOT NULL` → 이미 푸시 발송 → /active에서 제외 → 모달 안 뜸

즉 **푸시로 발송한 공지는 모달 안 뜸, 모달 전용 공지는 푸시 안 감.**

| 사용 케이스 | POST 옵션 | 결과 |
|---|---|---|
| 일회성 푸시 알림 (이벤트, 점검) | `push_immediately:true` (기본) | 푸시만, 모달 X |
| 매일 9시 푸시 | `repeat_daily:true` | 매일 푸시, 모달 X |
| 모달로만 강조 (앱 열 때 안내) | `push_immediately:false` | 모달만, 푸시 X |

### POST 요청 본문

```json
{
  "title": "신기능 안내",
  "body": "주간 챌린지가 시작되었습니다.",
  "priority": "info",
  "dismissible": true,
  "starts_at": "2026-06-08T00:00:00Z",
  "ends_at": "2026-06-30T23:59:59Z",
  "repeat_daily": false,
  "push_immediately": true
}
```

- `priority`: `info` (기본) / `warning` / `critical`
- `dismissible`: false면 "오늘 하루 안 보기" 버튼 숨김 (점검 임박 등)
- `starts_at`/`ends_at`: 노출 윈도우. null = 즉시 시작 / 무기한
- `repeat_daily`: true면 매일 KST 09:00 자동 재푸시
- `push_immediately`: false면 푸시 없이 행만 추가 (모달은 노출)

### curl 예시

```bash
curl -X POST https://strikelogapi-production.up.railway.app/system-notices \
  -H "X-Admin-Token: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"신기능","body":"주간 챌린지가 시작되었습니다."}'
```

## 매일 반복 푸시

`repeat_daily = true`인 공지는 `@Cron('0 0 * * *', { timeZone: 'UTC' })` = KST 09:00에 한 번씩 자동 발송.
같은 KST 날짜에 두 번 안 보내도록 `last_pushed_at` 컬럼으로 idempotency 보장.

종료 조건:
- `ends_at`이 지나면 자동 중단
- 혹은 `UPDATE system_notices SET repeat_daily = FALSE WHERE id = X`

## 푸시 수신 범위

- `PushService.sendToAllDevices()` 사용 — `fcm_tokens` 테이블의 모든 토큰
- 로그아웃 디바이스(userId = NULL)도 시스템 공지는 수신
- 일반 알림(`sendToUser`/`sendToUsers`)은 userId 필터링되므로 영향 없음

## 환경변수

- `ADMIN_API_KEY` — Railway env에 설정 필요. POST 엔드포인트 인증용. 미설정 시 POST는 항상 403.

## 직접 SQL로 관리

```sql
-- 즉시 숨기기
UPDATE system_notices SET ends_at = NOW() WHERE id = 1;
-- 매일 푸시 끄기
UPDATE system_notices SET repeat_daily = FALSE WHERE id = 1;
-- 본문 수정
UPDATE system_notices SET body = '...' WHERE id = 1;
-- 삭제
DELETE FROM system_notices WHERE id = 1;
```

## 의존

- `auth/public.decorator` — JWT 우회 + 헤더 인증
- `notifications.PushService` — `sendToAllDevices()` 호출
- `@nestjs/schedule` — Cron
