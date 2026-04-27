import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoomsService } from './game-rooms.service';
import { GameRoomsGateway } from './game-rooms.gateway';
import { GroupMember } from '../groups/entities/group-member.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([GroupMember]), AuthModule],
  providers: [GameRoomsService, GameRoomsGateway],
  exports: [GameRoomsService],
})
export class GameRoomsModule {}
