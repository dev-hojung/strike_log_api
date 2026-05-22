/**
 * 배지 카탈로그. DB가 아닌 코드에 선언해 변경/추가 시 마이그레이션 부담을 없앤다.
 *
 * 각 배지는 단일 BadgeKey 문자열로 식별되며, user_badges 테이블의
 * badge_key 컬럼과 1:1 매칭된다.
 */
export enum BadgeCategory {
  MILESTONE = 'milestone',
  SCORE = 'score',
  STRIKE = 'strike',
  SERIES = 'series',
  STREAK = 'streak',
  CLUB = 'club',
}

export interface BadgeDefinition {
  key: string;
  category: BadgeCategory;
  /** 표시용 한국어 이름 */
  name: string;
  /** 한 줄 설명 (조건/의의) */
  description: string;
  /** 정렬·진행률 계산을 위한 임계값 (예: 점수 200점 → 200). 없으면 null. */
  threshold: number | null;
}

/**
 * 카탈로그 정의 — 변경/추가 시 클라이언트의 표시는 자동 반영되지만,
 * 신규 key를 도입할 때는 게임/시리즈 저장 직후 호출되는 [BadgesService.checkAndAward]에
 * 해당 키의 평가 로직이 추가되어야 한다.
 */
export const BADGE_CATALOG: BadgeDefinition[] = [
  // 마일스톤
  { key: 'first_game', category: BadgeCategory.MILESTONE, name: '첫 경기', description: '첫 게임을 기록했어요.', threshold: 1 },
  { key: 'games_10', category: BadgeCategory.MILESTONE, name: '10경기 클럽', description: '총 10경기 달성', threshold: 10 },
  { key: 'games_50', category: BadgeCategory.MILESTONE, name: '50경기 클럽', description: '총 50경기 달성', threshold: 50 },
  { key: 'games_100', category: BadgeCategory.MILESTONE, name: '100경기 클럽', description: '총 100경기 달성', threshold: 100 },
  { key: 'games_500', category: BadgeCategory.MILESTONE, name: '500경기 마스터', description: '총 500경기 달성', threshold: 500 },

  // 점수
  { key: 'score_100', category: BadgeCategory.SCORE, name: '세자릿수', description: '한 게임 100점 첫 달성', threshold: 100 },
  { key: 'score_150', category: BadgeCategory.SCORE, name: '평균 이상', description: '한 게임 150점 첫 달성', threshold: 150 },
  { key: 'score_200', category: BadgeCategory.SCORE, name: '에버 200', description: '한 게임 200점 첫 달성', threshold: 200 },
  { key: 'score_250', category: BadgeCategory.SCORE, name: '에이스 250', description: '한 게임 250점 첫 달성', threshold: 250 },
  { key: 'score_perfect', category: BadgeCategory.SCORE, name: '퍼펙트 게임', description: '한 게임 300점 달성', threshold: 300 },

  // 스트라이크
  { key: 'strikes_5', category: BadgeCategory.STRIKE, name: '스트라이크 5', description: '한 게임에서 스트라이크 5개', threshold: 5 },
  { key: 'strikes_8', category: BadgeCategory.STRIKE, name: '스트라이크 8', description: '한 게임에서 스트라이크 8개', threshold: 8 },
  { key: 'strikes_10', category: BadgeCategory.STRIKE, name: '스트라이크 10+', description: '한 게임에서 스트라이크 10개 이상', threshold: 10 },
  { key: 'strikes_consecutive_5', category: BadgeCategory.STRIKE, name: '5연속 스트라이크', description: '한 게임에서 스트라이크 5연속', threshold: 5 },

  // 시리즈
  { key: 'series_first', category: BadgeCategory.SERIES, name: '첫 시리즈', description: '시리즈 첫 완주', threshold: 1 },
  { key: 'series_3_full', category: BadgeCategory.SERIES, name: '3게임 시리즈', description: '3게임 시리즈 완주', threshold: 3 },
  { key: 'series_avg_180', category: BadgeCategory.SERIES, name: '시리즈 에버 180', description: '시리즈 평균 180점 이상', threshold: 180 },
  { key: 'series_avg_200', category: BadgeCategory.SERIES, name: '시리즈 에버 200', description: '시리즈 평균 200점 이상', threshold: 200 },

  // Streak (출석)
  { key: 'streak_3', category: BadgeCategory.STREAK, name: '3일 연속', description: '3일 연속 게임 기록', threshold: 3 },
  { key: 'streak_7', category: BadgeCategory.STREAK, name: '7일 연속', description: '7일 연속 게임 기록', threshold: 7 },
  { key: 'streak_30', category: BadgeCategory.STREAK, name: '30일 연속', description: '30일 연속 게임 기록', threshold: 30 },
  { key: 'streak_100', category: BadgeCategory.STREAK, name: '100일 연속', description: '100일 연속 게임 기록', threshold: 100 },

  // 클럽
  { key: 'club_joined', category: BadgeCategory.CLUB, name: '클럽 가입', description: '첫 클럽 가입', threshold: 1 },
  { key: 'club_game_first', category: BadgeCategory.CLUB, name: '클럽 첫 경기', description: '첫 클럽 게임 참가', threshold: 1 },
  { key: 'club_game_win', category: BadgeCategory.CLUB, name: '클럽 우승', description: '클럽 게임 1위 달성', threshold: 1 },
];

export const BADGE_BY_KEY = new Map<string, BadgeDefinition>(
  BADGE_CATALOG.map((b) => [b.key, b]),
);
