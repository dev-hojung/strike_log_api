import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { TrialReminderService } from './trial-reminder.service';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupJoinRequest } from './entities/group-join-request.entity';
import { GroupCreationRequest } from './entities/group-creation-request.entity';
import { GroupAnnouncement } from './entities/group-announcement.entity';
import { Game } from '../games/entities/game.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { BadgesModule } from '../badges/badges.module';
import { UsersModule } from '../users/users.module';
import { ClubAccessGuard } from '../auth/club-access.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMember, GroupJoinRequest, GroupCreationRequest, GroupAnnouncement, Game]),
    NotificationsModule,
    BadgesModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, TrialReminderService, ClubAccessGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
