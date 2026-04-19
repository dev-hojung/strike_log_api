import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 새로운 볼링 게임 기록 생성
   * 클럽 게임이면 해당 클럽 멤버 전원에게 알림을 보낸다.
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
      started_at?: string | null;
      ended_at?: string | null;
    },
  ) {
    const game = this.gameRepository.create({
      user_id,
      total_score: createData.total_score,
      play_date: createData.play_date || new Date(),
      location: createData.location,
      frames: createData.frames,
      is_club_game: createData.is_club_game ?? false,
      room_id: createData.room_id ?? null,
      club_rank: createData.club_rank ?? null,
      started_at: createData.started_at ? new Date(createData.started_at) : null,
      ended_at: createData.ended_at ? new Date(createData.ended_at) : null,
    });
    const saved = await this.gameRepository.save(game);

    // 클럽 게임인 경우 같은 클럽 멤버들에게 알림 (비동기, 실패해도 게임 저장은 성공)
    if (createData.is_club_game) {
      this.notifyClubGameCreated(user_id, saved.id).catch((err) =>
        console.error('[Games] 클럽 게임 알림 전송 실패:', err),
      );
    }

    return saved;
  }

  /**
   * 클럽 게임 생성 알림을 해당 클럽 멤버 전원(생성자 제외)에게 전송
   */
  private async notifyClubGameCreated(creatorId: string, gameId: number) {
    // 생성자가 속한 클럽 목록
    const creatorMemberships = await this.groupMemberRepository.find({
      where: { user_id: creatorId },
      relations: ['user', 'group'],
    });

    if (creatorMemberships.length === 0) return;

    const creatorNickname = creatorMemberships[0].user?.nickname ?? '알 수 없는 유저';

    for (const membership of creatorMemberships) {
      const clubMembers = await this.groupMemberRepository.find({
        where: { group_id: membership.group_id },
      });

      const recipientIds = clubMembers
        .map((m) => m.user_id)
        .filter((id) => id !== creatorId);

      if (recipientIds.length === 0) continue;

      const clubName = membership.group?.name ?? '클럽';

      await this.notificationsService.createBulk(recipientIds, {
        type: NotificationType.CLUB_GAME_CREATED,
        title: '새로운 클럽 게임',
        body: `${creatorNickname}님이 ${clubName}에서 새 게임을 시작했습니다.`,
        targetId: String(gameId),
        actorId: creatorId,
        actorNickname: creatorNickname,
      });
    }
  }

  /**
   * 같은 방 코드(room_id)로 저장된 모든 참가자의 클럽 게임 기록 조회
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

    const recentTrend = allGames
      .slice(0, 10)
      .reverse()
      .map((game) => ({
        score: game.total_score,
        date: game.play_date,
      }));

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const thisMonthGames = allGames.filter((game) => {
      const d = new Date(game.play_date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const lastMonthGames = allGames.filter((game) => {
      const d = new Date(game.play_date);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    });

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
      monthlyTrend = {
        status: 'both',
        currentMonthAvg: thisMonthAvg,
        lastMonthAvg: lastMonthAvg,
        percentage: parseFloat((((thisMonthAvg - lastMonthAvg) / lastMonthAvg) * 100).toFixed(1)),
        currentMonthGameCount: thisMonthGames.length,
      };
    } else if (thisMonthAvg !== null && lastMonthAvg === null) {
      monthlyTrend = {
        status: 'current_only',
        currentMonthAvg: thisMonthAvg,
        currentMonthGameCount: thisMonthGames.length,
      };
    } else if (thisMonthAvg === null && lastMonthAvg !== null) {
      monthlyTrend = {
        status: 'last_only',
        lastMonthAvg: lastMonthAvg,
      };
    } else {
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
      relations: ['frames'],
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
          if (frame.first_roll === 10) {
            strikes++;
            if (frame.second_roll === 10) {
              strikes++;
              if (frame.third_roll === 10) {
                strikes++;
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
