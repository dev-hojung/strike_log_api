import { Controller, Get, Query } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller()
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  /**
   * 내 전체 배지 카탈로그 (잠금/해금 + 획득일).
   */
  @Get('badges/me')
  async getMyBadges(@CurrentUser('id') userId: string) {
    return this.badgesService.getStatusForUser(userId);
  }

  /**
   * 최근 획득 배지 (홈 카드 등에 사용).
   */
  @Get('badges/me/recent')
  async getRecent(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Math.max(1, Math.min(20, parseInt(limit, 10) || 5)) : 5;
    return this.badgesService.getRecentEarned(userId, n);
  }

  /**
   * 내 출석 streak 요약 (홈 카드 진입점).
   */
  @Get('attendance/me/streak')
  async getStreak(@CurrentUser('id') userId: string) {
    const [current, longest] = await Promise.all([
      this.badgesService.computeCurrentStreak(userId),
      this.badgesService.computeLongestStreak(userId),
    ]);
    return { currentStreak: current, longestStreak: longest };
  }
}
