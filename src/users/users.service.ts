import {
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
import { JwtPayload } from '../auth/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
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
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const id = randomUUID();
    let hashedPassword = undefined;

    if (password) {
      const salt = await bcrypt.genSalt();
      hashedPassword = await bcrypt.hash(password, salt);
    }

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
   */
  async login(email: string, password?: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
    }

    if (user.password && password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('이메일 또는 비밀번호가 일치하지 않습니다.');
      }
    } else if (user.password && !password) {
      throw new UnauthorizedException('비밀번호를 입력해주세요.');
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
}
