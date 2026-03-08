import { Test, TestingModule } from '@nestjs/testing';
import { GameRoomsService, GameRoomState } from './game-rooms.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GroupMember } from '../groups/entities/group-member.entity';
import { UnauthorizedException } from '@nestjs/common';

describe('GameRoomsService', () => {
  let service: GameRoomsService;
  let groupMemberRepository: { count: jest.Mock };

  beforeEach(async () => {
    // Repository Mock
    groupMemberRepository = {
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameRoomsService,
        {
          provide: getRepositoryToken(GroupMember),
          useValue: groupMemberRepository,
        },
      ],
    }).compile();

    service = module.get<GameRoomsService>(GameRoomsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isClubUser', () => {
    it('클럽에 가입된 유저라면 true를 반환한다', async () => {
      groupMemberRepository.count.mockResolvedValue(1);
      const result = await service.isClubUser('user-id');
      expect(result).toBe(true);
    });

    it('클럽에 가입되지 않은 유저라면 false를 반환한다', async () => {
      groupMemberRepository.count.mockResolvedValue(0);
      const result = await service.isClubUser('user-id');
      expect(result).toBe(false);
    });
  });

  describe('createRoom', () => {
    it('클럽 유저는 방을 성공적으로 생성한다', async () => {
      jest.spyOn(service, 'isClubUser').mockResolvedValue(true);
      const roomId = await service.createRoom('user-id');
      expect(roomId).toBeDefined();

      const roomState = service.getRoomState(roomId) as GameRoomState;
      expect(roomState).toBeDefined();
      expect(roomState.hostId).toBe('user-id');
      expect(roomState.participants['user-id'].score).toBe(0);
    });

    it('개인 유저는 방 생성 시도 시 UnauthorizedException을 던진다', async () => {
      jest.spyOn(service, 'isClubUser').mockResolvedValue(false);
      await expect(service.createRoom('user-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('joinRoom & updateScore', () => {
    it('방에 성공적으로 참가하고 점수를 업데이트한다', async () => {
      jest.spyOn(service, 'isClubUser').mockResolvedValue(true);
      const roomId = await service.createRoom('host-id');

      service.joinRoom(roomId, 'guest-id');
      let state = service.getRoomState(roomId) as GameRoomState;
      expect(state.participants['guest-id']).toBeDefined();
      expect(state.participants['guest-id'].score).toBe(0);

      service.updateScore(roomId, 'guest-id', 150);
      state = service.getRoomState(roomId) as GameRoomState;
      expect(state.participants['guest-id'].score).toBe(150);
    });
  });
});
