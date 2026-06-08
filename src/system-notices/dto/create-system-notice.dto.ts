import { ApiProperty } from '@nestjs/swagger';

import { SystemNoticePriority } from '../entities/system-notice.entity';

export class CreateSystemNoticeDto {
  @ApiProperty({ example: '서버 점검 안내' })
  title: string;

  @ApiProperty({ example: '오늘 자정 ~ 새벽 2시 점검 예정' })
  body: string;

  @ApiProperty({
    enum: SystemNoticePriority,
    default: SystemNoticePriority.INFO,
    required: false,
  })
  priority?: SystemNoticePriority;

  @ApiProperty({ default: true, required: false })
  dismissible?: boolean;

  @ApiProperty({ example: '2026-06-10T00:00:00Z', required: false })
  starts_at?: string;

  @ApiProperty({ example: '2026-06-30T23:59:59Z', required: false })
  ends_at?: string;

  @ApiProperty({
    default: false,
    required: false,
    description: 'true면 매일 KST 09:00에 자동 푸시 재발송',
  })
  repeat_daily?: boolean;

  @ApiProperty({
    default: true,
    required: false,
    description: 'false면 생성 시 푸시 발송 생략 (조용히 추가)',
  })
  push_immediately?: boolean;
}
