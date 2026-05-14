import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { GameSeriesService } from './game-series.service';
import { GameSeriesController } from './game-series.controller';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';
import { GameSeries } from './entities/game-series.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group } from '../groups/entities/group.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Frame, GameSeries, GroupMember, Group]),
    NotificationsModule,
  ],
  controllers: [GamesController, GameSeriesController],
  providers: [GamesService, GameSeriesService],
})
export class GamesModule {}
