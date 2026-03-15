import { LoginUserDto } from './dto/login-user.dto';
import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * 이메일/비밀번호 기반 회원가입
   *
   * @param body email, password, nickname 필드 포함
   * @returns 가입된 유저 정보
   */

  /**
   * 이메일/비밀번호 로그인
   */
  @Post('login')
  async login(@Body() body: LoginUserDto) {
    return this.usersService.login(body.email, body.password);
  }

  @Post('signup')
  async signup(@Body() body: { email: string; password?: string; nickname?: string }) {
    return this.usersService.signup(body.email, body.password, body.nickname);
  }

  /**
   * 로그인 후 호출: DB에 유저가 없으면 생성, 있으면 반환
   */
  @Post('sync')
  syncUser(@Body() body: { id: string; email: string }) {
    // 실제 운영에서는 Guards를 통해 토큰에서 id, email을 추출하는 것이 좋습니다.
    return this.usersService.syncUser(body.id, body.email);
  }

  /**
   * 내 정보 조회
   */
  @Get(':id')
  getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }

  /**
   * 내 정보 수정 (닉네임, 프로필 이미지 등)
   */
  @Patch(':id')
  updateProfile(
    @Param('id') id: string,
    @Body() updateData: { nickname?: string; profile_image_url?: string; phone?: string },
  ) {
    return this.usersService.updateProfile(id, updateData);
  }
}
