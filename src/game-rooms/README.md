# Game Rooms 모듈

## 개요

실시간 보울링 게임 방 관리를 담당하는 WebSocket 기반 모듈입니다. 클럽 유저들이 게임 방을 생성 및 참가하고, 실시간으로 점수와 게임 상태를 동기화합니다.

- **메모리 기반 방 관리**: 활성 게임 방을 메모리에 저장
- **실시간 점수 동기화**: 참가자 점수 및 통계(strikes, spares, opens) 업데이트
- **연결 추적**: 클라이언트 disconnect 시 자동 정리

## WebSocket 이벤트

### 클라이언트 → 서버

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `createRoom` | `{ nickname?: string }` | 새 방 생성 (클럽 유저만) |
| `joinRoom` | `{ roomId: string; nickname?: string }` | 기존 방 입장 |
| `updateScore` | `{ roomId: string; score: number; strikes?: number; spares?: number; opens?: number }` | 점수 및 통계 업데이트 |
| `leaveRoom` | `{ roomId: string }` | 방 퇴장 |
| `startGame` | `{ roomId: string }` | 게임 시작 (호스트만) |

### 서버 → 클라이언트

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `roomCreated` | `{ roomId: string; state: GameRoomState }` | 방 생성 완료 |
| `roomStateUpdated` | `GameRoomState` | 방 상태 변경 (참가/퇴장/점수 갱신 시) |
| `gameStarted` | `{ roomId: string; participants: Record<string, RoomParticipant> }` | 게임 시작 알림 |
| `error` | `{ message: string }` | 에러 메시지 |

## 서비스 책임

`GameRoomsService` (`src/game-rooms/game-rooms.service.ts`)

- **`isClubUser(user_id)`**: 유저가 어떤 클럽에라도 가입되어 있는지 확인
- **`createRoom(user_id, nickname)`**: 방 생성 (클럽 유저 필수), 무작위 방 ID 생성
- **`joinRoom(roomId, user_id, nickname)`**: 방 입장 시 참가자 추가
- **`updateScore(roomId, user_id, score, stats?)`**: 참가자 점수 및 통계 갱신
- **`getRoomState(roomId)`**: 방의 현재 상태 조회
- **`leaveRoom(roomId, user_id)`**: 참가자 제거, 방이 비면 삭제

## 인증 & 권한

- **JWT 검증**: Handshake 단계에서 `auth.token` 또는 `Authorization` 헤더의 JWT 검증
  - 검증 실패 시 즉시 disconnect
  - 검증된 user는 `client.data.user` 저장
- **클럽 유저 제한**: `createRoom` 호출 시 `GroupMember` 테이블 확인
- **호스트 권한**: `startGame`은 room의 `hostId`와 일치하는 사용자만 실행 가능

## 의존 모듈

| 모듈 | 목적 |
|------|------|
| `AuthModule` | JWT 검증 (JwtService) |
| `TypeOrmModule.forFeature([GroupMember])` | 클럽 유저 확인 |

## 구현 세부사항

### 클라이언트 추적

- **roomClients**: `Map<roomId, Map<clientId, Socket>>` - 방별 활성 클라이언트 관리
- **clientUserMap**: `Map<clientId, {userId, roomId}>` - disconnect 시 역추적으로 방에서 자동 제거

### 데이터 구조

```typescript
interface GameRoomState {
  roomId: string;
  hostId: string;
  participants: Record<string, RoomParticipant>;
  createdAt: Date;
}

interface RoomParticipant {
  nickname: string;
  score: number;
  strikes?: number;
  spares?: number;
  opens?: number;
}
```

### 방 생성 프로세스

1. JWT 검증 (authed user 추출)
2. `isClubUser` 확인 (클럽 가입 필수)
3. 무작위 방 ID 생성 (7자리 문자열)
4. 호스트를 첫 참가자로 추가
5. 클라이언트 연결 추적
6. `roomCreated` 이벤트 발송

## 파일 구조

- `src/game-rooms/game-rooms.module.ts` - 모듈 정의
- `src/game-rooms/game-rooms.gateway.ts` - WebSocket 게이트웨이 (이벤트 핸들러)
- `src/game-rooms/game-rooms.service.ts` - 게임 방 비즈니스 로직
- `src/game-rooms/game-rooms.gateway.spec.ts` - 게이트웨이 테스트
- `src/game-rooms/game-rooms.service.spec.ts` - 서비스 테스트
