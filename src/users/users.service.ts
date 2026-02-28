import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

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
