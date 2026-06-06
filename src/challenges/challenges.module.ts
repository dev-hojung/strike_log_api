import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Game } from '../games/entities/game.entity';
import { Frame } from '../games/entities/frame.entity';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';

/**
 * 주간 챌린지 도메인.
 * 정적 카탈로그 + games/frames 집계 기반 실시간 진행률 계산.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Game, Frame])],
  controllers: [ChallengesController],
  providers: [ChallengesService],
})
export class ChallengesModule {}
