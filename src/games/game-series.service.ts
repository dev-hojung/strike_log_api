import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { GameSeries } from './entities/game-series.entity';
import { Game } from './entities/game.entity';
import { GamesService } from './games.service';

/**
 * 시리즈(게임 묶음) 도메인 로직.
 *
 * 시리즈 라이프사이클:
 * 1. createSeries → started_at 기록, completed_at=null
 * 2. 게임 저장 시 series_id/series_index 함께 전달 (GamesService.createGame)
 * 3. 마지막 게임 저장 후 completeSeries → completed_at 채움
 *
 * 자동 완료 정책: target_game_count만큼 게임이 저장돼도 자동 종료하지 않는다.
 * (클라이언트가 명시적으로 호출 - 시리즈 도중 게임 추가/취소 여지 보존)
 */
@Injectable()
export class GameSeriesService {
  constructor(
    @InjectRepository(GameSeries)
    private readonly seriesRepository: Repository<GameSeries>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @Inject(forwardRef(() => GamesService))
    private readonly gamesService: GamesService,
  ) {}

  async createSeries(
    userId: string,
    body: { target_game_count: number; started_at?: string },
  ) {
    if (!Number.isInteger(body.target_game_count) || body.target_game_count < 1) {
      throw new ForbiddenException('target_game_count는 1 이상 정수여야 합니다.');
    }
    const series = this.seriesRepository.create({
      user_id: userId,
      target_game_count: body.target_game_count,
      started_at: body.started_at ? new Date(body.started_at) : new Date(),
      completed_at: null,
    });
    return this.seriesRepository.save(series);
  }

  async completeSeries(userId: string, seriesId: number) {
    const series = await this.seriesRepository.findOne({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException('시리즈를 찾을 수 없습니다.');
    if (series.user_id !== userId) {
      throw new ForbiddenException('본인 시리즈만 종료할 수 있습니다.');
    }
    if (!series.completed_at) {
      series.completed_at = new Date();
      await this.seriesRepository.save(series);

      // 시리즈 종료 직후 배지 평가 (시리즈 완주 관련 배지 트리거).
      // 비동기로 격리: 평가 실패가 시리즈 종료 응답에 영향을 주지 않도록.
      const games = await this.gameRepository.find({
        where: { series_id: seriesId },
      });
      const totalScore = games.reduce((acc, g) => acc + (g.total_score ?? 0), 0);
      this.gamesService
        .evaluateBadgesAndNotify(userId, {
          completedSeries: {
            id: series.id,
            total_score: totalScore,
            gameCount: games.length,
          },
        })
        .catch((err) =>
          console.error('[GameSeries] 배지 평가 실패:', err),
        );
    }
    return series;
  }

  async getSeriesWithGames(userId: string, seriesId: number) {
    const series = await this.seriesRepository.findOne({
      where: { id: seriesId },
    });
    if (!series) throw new NotFoundException('시리즈를 찾을 수 없습니다.');
    if (series.user_id !== userId) {
      throw new ForbiddenException('본인 시리즈만 조회할 수 있습니다.');
    }
    const games = await this.gameRepository.find({
      where: { series_id: seriesId },
      order: { series_index: 'ASC' },
      relations: ['frames'],
    });
    return this._toSummary(series, games);
  }

  async listRecentSeries(userId: string, limit = 10) {
    const seriesList = await this.seriesRepository.find({
      where: { user_id: userId },
      order: { started_at: 'DESC' },
      take: limit,
    });
    const ids = seriesList.map((s) => s.id);
    if (ids.length === 0) return [];

    // N+1 회피: 한 번에 모든 게임을 가져와 메모리 그룹화.
    const allGames = await this.gameRepository.find({
      where: { series_id: Not(IsNull()) },
      order: { series_index: 'ASC' },
      relations: ['frames'],
    });
    const gamesBySeries = new Map<number, Game[]>();
    for (const g of allGames) {
      if (g.series_id == null) continue;
      if (!ids.includes(g.series_id)) continue;
      const arr = gamesBySeries.get(g.series_id) ?? [];
      arr.push(g);
      gamesBySeries.set(g.series_id, arr);
    }

    return seriesList.map((s) =>
      this._toSummary(s, gamesBySeries.get(s.id) ?? []),
    );
  }

  /**
   * 베스트 시리즈: 완주된 시리즈 중 총점 최고. 미완주는 제외.
   */
  async getBestSeries(userId: string) {
    const completed = await this.seriesRepository.find({
      where: { user_id: userId, completed_at: Not(IsNull()) },
    });
    if (completed.length === 0) return null;

    const ids = completed.map((s) => s.id);
    const games = await this.gameRepository.find({
      where: { series_id: Not(IsNull()) },
    });
    const totalsBySeries = new Map<number, number>();
    for (const g of games) {
      if (g.series_id == null) continue;
      if (!ids.includes(g.series_id)) continue;
      totalsBySeries.set(
        g.series_id,
        (totalsBySeries.get(g.series_id) ?? 0) + g.total_score,
      );
    }

    let bestSeries: GameSeries | null = null;
    let bestTotal = -1;
    for (const s of completed) {
      const total = totalsBySeries.get(s.id) ?? 0;
      if (total > bestTotal) {
        bestTotal = total;
        bestSeries = s;
      }
    }
    if (!bestSeries) return null;
    // 베스트 시리즈에 한해서만 frames를 추가로 로드해 통계 계산 비용을 제한.
    const bestGames = await this.gameRepository.find({
      where: { series_id: bestSeries.id },
      order: { series_index: 'ASC' },
      relations: ['frames'],
    });
    return this._toSummary(bestSeries, bestGames);
  }

  private _toSummary(series: GameSeries, games: Game[]) {
    const totalScore = games.reduce((acc, g) => acc + (g.total_score ?? 0), 0);
    const average = games.length > 0 ? totalScore / games.length : 0;

    // 게임별 통계 (frames 관계가 로드된 경우에만 의미 있는 값. 미로드면 0)
    const gameStatsList = games.map((g) => this._statsForGame(g));

    // 시리즈 집계
    const aggStrikes = gameStatsList.reduce((a, s) => a + s.strikes, 0);
    const aggSpares = gameStatsList.reduce((a, s) => a + s.spares, 0);
    const aggOpens = gameStatsList.reduce((a, s) => a + s.opens, 0);
    const longestStrikeStreak = gameStatsList.reduce(
      (m, s) => Math.max(m, s.longest_strike_streak),
      0,
    );

    return {
      id: series.id,
      user_id: series.user_id,
      target_game_count: series.target_game_count,
      started_at: series.started_at,
      completed_at: series.completed_at,
      created_at: series.created_at,
      game_count: games.length,
      total_score: totalScore,
      average_score: Number(average.toFixed(2)),
      stats: {
        strikes: aggStrikes,
        spares: aggSpares,
        opens: aggOpens,
        longest_strike_streak: longestStrikeStreak,
      },
      games: games.map((g, i) => ({
        id: g.id,
        series_index: g.series_index,
        total_score: g.total_score,
        play_date: g.play_date,
        started_at: g.started_at,
        ended_at: g.ended_at,
        stats: gameStatsList[i],
      })),
    };
  }

  /**
   * 한 게임의 스트라이크/스페어/오픈 + 최장 연속 스트라이크 계산.
   * Frame 엔티티의 first_roll/second_roll/third_roll를 정규화된 frames 배열로 변환 후
   * 클라이언트의 BowlingScorer 규칙을 그대로 적용.
   * frames 관계가 로드되지 않은 경우 모두 0 반환.
   */
  private _statsForGame(game: Game): {
    strikes: number;
    spares: number;
    opens: number;
    longest_strike_streak: number;
  } {
    if (!game.frames || game.frames.length === 0) {
      return { strikes: 0, spares: 0, opens: 0, longest_strike_streak: 0 };
    }

    // 1~10 인덱스에 맞춘 frames 배열로 변환
    const arr: number[][] = Array.from({ length: 10 }, () => []);
    for (const f of game.frames) {
      const idx = (f.frame_number ?? 0) - 1;
      if (idx < 0 || idx > 9) continue;
      const pins: number[] = [];
      if (f.first_roll != null) pins.push(f.first_roll);
      if (f.second_roll != null) pins.push(f.second_roll);
      if (f.third_roll != null) pins.push(f.third_roll);
      arr[idx] = pins;
    }

    let strikes = 0;
    let spares = 0;
    let opens = 0;

    for (let i = 0; i < 10; i++) {
      const f = arr[i];
      if (f.length === 0) continue;
      if (i < 9) {
        if (f[0] === 10) strikes++;
        else if (f.length >= 2 && f[0] + f[1] === 10) spares++;
        else if (f.length >= 2) opens++;
      } else {
        if (f[0] === 10) strikes++;
        if (f.length >= 2) {
          if (f[0] !== 10 && f[0] + f[1] === 10) spares++;
          if (f[0] === 10 && f[1] === 10) strikes++;
          if (f[0] !== 10 && f[0] + f[1] < 10) opens++;
        }
        if (f.length >= 3) {
          if (f[2] === 10) strikes++;
          if (f[0] === 10 && f[1] !== 10 && f[1] + f[2] === 10) spares++;
        }
      }
    }

    // longest strike streak (BowlingScorer.longestStrikeStreak 규칙)
    let longest = 0;
    let current = 0;
    const hit = (isStrike: boolean) => {
      if (isStrike) {
        current++;
        if (current > longest) longest = current;
      } else {
        current = 0;
      }
    };
    for (let i = 0; i < 9; i++) {
      const f = arr[i];
      if (f.length === 0) return { strikes, spares, opens, longest_strike_streak: longest };
      hit(f[0] === 10);
    }
    const tenth = arr[9];
    if (tenth.length > 0) {
      hit(tenth[0] === 10);
      if (tenth.length >= 2) {
        if (tenth[0] === 10) hit(tenth[1] === 10);
        // 1구가 strike 아니면 2구는 strike 후보 아님 (스페어의 일부)
      }
      if (tenth.length >= 3) {
        const resetForThird =
          (tenth[0] === 10 && tenth[1] === 10) ||
          (tenth[0] !== 10 && tenth[0] + tenth[1] === 10);
        if (resetForThird) hit(tenth[2] === 10);
      }
    }
    return { strikes, spares, opens, longest_strike_streak: longest };
  }
}
