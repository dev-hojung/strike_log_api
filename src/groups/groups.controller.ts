import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * 새로운 클럽을 생성합니다.
   */
  @ApiOperation({ summary: '새 클럽 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['user_id', 'name'],
      properties: {
        user_id: { type: 'string', example: 'uuid-1234' },
        name: { type: 'string', example: '볼링 클럽 A' },
        description: { type: 'string', example: '주말 볼링 모임' },
        cover_image_url: { type: 'string', example: 'https://example.com/cover.png' },
      },
    },
  })
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
    const { user_id, ...createData } = body;
    return this.groupsService.createGroup(user_id, createData);
  }

  @ApiOperation({ summary: '전체 클럽 목록 조회' })
  @Get()
  getAllGroups() {
    return this.groupsService.getAllGroups();
  }

  @ApiOperation({ summary: '내가 속한 클럽 목록 조회' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('me/:user_id')
  getMyGroups(@Param('user_id') user_id: string) {
    return this.groupsService.getMyGroups(user_id);
  }

  @ApiOperation({ summary: '클럽 상세 정보 조회' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Get(':id')
  getGroupDetail(@Param('id') id: string) {
    return this.groupsService.getGroupDetail(+id);
  }

  /**
   * [DEPRECATED] 즉시 가입은 폐기됨. join-requests를 사용하세요.
   */
  @ApiOperation({ summary: '[DEPRECATED] 즉시 가입 (폐기됨, join-requests 사용)' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Post(':id/join')
  joinGroup() {
    throw new GoneException(
      '즉시 가입은 더 이상 지원되지 않습니다. POST /groups/:id/join-requests를 사용해주세요.',
    );
  }

  // ──────────────────────────────────────
  //  가입 신청 승인제
  // ──────────────────────────────────────

  /**
   * 가입 신청 생성
   */
  @ApiOperation({ summary: '클럽 가입 신청 생성' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['user_id'],
      properties: {
        user_id: { type: 'string', example: 'uuid-1234' },
        message: { type: 'string', example: '가입하고 싶습니다!' },
      },
    },
  })
  @Post(':id/join-requests')
  createJoinRequest(
    @Param('id') id: string,
    @Body() body: { user_id: string; message?: string },
  ) {
    if (!body.user_id) {
      throw new BadRequestException('user_id가 필요합니다.');
    }
    return this.groupsService.createJoinRequest(+id, body.user_id, body.message);
  }

  /**
   * 가입 신청 목록 조회 (클럽장 전용)
   */
  @ApiOperation({ summary: '가입 신청 목록 조회 (클럽장 전용)' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Get(':id/join-requests')
  getJoinRequests(
    @Param('id') id: string,
    @Body('user_id') user_id: string,
  ) {
    return this.groupsService.getJoinRequests(+id, user_id);
  }

  /**
   * 가입 신청 승인 (클럽장 전용)
   */
  @ApiOperation({ summary: '가입 신청 승인 (클럽장 전용)' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @ApiParam({ name: 'requestId', description: '신청 ID', example: '5' })
  @Post(':id/join-requests/:requestId/approve')
  approveJoinRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body('user_id') user_id: string,
  ) {
    return this.groupsService.approveJoinRequest(+id, +requestId, user_id);
  }

  /**
   * 가입 신청 거절 (클럽장 전용)
   */
  @ApiOperation({ summary: '가입 신청 거절 (클럽장 전용)' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @ApiParam({ name: 'requestId', description: '신청 ID', example: '5' })
  @Post(':id/join-requests/:requestId/reject')
  rejectJoinRequest(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body('user_id') user_id: string,
  ) {
    return this.groupsService.rejectJoinRequest(+id, +requestId, user_id);
  }

  @ApiOperation({ summary: '클럽 멤버 목록 조회' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupsService.getMembers(+id);
  }

  @ApiOperation({ summary: '클럽 멤버 목록 + 통계 조회' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Get(':id/members-with-stats')
  getMembersWithStats(@Param('id') id: string) {
    return this.groupsService.getMembersWithStats(+id);
  }
}
