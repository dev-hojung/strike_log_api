import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameRoomsService } from './game-rooms.service';

/**
 * 실시간 게임 방 관리를 위한 소켓 게이트웨이
 */
@WebSocketGateway({ cors: true })
export class GameRoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  // 방별 클라이언트 소켓 관리
  private roomClients = new Map<string, Map<string, Socket>>();

  constructor(private readonly gameRoomsService: GameRoomsService) {}

  handleConnection(client: Socket) {
    console.log('[GameRooms] Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('[GameRooms] Client disconnected:', client.id);
    // 연결 끊긴 클라이언트를 모든 방에서 제거
    for (const [roomId, clients] of this.roomClients.entries()) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.roomClients.delete(roomId);
      }
    }
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
    @MessageBody() data: { user_id: string; nickname?: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('[GameRooms] createRoom received:', JSON.stringify(data));
    try {
      const roomId = await this.gameRoomsService.createRoom(data.user_id, data.nickname ?? '게스트');
      console.log('[GameRooms] Room created:', roomId);

      // 클라이언트를 방에 등록
      if (!this.roomClients.has(roomId)) {
        this.roomClients.set(roomId, new Map());
      }
      this.roomClients.get(roomId)!.set(client.id, client);

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
    @MessageBody() data: { roomId: string; user_id: string; nickname?: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameRoomsService.joinRoom(data.roomId, data.user_id, data.nickname ?? '게스트');

      // 클라이언트를 방에 등록
      if (!this.roomClients.has(data.roomId)) {
        this.roomClients.set(data.roomId, new Map());
      }
      this.roomClients.get(data.roomId)!.set(client.id, client);

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
    @MessageBody() data: { roomId: string; user_id: string; score: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameRoomsService.updateScore(data.roomId, data.user_id, data.score);

      const roomState = this.gameRoomsService.getRoomState(data.roomId);
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string; user_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.gameRoomsService.leaveRoom(data.roomId, data.user_id);

    // 클라이언트를 방에서 제거
    this.roomClients.get(data.roomId)?.delete(client.id);

    const roomState = this.gameRoomsService.getRoomState(data.roomId);
    if (roomState) {
      this.emitToRoom(data.roomId, 'roomStateUpdated', roomState);
    }
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomState = this.gameRoomsService.getRoomState(data.roomId);
    if (!roomState) {
      client.emit('error', { message: '존재하지 않는 방입니다.' });
      return;
    }

    this.emitToRoom(data.roomId, 'gameStarted', {
      roomId: data.roomId,
      participants: roomState.participants,
    });
  }
}
