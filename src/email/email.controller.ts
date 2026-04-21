import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { Public } from '../auth/public.decorator';

/**
 * 회원가입·비밀번호 재설정 플로우에서 쓰이므로 전부 인증 없이 호출 가능.
 */
@ApiTags('email')
@Public()
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @ApiOperation({ summary: '이메일로 OTP 인증번호 발송' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  @Post('send-otp')
  async sendOtp(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('이메일이 필요합니다.');
    }
    await this.emailService.sendOtp(email);
    return { success: true, message: '인증번호가 발송되었습니다.' };
  }

  @ApiOperation({ summary: 'OTP 인증번호 검증' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'code'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        code: { type: 'string', example: '123456' },
      },
    },
  })
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
