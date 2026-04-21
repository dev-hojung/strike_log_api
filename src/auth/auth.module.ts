import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

/**
 * JWT 전략을 등록하고, 다른 모듈에서 `JwtService`를 주입받을 수 있도록 JwtModule을 재익스포트한다.
 *
 * 환경변수:
 *   JWT_SECRET      — 서명/검증 시크릿 (필수)
 *   JWT_EXPIRES_IN  — 액세스 토큰 유효기간 (기본 7d)
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          // `expiresIn`은 ms 문자열("7d", "1h") 또는 숫자(초) 허용.
          // @types/ms의 리터럴 타입을 만족시키려면 타입 단언 필요.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as unknown as number,
        },
      }),
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
