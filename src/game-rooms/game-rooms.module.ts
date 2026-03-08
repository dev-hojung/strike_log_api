import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GroupMember } from '../groups/entities/group-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GroupMember])],
  providers: [GameRoomsService, GameRoomsGateway],
  exports: [GameRoomsService],
})
export class GameRoomsModule {}
