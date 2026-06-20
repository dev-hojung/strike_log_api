import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GroupMember } from '../groups/entities/group-member.entity';
import { AuthModule } from '../auth/auth.module';
import { GameRoom } from './entities/game-room.entity';
import { GameRoomParticipant } from './entities/game-room-participant.entity';
import { Game } from '../games/entities/game.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupMember,
      GameRoom,
      GameRoomParticipant,
      Game, // suggestHandicaps에서 평균 점수 조회용
    ]),
    AuthModule,
    forwardRef(() => UsersModule),
  ],
  providers: [GameRoomsService, GameRoomsGateway],
  exports: [GameRoomsService],
})
export class GameRoomsModule {}
