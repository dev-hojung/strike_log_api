import { Controller, Get, Post, Patch, Delete, Body, Param, Query, GoneException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import {
  CreationRequestStatus,
  CreationRejectReason,
} from './entities/group-creation-request.entity';
import { isPlatformAdmin } from '../common/admin';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClubAccessGuard } from '../auth/club-access.guard';

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
      activity_region?: string;
      cover_image_url?: string;
    },
  ) {
    return this.groupsService.createCreationRequest({
      requester_id: userId,
      name: body.name,
      description: body.description,
      activity_region: body.activity_region,
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

  @ApiOperation({
    summary: '클럽 리더보드 조회 (평균 점수 내림차순)',
    description:
      '클럽 멤버 전원의 누적 평균/최고 점수/경기 수를 집계해 정렬한 리스트와 본인 순위(myRank)를 함께 반환.',
  })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @UseGuards(ClubAccessGuard)
  @Get(':id/leaderboard')
  getLeaderboard(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.groupsService.getClubLeaderboard(+id, userId);
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
  @UseGuards(ClubAccessGuard)
  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupsService.getMembers(+id);
  }

  @ApiOperation({ summary: '클럽 멤버 목록 + 통계 조회' })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @UseGuards(ClubAccessGuard)
  @Get(':id/members-with-stats')
  getMembersWithStats(@Param('id') id: string) {
    return this.groupsService.getMembersWithStats(+id);
  }

  @ApiOperation({
    summary: '내가 운영자인 클럽의 pending 가입 신청 수',
    description: '하단 네비/헤더 뱃지에 사용. 일반 멤버는 항상 0.',
  })
  @Get('me/pending-join-requests-count')
  async getMyPendingJoinRequestsCount(@CurrentUser('id') userId: string) {
    const count = await this.groupsService.countPendingJoinRequestsForAdmin(userId);
    return { count };
  }

  @ApiOperation({
    summary: '클럽 멤버를 운영자(ADMIN)로 승격',
    description:
      '호출자는 해당 클럽의 ADMIN이어야 한다. 대상이 본인이거나 이미 ADMIN이면 409.',
  })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @ApiParam({ name: 'userId', description: '승격 대상 사용자 UUID' })
  @Post(':id/members/:userId/promote')
  promoteMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.groupsService.promoteToAdmin(+id, currentUserId, targetUserId);
  }

  @ApiOperation({
    summary: '클럽 탈퇴',
    description:
      '본인 멤버십 삭제. 유일 ADMIN+다른 멤버 있으면 409 (권한 위임 필요). 본인이 유일 멤버면 클럽도 함께 삭제.',
  })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @Delete(':id/leave')
  leaveGroup(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.groupsService.leaveGroup(+id, currentUserId);
  }

  @ApiOperation({
    summary: '회원 추방',
    description:
      '운영자만 호출 가능. 일반 MEMBER만 추방할 수 있고 ADMIN/본인은 차단된다. 추방 시 대상에게 CLUB_KICKED 알림 발송.',
  })
  @ApiParam({ name: 'id', description: '클럽 ID', example: '1' })
  @ApiParam({ name: 'userId', description: '추방 대상 사용자 UUID' })
  @Delete(':id/members/:userId')
  kickMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.groupsService.kickMember(+id, currentUserId, targetUserId);
  }

  // ─── 클럽 공지사항 ──────────────────────────────────────

  @ApiOperation({ summary: '클럽 공지 목록', description: '멤버만 조회 가능.' })
  @ApiParam({ name: 'id', description: '클럽 ID' })
  @UseGuards(ClubAccessGuard)
  @Get(':id/announcements')
  listAnnouncements(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.groupsService.listAnnouncements(+id, currentUserId);
  }

  @ApiOperation({
    summary: '클럽 공지 작성',
    description: '운영자만. 작성 후 멤버 전원에게 CLUB_ANNOUNCEMENT 알림 발송.',
  })
  @ApiParam({ name: 'id', description: '클럽 ID' })
  @UseGuards(ClubAccessGuard)
  @Post(':id/announcements')
  createAnnouncement(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @Body() body: { title: string; body: string; pinned?: boolean },
  ) {
    return this.groupsService.createAnnouncement(+id, currentUserId, body);
  }

  @ApiOperation({ summary: '클럽 공지 수정', description: '운영자만.' })
  @ApiParam({ name: 'id', description: '클럽 ID' })
  @ApiParam({ name: 'aid', description: '공지 ID' })
  @UseGuards(ClubAccessGuard)
  @Patch(':id/announcements/:aid')
  updateAnnouncement(
    @Param('id') id: string,
    @Param('aid') aid: string,
    @CurrentUser('id') currentUserId: string,
    @Body() body: { title?: string; body?: string; pinned?: boolean },
  ) {
    return this.groupsService.updateAnnouncement(+id, +aid, currentUserId, body);
  }

  @ApiOperation({ summary: '클럽 공지 삭제', description: '운영자만.' })
  @ApiParam({ name: 'id', description: '클럽 ID' })
  @ApiParam({ name: 'aid', description: '공지 ID' })
  @UseGuards(ClubAccessGuard)
  @Delete(':id/announcements/:aid')
  deleteAnnouncement(
    @Param('id') id: string,
    @Param('aid') aid: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.groupsService.deleteAnnouncement(+id, +aid, currentUserId);
  }
}
