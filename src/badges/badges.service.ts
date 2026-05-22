import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBadge } from './entities/user-badge.entity';
import { BADGE_CATALOG, BadgeDefinition } from './badge-catalog';
import { Game } from '../games/entities/game.entity';
import { Frame } from '../games/entities/frame.entity';
import { GameSeries } from '../games/entities/game-series.entity';
import { GroupMember } from '../groups/entities/group-member.entity';

/**
 * 배지 평가 트리거 컨텍스트.
 * 게임 저장/시리즈 완료 등 도메인 이벤트에서 변경된 객체를 전달하면
 * 관련 카테고리만 평가해도 되지만, 단순화를 위해 현재는 전 카탈로그를 평가한다.
 */
export interface BadgeEvalContext {
  savedGame?: { id: number; total_score: number; frames?: Frame[]; is_club_game: boolean; club_rank?: number | null };
  completedSeries?: { id: number; total_score: number; gameCount: number };
}

export interface BadgeStatusItem {
  key: string;
  category: string;
  name: string;
  description: string;
  threshold: number | null;
  earned: boolean;
  earnedAt: Date | null;
}

@Injectable()
export class BadgesService {
  constructor(
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(GameSeries)
    private readonly seriesRepository: Repository<GameSeries>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
  ) {}

  /**
   * 사용자의 모든 배지를 평가하고, 신규 획득분만 DB에 insert한 뒤 신규 키 목록을 반환.
   * 호출 시점: 게임 저장 직후 / 시리즈 완료 직후.
   *
   * 이미 획득한 배지는 평가 자체를 건너뛴다.
   * 신규 획득은 알림 발송 등 후속 처리에 사용.
   */
  async checkAndAward(userId: string, context: BadgeEvalContext = {}): Promise<string[]> {
    const owned = await this.getOwnedKeys(userId);
    const stats = await this.loadStatsForEvaluation(userId);

    const newlyEarned: string[] = [];
    for (const def of BADGE_CATALOG) {
      if (owned.has(def.key)) continue;
      if (!this.evaluate(def, stats, context)) continue;

      try {
        await this.userBadgeRepository.insert({ user_id: userId, badge_key: def.key });
        newlyEarned.push(def.key);
      } catch (err) {
        // UNIQUE 위반 (동시 평가 race condition) → 무시
        if (!String(err).includes('ER_DUP_ENTRY')) throw err;
      }
    }
    return newlyEarned;
  }

  /**
   * 사용자 카탈로그 — 전체 배지 + 획득 여부.
   */
  async getStatusForUser(userId: string): Promise<BadgeStatusItem[]> {
    const earnedRows = await this.userBadgeRepository.find({ where: { user_id: userId } });
    const earnedMap = new Map(earnedRows.map((r) => [r.badge_key, r.earned_at]));
    return BADGE_CATALOG.map((def) => ({
      key: def.key,
      category: def.category,
      name: def.name,
      description: def.description,
      threshold: def.threshold,
      earned: earnedMap.has(def.key),
      earnedAt: earnedMap.get(def.key) ?? null,
    }));
  }

  /**
   * 최근 획득한 배지 [limit]개 (earned_at desc).
   */
  async getRecentEarned(userId: string, limit = 5): Promise<BadgeStatusItem[]> {
    const rows = await this.userBadgeRepository.find({
      where: { user_id: userId },
      order: { earned_at: 'DESC' },
      take: limit,
    });
    return rows.map((r) => {
      const def = BADGE_CATALOG.find((b) => b.key === r.badge_key);
      return {
        key: r.badge_key,
        category: def?.category ?? '',
        name: def?.name ?? r.badge_key,
        description: def?.description ?? '',
        threshold: def?.threshold ?? null,
        earned: true,
        earnedAt: r.earned_at,
      };
    });
  }

  // ---------- 내부 평가 ----------

  private async getOwnedKeys(userId: string): Promise<Set<string>> {
    const rows = await this.userBadgeRepository.find({ where: { user_id: userId } });
    return new Set(rows.map((r) => r.badge_key));
  }

  private async loadStatsForEvaluation(userId: string): Promise<{
    totalGames: number;
    maxScore: number;
    completedSeriesCount: number;
    maxSeriesAvg: number;
    currentStreak: number;
    clubMembershipCount: number;
    clubGameCount: number;
    clubWinCount: number;
  }> {
    const [
      totalGames,
      maxScoreRow,
      completedSeries,
      bestSeriesRow,
      streak,
      clubMembershipCount,
      clubGameCount,
      clubWinCount,
    ] = await Promise.all([
      this.gameRepository.count({ where: { user_id: userId } }),
      this.gameRepository
        .createQueryBuilder('g')
        .select('MAX(g.total_score)', 'max')
        .where('g.user_id = :userId', { userId })
        .getRawOne<{ max: number | null }>(),
      this.seriesRepository.count({ where: { user_id: userId } } as any),
      this.seriesRepository
        .createQueryBuilder('s')
        .select('MAX(s.total_score / s.target_game_count)', 'avg')
        .where('s.user_id = :userId', { userId })
        .andWhere('s.completed_at IS NOT NULL')
        .getRawOne<{ avg: number | null }>(),
      this.computeCurrentStreak(userId),
      this.groupMemberRepository.count({ where: { user_id: userId } }),
      this.gameRepository.count({ where: { user_id: userId, is_club_game: true } }),
      this.gameRepository.count({ where: { user_id: userId, is_club_game: true, club_rank: 1 } }),
    ]);

    return {
      totalGames,
      maxScore: Number(maxScoreRow?.max ?? 0),
      completedSeriesCount: completedSeries,
      maxSeriesAvg: Number(bestSeriesRow?.avg ?? 0),
      currentStreak: streak,
      clubMembershipCount,
      clubGameCount,
      clubWinCount,
    };
  }

  private evaluate(
    def: BadgeDefinition,
    stats: Awaited<ReturnType<BadgesService['loadStatsForEvaluation']>>,
    context: BadgeEvalContext,
  ): boolean {
    switch (def.key) {
      case 'first_game':
        return stats.totalGames >= 1;
      case 'games_10':
        return stats.totalGames >= 10;
      case 'games_50':
        return stats.totalGames >= 50;
      case 'games_100':
        return stats.totalGames >= 100;
      case 'games_500':
        return stats.totalGames >= 500;

      case 'score_100':
        return stats.maxScore >= 100;
      case 'score_150':
        return stats.maxScore >= 150;
      case 'score_200':
        return stats.maxScore >= 200;
      case 'score_250':
        return stats.maxScore >= 250;
      case 'score_perfect':
        return stats.maxScore >= 300;

      case 'strikes_5':
      case 'strikes_8':
      case 'strikes_10': {
        // 방금 저장된 게임의 스트라이크 카운트 (이력 게임은 추후 백필 시 평가).
        const frames = context.savedGame?.frames ?? [];
        const n = countStrikes(frames);
        return n >= (def.threshold ?? Number.MAX_SAFE_INTEGER);
      }
      case 'strikes_consecutive_5': {
        const frames = context.savedGame?.frames ?? [];
        return longestStrikeStreak(frames) >= 5;
      }

      case 'series_first':
        return stats.completedSeriesCount >= 1;
      case 'series_3_full':
        return !!context.completedSeries && context.completedSeries.gameCount >= 3;
      case 'series_avg_180':
        return stats.maxSeriesAvg >= 180;
      case 'series_avg_200':
        return stats.maxSeriesAvg >= 200;

      case 'streak_3':
        return stats.currentStreak >= 3;
      case 'streak_7':
        return stats.currentStreak >= 7;
      case 'streak_30':
        return stats.currentStreak >= 30;
      case 'streak_100':
        return stats.currentStreak >= 100;

      case 'club_joined':
        return stats.clubMembershipCount >= 1;
      case 'club_game_first':
        return stats.clubGameCount >= 1;
      case 'club_game_win':
        // 방금 저장된 게임 또는 기존 클럽 우승 누적
        return (
          stats.clubWinCount >= 1 ||
          (!!context.savedGame?.is_club_game && context.savedGame.club_rank === 1)
        );

      default:
        return false;
    }
  }

  /**
   * 출석 streak — 게임을 기록한 distinct play_date 기준 연속 일수.
   * 최근 기록일이 오늘 또는 어제여야 인정.
   */
  async computeCurrentStreak(userId: string): Promise<number> {
    const rows = await this.gameRepository
      .createQueryBuilder('g')
      .select('DISTINCT DATE_FORMAT(g.play_date, "%Y-%m-%d")', 'd')
      .where('g.user_id = :userId', { userId })
      .orderBy('d', 'DESC')
      .limit(400)
      .getRawMany<{ d: string }>();

    const dates = rows.map((r) => r.d);
    if (dates.length === 0) return 0;

    const today = ymdToday();
    const yesterday = ymdShift(today, -1);

    // 첫 날짜가 오늘 또는 어제일 때만 streak로 인정 (오늘 미기록은 어제까지 OK).
    let cursor: string;
    if (dates[0] === today) cursor = today;
    else if (dates[0] === yesterday) cursor = yesterday;
    else return 0;

    let streak = 0;
    for (const d of dates) {
      if (d === cursor) {
        streak++;
        cursor = ymdShift(cursor, -1);
      } else if (d < cursor) {
        break;
      }
    }
    return streak;
  }

  /**
   * 최장 streak — 전체 distinct play_date 시퀀스에서 연속 구간 최댓값.
   */
  async computeLongestStreak(userId: string): Promise<number> {
    const rows = await this.gameRepository
      .createQueryBuilder('g')
      .select('DISTINCT DATE_FORMAT(g.play_date, "%Y-%m-%d")', 'd')
      .where('g.user_id = :userId', { userId })
      .orderBy('d', 'ASC')
      .getRawMany<{ d: string }>();
    const dates = rows.map((r) => r.d);
    if (dates.length === 0) return 0;

    let longest = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] === ymdShift(dates[i - 1], 1)) {
        cur++;
        if (cur > longest) longest = cur;
      } else {
        cur = 1;
      }
    }
    return longest;
  }
}

// -------- helpers --------

function countStrikes(frames: Frame[]): number {
  let n = 0;
  for (const f of frames) {
    if (f.first_roll === 10) n++;
    if (f.frame_number === 10) {
      if (f.second_roll === 10) n++;
      if (f.third_roll === 10) n++;
    }
  }
  return n;
}

function longestStrikeStreak(frames: Frame[]): number {
  const seq: boolean[] = [];
  const sorted = [...frames].sort((a, b) => a.frame_number - b.frame_number);
  for (const f of sorted) {
    if (f.frame_number < 10) {
      seq.push(f.first_roll === 10);
    } else {
      seq.push(f.first_roll === 10);
      if (f.second_roll != null) seq.push(f.second_roll === 10);
      if (f.third_roll != null) seq.push(f.third_roll === 10);
    }
  }
  let max = 0;
  let cur = 0;
  for (const s of seq) {
    if (s) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function ymdToday(): string {
  const d = new Date();
  return ymd(d);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdShift(s: string, deltaDays: number): string {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return ymd(dt);
}
