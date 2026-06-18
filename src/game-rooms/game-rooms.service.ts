import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { GroupMember } from '../groups/entities/group-member.entity';
import { Game } from '../games/entities/game.entity';
import {
  GameRoom,
  GameRoomMode,
  GameRoomStatus,
} from './entities/game-room.entity';
import { GameRoomParticipant } from './entities/game-room-participant.entity';

export interface RoomParticipant {
  nickname: string;
  score: number;
  strikes?: number;
  spares?: number;
  opens?: number;
}

export interface ParticipantStatsUpdate {
  strikes?: number;
  spares?: number;
  opens?: number;
}

export interface GameRoomState {
  roomId: string;
  hostId: string;
  status: GameRoomStatus;
  mode: GameRoomMode;
  betMemo: string | null;
  maxPlayers: number;
  participants: Record<
    string,
    RoomParticipant & { handicap?: number }
  >;
  createdAt: Date;
}

/**
 * 클럽 게임 방 도메인 서비스.
 *
 * 영속화: game_rooms / game_room_participants 테이블.
 * 일시 disconnect는 participant 행을 즉시 지우지 않고 disconnected_at만 set하여
 * grace period 동안 재접속 허용. cron이 만료된 행을 정리한다.
 */
@Injectable()
export class GameRoomsService {
  private readonly logger = new Logger(GameRoomsService.name);

  /** 일시 disconnect 후 자동 leave 까지 허용하는 grace period */
  static readonly DISCONNECT_GRACE_MS = 30 * 1000;

  /** waiting 상태로 1시간 이상 방치된 방 자동 정리 */
  static readonly STALE_WAITING_ROOM_MS = 60 * 60 * 1000;

  /** finished/playing 상태로 6시간 이상 지난 방 정리 */
  static readonly STALE_FINISHED_ROOM_MS = 6 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(GameRoom)
    private readonly roomRepository: Repository<GameRoom>,
    @InjectRepository(GameRoomParticipant)
    private readonly participantRepository: Repository<GameRoomParticipant>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
  ) {}

  async isClubUser(userId: string): Promise<boolean> {
    const count = await this.groupMemberRepository.count({
      where: { user_id: userId },
    });
    return count > 0;
  }

  /**
   * 새 방 생성. 호스트 1명을 participants에 함께 INSERT.
   * 코드 충돌 시 최대 5회 재시도.
   *
   * mode='club'은 클럽 가입자만 가능, mode='bet'은 누구나 가능.
   */
  async createRoom(
    userId: string,
    nickname: string,
    opts?: {
      mode?: GameRoomMode;
      betMemo?: string | null;
      maxPlayers?: number;
    },
  ): Promise<string> {
    const mode = opts?.mode ?? GameRoomMode.CLUB;
    if (mode === GameRoomMode.CLUB) {
      if (!(await this.isClubUser(userId))) {
        throw new UnauthorizedException(
          '클럽 유저만 클럽 게임 방을 생성할 수 있습니다.',
        );
      }
    }

    const maxPlayers = Math.min(
      Math.max(opts?.maxPlayers ?? 6, 2),
      6,
    );

    for (let attempt = 0; attempt < 5; attempt++) {
      const id = this.generateRoomId();
      const exists = await this.roomRepository.findOne({ where: { id } });
      if (exists) continue;

      const room = this.roomRepository.create({
        id,
        host_id: userId,
        status: GameRoomStatus.WAITING,
        mode,
        bet_memo: mode === GameRoomMode.BET ? (opts?.betMemo ?? null) : null,
        max_players: maxPlayers,
      });
      await this.roomRepository.save(room);

      await this.participantRepository.save(
        this.participantRepository.create({
          room_id: id,
          user_id: userId,
          nickname,
          score: 0,
        }),
      );
      return id;
    }
    throw new Error('방 ID 생성 실패 — 잠시 후 다시 시도해주세요.');
  }

  /**
   * 방 참가. 같은 사용자가 다시 들어오면 disconnected_at만 풀어준다(grace 재진입).
   * 신규 참가 시 정원 초과를 막기 위해 pessimistic write lock + transaction 사용.
   */
  async joinRoom(
    roomId: string,
    userId: string,
    nickname: string,
  ): Promise<void> {
    await this.roomRepository.manager.transaction(async (em) => {
      const room = await em.findOne(GameRoom, {
        where: { id: roomId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!room) {
        throw new Error('존재하지 않는 방입니다.');
      }
      if (room.status === GameRoomStatus.FINISHED) {
        throw new Error('이미 종료된 방입니다.');
      }

      const existing = await em.findOne(GameRoomParticipant, {
        where: { room_id: roomId, user_id: userId },
      });
      if (existing) {
        // 일시 disconnect 상태였다면 grace 해제 + 닉네임 갱신
        existing.disconnected_at = null;
        existing.nickname = nickname;
        await em.save(existing);
        return;
      }

      // 신규 참가 시 정원 체크 (lock 보유 중 count)
      const currentCount = await em.count(GameRoomParticipant, {
        where: { room_id: roomId },
      });
      if (currentCount >= room.max_players) {
        throw new Error('정원이 가득 찼습니다.');
      }

      await em.save(
        em.create(GameRoomParticipant, {
          room_id: roomId,
          user_id: userId,
          nickname,
          score: 0,
        }),
      );
    });
  }

  /**
   * 호스트만 가능. 게임 시작 전(status=waiting)까지만 핸디캡 수정 허용.
   */
  async updateHandicap(
    roomId: string,
    requesterId: string,
    targetUserId: string,
    handicap: number,
  ): Promise<void> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) throw new Error('존재하지 않는 방입니다.');
    if (room.mode !== GameRoomMode.BET) {
      throw new Error('내기 모드 방에서만 핸디캡을 설정할 수 있습니다.');
    }
    if (room.host_id !== requesterId) {
      throw new Error('호스트만 핸디캡을 수정할 수 있습니다.');
    }
    if (room.status !== GameRoomStatus.WAITING) {
      throw new Error('게임 시작 후엔 핸디캡을 변경할 수 없습니다.');
    }
    const participant = await this.participantRepository.findOne({
      where: { room_id: roomId, user_id: targetUserId },
    });
    if (!participant) throw new Error('해당 참가자가 방에 없습니다.');

    participant.handicap = Math.max(-100, Math.min(100, Math.trunc(handicap)));
    await this.participantRepository.save(participant);
  }

  /**
   * 참가자별 자동 추천 핸디캡.
   * 룰: 참가자 중 최고 평균 점수 - 본인 평균 점수 (양수 = 더 받음).
   *     기록 없는 사용자는 0으로 처리.
   *     ±100 범위로 클램프.
   */
  async suggestHandicaps(
    roomId: string,
  ): Promise<Array<{ userId: string; suggestedHandicap: number; avg: number }>> {
    const participants = await this.participantRepository.find({
      where: { room_id: roomId },
    });
    if (participants.length === 0) return [];

    const stats = await Promise.all(
      participants.map(async (p) => {
        const row = await this.gameRepository
          .createQueryBuilder('g')
          .select('AVG(g.total_score)', 'avg')
          .where('g.user_id = :userId', { userId: p.user_id })
          .getRawOne<{ avg: string | null }>();
        return { userId: p.user_id, avg: Number(row?.avg ?? 0) };
      }),
    );
    const maxAvg = Math.max(...stats.map((s) => s.avg));
    return stats.map((s) => ({
      userId: s.userId,
      avg: s.avg,
      suggestedHandicap: Math.max(
        -100,
        Math.min(100, Math.round(maxAvg - s.avg)),
      ),
    }));
  }

  /**
   * 게임 종료 처리 + 핸디 적용 순위 계산.
   * roomState 그대로 두고 status만 finished로 전환 (cron이 6시간 후 정리).
   */
  async finishAndRank(roomId: string): Promise<
    Array<{
      userId: string;
      nickname: string;
      score: number;
      handicap: number;
      adjustedScore: number;
      rank: number;
    }>
  > {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) throw new Error('존재하지 않는 방입니다.');

    await this.setRoomStatus(roomId, GameRoomStatus.FINISHED);

    const participants = await this.participantRepository.find({
      where: { room_id: roomId },
      order: { joined_at: 'ASC' },
    });
    const items = participants
      .map((p) => ({
        userId: p.user_id,
        nickname: p.nickname,
        score: p.score,
        handicap: room.mode === GameRoomMode.BET ? p.handicap : 0,
        adjustedScore:
          p.score + (room.mode === GameRoomMode.BET ? p.handicap : 0),
      }))
      .sort((a, b) => b.adjustedScore - a.adjustedScore);
    let rank = 0;
    let lastScore: number | null = null;
    return items.map((item, idx) => {
      if (item.adjustedScore !== lastScore) {
        rank = idx + 1;
        lastScore = item.adjustedScore;
      }
      return { ...item, rank };
    });
  }

  /**
   * 점수/통계 업데이트. 참가자가 아니면 에러(silent fail 방지).
   */
  async updateScore(
    roomId: string,
    userId: string,
    score: number,
    stats?: ParticipantStatsUpdate,
  ): Promise<void> {
    const participant = await this.participantRepository.findOne({
      where: { room_id: roomId, user_id: userId },
    });
    if (!participant) {
      throw new Error('방에 참가 중이 아닙니다.');
    }
    participant.score = score;
    if (stats) {
      if (typeof stats.strikes === 'number') participant.strikes = stats.strikes;
      if (typeof stats.spares === 'number') participant.spares = stats.spares;
      if (typeof stats.opens === 'number') participant.opens = stats.opens;
    }
    participant.disconnected_at = null; // 활성 신호
    await this.participantRepository.save(participant);
  }

  async getRoomState(roomId: string): Promise<GameRoomState | undefined> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) return undefined;
    const participants = await this.participantRepository.find({
      where: { room_id: roomId },
      order: { joined_at: 'ASC' },
    });
    const map: Record<string, RoomParticipant & { handicap?: number }> = {};
    for (const p of participants) {
      map[p.user_id] = {
        nickname: p.nickname,
        score: p.score,
        strikes: p.strikes ?? undefined,
        spares: p.spares ?? undefined,
        opens: p.opens ?? undefined,
        handicap: room.mode === GameRoomMode.BET ? p.handicap : undefined,
      };
    }
    return {
      roomId: room.id,
      hostId: room.host_id,
      status: room.status,
      mode: room.mode,
      betMemo: room.bet_memo,
      maxPlayers: room.max_players,
      participants: map,
      createdAt: room.created_at,
    };
  }

  /**
   * 사용자가 명시적으로 방에서 나감.
   * 호스트면 가장 먼저 들어온 다른 참가자에게 host 이전. 마지막 참가자면 방 삭제.
   * DELETE → SELECT remaining → host UPDATE 를 동일 트랜잭션 안에서 수행.
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.roomRepository.manager.transaction(async (em) => {
      await em.delete(GameRoomParticipant, {
        room_id: roomId,
        user_id: userId,
      });
      const remaining = await em.find(GameRoomParticipant, {
        where: { room_id: roomId },
        order: { joined_at: 'ASC' },
      });
      if (remaining.length === 0) {
        await em.delete(GameRoom, { id: roomId });
        return;
      }
      const room = await em.findOne(GameRoom, { where: { id: roomId } });
      if (room && room.host_id === userId) {
        room.host_id = remaining[0].user_id;
        await em.save(room);
        this.logger.log(
          `host succession in room=${roomId}: → ${remaining[0].user_id}`,
        );
      }
    });
  }

  /**
   * 일시 disconnect 표시. 즉시 leaveRoom하지 않고 grace period까지 대기.
   */
  async markDisconnected(roomId: string, userId: string): Promise<void> {
    await this.participantRepository.update(
      { room_id: roomId, user_id: userId },
      { disconnected_at: new Date() },
    );
  }

  async setRoomStatus(
    roomId: string,
    status: GameRoomStatus,
  ): Promise<GameRoom | null> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) return null;
    room.status = status;
    return this.roomRepository.save(room);
  }

  // ─── Cleanup ──────────────────────────────────────────────

  /**
   * 매 30초마다:
   *   1) grace period 지난 disconnected 참가자 leave (호스트 승계 / 빈 방 삭제)
   *   2) waiting 상태로 1시간 이상 방치된 방 삭제
   *   3) playing/finished 상태로 6시간 이상 지난 방 삭제
   */
  /**
   * grace period가 지난 disconnected 참가자 목록을 반환한다.
   * gateway의 cron에서 leaveRoom + broadcast를 처리한다.
   */
  async getStalePeers(): Promise<GameRoomParticipant[]> {
    const graceCutoff = new Date(Date.now() - GameRoomsService.DISCONNECT_GRACE_MS);
    return this.participantRepository.find({
      where: { disconnected_at: LessThan(graceCutoff) as unknown as Date },
    });
  }

  @Cron('*/30 * * * * *')
  async cleanupStaleEntries(): Promise<void> {
    const waitingCutoff = new Date(
      Date.now() - GameRoomsService.STALE_WAITING_ROOM_MS,
    );
    await this.roomRepository.delete({
      status: GameRoomStatus.WAITING,
      updated_at: LessThan(waitingCutoff) as unknown as Date,
    });

    const finishedCutoff = new Date(
      Date.now() - GameRoomsService.STALE_FINISHED_ROOM_MS,
    );
    await this.roomRepository
      .createQueryBuilder()
      .delete()
      .where('status != :waiting', { waiting: GameRoomStatus.WAITING })
      .andWhere('updated_at < :cutoff', { cutoff: finishedCutoff })
      .execute();

    // 빈 방(참가자 0명)이 어쩌다 남아 있으면 정리
    const orphanRooms = await this.roomRepository
      .createQueryBuilder('r')
      .leftJoin(GameRoomParticipant, 'p', 'p.room_id = r.id')
      .where('p.user_id IS NULL')
      .select('r.id', 'id')
      .getRawMany<{ id: string }>();
    if (orphanRooms.length > 0) {
      await this.roomRepository.delete(orphanRooms.map((r) => r.id));
    }
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 9);
  }
}
