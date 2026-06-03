# Strike Log API — 자주 쓰는 쿼리/명령어

운영·디버깅에서 반복적으로 쓰는 SQL과 셸 명령을 한 파일에 모아둔다.
실행 전 항상 환경(로컬 vs 운영) 확인할 것.

---

## 1. DB 접속

### 로컬 MySQL
```bash
mysql -uroot -p strike_log
```

### Railway MySQL (Public Networking 켜진 경우)
Railway MySQL 카드 → Variables → `MYSQL_PUBLIC_URL` 복사 후:
```bash
mysql "mysql://root:<pw>@<host>:<port>/railway"
```

### Railway Console 탭에서 직접 실행
MySQL 카드 → Database 또는 Console 탭에서 SQL 직접 입력.

---

## 2. 스키마 / 마이그레이션 점검

```sql
-- 모든 테이블 목록
SHOW TABLES;

-- 적용된 마이그레이션
SELECT * FROM typeorm_migrations ORDER BY timestamp;

-- 특정 테이블 컬럼/인덱스/FK 보기
SHOW CREATE TABLE users\G
SHOW INDEX FROM games;

-- ENUM 정의 확인 (notifications.type 등)
SELECT COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'type';
```

### 신규 DB 부트스트랩 시 비상 정리
```sql
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS fcm_tokens, email_auth, user_badges, notifications,
  group_members, group_join_requests, group_creation_requests, frames,
  games, game_series, `groups`, users, typeorm_migrations;
SET FOREIGN_KEY_CHECKS = 1;
```

---

## 3. Users

```sql
-- 이메일로 유저 조회
SELECT id, email, nickname, created_at FROM users WHERE email = 'foo@bar.com';

-- 최근 가입자 20명
SELECT id, email, nickname, created_at FROM users ORDER BY created_at DESC LIMIT 20;

-- 관리자 후보 확인 (ADMIN_USER_IDS env에 박아둘 UUID)
SELECT id, email, nickname FROM users WHERE email IN ('admin@example.com');

-- 강제 닉네임 변경
UPDATE users SET nickname = '새닉' WHERE id = '<uuid>';
```

---

## 4. Groups (클럽)

```sql
-- 활성 클럽 목록과 멤버 수
SELECT g.id, g.name, g.subscription_status, g.trial_expires_at, COUNT(gm.user_id) AS members
FROM `groups` g
LEFT JOIN group_members gm ON gm.group_id = g.id
GROUP BY g.id
ORDER BY g.created_at DESC;

-- 체험 만료 임박 (3일 이내)
SELECT id, name, trial_expires_at
FROM `groups`
WHERE subscription_status = 'trial' AND trial_expires_at IS NOT NULL
  AND trial_expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY);

-- 가입 신청 대기 중
SELECT jr.id, g.name AS club, u.nickname AS user, jr.createdAt
FROM group_join_requests jr
JOIN `groups` g ON g.id = jr.group_id
JOIN users u ON u.id = jr.user_id
WHERE jr.status = 'pending'
ORDER BY jr.createdAt DESC;

-- 클럽 생성 신청 대기 중
SELECT cr.id, cr.name, u.nickname AS requester, cr.created_at
FROM group_creation_requests cr
JOIN users u ON u.id = cr.requester_id
WHERE cr.status = 'pending';

-- 특정 클럽의 ADMIN 확인
SELECT u.id, u.email, u.nickname
FROM group_members gm
JOIN users u ON u.id = gm.user_id
WHERE gm.group_id = <id> AND gm.role = 'ADMIN';
```

---

## 5. Games / Frames / Series

```sql
-- 유저별 게임 수/최고 점수
SELECT user_id, COUNT(*) AS games, MAX(total_score) AS best
FROM games
GROUP BY user_id
ORDER BY best DESC;

-- 특정 유저 최근 시리즈
SELECT id, target_game_count, started_at, completed_at
FROM game_series
WHERE user_id = '<uuid>'
ORDER BY started_at DESC LIMIT 10;

-- 특정 게임의 프레임 펼쳐보기
SELECT frame_number, first_roll, second_roll, third_roll, score
FROM frames WHERE game_id = <id> ORDER BY frame_number;

-- 클럽 게임만 (랭킹 포함)
SELECT g.id, u.nickname, g.total_score, g.club_rank, g.played_date := g.play_date
FROM games g JOIN users u ON u.id = g.user_id
WHERE g.is_club_game = 1 AND g.room_id = '<room>'
ORDER BY g.club_rank;
```

---

## 6. Notifications / FCM

```sql
-- 미읽음 알림 카운트 (유저별)
SELECT userId, COUNT(*) AS unread
FROM notifications WHERE isRead = 0
GROUP BY userId;

-- 최근 발송된 알림 30건
SELECT id, userId, type, title, createdAt
FROM notifications ORDER BY createdAt DESC LIMIT 30;

-- 특정 유저의 FCM 토큰
SELECT token, platform, updatedAt FROM fcm_tokens WHERE userId = '<uuid>';

-- 오래된 토큰 정리 (60일 이상 미갱신)
DELETE FROM fcm_tokens WHERE updatedAt < DATE_SUB(NOW(), INTERVAL 60 DAY);
```

---

## 7. Badges

```sql
-- 유저별 보유 배지
SELECT u.nickname, ub.badge_key, ub.earned_at
FROM user_badges ub JOIN users u ON u.id = ub.user_id
ORDER BY u.id, ub.earned_at;

-- 가장 많이 획득된 배지 TOP 10
SELECT badge_key, COUNT(*) AS holders
FROM user_badges GROUP BY badge_key ORDER BY holders DESC LIMIT 10;
```

---

## 8. 마이그레이션 명령 (TypeORM CLI)

```bash
# 새 마이그레이션 자동 생성 (entity와 DB 차이 기준)
npm run migration:generate src/migrations/<Name>

# 미적용 마이그레이션 실행 (NestJS 부팅 시 자동 실행되지만 수동도 가능)
npm run migration:run

# 마지막 마이그레이션 되돌리기
npm run migration:revert

# 적용 현황 표시
npm run migration:show
```

---

## 9. Railway 운영

### 헬스체크
```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://strikelogapi-production.up.railway.app/
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://strikelogapi-production.up.railway.app/api
```

### 배포 로그 (CLI 설치 시)
```bash
railway logs            # 현재 링크된 서비스의 로그
railway logs --service mysql
```

### 강제 재배포
대시보드 → Deployments → 최신 옆 `⋮` → `Redeploy`.

### 환경변수 일괄 보기
`Variables` 탭 → 우측 상단 `⋮` → `Raw Editor`.

---

## 10. 인증/JWT 테스트

```bash
# 로그인 → 토큰 발급 (실제 엔드포인트는 swagger /api 참조)
curl -X POST https://strikelogapi-production.up.railway.app/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"foo@bar.com","password":"pw"}'

# 발급된 토큰으로 보호 API 호출
curl -H "Authorization: Bearer <JWT>" \
  https://strikelogapi-production.up.railway.app/users/me
```

---

## 11. 로컬 npm 스크립트 요약

| 명령 | 설명 |
|---|---|
| `npm run start:dev` | 개발 watch (NODE_ENV=development) |
| `npm run start:prod` | 운영 모드 실행 (dist 필요) |
| `npm run start:prod:local` | 빌드 후 운영 모드 로컬 시뮬레이션 |
| `npm run build` | TypeScript 빌드 |
| `npm run lint` | ESLint 자동 수정 |
| `npm run format` | Prettier 포매팅 |
| `npm run migration:run` | 미적용 마이그레이션 실행 |
| `npm run migration:show` | 마이그레이션 상태 보기 |

---

## 12. 트러블슈팅 체크리스트

| 증상 | 가장 흔한 원인 | 빠른 진단 |
|---|---|---|
| Railway 502 `Application failed to respond` | Target Port 미스매치 | Settings → Networking → Target Port와 부팅 로그의 PORT 비교 |
| `ECONNREFUSED 127.0.0.1:3306` | DB 환경변수 누락 | Variables 탭에 `MYSQLHOST` 등 5개 있는지 확인 |
| `Table 'railway.X' doesn't exist` | 마이그레이션 미실행 | `SELECT * FROM typeorm_migrations` 로 적용 이력 확인 |
| `Firebase Admin init skipped: Failed to parse private key` | PEM의 `\n` 이중 escape | `.env`에서 백슬래시 하나(`\n`) 확인 |
| Swagger 200인데 API 401 | JWT 미첨부 | `@Public()` 없는 라우트는 Authorization 헤더 필요 |
