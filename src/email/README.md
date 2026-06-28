# Email 모듈

## 개요

이메일 인증번호(OTP) 발송 및 검증을 담당하는 NestJS 모듈입니다.

- **용도**: 회원가입, 비밀번호 재설정 시 이메일 OTP 인증 처리
- **특징**: 
  - Resend API를 통한 이메일 발송
  - 6자리 난수 OTP 코드 생성
  - 5분 유효기간 설정 및 검증
  - 모든 엔드포인트는 인증 없이 접근 가능 (`@Public()`)
  - **남용 방지**: IP 기반 rate limit(`@nestjs/throttler`) + 이메일별 재발송 쿨다운(60초). 초과 시 `429 Too Many Requests`

---

## 엔티티

### `EmailAuth` (`src/email/entities/email-auth.entity.ts`)

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | number | 기본 키 |
| `email` | string | 인증 대상 이메일 주소 |
| `code` | string | 6자리 인증 코드 |
| `is_verified` | boolean | 인증 완료 여부 (기본값: false) |
| `created_at` | Date | 생성 시각 (유효기간 계산 기준) |

---

## 컨트롤러 엔드포인트

### `POST /email/send-otp`

**설명**: 이메일로 OTP 인증번호 발송

**요청 바디**:
```json
{
  "email": "user@example.com"
}
```

**응답** (성공 200):
```json
{
  "success": true,
  "message": "인증번호가 발송되었습니다."
}
```

**예외**:
- `400 Bad Request`: 이메일 필드 누락 시 "이메일이 필요합니다."
- `429 Too Many Requests`: IP당 60초 3회 / 1시간 10회 초과, 또는 같은 이메일로 60초 내 재요청 시

---

### `POST /email/verify-otp`

**설명**: 발송된 OTP 인증번호 검증

**요청 바디**:
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**응답** (성공 200):
```json
{
  "success": true,
  "message": "인증이 완료되었습니다."
}
```

**예외**:
- `400 Bad Request`: 
  - 이메일 또는 코드 필드 누락 시
  - 인증번호 불일치 또는 만료 시
- `429 Too Many Requests`: IP당 60초 5회 초과 (코드 무차별 대입 방지)

---

## 서비스 책임

`EmailService` (`src/email/email.service.ts`)

### `sendOtp(email: string): Promise<boolean>`

0. 이메일별 재발송 쿨다운 검사: 같은 주소로 최근 발송 후 60초 미경과 시 `429` throw (`OTP_RESEND_COOLDOWN_MS`)
1. 6자리 난수 OTP 코드 생성
2. 동일 이메일의 미인증 코드 삭제 (최신 코드만 유지)
3. 새 인증번호를 DB 저장
4. 콘솔에 OTP 출력 (개발/테스트 용도)
5. Resend API를 통해 HTML 이메일 발송
6. 성공 여부 반환 (도메인 미인증 상황에서도 `true` 반환하여 테스트 진행 가능)

### `verifyOtp(email: string, code: string): Promise<boolean>`

1. 해당 이메일의 미인증 최신 레코드 조회
2. 생성 시각 기준 5분 유효기간 체크
3. 만료 시 DB에서 삭제
4. 코드 일치 여부 확인
5. 성공 시 `is_verified` 플래그를 `true`로 업데이트
6. 검증 결과 반환

---

## 외부 의존성

### Resend API

- **라이브러리**: `resend` NPM 패키지
- **사용처**: `src/email/email.service.ts` L5
- **메서드**: `resend.emails.send()`
- **발신자**: `onboarding@resend.dev` (고정)
- **주의**: 프로덕션에서는 Resend 도메인 인증 필요

### TypeORM

- **저장소**: `EmailAuth` 엔티티에 대한 Repository 주입
- **테이블**: `email_auth`
- **작업**: create, save, delete, findOne

---

## 환경변수

| 변수 | 설명 | 필수 | 기본값 |
|------|------|------|--------|
| `RESEND_API_KEY` | Resend API 인증 키 | 권장 | 선언되지 않으면 경고 출력, 더미 값 사용 |

**주의**:
- 미설정 시 콘솔에 경고 메시지 출력
- 테스트 환경에서는 콘솔에 출력된 OTP로 검증 가능
