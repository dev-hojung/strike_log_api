import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group, SubscriptionStatus } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { GroupJoinRequest, JoinRequestStatus } from './entities/group-join-request.entity';
import {
  GroupCreationRequest,
  CreationRequestStatus,
  CreationRejectReason,
} from './entities/group-creation-request.entity';
import { Game } from '../games/entities/game.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { isPlatformAdmin, platformAdminIds } from '../common/admin';

@Injectable()
export class GroupsService implements OnModuleInit {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(GroupJoinRequest)
    private readonly joinRequestRepository: Repository<GroupJoinRequest>,
    @InjectRepository(GroupCreationRequest)
    private readonly creationRequestRepository: Repository<GroupCreationRequest>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------- 클럽 생성 신청 플로우 ----------

  /**
   * 클럽 생성 신청. 관리자들에게 푸시 발송.
   */
  async createCreationRequest(params: {
    requester_id: string;
    name: string;
    description?: string;
    cover_image_url?: string;
  }) {
    if (!params.name?.trim()) {
      throw new BadRequestException('클럽 이름이 필요합니다.');
    }
    // 동일 유저가 PENDING 상태로 이미 신청한 건이 있으면 차단
    const existing = await this.creationRequestRepository.findOne({
      where: {
        requester_id: params.requester_id,
        status: CreationRequestStatus.PENDING,
      },
    });
    if (existing) {
      throw new ConflictException('이미 심사 중인 신청이 있습니다.');
    }

    const request = this.creationRequestRepository.create({
      requester_id: params.requester_id,
      name: params.name.trim(),
      description: params.description ?? null,
      cover_image_url: params.cover_image_url ?? null,
      status: CreationRequestStatus.PENDING,
    });
    const saved = await this.creationRequestRepository.save(request);

    // 관리자 모두에게 알림
    const admins = platformAdminIds();
    if (admins.length > 0) {
      await this.notificationsService.createBulk(admins, {
        type: NotificationType.CLUB_CREATION_REQUEST,
        title: '새 클럽 생성 신청',
        body: `"${saved.name}" 생성 신청이 접수되었습니다.`,
        targetId: String(saved.id),
        actorId: params.requester_id,
      });
    }
    return saved;
  }

  /**
   * 내 신청 목록 (pending + 최근 이력)
   */
  async listMyCreationRequests(user_id: string) {
    return this.creationRequestRepository.find({
      where: { requester_id: user_id },
      relations: ['requester'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * 관리자: 신청 목록 조회 (상태 필터 가능). 요청자 정보(닉네임/이메일)를 함께 반환.
   */
  async listCreationRequestsForAdmin(
    admin_user_id: string,
    status?: CreationRequestStatus,
  ) {
    if (!isPlatformAdmin(admin_user_id)) {
      throw new ForbiddenException('관리자 권한이 없습니다.');
    }
    const where = status ? { status } : {};
    return this.creationRequestRepository.find({
      where,
      relations: ['requester'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * 관리자: 신청 승인 → groups 레코드 생성 + 신청자 ADMIN 가입 + 알림
   */
  async approveCreationRequest(request_id: number, admin_user_id: string) {
    if (!isPlatformAdmin(admin_user_id)) {
      throw new ForbiddenException('관리자 권한이 없습니다.');
    }
    const req = await this.creationRequestRepository.findOne({
      where: { id: request_id },
    });
    if (!req) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (req.status !== CreationRequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청입니다.');
    }

    const group = await this.createGroup(req.requester_id, {
      name: req.name,
      description: req.description ?? undefined,
      cover_image_url: req.cover_image_url ?? undefined,
    });

    req.status = CreationRequestStatus.APPROVED;
    req.approved_group_id = group.id;
    await this.creationRequestRepository.save(req);

    await this.notificationsService.create({
      userId: req.requester_id,
      type: NotificationType.CLUB_CREATION_APPROVED,
      title: '클럽 생성 승인',
      body: `"${req.name}" 클럽이 승인되어 생성되었습니다.`,
      targetId: String(group.id),
      actorId: admin_user_id,
    });

    return { request: req, group };
  }

  /**
   * 관리자: 신청 반려
   */
  async rejectCreationRequest(
    request_id: number,
    admin_user_id: string,
    reason: CreationRejectReason,
  ) {
    if (!isPlatformAdmin(admin_user_id)) {
      throw new ForbiddenException('관리자 권한이 없습니다.');
    }
    if (!Object.values(CreationRejectReason).includes(reason)) {
      throw new BadRequestException('유효하지 않은 반려 사유입니다.');
    }
    const req = await this.creationRequestRepository.findOne({
      where: { id: request_id },
    });
    if (!req) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (req.status !== CreationRequestStatus.PENDING) {
      throw new BadRequestException('이미 처리된 신청입니다.');
    }

    req.status = CreationRequestStatus.REJECTED;
    req.reject_reason = reason;
    await this.creationRequestRepository.save(req);

    await this.notificationsService.create({
      userId: req.requester_id,
      type: NotificationType.CLUB_CREATION_REJECTED,
      title: '클럽 생성 반려',
      body: `"${req.name}" 클럽 생성 신청이 반려되었습니다.`,
      targetId: String(req.id),
      actorId: admin_user_id,
    });

    return req;
  }

  /**
   * 신청자 본인이 pending 상태 신청 취소
   */
  async cancelCreationRequest(request_id: number, user_id: string) {
    const req = await this.creationRequestRepository.findOne({
      where: { id: request_id },
    });
    if (!req) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (req.requester_id !== user_id) {
      throw new ForbiddenException('본인 신청만 취소할 수 있습니다.');
    }
    if (req.status !== CreationRequestStatus.PENDING) {
      throw new BadRequestException('취소할 수 없는 상태입니다.');
    }
    req.status = CreationRequestStatus.CANCELLED;
    await this.creationRequestRepository.save(req);
    return req;
  }

  /**
   * 새로운 클럽 생성 (생성자는 ADMIN 권한 부여).
   * 플랫폼 관리자가 직접 만든 클럽은 곧바로 `active`, 그 외는 7일 체험판.
   */
  async createGroup(user_id: string, createData: Partial<Group>) {
    const isCreatorPlatformAdmin = isPlatformAdmin(user_id);

    let subscriptionOverrides: Partial<Group>;
    if (isCreatorPlatformAdmin) {
      subscriptionOverrides = {
        subscription_status: SubscriptionStatus.ACTIVE,
        trial_started_at: null,
        trial_expires_at: null,
      };
    } else {
      const now = new Date();
      const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      subscriptionOverrides = {
        subscription_status: SubscriptionStatus.TRIAL,
        trial_started_at: now,
        trial_expires_at: expires,
      };
    }

    const group = this.groupRepository.create({
      ...createData,
      ...subscriptionOverrides,
    });
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
   * 기존 Group row들의 체험판 필드를 backfill.
   * 서비스 부팅 시 1회 실행. 이미 채워진 row는 건너뜀.
   */
  async onModuleInit() {
    const rows = await this.groupRepository.find({
      where: { subscription_status: SubscriptionStatus.TRIAL },
      relations: ['members'],
    });
    for (const group of rows) {
      // 이미 trial_expires_at이 있으면 건너뜀 (새로 생성된 신규 row)
      if (group.trial_expires_at) continue;

      // ADMIN 멤버 중 플랫폼 관리자가 있으면 active로 승격
      const hasAdminCreator = (group.members ?? [])
        .filter((m) => m.role === GroupRole.ADMIN)
        .some((m) => isPlatformAdmin(m.user_id));

      if (hasAdminCreator) {
        group.subscription_status = SubscriptionStatus.ACTIVE;
        group.trial_started_at = null;
        group.trial_expires_at = null;
      } else {
        // 생성일 기준 + 7일로 설정. 이미 7일 지났으면 expired.
        const created = group.created_at ?? new Date();
        const expires = new Date(created.getTime() + 7 * 24 * 60 * 60 * 1000);
        group.trial_started_at = created;
        group.trial_expires_at = expires;
        group.subscription_status =
          expires.getTime() < Date.now()
            ? SubscriptionStatus.EXPIRED
            : SubscriptionStatus.TRIAL;
      }
      await this.groupRepository.save(group);
    }
  }

  /**
   * 만료 여부를 확인해 필요 시 status를 expired로 업데이트한다.
   * 읽기 경로(getGroupDetail, getMyGroups)에서 호출해 지연 일관성을 보장.
   */
  private async _maybeExpireTrial(group: Group): Promise<Group> {
    if (
      group.subscription_status === SubscriptionStatus.TRIAL &&
      group.trial_expires_at &&
      group.trial_expires_at.getTime() < Date.now()
    ) {
      group.subscription_status = SubscriptionStatus.EXPIRED;
      await this.groupRepository.update(group.id, {
        subscription_status: SubscriptionStatus.EXPIRED,
      });
    }
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

    // 만료 갱신을 병렬 처리
    await Promise.all(list.map((m) => this._maybeExpireTrial(m.group)));

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
        subscription_status: group.subscription_status,
        trial_started_at: group.trial_started_at,
        trial_expires_at: group.trial_expires_at,
      };
    });
  }

  /**
   * 클럽 상세 정보 조회
   */
  async getGroupDetail(id: number) {
    const group = await this.groupRepository.findOne({ where: { id } });
    if (!group) throw new NotFoundException('클럽을 찾을 수 없습니다.');
    await this._maybeExpireTrial(group);
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
