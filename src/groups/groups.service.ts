import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { GroupJoinRequest, JoinRequestStatus } from './entities/group-join-request.entity';
import { Game } from '../games/entities/game.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(GroupJoinRequest)
    private readonly joinRequestRepository: Repository<GroupJoinRequest>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 새로운 클럽 생성 (생성자는 ADMIN 권한 부여)
   */
  async createGroup(user_id: string, createData: Partial<Group>) {
    const group = this.groupRepository.create(createData);
    await this.groupRepository.save(group);

    const member = this.groupMemberRepository.create({
      group_id: group.id,
      user_id,
      role: GroupRole.ADMIN,
    });
    await this.groupMemberRepository.save(member);

    return group;
  }

  /**
   * 전체 클럽 리스트 조회
   */
  async getAllGroups() {
    const groups = await this.groupRepository.find({
      relations: ['members'],
      order: { created_at: 'DESC' },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      cover_image_url: group.cover_image_url,
      created_at: group.created_at,
      member_count: group.members?.length ?? 0,
    }));
  }

  /**
   * 내가 가입한 클럽 리스트 및 멤버 요약 조회 (대시보드용)
   * 클럽장(ADMIN) user_id를 함께 반환합니다.
   */
  async getMyGroups(user_id: string) {
    const list = await this.groupMemberRepository.find({
      where: { user_id },
      relations: ['group', 'group.members', 'group.members.user'],
      order: { joined_at: 'DESC' },
    });

    return list.map((m) => {
      const group = m.group;
      const members = group.members.map((gm) => ({
        user_id: gm.user.id,
        nickname: gm.user.nickname,
        profile_image_url: gm.user.profile_image_url,
      }));

      // 클럽장(ADMIN) 찾기
      const admin = group.members.find((gm) => gm.role === GroupRole.ADMIN);

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        cover_image_url: group.cover_image_url,
        created_at: group.created_at,
        memberCount: members.length,
        memberSummary: members.slice(0, 3),
        leader_id: admin?.user_id ?? null,
      };
    });
  }

  /**
   * 클럽 상세 정보 조회
   */
  async getGroupDetail(id: number) {
    const group = await this.groupRepository.findOne({ where: { id } });
    if (!group) throw new NotFoundException('클럽을 찾을 수 없습니다.');
    return group;
  }

  // ──────────────────────────────────────
  //  가입 신청 승인제
  // ──────────────────────────────────────

  /**
   * 해당 클럽의 ADMIN(클럽장) user_id를 반환합니다.
   */
  private async getAdminUserId(groupId: number): Promise<string> {
    const admin = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, role: GroupRole.ADMIN },
    });
    if (!admin) throw new NotFoundException('클럽장을 찾을 수 없습니다.');
    return admin.user_id;
  }

  /**
   * 요청자가 클럽장인지 검증합니다. 아니면 403.
   */
  private async assertAdmin(groupId: number, userId: string): Promise<void> {
    const admin = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, role: GroupRole.ADMIN },
    });
    if (!admin || admin.user_id !== userId) {
      throw new ForbiddenException('클럽장만 수행할 수 있는 작업입니다.');
    }
  }

  /**
   * 가입 신청 생성
   */
  async createJoinRequest(groupId: number, userId: string, message?: string) {
    await this.getGroupDetail(groupId); // 404 체크

    // 이미 멤버인지 확인
    const existing = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: userId },
    });
    if (existing) {
      throw new ConflictException('이미 가입된 클럽입니다.');
    }

    // 이미 대기 중인 신청이 있는지 확인
    const pendingRequest = await this.joinRequestRepository.findOne({
      where: { group_id: groupId, user_id: userId, status: JoinRequestStatus.PENDING },
    });
    if (pendingRequest) {
      throw new ConflictException('이미 가입 신청 중입니다.');
    }

    const request = this.joinRequestRepository.create({
      group_id: groupId,
      user_id: userId,
      message: message || null,
      status: JoinRequestStatus.PENDING,
    });
    const saved = await this.joinRequestRepository.save(request);

    // 클럽장에게 가입 신청 알림
    const adminUserId = await this.getAdminUserId(groupId);
    const group = await this.getGroupDetail(groupId);

    // 신청자 닉네임 조회
    const applicant = await this.joinRequestRepository.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
    const nickname = applicant?.user?.nickname ?? '알 수 없는 유저';

    await this.notificationsService.create({
      userId: adminUserId,
      type: NotificationType.CLUB_JOIN_REQUEST,
      title: '새로운 가입 신청',
      body: `${nickname}님이 ${group.name} 클럽에 가입을 신청했습니다.`,
      targetId: String(groupId),
      actorId: userId,
      actorNickname: nickname,
    });

    return saved;
  }

  /**
   * 가입 신청 목록 조회 (클럽장 전용, pending만)
   */
  async getJoinRequests(groupId: number, userId: string) {
    // 클럽장 검증은 userId가 있을 때만 (GET은 body가 없을 수 있음)
    if (userId) {
      await this.assertAdmin(groupId, userId);
    }

    const requests = await this.joinRequestRepository.find({
      where: { group_id: groupId, status: JoinRequestStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });

    return requests.map((r) => ({
      id: r.id,
      userId: r.user_id,
      nickname: r.user?.nickname ?? null,
      profileImageUrl: r.user?.profile_image_url ?? null,
      message: r.message,
      createdAt: r.createdAt,
    }));
  }

  /**
   * 가입 신청 승인
   */
  async approveJoinRequest(groupId: number, requestId: number, adminUserId: string) {
    if (adminUserId) {
      await this.assertAdmin(groupId, adminUserId);
    }

    const request = await this.joinRequestRepository.findOne({
      where: { id: requestId, group_id: groupId, status: JoinRequestStatus.PENDING },
    });
    if (!request) {
      throw new NotFoundException('가입 신청을 찾을 수 없습니다.');
    }

    // 상태 변경
    request.status = JoinRequestStatus.APPROVED;
    await this.joinRequestRepository.save(request);

    // 멤버 추가
    const member = this.groupMemberRepository.create({
      group_id: groupId,
      user_id: request.user_id,
      role: GroupRole.MEMBER,
    });
    await this.groupMemberRepository.save(member);

    // 신청자에게 승인 알림
    const group = await this.getGroupDetail(groupId);
    await this.notificationsService.create({
      userId: request.user_id,
      type: NotificationType.CLUB_JOIN_APPROVED,
      title: '가입 승인',
      body: `${group.name} 클럽 가입이 승인되었습니다.`,
      targetId: String(groupId),
    });

    return { message: '가입이 승인되었습니다.' };
  }

  /**
   * 가입 신청 거절
   */
  async rejectJoinRequest(groupId: number, requestId: number, adminUserId: string) {
    if (adminUserId) {
      await this.assertAdmin(groupId, adminUserId);
    }

    const request = await this.joinRequestRepository.findOne({
      where: { id: requestId, group_id: groupId, status: JoinRequestStatus.PENDING },
    });
    if (!request) {
      throw new NotFoundException('가입 신청을 찾을 수 없습니다.');
    }

    request.status = JoinRequestStatus.REJECTED;
    await this.joinRequestRepository.save(request);

    // 신청자에게 거절 알림
    const group = await this.getGroupDetail(groupId);
    await this.notificationsService.create({
      userId: request.user_id,
      type: NotificationType.CLUB_JOIN_REJECTED,
      title: '가입 거절',
      body: `${group.name} 클럽 가입이 거절되었습니다.`,
      targetId: String(groupId),
    });

    return { message: '가입이 거절되었습니다.' };
  }

  /**
   * 클럽 멤버 리스트 반환
   */
  async getMembers(id: number) {
    return this.groupMemberRepository.find({
      where: { group_id: id },
      relations: ['user'],
      order: { role: 'ASC', joined_at: 'ASC' },
    });
  }

  /**
   * 클럽 멤버 리스트 + 각 멤버의 평균 점수를 함께 반환
   */
  async getMembersWithStats(id: number) {
    const members = await this.groupMemberRepository.find({
      where: { group_id: id },
      relations: ['user'],
      order: { role: 'ASC', joined_at: 'ASC' },
    });

    const result = await Promise.all(
      members.map(async (member) => {
        const games = await this.gameRepository.find({
          where: { user_id: member.user_id },
          select: ['total_score'],
        });

        const avgScore =
          games.length > 0
            ? Math.round(games.reduce((sum, g) => sum + g.total_score, 0) / games.length)
            : 0;

        return {
          group_id: member.group_id,
          user_id: member.user_id,
          role: member.role,
          joined_at: member.joined_at,
          user: {
            id: member.user.id,
            nickname: member.user.nickname,
            profile_image_url: member.user.profile_image_url,
          },
          avg_score: avgScore,
        };
      }),
    );

    return result;
  }
}
