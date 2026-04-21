import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 해당 라우트를 인증 없이 접근 가능하게 표시.
 * 전역 JwtAuthGuard가 이 메타데이터를 읽어 통과시킨다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
