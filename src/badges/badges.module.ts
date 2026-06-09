import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { UserBadge } from './entities/user-badge.entity';
import { AttendanceLog } from './entities/attendance-log.entity';
import { Game } from '../games/entities/game.entity';
import { GameSeries } from '../games/entities/game-series.entity';
import { GroupMember } from '../groups/entities/group-member.entity';

/**
 * 배지/출석 streak 도메인.
 * BadgesService는 게임 저장·시리즈 완료 훅에서도 호출되므로 exports로 노출한다.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserBadge,
      AttendanceLog,
      Game,
      GameSeries,
      GroupMember,
    ]),
  ],
  controllers: [BadgesController],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
