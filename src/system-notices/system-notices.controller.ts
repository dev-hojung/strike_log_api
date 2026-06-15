import * as crypto from 'crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { CreateSystemNoticeDto } from './dto/create-system-notice.dto';
import { SystemNoticesService } from './system-notices.service';

@ApiTags('system-notices')
@Controller('system-notices')
export class SystemNoticesController {
  private readonly logger = new Logger(SystemNoticesController.name);

  constructor(private readonly service: SystemNoticesService) {}

  @Public()
  @ApiOperation({
    summary: '현재 활성 시스템 공지 목록',
    description:
      'starts_at/ends_at 윈도우 안에 있는 공지만 반환. 로그인 전에도 호출 가능.',
  })
  @Get('active')
  getActive() {
    return this.service.getActive();
  }

  /**
   * 관리자 전용 공지 등록 + (옵션) 즉시 전체 디바이스 푸시.
   *
   * 인증: 환경변수 ADMIN_API_KEY와 일치하는 X-Admin-Token 헤더 필요.
   * JWT 가드는 @Public()로 우회, 헤더 검증만 사용.
   */
  @Public()
  @ApiOperation({
    summary: '시스템 공지 등록 (관리자)',
    description:
      'X-Admin-Token 헤더가 서버 ADMIN_API_KEY와 일치해야 함. push_immediately = false면 푸시 없이 등록.',
  })
  @ApiHeader({ name: 'X-Admin-Token', required: true })
  @ApiBody({ type: CreateSystemNoticeDto })
  @Post()
  async create(
    @Headers('x-admin-token') adminToken: string | undefined,
    @Body() dto: CreateSystemNoticeDto,
  ) {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) {
      this.logger.warn('ADMIN_API_KEY env not configured — admin POST blocked');
      throw new ForbiddenException('admin endpoint disabled');
    }
    const expectedBuf = Buffer.from(expected);
    const tokenBuf = Buffer.from(adminToken ?? '');
    const equal =
      expectedBuf.length === tokenBuf.length &&
      crypto.timingSafeEqual(expectedBuf, tokenBuf);
    if (!adminToken || !equal) {
      throw new ForbiddenException('invalid admin token');
    }
    if (!dto?.title || !dto?.body) {
      throw new ForbiddenException('title/body required');
    }
    return this.service.createAndBroadcast(dto);
  }
}
