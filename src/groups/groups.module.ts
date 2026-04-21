import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { TrialReminderService } from './trial-reminder.service';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupJoinRequest } from './entities/group-join-request.entity';
import { GroupCreationRequest } from './entities/group-creation-request.entity';
import { Game } from '../games/entities/game.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Group,
      GroupMember,
      GroupJoinRequest,
      GroupCreationRequest,
      Game,
    ]),
    NotificationsModule,
  ],
  controllers: [GroupsController],
  providers: [GroupsService, TrialReminderService],
  exports: [GroupsService],
})
export class GroupsModule {}
