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
    it('should call gamesService.createGame', async () => {
      const createGameDto = {
        user_id: 'user-uuid',
        total_score: 200,
        play_date: new Date(),
        frames: [],
      };
      const result = { id: 1, ...createGameDto };
      mockGamesService.createGame.mockResolvedValue(result);

      expect(await controller.createGame(createGameDto)).toEqual(result);
      expect(service.createGame).toHaveBeenCalledWith(
        'user-uuid',
        createGameDto,
      );
    });
  });

  describe('getMyGames', () => {
    it('should call gamesService.getMyGames', async () => {
      const userId = 'user-uuid';
      const result = [{ id: 1, total_score: 180 }];
      mockGamesService.getMyGames.mockResolvedValue(result);

      expect(await controller.getMyGames(userId)).toEqual(result);
      expect(service.getMyGames).toHaveBeenCalledWith(userId);
    });
  });

  describe('getGameDetail', () => {
    it('should call gamesService.getGameDetail', async () => {
      const gameId = '1';
      const userId = 'user-uuid';
      const result = { id: 1, total_score: 180, frames: [] };
      mockGamesService.getGameDetail.mockResolvedValue(result);

      expect(await controller.getGameDetail(gameId, userId)).toEqual(result);
      expect(service.getGameDetail).toHaveBeenCalledWith(1, userId);
    });
  });
});
