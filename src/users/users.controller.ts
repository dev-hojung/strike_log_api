import { LoginUserDto } from './dto/login-user.dto';
import { Controller, Get, Post, Body, Patch, Param, Delete, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * 이메일/비밀번호 로그인
   */
  @ApiOperation({ summary: '이메일/비밀번호 로그인' })
  @Public()
  @Post('login')
  async login(@Body() body: LoginUserDto) {
    return this.usersService.login(body.email, body.password);
  }

  @ApiOperation({ summary: '이메일/비밀번호 회원가입' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'password123' },
        nickname: { type: 'string', example: '볼링왕' },
      },
    },
  })
  @Public()
  @Post('signup')
  async signup(@Body() body: { email: string; password?: string; nickname?: string }) {
    return this.usersService.signup(body.email, body.password, body.nickname);
  }


  /**
   * 내 정보 조회
   */
  @ApiOperation({ summary: '유저 프로필 조회' })
  @ApiParam({ name: 'id', description: '유저 ID', example: 'uuid-1234' })
  @Get(':id')
  async getProfile(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    // 남의 프로필 접근 차단. 관리자는 예외 허용.

    const { isPlatformAdmin } = require('../common/admin') as {
      isPlatformAdmin: (uid: string) => boolean;
    };
    if (user.id !== id && !isPlatformAdmin(user.id)) {
      throw new ForbiddenException('다른 사용자의 프로필을 조회할 수 없습니다.');
    }
    const profile = await this.usersService.getProfile(id);
    return { ...profile, is_platform_admin: isPlatformAdmin(id) };
  }

  /**
   * 비밀번호 재설정 (로그아웃 상태 / OTP 기반).
   *
   * 흐름: 앱이 미리 /email/send-otp + /email/verify-otp로 사용자 확인 →
   *      본 엔드포인트로 OTP + 새 비밀번호 함께 전송 → 서버에서 OTP 1회 소비 후 갱신.
   */
  @ApiOperation({ summary: '비밀번호 재설정 (이메일 OTP 기반)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'code', 'newPassword'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        code: { type: 'string', example: '123456' },
        newPassword: { type: 'string', example: 'newPass8plus' },
      },
    },
  })
  @Public()
  @Post('forgot-password/reset')
  resetPasswordWithOtp(
    @Body() body: { email: string; code: string; newPassword: string },
  ) {
    return this.usersService.resetPasswordWithOtp(
      body.email,
      body.code,
      body.newPassword,
    );
  }

  /**
   * 비밀번호 변경
   */
  @ApiOperation({ summary: '비밀번호 변경' })
  @ApiParam({ name: 'id', description: '유저 ID', example: 'uuid-1234' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', example: 'oldPass123' },
        newPassword: { type: 'string', example: 'newPass456' },
      },
    },
  })
  @Post(':id/change-password')
  changePassword(
    @Param('id') id: string,
    @Body() body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.id !== id) {
      throw new ForbiddenException('본인만 비밀번호를 변경할 수 있습니다.');
    }
    return this.usersService.changePassword(id, body.currentPassword, body.newPassword);
  }

  /**
   * 내 정보 수정 (닉네임, 프로필 이미지 등)
   */
  @ApiOperation({ summary: '유저 프로필 수정' })
  @ApiParam({ name: 'id', description: '유저 ID', example: 'uuid-1234' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        nickname: { type: 'string', example: '새닉네임' },
        profile_image_url: { type: 'string', example: 'https://example.com/avatar.png' },
        phone: { type: 'string', example: '010-1234-5678' },
      },
    },
  })
  @Patch(':id')
  updateProfile(
    @Param('id') id: string,
    @Body() updateData: { nickname?: string; profile_image_url?: string; phone?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.id !== id) {
      throw new ForbiddenException('본인만 프로필을 수정할 수 있습니다.');
    }
    return this.usersService.updateProfile(id, updateData);
  }

  /**
   * 계정 삭제 (회원 탈퇴).
   * 본인 계정과 연관된 모든 데이터를 영구 삭제한다.
   */
  @ApiOperation({ summary: '계정 삭제 (회원 탈퇴)' })
  @Delete('me')
  async deleteMe(@CurrentUser('id') userId: string) {
    await this.usersService.deleteMe(userId);
    return { message: '계정이 삭제되었습니다.' };
  }
}
