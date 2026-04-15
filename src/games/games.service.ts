import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
  ) {}

  /**
   * 새로운 볼링 게임 기록 생성
   * 클럽 게임이면 [is_club_game], [room_id], [club_rank]를 함께 전달해 메타데이터를 보존한다.
   */
  async createGame(
    user_id: string,
    createData: {
      total_score: number;
      play_date?: Date;
      location?: string;
      frames?: Frame[];
      is_club_game?: boolean;
      room_id?: string | null;
      club_rank?: number | null;
    },
  ) {
    const game = this.gameRepository.create({
      user_id,
      total_score: createData.total_score,
      play_date: createData.play_date || new Date(),
      location: createData.location,
      frames: createData.frames, // typeorm이 Frame 엔티티들을 cascade=true로 함께 생성해 줌
      is_club_game: createData.is_club_game ?? false,
      room_id: createData.room_id ?? null,
      club_rank: createData.club_rank ?? null,
    });
    return this.gameRepository.save(game);
  }

  /**
   * 같은 방 코드(room_id)로 저장된 모든 참가자의 클럽 게임 기록 조회
   * 저장이 완료된 참가자만 포함되며, total_score 내림차순으로 정렬된다.
   */
  async getClubGameByRoom(room_id: string) {
    const games = await this.gameRepository.find({
      where: { room_id, is_club_game: true },
      relations: ['user', 'frames'],
      order: { total_score: 'DESC', created_at: 'ASC' },
    });
    if (games.length === 0) {
      throw new NotFoundException('해당 방의 저장된 클럽 게임 기록이 없습니다.');
    }
    return games;
  }

  /**
   * 유저의 볼링 통계 정보 (평균, 최고 점수, 최근 10경기) 조회
   */
  async getUserStatistics(user_id: string) {
    const allGames = await this.gameRepository.find({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });

    if (allGames.length === 0) {
      return {
        averageScore: 0,
        highestScore: 0,
        highestScoreDate: null,
        recentTrend: [],
        monthlyTrend: { status: 'none' },
      };
    }

    const totalScoreSum = allGames.reduce((sum, game) => sum + game.total_score, 0);
    const averageScore = Math.round(totalScoreSum / allGames.length);

    let highestScore = 0;
    let highestScoreDate: Date | null = null;
    allGames.forEach((game) => {
      if (game.total_score > highestScore) {
        highestScore = game.total_score;
        highestScoreDate = game.play_date;
      }
    });

    // 최근 10경기는 최신순으로 정렬되어 있으므로 처음 10개를 가져와서, 차트에 그리기 위해 오래된 순으로 역순 정렬
    const recentTrend = allGames
      .slice(0, 10)
      .reverse()
      .map((game) => ({
        score: game.total_score,
        date: game.play_date,
      }));

    // 이번 달 / 지난 달 에버리지 비교 (지난달 대비 상승률 계산)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 지난 달의 연도/월 계산 (1월이면 전년 12월로)
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // 이번 달 경기 필터링
    const thisMonthGames = allGames.filter((game) => {
      const d = new Date(game.play_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // 지난 달 경기 필터링
    const lastMonthGames = allGames.filter((game) => {
      const d = new Date(game.play_date);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });

    // 월별 에버리지 및 변동률 계산 (4가지 시나리오 구분)
    const thisMonthAvg =
      thisMonthGames.length > 0
        ? Math.round(
            thisMonthGames.reduce((sum, g) => sum + g.total_score, 0) / thisMonthGames.length,
          )
        : null;
    const lastMonthAvg =
      lastMonthGames.length > 0
        ? Math.round(
            lastMonthGames.reduce((sum, g) => sum + g.total_score, 0) / lastMonthGames.length,
          )
        : null;

    let monthlyTrend: Record<string, unknown>;

    if (thisMonthAvg !== null && lastMonthAvg !== null && lastMonthAvg > 0) {
      // 양쪽 데이터 모두 있음 → 퍼센트 변동률 계산
      monthlyTrend = {
        status: 'both',
        currentMonthAvg: thisMonthAvg,
        lastMonthAvg: lastMonthAvg,
        percentage: parseFloat((((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100).toFixed(1)),
        currentMonthGameCount: thisMonthGames.length,
      };
    } else if (thisMonthAvg !== null && lastMonthAvg === null) {
      // 이번 달만 데이터 있음
      monthlyTrend = {
        status: 'current_only',
        currentMonthAvg: thisMonthAvg,
        currentMonthGameCount: thisMonthGames.length,
      };
    } else if (thisMonthAvg === null && lastMonthAvg !== null) {
      // 지난달만 데이터 있음
      monthlyTrend = {
        status: 'last_only',
        lastMonthAvg: lastMonthAvg,
      };
    } else {
      // 양쪽 모두 데이터 없음
      monthlyTrend = { status: 'none' };
    }

    return {
      averageScore,
      highestScore,
      highestScoreDate,
      recentTrend,
      monthlyTrend,
    };
  }

  /**
   * 최근 게임 1건 조회
   */
  async getRecentGame(user_id: string) {
    const game = await this.gameRepository.findOne({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });
    if (!game) {
      throw new NotFoundException('최근 게임 기록이 없습니다.');
    }
    return game;
  }

  /**
   * 내 게임 기록 목록 조회
   */
  async getMyGames(user_id: string) {
    return this.gameRepository.find({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });
  }

  /**
   * 특정 게임의 상세 정보(프레임 포함) 조회
   */
  async getGameDetail(id: number, user_id: string) {
    const game = await this.gameRepository.findOne({
      where: { id, user_id },
      relations: ['frames'], // 프레임 기록 함께 반환
    });

    if (!game) {
      throw new NotFoundException('해당 게임 기록을 찾을 수 없습니다.');
    }
    return game;
  }

  /**
   * 이번 달 프레임 통계 (스트라이크, 스페어, 오픈, 올커버 게임 수)
   */
  async getMonthlyFrameStats(user_id: string) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // 이번 달 게임 + 프레임 조회
    const allGames = await this.gameRepository.find({
      where: { user_id },
      relations: ['frames'],
      order: { play_date: 'DESC' },
    });

    const thisMonthGames = allGames.filter((game) => {
      const d = new Date(game.play_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    let strikes = 0;
    let spares = 0;
    let opens = 0;
    let allCoverGames = 0;

    for (const game of thisMonthGames) {
      if (!game.frames || game.frames.length === 0) continue;

      let gameHasOpen = false;

      for (const frame of game.frames) {
        if (frame.frame_number <= 9) {
          // 1~9프레임
          if (frame.first_roll === 10) {
            strikes++;
          } else if (
            frame.first_roll != null &&
            frame.second_roll != null &&
            frame.first_roll + frame.second_roll === 10
          ) {
            spares++;
          } else {
            opens++;
            gameHasOpen = true;
          }
        } else {
          // 10프레임
          if (frame.first_roll === 10) {
            strikes++;
            if (frame.second_roll === 10) {
              strikes++;
              if (frame.third_roll === 10) {
                strikes++;
              } else if (frame.third_roll != null) {
                // 3구째는 단독 판정 불가 (보너스 투구)
              }
            } else if (
              frame.second_roll != null &&
              frame.third_roll != null
            ) {
              if (frame.second_roll + frame.third_roll === 10) {
                spares++;
              } else {
                opens++;
                gameHasOpen = true;
              }
            }
          } else if (
            frame.first_roll != null &&
            frame.second_roll != null &&
            frame.first_roll + frame.second_roll === 10
          ) {
            spares++;
            if (frame.third_roll === 10) {
              strikes++;
            }
          } else {
            opens++;
            gameHasOpen = true;
          }
        }
      }

      if (!gameHasOpen && game.frames.length >= 10) {
        allCoverGames++;
      }
    }

    return {
      strikes,
      spares,
      opens,
      allCoverGames,
      gameCount: thisMonthGames.length,
    };
  }
}
