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
    it('should call groupsService.createGroup', async () => {
      const createGroupDto = { user_id: 'user-uuid', name: 'Test Group' };
      const result = { id: 1, ...createGroupDto };
      mockGroupsService.createGroup.mockResolvedValue(result);

      expect(await controller.createGroup(createGroupDto)).toEqual(result);
      expect(service.createGroup).toHaveBeenCalledWith('user-uuid', {
        name: 'Test Group',
      });
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
    it('should call groupsService.getMyGroups', async () => {
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
    it('should call groupsService.joinGroup', async () => {
      const groupId = '1';
      const userId = 'user-uuid';
      const result = { success: true };
      mockGroupsService.joinGroup.mockResolvedValue(result);

      expect(await controller.joinGroup(groupId, userId)).toEqual(result);
      expect(service.joinGroup).toHaveBeenCalledWith(1, userId);
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
