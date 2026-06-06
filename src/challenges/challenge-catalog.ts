/**
 * 주간 챌린지 카탈로그.
 *
 * 정적 데이터로 보관. 매주 KST 월요일 00:00 ~ 일요일 23:59 자동 진행.
 * 별도 사용자 진행 테이블 없이 games 테이블 집계로 매번 실시간 계산.
 */

export enum WeeklyChallengeKey {
  GAMES_5 = 'weekly_games_5',
  AVG_180 = 'weekly_avg_180',
  STRIKES_30 = 'weekly_strikes_30',
}

export interface WeeklyChallengeDefinition {
  key: WeeklyChallengeKey;
  /** 표시용 한국어 이름 */
  name: string;
  /** 한 줄 설명 */
  description: string;
  /** 달성 목표값 (예: 5게임 → 5, 평균 180 → 180, 스트라이크 30 → 30) */
  target: number;
  /** 진행률 단위 (UI 표시용) */
  unit: string;
}

export const WEEKLY_CHALLENGES: WeeklyChallengeDefinition[] = [
  {
    key: WeeklyChallengeKey.GAMES_5,
    name: '5게임 도전',
    description: '이번 주 게임 5판 이상 기록',
    target: 5,
    unit: '게임',
  },
  {
    key: WeeklyChallengeKey.AVG_180,
    name: '에버 180 챌린지',
    description: '이번 주 평균 180점 이상 (3게임 이상)',
    target: 180,
    unit: '점',
  },
  {
    key: WeeklyChallengeKey.STRIKES_30,
    name: '스트라이크 헌터',
    description: '이번 주 스트라이크 30개 달성',
    target: 30,
    unit: '개',
  },
];

export const CHALLENGE_BY_KEY = new Map<WeeklyChallengeKey, WeeklyChallengeDefinition>(
  WEEKLY_CHALLENGES.map((c) => [c.key, c]),
);
