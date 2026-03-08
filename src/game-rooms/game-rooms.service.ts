import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupMember } from '../groups/entities/group-member.entity';

export interface RoomParticipant {
  score: number;
}

export interface GameRoomState {
  roomId: string;
  hostId: string;
  participants: Record<string, RoomParticipant>;
  createdAt: Date;
}

/**
 * 게임 방 관련 서비스
 * 클럽 유저 여부를 확인하고, 메모리 기반으로 게임 방을 관리합니다.
 */
@Injectable()
export class GameRoomsService {
  // 메모리에 게임 방 정보 저장
  private readonly activeRooms = new Map<string, GameRoomState>();

  constructor(
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
  ) {}

  /**
   * 유저가 클럽 유저인지(어떤 클럽에라도 가입되어 있는지) 확인
   * @param user_id 검사할 유저 ID
   * @returns 클럽 유저이면 true, 아니면 false
   */
  async isClubUser(user_id: string): Promise<boolean> {
    const memberCount = await this.groupMemberRepository.count({
      where: { user_id },
    });
    return memberCount > 0;
  }

  /**
   * 새로운 게임 방 생성
   * @param user_id 방장 유저 ID
   * @returns 생성된 방의 ID
   */
  async createRoom(user_id: string): Promise<string> {
    const isClub = await this.isClubUser(user_id);
    if (!isClub) {
      throw new UnauthorizedException('클럽 유저만 게임 방을 생성할 수 있습니다.');
    }

    const roomId = Math.random().toString(36).substring(2, 9);
    this.activeRooms.set(roomId, {
      roomId,
      hostId: user_id,
      participants: { [user_id]: { score: 0 } },
      createdAt: new Date(),
    });

    return roomId;
  }

  /**
   * 특정 게임 방에 참가
   * @param roomId 방 ID
   * @param user_id 참가할 유저 ID
   */
  joinRoom(roomId: string, user_id: string): void {
    const room = this.activeRooms.get(roomId);
    if (!room) {
      throw new Error('존재하지 않는 방입니다.');
    }

    if (!room.participants[user_id]) {
      room.participants[user_id] = { score: 0 };
    }
  }

  /**
   * 게임 방 내 유저 점수 업데이트
   * @param roomId 방 ID
   * @param user_id 점수를 갱신할 유저 ID
   * @param score 새로운 점수
   */
  updateScore(roomId: string, user_id: string, score: number): void {
    const room = this.activeRooms.get(roomId);
    if (!room) {
      throw new Error('존재하지 않는 방입니다.');
    }

    if (room.participants[user_id]) {
      room.participants[user_id].score = score;
    }
  }

  /**
   * 특정 방의 상태 조회
   * @param roomId 방 ID
   * @returns 방 정보 객체
   */
  getRoomState(roomId: string): GameRoomState | undefined {
    return this.activeRooms.get(roomId);
  }

  /**
   * 유저가 방에서 나가기
   * @param roomId 방 ID
   * @param user_id 나갈 유저 ID
   */
  leaveRoom(roomId: string, user_id: string): void {
    const room = this.activeRooms.get(roomId);
    if (room && room.participants[user_id]) {
      delete room.participants[user_id];
      // 방에 사람이 없으면 방 삭제
      if (Object.keys(room.participants).length === 0) {
        this.activeRooms.delete(roomId);
      }
    }
  }
}
