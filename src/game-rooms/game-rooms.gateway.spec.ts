import { Test, TestingModule } from '@nestjs/testing';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GameRoomsService } from './game-rooms.service';
import { Server, Socket } from 'socket.io';

/**
 * GameRoomsGateway 테스트
 *
 * 현재 구현은 socket.io 내장 room 대신 roomClients Map으로 직접 관리하므로
 * client.join/leave가 아닌 roomClients 맵 + client.emit 호출을 검증합니다.
 */
describe('GameRoomsGateway', () => {
  let gateway: GameRoomsGateway;
  let service: {
    createRoom: jest.Mock;
    joinRoom: jest.Mock;
    updateScore: jest.Mock;
    getRoomState: jest.Mock;
    leaveRoom: jest.Mock;
  };

  /** client.id가 있는 Socket 목 생성 */
  const createMockClient = (id: string): Socket =>
    ({ id, emit: jest.fn() }) as unknown as Socket;

  beforeEach(async () => {
    service = {
      createRoom: jest.fn(),
      joinRoom: jest.fn(),
      updateScore: jest.fn(),
      getRoomState: jest.fn(),
      leaveRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameRoomsGateway,
        { provide: GameRoomsService, useValue: service },
      ],
    }).compile();

    gateway = module.get<GameRoomsGateway>(GameRoomsGateway);
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as unknown as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  // ─── createRoom ──────────────────────────────────────────────
  describe('handleCreateRoom', () => {
    it('방 생성 성공 시 roomCreated 이벤트를 클라이언트에 emit한다', async () => {
      service.createRoom.mockResolvedValue('room-abc');
      service.getRoomState.mockReturnValue({
        roomId: 'room-abc',
        participants: { 'user-1': { nickname: '호스트', score: 0 } },
      });

      const client = createMockClient('socket-1');
      await gateway.handleCreateRoom(
        { user_id: 'user-1', nickname: '호스트' },
        client,
      );

      expect(service.createRoom).toHaveBeenCalledWith('user-1', '호스트');
      expect(client.emit).toHaveBeenCalledWith(
        'roomCreated',
        expect.objectContaining({ roomId: 'room-abc' }),
      );
    });

    it('방 생성 실패 시 error 이벤트를 클라이언트에 emit한다', async () => {
      service.createRoom.mockRejectedValue(new Error('클럽 유저 아님'));

      const client = createMockClient('socket-1');
      await gateway.handleCreateRoom({ user_id: 'user-1' }, client);

      expect(client.emit).toHaveBeenCalledWith('error', {
        message: '클럽 유저 아님',
      });
    });
  });

  // ─── joinRoom ────────────────────────────────────────────────
  describe('handleJoinRoom', () => {
    it('참가 성공 시 방 전체에 roomStateUpdated를 emit한다', async () => {
      const roomState = {
        roomId: 'room-abc',
        participants: {
          'host-1': { nickname: '호스트', score: 0 },
          'guest-1': { nickname: '게스트', score: 0 },
        },
      };
      service.getRoomState.mockReturnValue(roomState);

      // 호스트가 먼저 방에 들어와 있는 상황 시뮬레이션
      const host = createMockClient('socket-host');
      service.createRoom.mockResolvedValue('room-abc');
      await gateway.handleCreateRoom(
        { user_id: 'host-1', nickname: '호스트' },
        host,
      );

      // 게스트 참가
      const guest = createMockClient('socket-guest');
      gateway.handleJoinRoom(
        { roomId: 'room-abc', user_id: 'guest-1', nickname: '게스트' },
        guest,
      );

      expect(service.joinRoom).toHaveBeenCalledWith(
        'room-abc',
        'guest-1',
        '게스트',
      );
      // 방 안의 모든 클라이언트(호스트+게스트)에게 emit
      expect(host.emit).toHaveBeenCalledWith('roomStateUpdated', roomState);
      expect(guest.emit).toHaveBeenCalledWith('roomStateUpdated', roomState);
    });
  });

  // ─── updateScore ─────────────────────────────────────────────
  describe('handleUpdateScore', () => {
    it('점수 업데이트 후 방 전체에 roomStateUpdated를 emit한다', async () => {
      const roomState = {
        roomId: 'room-abc',
        participants: { 'user-1': { nickname: '유저', score: 150 } },
      };
      service.createRoom.mockResolvedValue('room-abc');
      service.getRoomState.mockReturnValue(roomState);

      const client = createMockClient('socket-1');
      await gateway.handleCreateRoom(
        { user_id: 'user-1', nickname: '유저' },
        client,
      );

      // emit 히스토리 초기화 (createRoom 때 roomCreated가 이미 불림)
      (client.emit as jest.Mock).mockClear();

      gateway.handleUpdateScore(
        { roomId: 'room-abc', user_id: 'user-1', score: 150, strikes: 3 },
        client,
      );

      expect(service.updateScore).toHaveBeenCalledWith(
        'room-abc',
        'user-1',
        150,
        { strikes: 3, spares: undefined, opens: undefined },
      );
      expect(client.emit).toHaveBeenCalledWith('roomStateUpdated', roomState);
    });
  });

  // ─── leaveRoom ───────────────────────────────────────────────
  describe('handleLeaveRoom', () => {
    it('방 나가기 처리 후 남은 참가자에게 roomStateUpdated를 emit한다', async () => {
      service.createRoom.mockResolvedValue('room-abc');

      const host = createMockClient('socket-host');
      await gateway.handleCreateRoom(
        { user_id: 'host-1', nickname: '호스트' },
        host,
      );

      const guest = createMockClient('socket-guest');
      service.getRoomState.mockReturnValue({
        roomId: 'room-abc',
        participants: { 'host-1': { nickname: '호스트', score: 0 } },
      });

      gateway.handleJoinRoom(
        { roomId: 'room-abc', user_id: 'guest-1', nickname: '게스트' },
        guest,
      );

      // 게스트 퇴장
      (host.emit as jest.Mock).mockClear();
      gateway.handleLeaveRoom(
        { roomId: 'room-abc', user_id: 'guest-1' },
        guest,
      );

      expect(service.leaveRoom).toHaveBeenCalledWith('room-abc', 'guest-1');
      // 호스트에게만 업데이트 전파 (게스트는 roomClients에서 제거됨)
      expect(host.emit).toHaveBeenCalledWith(
        'roomStateUpdated',
        expect.any(Object),
      );
    });
  });

  // ─── disconnect ──────────────────────────────────────────────
  describe('handleDisconnect', () => {
    it('연결 끊김 시 참가자 목록에서도 제거하고 남은 멤버에게 상태를 전파한다', async () => {
      service.createRoom.mockResolvedValue('room-abc');

      const host = createMockClient('socket-host');
      await gateway.handleCreateRoom(
        { user_id: 'host-1', nickname: '호스트' },
        host,
      );

      const guest = createMockClient('socket-guest');
      service.getRoomState
        .mockReturnValueOnce({
          roomId: 'room-abc',
          participants: {
            'host-1': { nickname: '호스트', score: 0 },
            'guest-1': { nickname: '게스트', score: 0 },
          },
        }) // joinRoom 때 사용
        .mockReturnValue({
          roomId: 'room-abc',
          participants: { 'host-1': { nickname: '호스트', score: 0 } },
        }); // disconnect 후 사용

      gateway.handleJoinRoom(
        { roomId: 'room-abc', user_id: 'guest-1', nickname: '게스트' },
        guest,
      );

      // 게스트가 소켓 연결 끊김 (앱 강제 종료 등)
      (host.emit as jest.Mock).mockClear();
      gateway.handleDisconnect(guest);

      // service.leaveRoom이 호출되어 participants에서 guest-1 제거
      expect(service.leaveRoom).toHaveBeenCalledWith('room-abc', 'guest-1');
      // 남은 호스트에게 상태 업데이트 전파
      expect(host.emit).toHaveBeenCalledWith(
        'roomStateUpdated',
        expect.objectContaining({
          participants: { 'host-1': expect.any(Object) },
        }),
      );
    });

    it('방에 참가하지 않은 클라이언트가 disconnect해도 에러가 발생하지 않는다', () => {
      const client = createMockClient('unregistered');
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });
});
