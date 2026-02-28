import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    signup: jest.fn(),
    syncUser: jest.fn(),
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signup', () => {
    it('should call usersService.signup', async () => {
      const signupDto = {
        email: 'test@example.com',
        password: 'password123',
        nickname: 'tester',
      };
      const result = { id: 'uuid', ...signupDto };
      mockUsersService.signup.mockResolvedValue(result);

      expect(await controller.signup(signupDto)).toEqual(result);
      expect(service.signup).toHaveBeenCalledWith(
        signupDto.email,
        signupDto.password,
        signupDto.nickname,
      );
    });
  });

  describe('syncUser', () => {
    it('should call usersService.syncUser', async () => {
      const syncDto = { id: 'uuid', email: 'test@example.com' };
      const result = { ...syncDto, nickname: 'tester' };
      mockUsersService.syncUser.mockResolvedValue(result);

      expect(await controller.syncUser(syncDto)).toEqual(result);
      expect(service.syncUser).toHaveBeenCalledWith(syncDto.id, syncDto.email);
    });
  });

  describe('getProfile', () => {
    it('should call usersService.getProfile', async () => {
      const userId = 'uuid';
      const result = { id: userId, email: 'test@example.com' };
      mockUsersService.getProfile.mockResolvedValue(result);

      expect(await controller.getProfile(userId)).toEqual(result);
      expect(service.getProfile).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateProfile', () => {
    it('should call usersService.updateProfile', async () => {
      const userId = 'uuid';
      const updateDto = { nickname: 'newNickname' };
      const result = { id: userId, ...updateDto };
      mockUsersService.updateProfile.mockResolvedValue(result);

      expect(await controller.updateProfile(userId, updateDto)).toEqual(result);
      expect(service.updateProfile).toHaveBeenCalledWith(userId, updateDto);
    });
  });
});
