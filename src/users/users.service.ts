import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './entities/user.entity';
import { FcmToken } from '../notifications/entities/fcm-token.entity';
import { JwtPayload } from '../auth/jwt.strategy';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * 유저 레코드로부터 JWT 발급. 응답에 access_token + 기본 프로필을 함께 담는다.
   */
  private issueToken(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    const { password: _omit, ...safe } = user;
    return { access_token, user: safe };
  }

  /**
   * 이메일과 비밀번호를 사용하여 회원가입을 진행합니다.
   *
   * @param email 사용자 이메일
   * @param password 평문 비밀번호 (해싱 전)
   * @param nickname 선택적 닉네임
   * @returns 생성된 사용자 정보
   * @throws ConflictException 이미 존재하는 이메일일 경우 발생
   */
  async signup(email: string, password?: string, nickname?: string) {
    // 비밀번호 필수. 빈 문자열도 허용 안 함 — 이전 구현은 password 누락 시 NULL로 저장되어
    // 이후 어떤 비밀번호로도 로그인 통과되는 버그가 있었음 (login 수정으로 차단됐지만
    // 가입 단계에서도 함께 막아 부적합 계정 자체가 안 생기게 한다).
    if (!password || password.length < 8) {
      throw new BadRequestException('비밀번호는 8자 이상이어야 합니다.');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const id = randomUUID();
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = this.userRepository.create({
      id,
      email,
      password: hashedPassword,
      nickname: nickname || email.split('@')[0], // 닉네임 미입력 시 이메일 아이디 사용
    });

    const saved = await this.userRepository.save(user);
    return this.issueToken(saved);
  }

  /**
   * Supabase Auth 성공 시 DB에 유저 정보 동기화
   */

  /**
   * 이메일과 비밀번호를 사용하여 로그인을 진행합니다.
   *
   * 모든 경로에서 반드시 비밀번호 검증을 거치도록 한다.
   * (이전 구현은 user.password가 NULL이면 어떤 비밀번호든 통과되는 버그가 있었음)
   */
  async login(email: string, password?: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    // 비밀번호 미설정 계정(예: syncUser로 생성된 OAuth 임시 계정)은 로그인 자체를 차단.
    // 가입을 완료해서 비밀번호를 설정한 뒤 로그인해야 한다.
    if (!user.password) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }
    if (!password) {
      throw new UnauthorizedException('비밀번호를 입력해주세요.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    return this.issueToken(user);
  }

  async syncUser(id: string, email: string) {
    let user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      user = this.userRepository.create({ id, email });
      await this.userRepository.save(user);
    }
    return user;
  }

  /**
   * 내 프로필 정보 조회
   */
  async getProfile(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }
    return user;
  }

  /**
   * 이메일 OTP 검증 후 비밀번호 재설정 (forgot-password 플로우).
   *
   * 보안 고려:
   *   - OTP는 EmailService.consumeOtp가 1회성으로 소비 (재사용 방지)
   *   - 사용자 존재 누설 방지를 위해 모든 실패는 동일한 401 메시지로 반환
   *   - newPassword 8자 이상 강제
   *
   * 흐름: 앱이 먼저 /email/send-otp + /email/verify-otp로 사용자 확인 → 본 엔드포인트로
   * 새 비밀번호 + 같은 OTP 코드 다시 보내서 소비 + 비밀번호 갱신.
   */
  async resetPasswordWithOtp(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('비밀번호는 8자 이상이어야 합니다.');
    }
    if (!email || !code) {
      throw new BadRequestException('인증번호가 일치하지 않거나 만료되었습니다.');
    }

    const consumed = await this.emailService.consumeOtp(email, code);
    if (!consumed) {
      throw new UnauthorizedException('인증번호가 일치하지 않거나 만료되었습니다.');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      // OTP는 이미 소비됐지만 사용자가 없으면 의미 없음. 동일한 메시지로 응답.
      throw new UnauthorizedException('인증번호가 일치하지 않거나 만료되었습니다.');
    }

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    await this.userRepository.save(user);

    return { message: '비밀번호가 변경되었습니다.' };
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('유저를 찾을 수 없습니다.');
    }

    if (!user.password) {
      throw new UnauthorizedException('비밀번호가 설정되지 않은 계정입니다.');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('현재 비밀번호가 일치하지 않습니다.');
    }

    const salt = await bcrypt.genSalt();
    user.password = await bcrypt.hash(newPassword, salt);
    await this.userRepository.save(user);

    return { message: '비밀번호가 변경되었습니다.' };
  }

  /**
   * 내 프로필 정보 수정
   */
  async updateProfile(id: string, updateData: Partial<User>) {
    const user = await this.getProfile(id);
    Object.assign(user, updateData);
    return this.userRepository.save(user);
  }

  /**
   * 회원 탈퇴 — 본인 계정과 연관된 모든 데이터를 삭제한다.
   *
   * 삭제 범위:
   * - games / frames / game_series — FK CASCADE
   * - group_members / group_join_requests / group_creation_requests — FK CASCADE
   * - notifications / user_badges — FK CASCADE
   * - fcm_tokens — userId 컬럼만 있고 FK relation 없으므로 직접 삭제
   * - users 본 행
   *
   * 그룹(클럽) 자체는 삭제하지 않는다. 사용자가 만든 클럽이라도 다른 멤버가 남아 있다면 보존.
   *
   * @throws NotFoundException 대상 사용자가 존재하지 않을 때
   */
  async deleteMe(userId: string): Promise<void> {
    // FCM 토큰은 onDelete CASCADE가 없어 별도 정리.
    await this.fcmTokenRepository.delete({ userId });

    const result = await this.userRepository.delete({ id: userId });
    if (result.affected === 0) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
  }
}
