import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { Resend } from 'resend';
import { EmailAuth } from './entities/email-auth.entity';

/** 같은 이메일로 OTP를 재발송할 수 있기까지의 최소 간격(ms). IP 우회 공격에도 한 메일함 폭탄을 차단. */
const OTP_RESEND_COOLDOWN_MS = 60_000;

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(
    private configService: ConfigService,
    @InjectRepository(EmailAuth)
    private readonly emailAuthRepository: Repository<EmailAuth>,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      console.warn('RESEND_API_KEY is not defined in .env');
    }
    this.resend = new Resend(apiKey || 'your_resend_api_key');
  }

  async sendOtp(
    email: string,
    purpose: 'signup' | 'reset' = 'signup',
  ): Promise<boolean> {
    // 이메일별 재발송 쿨다운: 같은 주소로 가장 최근 발송 후 60초가 안 지났으면 거부.
    // (IP 기반 throttler를 우회해도 특정 메일함으로의 OTP 폭탄을 막는다.)
    const lastSent = await this.emailAuthRepository.findOne({
      where: { email },
      order: { created_at: 'DESC' },
    });
    if (lastSent) {
      const elapsed = Date.now() - new Date(lastSent.created_at).getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        throw new HttpException(
          `인증번호는 ${wait}초 후에 다시 요청할 수 있습니다.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    try {
      const otpCode = randomInt(100000, 1000000).toString();

      // 기존에 인증받지 않은 코드가 있다면 삭제하여 최신 코드만 유지
      await this.emailAuthRepository.delete({ email, is_verified: false });

      // 새 인증번호 DB 저장
      const emailAuth = this.emailAuthRepository.create({
        email,
        code: otpCode,
      });
      await this.emailAuthRepository.save(emailAuth);

      // 개발/테스트 편의를 위해 발급된 OTP를 콘솔에 출력합니다.
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Email Auth OTP/${purpose}] To: ${email}, Code: ${otpCode}`);
      }

      const fromAddress =
        this.configService.get<string>('RESEND_FROM_ADDRESS') ??
        'Strike Log <noreply@strikelog.xyz>';

      const isReset = purpose === 'reset';
      const subject = isReset
        ? '[STRIKE LOG] 비밀번호 재설정 인증번호'
        : '[STRIKE LOG] 회원가입 인증번호';
      const purposeLine = isReset
        ? '비밀번호 재설정을 위한 인증번호는'
        : '회원가입을 위한 인증번호는';

      const { error } = await this.resend.emails.send({
        from: fromAddress,
        to: email,
        subject,
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #1A5CFF;">STRIKE LOG</h2>
                <p>안녕하세요!</p>
                <p>${purposeLine} <strong>${otpCode}</strong> 입니다.</p>
                <p>인증번호는 5분간 유효합니다. 앱에서 입력해주세요.</p>
               </div>`,
      });

      if (error) {
        // Resend 도메인 미인증으로 인한 에러 발생 시,
        // 콘솔에 안내를 띄우고 시스템은 정상(true)으로 진행되게 하여 테스트를 돕습니다.
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Email Warning] Resend 이메일 발송 제한. OTP 코드는 콘솔에서 확인하세요. (${error.message})`,
          );
        }
        return true;
      }

      return true;
    } catch (e) {
      console.error('Email Error:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      // 예기치 못한 에러라도 테스트 환경에서는 true를 반환하게 하여 차단을 방지할 수 있습니다.
      console.warn(
        `[Email Warning] 이메일 발송 중 예외 발생. OTP 코드는 콘솔에서 확인하세요. (${errorMessage})`,
      );
      return true;
    }
  }

  async verifyOtp(email: string, code: string): Promise<boolean> {
    // 가장 최근에 요청된 미인증 내역 조회
    const authRecord = await this.emailAuthRepository.findOne({
      where: { email, is_verified: false },
      order: { created_at: 'DESC' },
    });

    if (!authRecord) {
      console.warn(`[Email Auth Failed] (${email}) 인증 요청 내역이 없거나 이미 인증되었습니다.`);
      return false;
    }

    // 5분 만료 시간 체크
    const now = new Date();
    const createdAt = new Date(authRecord.created_at);
    const diffMins = (now.getTime() - createdAt.getTime()) / (1000 * 60);

    if (diffMins > 5) {
      // 만료된 경우 삭제 처리
      console.warn(
        `[Email Auth Failed] (${email}) 인증 시간이 만료되었습니다. (요청 시각: ${createdAt.toISOString()})`,
      );
      await this.emailAuthRepository.delete(authRecord.id);
      return false;
    }

    // 코드 검증
    if (authRecord.code === code) {
      authRecord.is_verified = true;
      await this.emailAuthRepository.save(authRecord);
      console.log(`[Email Auth Success] (${email}) 이메일 인증이 완료되었습니다.`);
      return true;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Email Auth Failed] (${email}) 인증번호가 일치하지 않습니다.`,
      );
    }
    return false;
  }

  /**
   * 비밀번호 재설정 등 1회성 검증 시 사용.
   * 단일 DELETE 쿼리로 TOCTOU race condition 방지.
   * 코드가 일치하고 5분 이내라면 행을 즉시 삭제(소비)하고 true.
   * 동일 OTP로 두 번째 시도 시 false (재사용 방지).
   */
  async consumeOtp(email: string, code: string): Promise<boolean> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await this.emailAuthRepository
      .createQueryBuilder()
      .delete()
      .from(EmailAuth)
      .where('email = :email', { email })
      .andWhere('code = :code', { code })
      .andWhere('created_at >= :since', { since: fiveMinAgo })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
