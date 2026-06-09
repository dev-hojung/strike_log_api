import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GroupMember } from '../groups/entities/group-member.entity';
import { AuthModule } from '../auth/auth.module';
import { GameRoom } from './entities/game-room.entity';
import { GameRoomParticipant } from './entities/game-room-participant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupMember, GameRoom, GameRoomParticipant]),
    AuthModule,
  ],
  providers: [GameRoomsService, GameRoomsGateway],
  exports: [GameRoomsService],
})
export class GameRoomsModule {}
