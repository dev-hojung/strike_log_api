import { Body, Controller, Delete, Get, Logger, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 내 알림 목록 조회 (최신순)
   */
  @ApiOperation({ summary: '내 알림 목록 조회 (최신순)' })
  @Get('me')
  getMyNotifications(@CurrentUser('id') userId: string) {
    return this.notificationsService.findByUser(userId);
  }

  /**
   * 내 읽지 않은 알림 수 조회
   */
  @ApiOperation({ summary: '내 읽지 않은 알림 수 조회' })
  @Get('me/unread-count')
  async getMyUnreadCount(@CurrentUser('id') userId: string) {
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  /**
   * 본인 알림 단건 읽음 처리
   * (서비스에 소유자 검증 메서드가 없으므로, ID 기반으로 본인 외 호출은 막을 수 없음 →
   *  현재는 인증된 유저만 호출 가능. 추후 서비스 레벨에서 owner 체크 추가 권장.)
   */
  @ApiOperation({ summary: '알림 단건 읽음 처리' })
  @ApiParam({ name: 'id', description: '알림 ID', example: '7' })
  @Post(':id/read')
  async markAsRead(@Param('id') id: string) {
    await this.notificationsService.markAsRead(+id);
    return { ok: true };
  }

  /**
   * 내 모든 알림 읽음 처리
   */
  @ApiOperation({ summary: '내 모든 알림 읽음 처리' })
  @Post('me/read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    await this.notificationsService.markAllAsRead(userId);
    return { ok: true };
  }

  /**
   * 내 FCM 디바이스 토큰 등록
   */
  @ApiOperation({ summary: '내 FCM 디바이스 토큰 등록' })
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
  @Post('me/fcm-token')
  async registerFcmToken(
    @CurrentUser('id') userId: string,
    @Body() body: { token: string; platform: string },
  ) {
    this.logger.log(
      `[fcm-token register] user=${userId} platform=${body.platform} token=${body.token?.slice(0, 16)}...`,
    );
    await this.notificationsService.registerFcmToken(userId, body.token, body.platform);
    return { ok: true };
  }

  /**
   * 익명(로그아웃 / 가입 전) 디바이스 토큰 등록.
   * userId=null로 저장돼 개인 알림은 안 받지만 시스템 공지 같은 broadcast 푸시는 수신.
   * 같은 token이 이미 사용자에 바인딩돼 있으면 해당 바인딩이 NULL로 덮어써짐 — 로그아웃 흐름과 일관됨.
   */
  @Public()
  @ApiOperation({
    summary: '익명 FCM 디바이스 토큰 등록 (로그아웃 디바이스 / 가입 전)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        platform: { type: 'string', example: 'android' },
      },
      required: ['token', 'platform'],
    },
  })
  @Post('fcm-token')
  async registerAnonymousFcmToken(
    @Body() body: { token: string; platform: string },
  ) {
    this.logger.log(
      `[fcm-token register anonymous] platform=${body.platform} token=${body.token?.slice(0, 16)}...`,
    );
    await this.notificationsService.registerFcmToken(null, body.token, body.platform);
    return { ok: true };
  }

  /**
   * 내 FCM 디바이스 토큰 삭제 (로그아웃 등)
   */
  @ApiOperation({ summary: '내 FCM 디바이스 토큰 삭제' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', example: 'fMm3...xyz' },
      },
      required: ['token'],
    },
  })
  @Delete('me/fcm-token')
  async deleteFcmToken(@CurrentUser('id') userId: string, @Body() body: { token: string }) {
    await this.notificationsService.deleteFcmToken(userId, body.token);
    return { ok: true };
  }
}
