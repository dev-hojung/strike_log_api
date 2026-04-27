import { Test, TestingModule } from '@nestjs/testing';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

describe('GroupsController', () => {
  let controller: GroupsController;
  let service: GroupsService;

  const mockGroupsService = {
    createGroup: jest.fn(),
    getAllGroups: jest.fn(),
    getMyGroups: jest.fn(),
    getGroupDetail: jest.fn(),
    joinGroup: jest.fn(),
    getMembers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        {
          provide: GroupsService,
          useValue: mockGroupsService,
        },
      ],
    }).compile();

    controller = module.get<GroupsController>(GroupsController);
    service = module.get<GroupsService>(GroupsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createGroup', () => {
    it('플랫폼 관리자가 호출하면 service.createGroup으로 위임된다', async () => {
      // 플랫폼 관리자 환경변수 설정
      process.env.ADMIN_USER_IDS = 'admin-uuid';
      const body = { name: 'Test Group' };
      const result = { id: 1, ...body };
      mockGroupsService.createGroup.mockResolvedValue(result);

      expect(await controller.createGroup('admin-uuid', body)).toEqual(result);
      expect(service.createGroup).toHaveBeenCalledWith('admin-uuid', body);
    });

    it('일반 유저가 호출하면 GoneException을 던진다', () => {
      process.env.ADMIN_USER_IDS = 'admin-uuid';
      expect(() => controller.createGroup('regular-uuid', { name: 'Test Group' })).toThrow();
    });
  });

  describe('getAllGroups', () => {
    it('should call groupsService.getAllGroups', async () => {
      const result = [{ id: 1, name: 'Group 1' }];
      mockGroupsService.getAllGroups.mockResolvedValue(result);

      expect(await controller.getAllGroups()).toEqual(result);
      expect(service.getAllGroups).toHaveBeenCalled();
    });
  });

  describe('getMyGroups', () => {
    it('인증된 유저 id로 service.getMyGroups가 호출된다', async () => {
      const userId = 'user-uuid';
      const result = [{ id: 1, name: 'My Group' }];
      mockGroupsService.getMyGroups.mockResolvedValue(result);

      expect(await controller.getMyGroups(userId)).toEqual(result);
      expect(service.getMyGroups).toHaveBeenCalledWith(userId);
    });
  });

  describe('getGroupDetail', () => {
    it('should call groupsService.getGroupDetail', async () => {
      const groupId = '1';
      const result = { id: 1, name: 'Group 1', description: 'desc' };
      mockGroupsService.getGroupDetail.mockResolvedValue(result);

      expect(await controller.getGroupDetail(groupId)).toEqual(result);
      expect(service.getGroupDetail).toHaveBeenCalledWith(1);
    });
  });

  describe('joinGroup', () => {
    it('should throw GoneException (deprecated)', () => {
      expect(() => controller.joinGroup()).toThrow();
    });
  });

  describe('getMembers', () => {
    it('should call groupsService.getMembers', async () => {
      const groupId = '1';
      const result = [{ user_id: 'user-uuid', role: 'MEMBER' }];
      mockGroupsService.getMembers.mockResolvedValue(result);

      expect(await controller.getMembers(groupId)).toEqual(result);
      expect(service.getMembers).toHaveBeenCalledWith(1);
    });
  });
});
