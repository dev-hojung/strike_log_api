import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game, Frame])],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
