import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBadge } from './entities/user-badge.entity';
import { AttendanceLog } from './entities/attendance-log.entity';
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
    @InjectRepository(AttendanceLog)
    private readonly attendanceRepository: Repository<AttendanceLog>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(GameSeries)
    private readonly seriesRepository: Repository<GameSeries>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
  ) {}

  /**
   * 앱 접속 시 출석 1회 기록.
   * 같은 KST 날짜에 여러 번 호출되어도 idempotent (PK 충돌 무시).
   * 호출 후 신규 streak 배지를 평가해서 결과 반환.
   */
  async recordAttendance(userId: string): Promise<{
    ymd: string;
    newlyRecorded: boolean;
    newlyEarnedBadges: string[];
  }> {
    const ymd = ymdToday();
    // PK가 (user_id, ymd_kst)라 같은 날 INSERT IGNORE 효과를 query builder로 구현.
    const result = await this.attendanceRepository
      .createQueryBuilder()
      .insert()
      .into(AttendanceLog)
      .values({ user_id: userId, ymd_kst: ymd })
      .orIgnore()
      .execute();

    // raw.affectedRows가 1이면 신규, 0이면 중복.
    const newlyRecorded = result.identifiers.length > 0 ||
      // 일부 드라이버에서 identifiers가 비어도 raw.affectedRows로 확인.
      ((result as unknown as { raw?: { affectedRows?: number } }).raw?.affectedRows ?? 0) > 0;

    // 첫 출석이 아니면 배지 평가 비용 절약.
    if (!newlyRecorded) {
      return { ymd, newlyRecorded: false, newlyEarnedBadges: [] };
    }

    const newlyEarnedBadges = await this.evaluateAndAward(userId);
    return { ymd, newlyRecorded: true, newlyEarnedBadges };
  }

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
    completedThreeGameSeriesCount: number;
    maxSeriesAvg: number;
    currentStreak: number;
    clubMembershipCount: number;
    clubGameCount: number;
    clubWinCount: number;
    maxStrikesInGame: number;
    maxConsecutiveStrikes: number;
  }> {
    const [
      totalGames,
      maxScoreRow,
      completedSeries,
      // game_series에 total_score 컬럼이 없으므로 자식 games를 SUM해서 시리즈별 평균 계산.
      // MAX(SUM(...))은 표준 SQL에서 직접 못 쓰므로 시리즈별 평균을 모두 받아 메모리에서 max 추출.
      seriesAvgRows,
      // 3게임 시리즈만 따로 카운트 (series_3_full 배지 평가용).
      completedThreeGameSeries,
      streak,
      clubMembershipCount,
      clubGameCount,
      clubWinCount,
      // 모든 게임의 frames를 메모리에서 집계해 한 게임 최대 스트라이크 / 최장 연속 추출.
      // 이력 평가 미지원으로 인해 strikes_5/8/10/consecutive_5가 과거 베스트를 무시하던 문제 해소.
      strikesStats,
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
        .innerJoin('s.games', 'g')
        .select('SUM(g.total_score) / s.target_game_count', 'avg_score')
        .where('s.user_id = :userId', { userId })
        .andWhere('s.completed_at IS NOT NULL')
        .groupBy('s.id')
        .addGroupBy('s.target_game_count')
        .getRawMany<{ avg_score: number | string }>(),
      this.seriesRepository
        .createQueryBuilder('s')
        .where('s.user_id = :userId', { userId })
        .andWhere('s.target_game_count = 3')
        .andWhere('s.completed_at IS NOT NULL')
        .getCount(),
      this.computeCurrentStreak(userId),
      this.groupMemberRepository.count({ where: { user_id: userId } }),
      this.gameRepository.count({ where: { user_id: userId, is_club_game: true } }),
      this.gameRepository.count({ where: { user_id: userId, is_club_game: true, club_rank: 1 } }),
      this.loadStrikesStats(userId),
    ]);

    const maxSeriesAvg = seriesAvgRows.length > 0
      ? Math.max(...seriesAvgRows.map((r) => Number(r.avg_score) || 0))
      : 0;

    return {
      totalGames,
      maxScore: Number(maxScoreRow?.max ?? 0),
      completedSeriesCount: completedSeries,
      completedThreeGameSeriesCount: completedThreeGameSeries,
      maxSeriesAvg,
      currentStreak: streak,
      clubMembershipCount,
      clubGameCount,
      clubWinCount,
      maxStrikesInGame: strikesStats.maxStrikes,
      maxConsecutiveStrikes: strikesStats.maxConsecutive,
    };
  }

  /**
   * 사용자의 모든 게임에서 한 게임 최대 스트라이크 수, 최장 연속 스트라이크를 집계.
   * frames를 JS에서 직접 훑어 [countStrikes]/[longestStrikeStreak]와 동일 규칙 적용.
   */
  private async loadStrikesStats(
    userId: string,
  ): Promise<{ maxStrikes: number; maxConsecutive: number }> {
    const games = await this.gameRepository.find({
      where: { user_id: userId },
      relations: ['frames'],
    });
    let maxStrikes = 0;
    let maxConsecutive = 0;
    for (const g of games) {
      const frames = g.frames ?? [];
      if (frames.length === 0) continue;
      const n = countStrikes(frames);
      if (n > maxStrikes) maxStrikes = n;
      const c = longestStrikeStreak(frames);
      if (c > maxConsecutive) maxConsecutive = c;
    }
    return { maxStrikes, maxConsecutive };
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
        // 방금 저장된 게임 또는 이력 전체 베스트 중 큰 값으로 평가.
        const frames = context.savedGame?.frames ?? [];
        const fromContext = frames.length > 0 ? countStrikes(frames) : 0;
        const best = Math.max(fromContext, stats.maxStrikesInGame);
        return best >= (def.threshold ?? Number.MAX_SAFE_INTEGER);
      }
      case 'strikes_consecutive_5': {
        const frames = context.savedGame?.frames ?? [];
        const fromContext = frames.length > 0 ? longestStrikeStreak(frames) : 0;
        return Math.max(fromContext, stats.maxConsecutiveStrikes) >= 5;
      }

      case 'series_first':
        return stats.completedSeriesCount >= 1;
      case 'series_3_full':
        // 이력의 3게임 시리즈 완주 1번 이상이거나, 방금 완주한 시리즈가 3게임 이상.
        return (
          stats.completedThreeGameSeriesCount >= 1 ||
          (!!context.completedSeries && context.completedSeries.gameCount >= 3)
        );
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
    // 출석 기준: attendance_logs.ymd_kst (앱 접속 기록).
    // (이전 구현: games.play_date 기반 — 게임 기록 없으면 streak 안 누적되던 문제)
    const rows = await this.attendanceRepository
      .createQueryBuilder('a')
      .select('a.ymd_kst', 'd')
      .where('a.user_id = :userId', { userId })
      .orderBy('a.ymd_kst', 'DESC')
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
    const rows = await this.attendanceRepository
      .createQueryBuilder('a')
      .select('a.ymd_kst', 'd')
      .where('a.user_id = :userId', { userId })
      .orderBy('a.ymd_kst', 'ASC')
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

// 모든 날짜 계산은 Asia/Seoul(KST) 기준으로 통일.
// 이유: 클라이언트는 KST yyyy-MM-dd로 play_date를 저장하지만 Railway 호스트는 UTC라
// 단순 new Date()를 쓰면 새벽~오전 사이 streak가 어긋남 (UTC 어제 vs KST 오늘).
const KST_TZ = 'Asia/Seoul';

function ymdToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: KST_TZ });
}

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: KST_TZ });
}

function ymdShift(s: string, deltaDays: number): string {
  // 정오 UTC로 Date 객체 생성 → ±deltaDays 후 KST yyyy-MM-dd 추출.
  // 정오를 기준점으로 잡으면 KST/UTC 어느 쪽에서 보더라도 자정 경계 문제 없음.
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return ymd(dt);
}
