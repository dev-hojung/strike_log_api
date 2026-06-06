import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { ChallengesService } from './challenges.service';

@ApiTags('challenges')
@ApiBearerAuth('access-token')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @ApiOperation({
    summary: '내 주간 챌린지 진행률',
    description:
      'KST 월~일 기준 이번 주 게임 기록으로 진행률 실시간 계산. 별도 사용자 진행 테이블 없음.',
  })
  @Get('me/weekly')
  getMyWeekly(@CurrentUser('id') userId: string) {
    return this.challengesService.getMyWeekly(userId);
  }
}
