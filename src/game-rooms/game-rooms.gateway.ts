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

  constructor(private readonly gameRoomsService: GameRoomsService) {}

  handleConnection(_client: Socket) {
    // Client connected
  }

  handleDisconnect(_client: Socket) {
    // Client disconnected
  }

  /**
   * 클럽 유저가 새로운 방을 생성합니다.
   * @param data 방 생성 요청 데이터 (user_id 포함)
   * @param client 연결된 소켓 클라이언트
   */
  @SubscribeMessage('createRoom')
  async handleCreateRoom(
    @MessageBody() data: { user_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const roomId = await this.gameRoomsService.createRoom(data.user_id);
      void client.join(roomId);

      const roomState = this.gameRoomsService.getRoomState(roomId);
      client.emit('roomCreated', { roomId, state: roomState });
      return { event: 'createRoomResponse', data: { success: true, roomId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { event: 'createRoomResponse', data: { success: false, message } };
    }
  }

  /**
   * 다른 유저가 생성된 방에 참가합니다.
   * @param data 참가 요청 데이터 (roomId, user_id 포함)
   * @param client 연결된 소켓 클라이언트
   */
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() data: { roomId: string; user_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameRoomsService.joinRoom(data.roomId, data.user_id);
      void client.join(data.roomId);

      const roomState = this.gameRoomsService.getRoomState(data.roomId);
      // 방에 있는 모든 유저에게 새로운 유저가 참가했음을 알림
      this.server.to(data.roomId).emit('roomStateUpdated', roomState);

      return { event: 'joinRoomResponse', data: { success: true, roomId: data.roomId } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { event: 'joinRoomResponse', data: { success: false, message } };
    }
  }

  /**
   * 방 내 유저가 점수를 업데이트하면 같은 방의 유저들에게 브로드캐스트합니다.
   * @param data 점수 갱신 데이터 (roomId, user_id, score 포함)
   * @param client 연결된 소켓 클라이언트
   */
  @SubscribeMessage('updateScore')
  handleUpdateScore(
    @MessageBody() data: { roomId: string; user_id: string; score: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.gameRoomsService.updateScore(data.roomId, data.user_id, data.score);

      const roomState = this.gameRoomsService.getRoomState(data.roomId);
      // 변경된 상태를 해당 방 전체 인원에게 전송
      this.server.to(data.roomId).emit('roomStateUpdated', roomState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      client.emit('error', { message });
    }
  }

  /**
   * 유저가 방을 나갈 때 처리합니다.
   * @param data 방 나가기 데이터 (roomId, user_id)
   * @param client 연결된 소켓 클라이언트
   */
  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() data: { roomId: string; user_id: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.gameRoomsService.leaveRoom(data.roomId, data.user_id);
    void client.leave(data.roomId);

    const roomState = this.gameRoomsService.getRoomState(data.roomId);
    if (roomState) {
      this.server.to(data.roomId).emit('roomStateUpdated', roomState);
    }
  }
}
