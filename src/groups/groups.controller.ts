import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * 새로운 클럽을 생성합니다.
   * 클라이언트가 user_id를 누락했을 때 'undefined' 문자열로 인한 외래키 제약조건 에러를 방지하기 위해 예외 처리를 추가했습니다.
   *
   * @param body 클럽 생성에 필요한 정보 (user_id 필수포함)
   * @returns 생성된 클럽 정보
   * @throws {BadRequestException} user_id가 누락되었을 경우 발생
   */
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
    if (!body.user_id) {
      throw new BadRequestException('user_id가 필요합니다.');
    }
    // 임시로 body.user_id 맵핑 (토큰 사용 권장)
    const { user_id, ...createData } = body;
    return this.groupsService.createGroup(user_id, createData);
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

  /**
   * 특정 클럽에 가입 요청을 합니다.
   * user_id 가 누락되어 외래키 에러가 발생하지 않도록 검사 로직을 추가했습니다.
   *
   * @param id 가입할 클럽의 아이디
   * @param user_id 가입을 요청하는 유저의 아이디
   * @returns 생성된 그룹 멤버 정보
   * @throws {BadRequestException} user_id가 누락되었을 경우 발생
   */
  @Post(':id/join')
  joinGroup(
    @Param('id') id: string,
    @Body('user_id') user_id: string, // 임시처리
  ) {
    if (!user_id) {
      throw new BadRequestException('user_id가 필요합니다.');
    }
    return this.groupsService.joinGroup(+id, user_id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupsService.getMembers(+id);
  }

  @Get(':id/members-with-stats')
  getMembersWithStats(@Param('id') id: string) {
    return this.groupsService.getMembersWithStats(+id);
  }
}
