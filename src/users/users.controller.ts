import { LoginUserDto } from './dto/login-user.dto';
import { Controller, Get, Post, Body, Patch, Param, ForbiddenException } from '@nestjs/common';
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
   * 로그인 후 호출: DB에 유저가 없으면 생성, 있으면 반환
   */
  @ApiOperation({ summary: '소셜 로그인 후 유저 동기화 (없으면 생성)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['id', 'email'],
      properties: {
        id: { type: 'string', example: 'uuid-1234' },
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  @Public()
  @Post('sync')
  syncUser(@Body() body: { id: string; email: string }) {
    return this.usersService.syncUser(body.id, body.email);
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
}
