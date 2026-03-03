import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send-otp')
  async sendOtp(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('이메일이 필요합니다.');
    }
    await this.emailService.sendOtp(email);
    return { success: true, message: '인증번호가 발송되었습니다.' };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: { email: string; code: string }) {
    const { email, code } = body;
    if (!email || !code) {
      throw new BadRequestException('이메일과 인증번호가 필요합니다.');
    }
    const isValid = await this.emailService.verifyOtp(email, code);
    if (!isValid) {
      throw new BadRequestException('인증번호가 일치하지 않거나 만료되었습니다.');
    }
    return { success: true, message: '인증이 완료되었습니다.' };
  }
}
