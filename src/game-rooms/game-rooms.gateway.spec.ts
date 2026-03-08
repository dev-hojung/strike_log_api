import { Test, TestingModule } from '@nestjs/testing';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GameRoomsService } from './game-rooms.service';
import { Server, Socket } from 'socket.io';

describe('GameRoomsGateway', () => {
  let gateway: GameRoomsGateway;
  let service: {
    createRoom: jest.Mock;
    joinRoom: jest.Mock;
    updateScore: jest.Mock;
    getRoomState: jest.Mock;
    leaveRoom: jest.Mock;
  };

  beforeEach(async () => {
    // Service Mock
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
        {
          provide: GameRoomsService,
          useValue: service,
        },
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

  describe('handleCreateRoom', () => {
    it('방을 성공적으로 생성해야 한다', async () => {
      service.createRoom.mockResolvedValue('test-room');
      service.getRoomState.mockReturnValue({ roomId: 'test-room' });

      const client = {
        join: jest.fn(),
        emit: jest.fn(),
      } as unknown as Socket;

      const result = await gateway.handleCreateRoom({ user_id: 'user-id' }, client);

      expect(service.createRoom).toHaveBeenCalledWith('user-id');
      expect(client.join).toHaveBeenCalledWith('test-room');
      expect(client.emit).toHaveBeenCalledWith('roomCreated', expect.any(Object));
      expect(result).toEqual({
        event: 'createRoomResponse',
        data: { success: true, roomId: 'test-room' },
      });
    });

    it('방 생성 실패 시 에러 응답을 반환해야 한다', async () => {
      service.createRoom.mockRejectedValue(new Error('클럽 유저 아님'));

      const client = {
        join: jest.fn(),
        emit: jest.fn(),
      } as unknown as Socket;

      const result = await gateway.handleCreateRoom({ user_id: 'user-id' }, client);
      expect(result).toEqual({
        event: 'createRoomResponse',
        data: { success: false, message: '클럽 유저 아님' },
      });
    });
  });

  describe('handleJoinRoom', () => {
    it('방에 성공적으로 참가해야 한다', () => {
      const client = {
        join: jest.fn(),
      } as unknown as Socket;

      const result = gateway.handleJoinRoom({ roomId: 'test-room', user_id: 'guest-id' }, client);

      expect(service.joinRoom).toHaveBeenCalledWith('test-room', 'guest-id');
      expect(client.join).toHaveBeenCalledWith('test-room');
      expect(gateway.server.to).toHaveBeenCalledWith('test-room');
      expect(gateway.server.emit).toHaveBeenCalledWith('roomStateUpdated', undefined);
      expect(result).toEqual({
        event: 'joinRoomResponse',
        data: { success: true, roomId: 'test-room' },
      });
    });
  });

  describe('handleUpdateScore', () => {
    it('점수를 성공적으로 업데이트해야 한다', () => {
      const client = {
        emit: jest.fn(),
      } as unknown as Socket;

      gateway.handleUpdateScore({ roomId: 'test-room', user_id: 'user-id', score: 100 }, client);

      expect(service.updateScore).toHaveBeenCalledWith('test-room', 'user-id', 100);
      expect(gateway.server.to).toHaveBeenCalledWith('test-room');
      expect(gateway.server.emit).toHaveBeenCalledWith('roomStateUpdated', undefined);
    });
  });

  describe('handleLeaveRoom', () => {
    it('방에서 나가는 동작을 성공적으로 처리해야 한다', () => {
      const client = {
        leave: jest.fn(),
      } as unknown as Socket;

      service.getRoomState.mockReturnValue({ roomId: 'test-room' });

      gateway.handleLeaveRoom({ roomId: 'test-room', user_id: 'user-id' }, client);

      expect(service.leaveRoom).toHaveBeenCalledWith('test-room', 'user-id');
      expect(client.leave).toHaveBeenCalledWith('test-room');
      expect(gateway.server.to).toHaveBeenCalledWith('test-room');
      expect(gateway.server.emit).toHaveBeenCalledWith('roomStateUpdated', { roomId: 'test-room' });
    });
  });
});
