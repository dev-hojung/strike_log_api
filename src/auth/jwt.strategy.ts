import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * JWT payload에 실리는 사용자 정보.
 * `sub`은 JWT 표준 subject 클레임으로 user.id(uuid)를 담는다.
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * 요청에 주입되는 유저 객체. 컨트롤러에서 `@CurrentUser()`로 꺼내 쓴다.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException(
        'JWT_SECRET 환경변수가 설정되지 않았습니다.',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    // Passport가 이 반환값을 `req.user`에 주입.
    return { id: payload.sub, email: payload.email };
  }
}
