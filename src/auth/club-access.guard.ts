import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './jwt.strategy';
import { isPlatformAdmin } from '../common/admin';
import { GroupsService } from '../groups/groups.service';

/**
 * 클럽 구독(체험 또는 정식)이 활성인 유저만 통과시키는 가드.
 *
 * 통과 조건:
 *  - isPlatformAdmin(user.id) — 어드민 면제
 *  - 가입한 클럽 중 subscription_status가 ACTIVE이거나, TRIAL이고 만료 전인 클럽이 있음
 *    (GroupsService.hasActiveClubAccess — 게임 룸 게이트와 동일 기준)
 *
 * — createGroup / join-request 같이 클럽 가입을 시작시키는 액션에는 이 가드를 붙이지 말 것.
 *
 * 에러 응답:
 *  403 { statusCode: 403, message: '...', code: 'club_trial_expired' }
 */
@Injectable()
export class ClubAccessGuard implements CanActivate {
  constructor(private readonly groupsService: GroupsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.id) {
      throw new ForbiddenException({
        statusCode: 403,
        message: '클럽 구독이 만료됐어요. 관리자에게 문의해주세요.',
        code: 'club_trial_expired',
      });
    }

    if (isPlatformAdmin(user.id)) return true;

    const hasAccess = await this.groupsService.hasActiveClubAccess(user.id);
    if (!hasAccess) {
      throw new ForbiddenException({
        statusCode: 403,
        message: '클럽 구독이 만료됐어요. 관리자에게 문의해주세요.',
        code: 'club_trial_expired',
      });
    }

    return true;
  }
}
