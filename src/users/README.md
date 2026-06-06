# Users 모듈

회원 도메인을 담당하는 NestJS 모듈입니다. 회원가입, 로그인, JWT 토큰 발급, 프로필 관리, 비밀번호 변경 등의 기능을 제공합니다.

## 개요

- 이메일/비밀번호 기반 회원가입 및 로그인
- JWT 토큰 발급 및 인증 통합 (AuthModule)
- 소셜 로그인 후 사용자 동기화 (Supabase Auth)
- 프로필 정보 조회 및 수정
- 비밀번호 변경 (bcrypt 해싱 사용)
- 관리자/본인만 접근 가능하도록 권한 검증

## 엔티티

| 이름 | 설명 |
|------|------|
| `User` (`src/users/entities/user.entity.ts`) | 사용자 정보를 저장하는 메인 엔티티. UUID ID, 이메일(unique), 해싱된 비밀번호, 닉네임, 전화번호, 프로필 이미지 URL 포함 |

## DTO

| 이름 | 설명 |
|------|------|
| `LoginUserDto` (`src/users/dto/login-user.dto.ts`) | 로그인 요청 시 email, password를 받음 |
| `CreateUserDto` (`src/users/dto/create-user.dto.ts`) | 비어있는 DTO (현재 미사용) |
| `UpdateUserDto` (`src/users/dto/update-user.dto.ts`) | CreateUserDto의 Partial 확장 (프로필 수정용) |

## 컨트롤러 엔드포인트

| HTTP | 경로 | 설명 |
|------|------|------|
| `POST` | `/users/login` | 이메일/비밀번호로 로그인. JWT 토큰과 사용자 정보 반환 |
| `POST` | `/users/signup` | 이메일/비밀번호로 회원가입. 닉네임 선택 입력 시 이메일 아이디 자동 설정 |
| `POST` | `/users/sync` | Supabase Auth 성공 후 DB에 사용자 동기화 (없으면 생성) |
| `GET` | `/users/:id` | 유저 프로필 조회. 본인 또는 관리자만 접근 가능 |
| `POST` | `/users/:id/change-password` | 비밀번호 변경. 현재 비밀번호 검증 후 새 비밀번호로 업데이트 |
| `PATCH` | `/users/:id` | 프로필 수정 (닉네임, 프로필 이미지 URL, 전화번호). 본인만 수정 가능 |
| `DELETE` | `/users/me` | 회원 탈퇴. FCM 토큰 직접 정리 + users 행 삭제(FK CASCADE로 게임/시리즈/멤버십 자동 정리) |

## 서비스 책임

- **회원가입**: 중복 이메일 검증 → UUID 생성 → 비밀번호 bcrypt 해싱 → DB 저장 → JWT 발급
- **로그인**: 이메일 조회 → bcrypt.compare로 비밀번호 검증 → JWT 발급
- **소셜 로그인 동기화**: ID와 이메일로 사용자 조회 후 없으면 생성
- **프로필 조회**: 사용자 ID로 DB 조회
- **프로필 수정**: 요청된 필드(nickname, profile_image_url, phone)만 부분 업데이트
- **비밀번호 변경**: 현재 비밀번호 검증 → 새 비밀번호 해싱 → DB 업데이트
- **JWT 토큰 발급**: 유저 정보로부터 JwtPayload(sub, email) 생성 후 서명 및 반환

## 환경변수

서비스에서 사용하는 환경변수:

- `JWT_SECRET`: JWT 토큰 서명 및 검증에 사용 (AuthModule을 통해 JwtService에 주입)

관리자 권한 검증:

- `ADMIN_USER_IDS`: 프로필 조회 시 관리자 판정. `src/common/admin.ts`의 `isPlatformAdmin(uid)` 함수 사용

## 보안

- 비밀번호는 bcrypt로 해싱되어 저장됨 (평문 저장 안 함)
- 프로필 조회/수정 시 `@CurrentUser()` 데코레이터로 JWT 인증 검증
- 본인이 아닌 사용자의 프로필 수정 시도 시 ForbiddenException 발생
- 관리자는 모든 프로필 조회 가능
- password 필드는 select: false로 설정되어 기본 조회에 포함 안 됨

## 모듈 구조

```
src/users/
├── users.module.ts          # TypeOrmModule(User), AuthModule 등록
├── users.controller.ts      # 6개 엔드포인트 정의
├── users.service.ts         # 회원 로직 구현
├── entities/
│   └── user.entity.ts       # User 엔티티 정의
└── dto/
    ├── create-user.dto.ts
    ├── login-user.dto.ts
    └── update-user.dto.ts
```

## 의존성

- `@nestjs/jwt`: JWT 생성/검증
- `bcrypt`: 비밀번호 해싱
- `typeorm`: ORM (User 엔티티)
- `AuthModule`: JWT 전략 및 @CurrentUser 데코레이터
