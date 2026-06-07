# system-notices 모듈

운영자가 모든 사용자에게 일괄 공지하기 위한 모듈. 별도 관리자 웹 없이 운영 DB에 직접 SQL로 INSERT 한다.

## 엔드포인트

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/system-notices/active` | Public (로그인 전 호출 가능) | 현재 활성 공지 목록 |

응답:

```json
[
  {
    "id": 1,
    "title": "서버 점검 안내",
    "body": "오늘 자정 ~ 새벽 2시 점검 예정",
    "priority": "warning",
    "dismissible": true,
    "starts_at": null,
    "ends_at": "2026-06-08T15:00:00.000Z",
    "created_at": "2026-06-07T01:23:45.000Z",
    "updated_at": "2026-06-07T01:23:45.000Z"
  }
]
```

## 운영자 사용 흐름

새 공지 등록 SQL 예시:

```sql
INSERT INTO system_notices (title, body, priority, dismissible, starts_at, ends_at)
VALUES (
  '신기능: 주간 챌린지',
  '이번 주부터 챌린지 3종이 자동 시작됩니다.',
  'info',
  TRUE,
  NULL,
  '2026-06-30 23:59:59'
);
```

- `starts_at IS NULL` → 즉시 노출 시작
- `ends_at IS NULL` → 무기한 (수동으로 행 삭제 또는 ends_at 업데이트해서 종료)
- `priority` 값: `info` / `warning` / `critical` — 앱 UI 색상/아이콘 분기용
- `dismissible = FALSE` → 사용자가 "오늘 하루 안 보기" 불가 (점검 임박 등)

## 클라이언트 동작

- 앱 시작 직후 `/system-notices/active`를 호출
- SharedPreferences에 (notice_id → dismissed_until ISO date)가 저장돼 있어 dismiss 처리된 공지는 화면에 안 띄움
- "오늘 하루 안 보기" 누르면 dismissed_until = 오늘 KST 23:59:59로 저장
- `dismissible == false`인 공지는 닫기 버튼만 노출 (오늘 하루 안 보기 버튼 숨김)

## 의존

- `auth/public.decorator` — JWT 우회용
