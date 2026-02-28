import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  createGroup(
    @Body()
    body: {
      user_id: string;
      name: string;
      description?: string;
      cover_image_url?: string;
    },
  ) {
    // 임시로 body.user_id 맵핑 (토큰 사용 권장)
    const { user_id, ...createData } = body;
    return this.groupsService.createGroup(String(user_id), createData);
  }

  @Get()
  getAllGroups() {
    return this.groupsService.getAllGroups();
  }

  @Get('me/:user_id')
  getMyGroups(@Param('user_id') user_id: string) {
    return this.groupsService.getMyGroups(user_id);
  }

  @Get(':id')
  getGroupDetail(@Param('id') id: string) {
    return this.groupsService.getGroupDetail(+id);
  }

  @Post(':id/join')
  joinGroup(
    @Param('id') id: string,
    @Body('user_id') user_id: string, // 임시처리
  ) {
    return this.groupsService.joinGroup(+id, user_id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupsService.getMembers(+id);
  }
}
