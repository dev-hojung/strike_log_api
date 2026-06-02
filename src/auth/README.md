# Auth Module

## 개요

JWT 기반 인증 시스템. 토큰 검증, 사용자 추출, 공개 라우트 표시를 담당합니다.

## 주요 구성요소

- `src/auth/auth.module.ts` — Passport/JWT 모듈 설정, 환경변수 기반 초기화
- `src/auth/jwt.strategy.ts` — JWT 토큰 검증 전략, 페이로드를 `AuthenticatedUser`로 변환
- `src/auth/jwt-auth.guard.ts` — 전역 인증 가드, `@Public()` 데코레이터 확인
- `src/auth/current-user.decorator.ts` — 컨트롤러에서 인증 사용자 추출
- `src/auth/public.decorator.ts` — 라우트를 인증 불필요로 표시

## 사용 패턴

### @CurrentUser() — 인증 사용자 정보 추출

```typescript
@Get('me')
getMe(@CurrentUser() user: AuthenticatedUser) {
  return user; // { id: string, email: string }
}
```

특정 필드만 추출:
```typescript
@Post('create-group')
createGroup(@CurrentUser('id') userId: string) {
  return this.groupsService.createGroup(userId);
}
```

### @Public() — 인증 없이 접근 가능

```typescript
@Public()
@Get('health')
health() {
  return { status: 'ok' };
}
```

### JwtAuthGuard — 전역 적용

`src/app.module.ts`에서 이미 전역 등록됨:
```typescript
{ provide: APP_GUARD, useClass: JwtAuthGuard }
```
기본값: 모든 라우트는 JWT 토큰 필요. `@Public()`만 통과.

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| JWT_SECRET | O | - | 토큰 서명/검증 시크릿 |
| JWT_EXPIRES_IN | X | 7d | 액세스 토큰 유효기간 (ms 형식: "7d", "1h" 또는 초 단위 숫자) |

## 인증 흐름

1. 클라이언트가 `Authorization: Bearer <token>` 헤더 전송
2. `JwtAuthGuard`가 `@Public()` 확인 → 없으면 JWT 검증
3. `JwtStrategy`가 시크릿으로 토큰 검증 및 페이로드 파싱
4. Passport가 `req.user`에 `AuthenticatedUser` 주입
5. `@CurrentUser()`로 컨트롤러에서 추출
