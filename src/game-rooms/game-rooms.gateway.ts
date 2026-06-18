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
import { Cron } from '@nestjs/schedule';
import { Server, Socket } from 'socket.io';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomMode, GameRoomStatus } from './entities/game-room.entity';
import type { JwtPayload, AuthenticatedUser } from '../auth/jwt.strategy';
import { DiscordNotifierService } from '../common/discord-notifier.service';

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
    private readonly discord: DiscordNotifierService,
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

  async handleDisconnect(client: Socket) {
    console.log('[GameRooms] Client disconnected:', client.id);

    const mapping = this.clientUserMap.get(client.id);
    if (mapping) {
      const { userId, roomId } = mapping;
      // 즉시 leaveRoom 하지 않고 disconnected_at만 set. grace period 내 재접속 시 복원.
      // 만료 시 service의 cron이 정리하면서 호스트 승계/빈방 삭제 처리.
      try {
        await this.gameRoomsService.markDisconnected(roomId, userId);
        console.log(
          `[GameRooms] Marked disconnected user=${userId} room=${roomId} (grace period 진입)`,
        );
        // 남은 참가자에게 끊김 사실을 알리기 위해 현재 상태 broadcast
        const state = await this.gameRoomsService.getRoomState(roomId);
        if (state) this.emitToRoom(roomId, 'roomStateUpdated', state);
      } catch (e) {
        console.log(
          `[GameRooms] markDisconnected failed: ${(e as Error).message}`,
        );
      }
      this.clientUserMap.delete(client.id);
    }

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

  /**
   * 매 30초마다 grace period가 지난 disconnected 참가자를 leaveRoom 처리하고
   * 남은 참가자에게 roomStateUpdated를 broadcast한다.
   */
  @Cron('*/30 * * * * *')
  async cleanupStalePeers(): Promise<void> {
    try {
      const stale = await this.gameRoomsService.getStalePeers();
      for (const p of stale) {
        try {
          await this.gameRoomsService.leaveRoom(p.room_id, p.user_id);
          const state = await this.gameRoomsService.getRoomState(p.room_id);
          if (state) this.emitToRoom(p.room_id, 'roomStateUpdated', state);
        } catch (e) {
          console.log(`[GameRooms] cleanup leaveRoom failed: ${(e as Error).message}`);
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error(`[cleanupStalePeers] cron failed: ${error.message}`, error.stack);
      void this.discord.notifyError({
        source: 'cron',
        title: 'Cron failed: cleanupStalePeers',
        message: error.message,
        stack: error.stack,
      });
    }
  }

  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @MessageBody()
    data: {
      nickname?: string;
      mode?: 'club' | 'bet';
      betMemo?: string | null;
      maxPlayers?: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    console.log(
      `[GameRooms] createRoom received from user=${user.id}: ${JSON.stringify(data ?? {})}`,
    );
    try {
      const mode =
        data?.mode === 'bet' ? GameRoomMode.BET : GameRoomMode.CLUB;
      const roomId = await this.gameRoomsService.createRoom(
        user.id,
        data?.nickname ?? '게스트',
        {
          mode,
          betMemo: data?.betMemo ?? null,
          maxPlayers: data?.maxPlayers,
        },
      );
      console.log('[GameRooms] Room created:', roomId);

      // 클라이언트를 방에 등록 + disconnect 역추적용 매핑
      if (!this.roomClients.has(roomId)) {
        this.roomClients.set(roomId, new Map());
      }
      this.roomClients.get(roomId)!.set(client.id, client);
      this.clientUserMap.set(client.id, { userId: user.id, roomId });

      const roomState = await this.gameRoomsService.getRoomState(roomId);
      client.emit('roomCreated', { roomId, state: roomState });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.log('[GameRooms] createRoom error:', message);
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { roomId: string; nickname?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      await this.gameRoomsService.joinRoom(
        data.roomId,
        user.id,
        data?.nickname ?? '게스트',
      );

      if (!this.roomClients.has(data.roomId)) {
        this.roomClients.set(data.roomId, new Map());
      }
      this.roomClients.get(data.roomId)!.set(client.id, client);
      this.clientUserMap.set(client.id, {
        userId: user.id,
        roomId: data.roomId,
      });

      const roomState = await this.gameRoomsService.getRoomState(data.roomId);
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('updateScore')
  async handleUpdateScore(
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
      await this.gameRoomsService.updateScore(data.roomId, user.id, data.score, {
        strikes: data.strikes,
        spares: data.spares,
        opens: data.opens,
      });
      const roomState = await this.gameRoomsService.getRoomState(data.roomId);
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      await this.gameRoomsService.leaveRoom(data.roomId, user.id);

      this.roomClients.get(data.roomId)?.delete(client.id);
      this.clientUserMap.delete(client.id);

      const roomState = await this.gameRoomsService.getRoomState(data.roomId);
      if (roomState) {
        this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('startGame')
  async handleStartGame(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;

    const roomState = await this.gameRoomsService.getRoomState(data.roomId);
    if (!roomState) {
      client.emit('error', { message: '존재하지 않는 방입니다.' });
      return;
    }
    if (roomState.hostId !== user.id) {
      client.emit('error', { message: '호스트만 게임을 시작할 수 있습니다.' });
      return;
    }

    // 상태 전이 + 브로드캐스트
    await this.gameRoomsService.setRoomStatus(data.roomId, GameRoomStatus.PLAYING);
    this.emitToRoom(data.roomId, 'gameStarted', {
      roomId: data.roomId,
      participants: roomState.participants,
    });
  }

  /**
   * 내기 모드 핸디캡 수정. 호스트만, 게임 시작 전까지만 가능.
   */
  @SubscribeMessage('updateHandicap')
  async handleUpdateHandicap(
    @MessageBody()
    data: { roomId: string; targetUserId: string; handicap: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      await this.gameRoomsService.updateHandicap(
        data.roomId,
        user.id,
        data.targetUserId,
        Number(data.handicap) || 0,
      );
      const roomState = await this.gameRoomsService.getRoomState(data.roomId);
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  /**
   * 자동 핸디캡 추천. 호스트가 "추천 적용" 버튼 누를 때 호출.
   * 적용은 클라가 각 참가자에 대해 updateHandicap을 따로 호출.
   */
  @SubscribeMessage('suggestHandicaps')
  async handleSuggestHandicaps(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    try {
      const suggestions = await this.gameRoomsService.suggestHandicaps(
        data.roomId,
      );
      client.emit('handicapSuggestions', { roomId: data.roomId, suggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  /**
   * 게임 종료 + 핸디 적용 순위 emit.
   * 호스트만 호출.
   */
  @SubscribeMessage('finishGame')
  async handleFinishGame(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.requireUser(client);
    if (!user) return;
    const state = await this.gameRoomsService.getRoomState(data.roomId);
    if (!state) {
      client.emit('error', { message: '존재하지 않는 방입니다.' });
      return;
    }
    if (state.hostId !== user.id) {
      client.emit('error', { message: '호스트만 게임을 종료할 수 있습니다.' });
      return;
    }
    try {
      const rankings = await this.gameRoomsService.finishAndRank(data.roomId);
      this.emitToRoom(data.roomId, 'gameEnded', {
        roomId: data.roomId,
        mode: state.mode,
        betMemo: state.betMemo,
        rankings,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }
}
