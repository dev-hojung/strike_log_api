import { Controller, Get, Post, Body, Param, Query, GoneException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import {
  CreationRequestStatus,
  CreationRejectReason,
} from './entities/group-creation-request.entity';
import { isPlatformAdmin } from '../common/admin';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('groups')
@ApiBearerAuth('access-token')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * 새로운 클럽을 생성합니다. (플랫폼 관리자 전용 — 일반 유저는 creation-requests 사용)
   */
  @ApiOperation({ summary: '새 클럽 생성 (플랫폼 관리자 전용)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: '볼링 클럽 A' },
        description: { type: 'string', example: '주말 볼링 모임' },
        cover_image_url: { type: 'string', example: 'https://example.com/cover.png' },
      },
    },
  })
  @Post()
  createGroup(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      cover_image_url?: string;
    },
  ) {
    // 일반 유저는 POST /groups/creation-requests를 사용. 관리자만 즉시 생성 허용.
    if (!isPlatformAdmin(userId)) {
      throw new GoneException(
        '직접 생성은 지원되지 않습니다. POST /groups/creation-requests를 사용해주세요.',
      );
    }
    return this.groupsService.createGroup(userId, body);
  }

  @ApiOperation({ summary: '전체 클럽 목록 조회' })
  @Get()
  getAllGroups() {
    return this.groupsService.getAllGroups();
  }

  @ApiOperation({ summary: '내가 속한 클럽 목록 조회' })
  @Get('me')
  getMyGroups(@CurrentUser('id') userId: string) {
    return this.groupsService.getMyGroups(userId);
  }

  // ──────────────────────────────────────
  //  클럽 생성 신청 승인제 (creation-requests)
  // ──────────────────────────────────────
  // 주의: NestJS 라우트 매칭은 정의 순서를 따르므로
  // `@Get(':id')` 이전에 정의해야 한다.

  @ApiOperation({ summary: '클럽 생성 신청' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: '볼링 클럽 A' },
        description: { type: 'string' },
        cover_image_url: { type: 'string' },
      },
    },
  })
  @Post('creation-requests')
  createCreationRequest(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      cover_image_url?: string;
    },
  ) {
    return this.groupsService.createCreationRequest({
      requester_id: userId,
      name: body.name,
      description: body.description,
      cover_image_url: body.cover_image_url,
    });
  }

  @ApiOperation({ summary: '내 클럽 생성 신청 목록' })
  @Get('creation-requests/me')
  getMyCreationRequests(@CurrentUser('id') userId: string) {
    return this.groupsService.listMyCreationRequests(userId);
  }

  @ApiOperation({ summary: '[ADMIN] 클럽 생성 신청 목록 조회' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: CreationRequestStatus,
  })
  @Get('creation-requests')
  listCreationRequestsForAdmin(
    @CurrentUser('id') userId: string,
    @Query('status') status?: CreationRequestStatus,
  ) {
    return this.groupsService.listCreationRequestsForAdmin(userId, status);
  }

  @ApiOperation({ summary: '[ADMIN] 클럽 생성 신청 승인' })
  @ApiParam({ name: 'id', description: '신청 ID' })
  @Post('creation-requests/:id/approve')
  approveCreationRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.approveCreationRequest(+id, userId);
  }

  @ApiOperation({ summary: '[ADMIN] 클럽 생성 신청 반려' })
  @ApiParam({ name: 'id', description: '신청 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['reason'],
      properties: {
        reason: {
          type: 'string',
          enum: Object.values(CreationRejectReason),
        },
      },
    },
  })
  @Post('creation-requests/:id/reject')
  rejectCreationRequest(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { reason: CreationRejectReason },
  ) {
    return this.groupsService.rejectCreationRequest(+id, userId, body.reason);
  }

  @ApiOperation({ summary: '본인 클럽 생성 신청 취소' })
  @ApiParam({ name: 'id', description: '신청 ID' })
  @Post('creation-requests/:id/cancel')
  cancelCreationRequest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.cancelCreationRequest(+id, userId);
  }

  // ──────────────────────────────────────

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
      properties: {
        message: { type: 'string', example: '가입하고 싶습니다!' },
      },
    },
  })
  @Post(':id/join-requests')
  createJoinRequest(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { message?: string },
  ) {
    return this.groupsService.createJoinRequest(+id, userId, body?.message);
  }

  /**
   * 가입 신청 목록 조회 (클럽장 전용)
   */
  @ApiOperation({ summary: '가입 신청 목록 조회 (클럽장 전용)' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Get(':id/join-requests')
  getJoinRequests(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.getJoinRequests(+id, userId);
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
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.approveJoinRequest(+id, +requestId, userId);
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
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.rejectJoinRequest(+id, +requestId, userId);
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
