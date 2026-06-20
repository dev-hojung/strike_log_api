import {
  Injectable,
  NotFoundException,
  GoneException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { Group, SubscriptionStatus } from '../groups/entities/group.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { BadgesService, BadgeEvalContext } from '../badges/badges.service';
import { BADGE_BY_KEY } from '../badges/badge-catalog';
import { isPlatformAdmin } from '../common/admin';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly notificationsService: NotificationsService,
    private readonly badgesService: BadgesService,
  ) {}

  /**
   * 통계 조회 권한 검증.
   * - 본인 또는 플랫폼 관리자: 무조건 허용
   * - 둘 다 아니면 actor와 target이 같은 클럽 멤버인지 확인 (어떤 클럽이라도 공유)
   *
   * 클럽 기능의 자연스러운 확장: 같은 클럽 멤버끼리 서로의 통계를 비교할 수 있어야 한다.
   * 다른 곳(게임 상세 등)에는 적용하지 않고 통계 endpoint 전용.
   *
   * @throws ForbiddenException 공유 클럽이 없는 경우
   */
  async assertSelfOrAdminOrClubMate(
    actorId: string,
    targetId: string,
  ): Promise<void> {
    if (actorId === targetId) return;
    if (isPlatformAdmin(actorId)) return;

    const shared = await this.groupMemberRepository
      .createQueryBuilder('m1')
      .innerJoin(
        GroupMember,
        'm2',
        'm2.group_id = m1.group_id AND m2.user_id = :target',
        { target: targetId },
      )
      .where('m1.user_id = :actor', { actor: actorId })
      .getCount();

    if (shared === 0) {
      throw new ForbiddenException(
        '같은 클럽 멤버의 통계만 조회할 수 있습니다.',
      );
    }
  }

  /**
   * 클럽 게임 생성 허용 여부 검증.
   * 유저가 속한 모든 클럽이 EXPIRED면 GoneException.
   * 하나라도 TRIAL/ACTIVE면 허용.
   */
  private async _assertClubGameAllowed(user_id: string): Promise<void> {
    const memberships = await this.groupMemberRepository.find({
      where: { user_id },
    });
    if (memberships.length === 0) {
      // 클럽에 소속되지 않았는데 클럽 게임을 만들려는 경우: 서비스 레벨에서 막을지는
      // 기존 정책을 따름 (알림 전송만 누락됨). 여기서는 허용.
      return;
    }
    const groupIds = memberships.map((m) => m.group_id);
    const groups = await this.groupRepository.find({
      where: { id: In(groupIds) },
    });
    const hasActive = groups.some(
      (g) =>
        g.subscription_status === SubscriptionStatus.ACTIVE ||
        g.subscription_status === SubscriptionStatus.TRIAL,
    );
    if (!hasActive) {
      throw new GoneException(
        '소속된 모든 클럽의 체험판이 만료되어 새 클럽 게임을 생성할 수 없습니다.',
      );
    }
  }

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
      is_bet_game?: boolean;
      room_id?: string | null;
      club_rank?: number | null;
      started_at?: string | null;
      ended_at?: string | null;
      series_id?: number | null;
      series_index?: number | null;
    },
  ) {
    // 클럽 게임이면 체험판 만료 여부 확인: 유저가 속한 클럽 중 하나라도
    // active/trial이어야 허용. 전부 expired면 GoneException.
    if (createData.is_club_game) {
      await this._assertClubGameAllowed(user_id);
    }

    const game = this.gameRepository.create({
      user_id,
      total_score: createData.total_score,
      play_date: createData.play_date || new Date(),
      location: createData.location,
      frames: createData.frames,
      is_club_game: createData.is_club_game ?? false,
      is_bet_game: createData.is_bet_game ?? false,
      room_id: createData.room_id ?? null,
      club_rank: createData.club_rank ?? null,
      started_at: createData.started_at ? new Date(createData.started_at) : null,
      ended_at: createData.ended_at ? new Date(createData.ended_at) : null,
      series_id: createData.series_id ?? null,
      series_index: createData.series_index ?? null,
    });
    const saved = await this.gameRepository.save(game);

    // 클럽 게임인 경우 같은 클럽 멤버들에게 알림 (비동기, 실패해도 게임 저장은 성공)
    if (createData.is_club_game) {
      this.notifyClubGameCreated(user_id, saved.id).catch((err) =>
        console.error('[Games] 클럽 게임 알림 전송 실패:', err),
      );
    }

    // 퍼펙트 게임(300점) 달성 시 같은 클럽 멤버 전원에게 알림.
    // 클럽 비가입자도 가능하지만 알림은 클럽원에게만 의미가 있으므로 클럽 가입자만 발송.
    if (saved.total_score >= 300) {
      this.notifyClubPerfectGame(user_id, saved.id).catch((err) =>
        console.error('[Games] 퍼펙트 게임 알림 전송 실패:', err),
      );
    }

    // 개인 최고 점수 갱신 알림 (비동기, 게임 저장 흐름과 격리)
    this.notifyIfNewBestScore(user_id, saved.id, saved.total_score).catch(
      (err) => console.error('[Games] 베스트 갱신 알림 전송 실패:', err),
    );

    // 배지 평가는 동기로 수행해 신규 키를 응답에 동봉(클라 모달 트리거).
    // 알림 발송은 평가 후 fire-and-forget.
    let newlyEarnedBadges: Array<{ key: string; name: string; description: string; category: string }> = [];
    try {
      const keys = await this.badgesService.checkAndAward(user_id, {
        savedGame: {
          id: saved.id,
          total_score: saved.total_score,
          frames: createData.frames,
          is_club_game: saved.is_club_game,
          club_rank: saved.club_rank,
        },
      });
      for (const key of keys) {
        const def = BADGE_BY_KEY.get(key);
        this.notificationsService
          .create({
            userId: user_id,
            type: NotificationType.BADGE_EARNED,
            title: '새 배지 획득!',
            body: def
              ? `${def.name} 배지를 획득했어요. ${def.description}`
              : `${key} 배지를 획득했어요.`,
            targetId: key,
          })
          .catch((err) =>
            console.error('[Games] 배지 알림 전송 실패:', err),
          );
      }
      newlyEarnedBadges = keys.map((k) => {
        const d = BADGE_BY_KEY.get(k);
        return {
          key: k,
          name: d?.name ?? k,
          description: d?.description ?? '',
          category: d?.category ?? '',
        };
      });
    } catch (err) {
      console.error('[Games] 배지 평가 실패:', err);
    }

    // Game 엔티티 + 신규 배지 메타데이터 동봉.
    return { ...saved, newly_earned_badges: newlyEarnedBadges };
  }

  /**
   * 배지 평가 + 신규 획득 시 알림 발송.
   * 시리즈 완료 훅에서도 호출되도록 public 노출.
   */
  async evaluateBadgesAndNotify(
    userId: string,
    context: BadgeEvalContext,
  ): Promise<void> {
    const newlyEarned = await this.badgesService.checkAndAward(userId, context);
    if (newlyEarned.length === 0) return;
    for (const key of newlyEarned) {
      const def = BADGE_BY_KEY.get(key);
      await this.notificationsService.create({
        userId,
        type: NotificationType.BADGE_EARNED,
        title: '새 배지 획득!',
        body: def
          ? `${def.name} 배지를 획득했어요. ${def.description}`
          : `${key} 배지를 획득했어요.`,
        targetId: key,
      });
    }
  }

  /**
   * 방금 저장한 게임이 사용자의 개인 최고점을 갱신했는지 검사하고, 그렇다면 알림 발송.
   * 첫 게임(이전 기록 없음)은 베스트로 보지 않는다.
   */
  private async notifyIfNewBestScore(
    userId: string,
    savedGameId: number,
    savedScore: number,
  ): Promise<void> {
    // 방금 저장한 게임을 제외한 이전 최고점 조회.
    const prevBestRow = await this.gameRepository
      .createQueryBuilder('g')
      .select('MAX(g.total_score)', 'max')
      .where('g.user_id = :userId', { userId })
      .andWhere('g.id != :savedGameId', { savedGameId })
      .getRawOne<{ max: number | null }>();

    const prevBest = prevBestRow?.max != null ? Number(prevBestRow.max) : null;

    // 첫 게임이거나 갱신이 아니면 알림 생략.
    if (prevBest == null) return;
    if (savedScore <= prevBest) return;

    await this.notificationsService.create({
      userId,
      type: NotificationType.NEW_BEST_SCORE,
      title: '새 베스트 점수 달성!',
      body: `이번 게임 ${savedScore}점으로 개인 최고 기록을 갱신했어요. (이전 ${prevBest}점)`,
      targetId: String(savedGameId),
    });
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

      const recipientIds = clubMembers.map((m) => m.user_id).filter((id) => id !== creatorId);

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
   * 300점 퍼펙트 게임 달성 시 같은 클럽 멤버 전원에게 알림.
   * 본인은 제외. 다중 클럽 가입자는 클럽별로 한 번씩 발송 (UI에서 동일 게임 ID로 중복 표시 가능).
   */
  private async notifyClubPerfectGame(achieverId: string, gameId: number) {
    const memberships = await this.groupMemberRepository.find({
      where: { user_id: achieverId },
      relations: ['user', 'group'],
    });
    if (memberships.length === 0) return;
    const achieverNickname =
      memberships[0].user?.nickname ?? '클럽 멤버';

    for (const m of memberships) {
      const peers = await this.groupMemberRepository.find({
        where: { group_id: m.group_id },
      });
      const recipientIds = peers
        .map((p) => p.user_id)
        .filter((id) => id !== achieverId);
      if (recipientIds.length === 0) continue;

      const clubName = m.group?.name ?? '클럽';
      await this.notificationsService.createBulk(recipientIds, {
        type: NotificationType.CLUB_PERFECT_GAME,
        title: '퍼펙트 게임 달성! 🎳',
        body: `${achieverNickname}님이 ${clubName}에서 퍼펙트(300점)를 달성하셨습니다!`,
        targetId: String(gameId),
        actorId: achieverId,
        actorNickname: achieverNickname,
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
        // 개인/클럽 분리 평균. 게임이 없으면 모두 0.
        personalAverageScore: 0,
        clubAverageScore: 0,
        personalGameCount: 0,
        clubGameCount: 0,
        highestScore: 0,
        highestScoreDate: null,
        recentTrend: [],
        monthlyTrend: { status: 'none' },
      };
    }

    const totalScoreSum = allGames.reduce((sum, game) => sum + game.total_score, 0);
    const averageScore = Math.round(totalScoreSum / allGames.length);

    // 개인 게임(is_club_game=false) / 클럽 게임(is_club_game=true) 분리 평균.
    const personalGames = allGames.filter((g) => !g.is_club_game);
    const clubGames = allGames.filter((g) => g.is_club_game);
    const personalAverageScore = personalGames.length > 0
      ? Math.round(
          personalGames.reduce((s, g) => s + g.total_score, 0) / personalGames.length,
        )
      : 0;
    const clubAverageScore = clubGames.length > 0
      ? Math.round(
          clubGames.reduce((s, g) => s + g.total_score, 0) / clubGames.length,
        )
      : 0;

    let highestScore = 0;
    let highestScoreDate: Date | null = null;
    allGames.forEach((game) => {
      if (game.total_score > highestScore) {
        highestScore = game.total_score;
        highestScoreDate = game.play_date;
      }
    });

    // 최근 10경기만 frames join (성능 위해 전체 allGames에 join하지 않음)
    const recent10 = await this.gameRepository.find({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
      take: 10,
      relations: ['frames'],
    });

    const recentTrend = recent10
      .slice()
      .reverse()
      .map((game) => {
        const frames = game.frames ?? [];
        let strikes = 0, spares = 0, opens = 0;
        for (const frame of frames) {
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
            }
          } else {
            // 10프레임
            if (frame.first_roll === 10) {
              strikes++;
              if (frame.second_roll === 10) {
                strikes++;
                if (frame.third_roll === 10) {
                  strikes++;
                }
              } else if (frame.second_roll != null && frame.third_roll != null) {
                if (frame.second_roll + frame.third_roll === 10) {
                  spares++;
                } else {
                  opens++;
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
            }
          }
        }
        return { score: game.total_score, date: game.play_date, strikes, spares, opens };
      });

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
      personalAverageScore,
      clubAverageScore,
      personalGameCount: personalGames.length,
      clubGameCount: clubGames.length,
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
      where: { id },
      relations: ['frames'],
    });

    if (!game) {
      throw new NotFoundException('해당 게임 기록을 찾을 수 없습니다.');
    }
    // 본인 / 플랫폼 어드민 / 공통 클럽 멤버이면 조회 허용. 그 외는 403.
    // (퍼펙트 알림 등으로 같은 클럽원의 게임 상세를 보러 오는 경우 지원)
    await this.assertSelfOrAdminOrClubMate(user_id, game.user_id);
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
    let perfectGames = 0;

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
            } else if (frame.second_roll != null && frame.third_roll != null) {
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

      // 퍼펙트 게임(300점)은 별도 카운트. 그 외 노 오픈 게임은 올커버.
      if (!gameHasOpen && game.frames.length >= 10) {
        if (game.total_score >= 300) {
          perfectGames++;
        } else {
          allCoverGames++;
        }
      }
    }

    return {
      strikes,
      spares,
      opens,
      perfectGames,
      allCoverGames,
      gameCount: thisMonthGames.length,
    };
  }
}
