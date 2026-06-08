import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationsModule } from '../notifications/notifications.module';
import { SystemNotice } from './entities/system-notice.entity';
import { SystemNoticesController } from './system-notices.controller';
import { SystemNoticesService } from './system-notices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemNotice]),
    NotificationsModule, // PushService 의존
  ],
  controllers: [SystemNoticesController],
  providers: [SystemNoticesService],
})
export class SystemNoticesModule {}
