import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SystemNotice } from './entities/system-notice.entity';
import { SystemNoticesController } from './system-notices.controller';
import { SystemNoticesService } from './system-notices.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemNotice])],
  controllers: [SystemNoticesController],
  providers: [SystemNoticesService],
})
export class SystemNoticesModule {}
