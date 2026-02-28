import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private otpStorage = new Map<string, string>();

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not defined in .env');
    }
    this.resend = new Resend(apiKey || 'your_resend_api_key');
  }

  async sendOtp(email: string): Promise<boolean> {
    try {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      this.otpStorage.set(email, otpCode);

      const { error } = await this.resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: '[STRIKE LOG] 회원가입 인증번호',
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #1A5CFF;">STRIKE LOG</h2>
                <p>안녕하세요!</p>
                <p>회원가입을 위한 인증번호는 <strong>\${otpCode}</strong> 입니다.</p>
                <p>앱에서 입력해주세요.</p>
               </div>`,
      });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return true;
    } catch {
      throw new InternalServerErrorException('이메일 발송 실패');
    }
  }

  verifyOtp(email: string, code: string): boolean {
    if (this.otpStorage.has(email) && this.otpStorage.get(email) === code) {
      this.otpStorage.delete(email); // 인증 성공 시 사용된 코드 삭제
      return true;
    }
    return false;
  }
}
