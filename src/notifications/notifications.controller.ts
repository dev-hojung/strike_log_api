import { Body, Controller, Delete, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 특정 유저의 알림 목록 조회 (최신순)
   */
  @ApiOperation({ summary: '유저 알림 목록 조회 (최신순)' })
  @ApiParam({ name: 'userId', description: '유저 ID', example: 'uuid-1234' })
  @Get(':userId')
  getNotifications(@Param('userId') userId: string) {
    return this.notificationsService.findByUser(userId);
  }

  /**
   * 읽지 않은 알림 수 조회
   */
  @ApiOperation({ summary: '읽지 않은 알림 수 조회' })
  @ApiParam({ name: 'userId', description: '유저 ID', example: 'uuid-1234' })
  @Get(':userId/unread-count')
  async getUnreadCount(@Param('userId') userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  /**
   * 단건 읽음 처리
   */
  @ApiOperation({ summary: '알림 단건 읽음 처리' })
  @ApiParam({ name: 'id', description: '알림 ID', example: '7' })
  @Post(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationsService.markAsRead(+id);
    return { ok: true };
  }

  /**
   * 전체 읽음 처리
   */
  @ApiOperation({ summary: '유저의 모든 알림 읽음 처리' })
  @ApiParam({ name: 'userId', description: '유저 ID', example: 'uuid-1234' })
  @Post(':userId/read-all')
  async markAllAsRead(@Param('userId') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { ok: true };
  }

  /**
   * FCM 디바이스 토큰 등록
   */
  @ApiOperation({ summary: 'FCM 디바이스 토큰 등록' })
  @ApiParam({ name: 'userId', description: '유저 ID', example: 'uuid-1234' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', example: 'fMm3...xyz' },
        platform: { type: 'string', example: 'android' },
      },
      required: ['token', 'platform'],
    },
  })
  @Post(':userId/fcm-token')
  async registerFcmToken(
    @Param('userId') userId: string,
    @Body() body: { token: string; platform: string },
  ) {
    await this.notificationsService.registerFcmToken(
      userId,
      body.token,
      body.platform,
    );
    return { ok: true };
  }

  /**
   * FCM 디바이스 토큰 삭제 (로그아웃 등)
   */
  @ApiOperation({ summary: 'FCM 디바이스 토큰 삭제' })
  @ApiParam({ name: 'userId', description: '유저 ID', example: 'uuid-1234' })
  @Delete(':userId/fcm-token')
  async deleteFcmToken(
    @Param('userId') userId: string,
    @Body() body: { token: string },
  ) {
    await this.notificationsService.deleteFcmToken(userId, body.token);
    return { ok: true };
  }
}
