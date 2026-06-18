import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateInquiryDto, InquiriesService } from './inquiries.service';
import { InquiryCategory } from './entities/inquiry.entity';

interface CreateInquiryBody {
  category: InquiryCategory;
  subject: string;
  body: string;
  contact_email?: string;
}

@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateInquiryBody,
  ) {
    const dto: CreateInquiryDto = {
      category: body.category,
      subject: body.subject,
      body: body.body,
      contact_email: body.contact_email ?? null,
    };
    return this.inquiriesService.create(user.id, dto);
  }
}
