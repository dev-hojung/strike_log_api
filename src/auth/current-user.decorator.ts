import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './jwt.strategy';

/**
 * 컨트롤러에서 현재 인증된 유저를 꺼내는 파라미터 데코레이터.
 *
 * 사용:
 *   @Get('me')
 *   foo(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * `data`를 문자열로 넘기면 특정 필드만 추출 (`@CurrentUser('id') userId`).
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
