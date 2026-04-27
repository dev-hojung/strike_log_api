import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { GameRoomsService } from './game-rooms.service';
import type { JwtPayload, AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Socket의 `data`에 부착되는 인증 사용자 정보.
 * `client.data.user`로 접근한다.
 */
interface AuthedSocketData {
  user?: AuthenticatedUser;
}

/**
 * 실시간 게임 방 관리를 위한 소켓 게이트웨이
 *
 * 인증:
 *  - 클라이언트는 socket.io handshake 단계에서 JWT를 전달해야 한다.
 *    `auth.token` 또는 `Authorization: Bearer <token>` 헤더 둘 다 지원.
 *  - 검증 실패 시 즉시 disconnect.
 *  - 검증된 user는 `client.data.user`에 저장되며, 모든 이벤트 핸들러는
 *    body의 user_id 대신 이 값을 신뢰한다.
 */
@WebSocketGateway({ cors: true })
export class GameRoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // 방별 클라이언트 소켓 관리
  private roomClients = new Map<string, Map<string, Socket>>();

  // client.id → { userId, roomId } 매핑.
  // disconnect 시 어떤 유저가 어떤 방에서 나갔는지 역추적해 participants도 정리.
  private clientUserMap = new Map<string, { userId: string; roomId: string }>();

  constructor(
    private readonly gameRoomsService: GameRoomsService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * handshake에서 JWT를 추출. `auth.token`이 우선, 없으면 Authorization 헤더 사용.
   */
  private extractToken(client: Socket): string | null {
    const auth = (client.handshake.auth ?? {}) as { token?: string };
    if (auth.token && typeof auth.token === 'string') {
      return auth.token.replace(/^Bearer\s+/i, '');
    }
    const header =
      client.handshake.headers.authorization ??
      (client.handshake.headers as Record<string, string | undefined>)['Authorization'];
    if (header && typeof header === 'string') {
      return header.replace(/^Bearer\s+/i, '');
    }
    return null;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        console.log('[GameRooms] Connection rejected — missing token:', client.id);
        client.emit('error', { message: '인증 토큰이 필요합니다.' });
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const data = client.data as AuthedSocketData;
      data.user = {
        id: payload.sub,
        email: payload.email,
      };
      console.log(`[GameRooms] Client connected: ${client.id} (user=${payload.sub})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`[GameRooms] Connection rejected — invalid token (${client.id}): ${message}`);
      client.emit('error', { message: '유효하지 않은 인증 토큰입니다.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    console.log('[GameRooms] Client disconnected:', client.id);

    // 1) client → user/room 매핑으로 participants에서도 제거 (좀비 방지)
    const mapping = this.clientUserMap.get(client.id);
    if (mapping) {
      const { userId, roomId } = mapping;
      this.gameRoomsService.leaveRoom(roomId, userId);
      console.log(`[GameRooms] Removed disconnected user ${userId} from room ${roomId}`);

      // 남은 참가자에게 상태 업데이트 전파
      const roomState = this.gameRoomsService.getRoomState(roomId);
      if (roomState) {
        this.emitToRoom(roomId, 'roomStateUpdated', roomState);
      }
      this.clientUserMap.delete(client.id);
    }

    // 2) roomClients(소켓 추적)에서도 제거
    for (const [roomId, clients] of this.roomClients.entries()) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.roomClients.delete(roomId);
      }
    }
  }

  /**
   * 인증된 user를 꺼낸다. 없으면 에러 emit + 즉시 disconnect.
   */
  private requireUser(client: Socket): AuthenticatedUser | null {
    const data = client.data as AuthedSocketData;
    const user = data.user;
    if (!user) {
      client.emit('error', { message: '인증되지 않은 연결입니다.' });
      client.disconnect(true);
      return null;
    }
    return user;
  }

  /**
   * 방의 모든 클라이언트에게 이벤트 전송
   */
  private emitToRoom(roomId: string, event: string, data: unknown) {
    const clients = this.roomClients.get(roomId);
    if (!clients) return;
    console.log(`[GameRooms] Emitting '${event}' to ${clients.size} clients in room ${roomId}`);
    for (const [, socket] of clients) {
      socket.emit(event, data);
    }
  }

  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @MessageBody() data: { nickname?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    console.log(
      `[GameRooms] createRoom received from user=${user.id}: ${JSON.stringify(data ?? {})}`,
    );
    try {
      const roomId = await this.gameRoomsService.createRoom(user.id, data?.nickname ?? '게스트');
      console.log('[GameRooms] Room created:', roomId);

      // 클라이언트를 방에 등록 + disconnect 역추적용 매핑
      if (!this.roomClients.has(roomId)) {
        this.roomClients.set(roomId, new Map());
      }
      this.roomClients.get(roomId)!.set(client.id, client);
      this.clientUserMap.set(client.id, { userId: user.id, roomId });

      const roomState = this.gameRoomsService.getRoomState(roomId);
      client.emit('roomCreated', { roomId, state: roomState });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log('[GameRooms] createRoom error:', message);
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { roomId: string; nickname?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      this.gameRoomsService.joinRoom(data.roomId, user.id, data?.nickname ?? '게스트');

      // 클라이언트를 방에 등록 + disconnect 역추적용 매핑
      if (!this.roomClients.has(data.roomId)) {
        this.roomClients.set(data.roomId, new Map());
      }
      this.roomClients.get(data.roomId)!.set(client.id, client);
      this.clientUserMap.set(client.id, {
        userId: user.id,
        roomId: data.roomId,
      });

      const roomState = this.gameRoomsService.getRoomState(data.roomId);
      // 방의 모든 클라이언트에게 직접 전송
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('updateScore')
  handleUpdateScore(
    @MessageBody()
    data: {
      roomId: string;
      score: number;
      strikes?: number;
      spares?: number;
      opens?: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      this.gameRoomsService.updateScore(data.roomId, user.id, data.score, {
        strikes: data.strikes,
        spares: data.spares,
        opens: data.opens,
      });

      const roomState = this.gameRoomsService.getRoomState(data.roomId);
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    const user = this.requireUser(client);
    if (!user) return;
    this.gameRoomsService.leaveRoom(data.roomId, user.id);

    // 클라이언트를 방에서 제거 + disconnect 매핑도 정리
    this.roomClients.get(data.roomId)?.delete(client.id);
    this.clientUserMap.delete(client.id);

    const roomState = this.gameRoomsService.getRoomState(data.roomId);
    if (roomState) {
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    }
  }

  @SubscribeMessage('startGame')
  handleStartGame(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    const user = this.requireUser(client);
    if (!user) return;

    const roomState = this.gameRoomsService.getRoomState(data.roomId);
    if (!roomState) {
      client.emit('error', { message: '존재하지 않는 방입니다.' });
      return;
    }

    // 호스트만 시작 가능
    if (roomState.hostId !== user.id) {
      client.emit('error', { message: '호스트만 게임을 시작할 수 있습니다.' });
      return;
    }

    this.emitToRoom(data.roomId, 'gameStarted', {
      roomId: data.roomId,
      participants: roomState.participants,
    });
  }
}
