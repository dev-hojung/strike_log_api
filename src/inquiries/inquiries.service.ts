import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inquiry, InquiryCategory } from './entities/inquiry.entity';
import { User } from '../users/entities/user.entity';
import { DiscordNotifierService } from '../common/discord-notifier.service';

export interface CreateInquiryDto {
  category: InquiryCategory;
  subject: string;
  body: string;
  contact_email?: string | null;
}

const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  [InquiryCategory.CLUB_TRIAL]: '클럽 구독',
  [InquiryCategory.BUG]: '버그 신고',
  [InquiryCategory.GENERAL]: '일반 문의',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class InquiriesService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepository: Repository<Inquiry>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly discord: DiscordNotifierService,
  ) {}

  async create(userId: string, dto: CreateInquiryDto): Promise<Inquiry> {
    // 수동 검증
    if (!Object.values(InquiryCategory).includes(dto.category)) {
      throw new BadRequestException('유효하지 않은 카테고리입니다.');
    }
    if (!dto.subject || dto.subject.length < 1 || dto.subject.length > 120) {
      throw new BadRequestException('제목은 1~120자여야 합니다.');
    }
    if (!dto.body || dto.body.length < 1 || dto.body.length > 10000) {
      throw new BadRequestException('내용은 1~10000자여야 합니다.');
    }
    if (dto.contact_email && !EMAIL_REGEX.test(dto.contact_email)) {
      throw new BadRequestException('회신 이메일 형식이 올바르지 않습니다.');
    }

    const inquiry = this.inquiryRepository.create({
      user_id: userId,
      category: dto.category,
      subject: dto.subject,
      body: dto.body,
      contact_email: dto.contact_email ?? null,
    });
    const saved = await this.inquiryRepository.save(inquiry);

    // 알림에 닉네임·이메일을 담기 위해 user 조회. 조회 실패해도 알림은 보냄.
    const user = await this.userRepository.findOne({ where: { id: userId } });

    const categoryLabel = CATEGORY_LABELS[dto.category];
    void this.discord.notifyInquiry({
      title: `[문의] ${categoryLabel} — ${dto.subject}`,
      message: dto.body,
      fields: [
        { name: 'user_id', value: userId },
        { name: 'nickname', value: user?.nickname ?? '(unknown)' },
        { name: 'email', value: user?.email ?? '(unknown)' },
        { name: 'contact_email', value: dto.contact_email ?? '(미입력)' },
        { name: 'category', value: dto.category },
      ],
    });

    return saved;
  }
}
