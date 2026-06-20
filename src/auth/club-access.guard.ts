import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './jwt.strategy';
import { isPlatformAdmin } from '../common/admin';
import { UsersService } from '../users/users.service';

/**
 * 클럽 무료 체험 기간이 활성 상태인 유저만 통과시키는 가드.
 *
 * 통과 조건:
 *  - isPlatformAdmin(user.id) — 어드민 면제
 *  - user.club_trial_expires_at != null AND now < expires_at
 *
 * not_started(아직 시작 안 함) 상태는 차단된다.
 * — createGroup / join-request 같이 trial을 시작시키는 액션에는 이 가드를 붙이지 말 것.
 *    (service 내부에서 ensureClubTrialStarted를 먼저 호출하기 때문)
 *
 * 에러 응답:
 *  403 { statusCode: 403, message: '...', code: 'club_trial_expired' }
 */
@Injectable()
export class ClubAccessGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.id) {
      throw new ForbiddenException({
        statusCode: 403,
        message: '클럽 무료 체험 기간이 종료됐어요. 관리자에게 문의해주세요.',
        code: 'club_trial_expired',
      });
    }

    if (isPlatformAdmin(user.id)) return true;

    const userEntity = await this.usersService.findById(user.id);
    if (
      !userEntity?.club_trial_expires_at ||
      userEntity.club_trial_expires_at.getTime() <= Date.now()
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        message: '클럽 무료 체험 기간이 종료됐어요. 관리자에게 문의해주세요.',
        code: 'club_trial_expired',
      });
    }

    return true;
  }
}
