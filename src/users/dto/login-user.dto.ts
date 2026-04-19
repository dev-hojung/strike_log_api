import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
  @ApiProperty({ example: 'user@example.com', description: '이메일 주소' })
  email!: string;

  @ApiProperty({ example: 'password123', description: '비밀번호' })
  password!: string;
}
