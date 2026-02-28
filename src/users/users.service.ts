import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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

    return this.userRepository.save(user);
  }

  /**
   * Supabase Auth 성공 시 DB에 유저 정보 동기화
   */
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
   * 내 프로필 정보 수정
   */
  async updateProfile(id: string, updateData: Partial<User>) {
    const user = await this.getProfile(id);
    Object.assign(user, updateData);
    return this.userRepository.save(user);
  }
}
