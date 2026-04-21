/**
 * 플랫폼 관리자 판별 유틸.
 * `ADMIN_USER_IDS` 환경변수에 콤마로 구분된 UUID 목록을 지정한다.
 * 예: ADMIN_USER_IDS="uuid-aaa,uuid-bbb"
 */
export function isPlatformAdmin(userId: string | undefined | null): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS ?? '';
  if (!raw.trim()) return false;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

export function platformAdminIds(): string[] {
  const raw = process.env.ADMIN_USER_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
