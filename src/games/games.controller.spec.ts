import { Test, TestingModule } from '@nestjs/testing';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

describe('GamesController', () => {
  let controller: GamesController;
  let service: GamesService;

  const mockGamesService = {
    createGame: jest.fn(),
    getMyGames: jest.fn(),
    getGameDetail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamesController],
      providers: [
        {
          provide: GamesService,
          useValue: mockGamesService,
        },
      ],
    }).compile();

    controller = module.get<GamesController>(GamesController);
    service = module.get<GamesService>(GamesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createGame', () => {
    it('인증된 유저 id로 service.createGame이 호출된다', async () => {
      const userId = 'user-uuid';
      const createGameDto = {
        total_score: 200,
        play_date: new Date(),
        frames: [],
      };
      const result = { id: 1, user_id: userId, ...createGameDto };
      mockGamesService.createGame.mockResolvedValue(result);

      expect(await controller.createGame(userId, createGameDto)).toEqual(result);
      expect(service.createGame).toHaveBeenCalledWith(userId, createGameDto);
    });
  });

  describe('getMyGames', () => {
    it('인증된 유저 id로 service.getMyGames가 호출된다', async () => {
      const userId = 'user-uuid';
      const result = [{ id: 1, total_score: 180 }];
      mockGamesService.getMyGames.mockResolvedValue(result);

      expect(await controller.getMyGames(userId)).toEqual(result);
      expect(service.getMyGames).toHaveBeenCalledWith(userId);
    });
  });

  describe('getGameDetail', () => {
    it('인증된 유저 id로 service.getGameDetail이 호출된다', async () => {
      const gameId = '1';
      const userId = 'user-uuid';
      const result = { id: 1, total_score: 180, frames: [] };
      mockGamesService.getGameDetail.mockResolvedValue(result);

      expect(await controller.getGameDetail(gameId, userId)).toEqual(result);
      expect(service.getGameDetail).toHaveBeenCalledWith(1, userId);
    });
  });
});
