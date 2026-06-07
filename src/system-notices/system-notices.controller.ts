import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { SystemNoticesService } from './system-notices.service';

@ApiTags('system-notices')
@Controller('system-notices')
export class SystemNoticesController {
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
}
