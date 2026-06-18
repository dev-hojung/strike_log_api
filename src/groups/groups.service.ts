import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Group, SubscriptionStatus } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';
import { GroupJoinRequest, JoinRequestStatus } from './entities/group-join-request.entity';
import {
  GroupCreationRequest,
  CreationRequestStatus,
  CreationRejectReason,
} from './entities/group-creation-request.entity';
import { GroupAnnouncement } from './entities/group-announcement.entity';
import { Game } from '../games/entities/game.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { BadgesService } from '../badges/badges.service';
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
    @InjectRepository(GroupAnnouncement)
    private readonly announcementRepository: Repository<GroupAnnouncement>,
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    private readonly notificationsService: NotificationsService,
    private readonly badgesService: BadgesService,
  ) {}

  // ---------- 클럽 생성 신청 플로우 ----------

  /**
   * 클럽 생성 신청. 관리자들에게 푸시 발송.
   */
  async createCreationRequest(params: {
    requester_id: string;
    name: string;
    description?: string;
    activity_region?: string;
    cover_image_url?: string;
  }) {
    const trimmedName = params.name?.trim();
    if (!trimmedName) {
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

    // 이미 승인된 클럽 이름 중복 차단
    const existingGroup = await this.groupRepository.findOne({
      where: { name: trimmedName },
    });
    if (existingGroup) {
      throw new ConflictException('이미 사용 중인 클럽 이름입니다.');
    }

    // 검토 중(PENDING)인 다른 사용자의 동일 이름 신청도 차단
    const conflictingRequest = await this.creationRequestRepository.findOne({
      where: {
        name: trimmedName,
        status: CreationRequestStatus.PENDING,
      },
    });
    if (conflictingRequest) {
      throw new ConflictException('동일한 이름으로 검토 중인 신청이 있습니다.');
    }

    const request = this.creationRequestRepository.create({
      requester_id: params.requester_id,
      name: trimmedName,
      description: params.description ?? null,
      activity_region: params.activity_region?.trim() || null,
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
  async listCreationRequestsForAdmin(admin_user_id: string, status?: CreationRequestStatus) {
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
      activity_region: req.activity_region,
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

    // 신규 멤버십 발생 → club_joined 배지 평가 (실패해도 클럽 생성 흐름 차단 X).
    void this.badgesService
      .checkAndAward(user_id)
      .catch((err) => console.error('[Groups] 클럽 생성 후 배지 평가 실패:', err));

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
          expires.getTime() < Date.now() ? SubscriptionStatus.EXPIRED : SubscriptionStatus.TRIAL;
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

    const avgMap = await this.computeGroupAverages(groups.map((g) => g.id));

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      activity_region: group.activity_region,
      cover_image_url: group.cover_image_url,
      created_at: group.created_at,
      member_count: group.members?.length ?? 0,
      // 클럽 모든 멤버의 모든 게임 평균. 게임이 없으면 0.
      avg_score: avgMap.get(group.id) ?? 0,
    }));
  }

  /**
   * 여러 클럽의 평균 점수를 한 번의 쿼리로 계산.
   * 의미: 각 클럽 멤버 전원의 모든 게임(개인/클럽 무관)을 합쳐 평균.
   * 게임이 없는 클럽은 결과 Map에 키가 존재하지 않음(호출자에서 ?? 0 처리).
   */
  private async computeGroupAverages(
    groupIds: number[],
  ): Promise<Map<number, number>> {
    if (groupIds.length === 0) return new Map();
    const rows = await this.gameRepository
      .createQueryBuilder('g')
      .innerJoin(GroupMember, 'm', 'm.user_id = g.user_id')
      .select('m.group_id', 'group_id')
      .addSelect('AVG(g.total_score)', 'avg')
      .where('m.group_id IN (:...groupIds)', { groupIds })
      .groupBy('m.group_id')
      .getRawMany<{ group_id: number | string; avg: number | string | null }>();
    const map = new Map<number, number>();
    for (const r of rows) {
      const id = Number(r.group_id);
      const v = Number(r.avg ?? 0);
      map.set(id, Number.isFinite(v) ? Math.round(v) : 0);
    }
    return map;
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

    const avgMap = await this.computeGroupAverages(list.map((m) => m.group.id));

    return list.map((m) => {
      const group = m.group;
      const members = group.members.map((gm) => ({
        user_id: gm.user.id,
        nickname: gm.user.nickname,
        profile_image_url: gm.user.profile_image_url,
        // 클라 측에서 ADMIN 뱃지를 숨기기 위한 플래그(플랫폼 어드민과 클럽 ADMIN 표시 분리).
        is_platform_admin: isPlatformAdmin(gm.user.id),
      }));

      // 클럽장(ADMIN) 찾기
      const admin = group.members.find((gm) => gm.role === GroupRole.ADMIN);

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        activity_region: group.activity_region,
        cover_image_url: group.cover_image_url,
        created_at: group.created_at,
        memberCount: members.length,
        memberSummary: members.slice(0, 3),
        leader_id: admin?.user_id ?? null,
        subscription_status: group.subscription_status,
        trial_started_at: group.trial_started_at,
        trial_expires_at: group.trial_expires_at,
        // 클럽 모든 멤버의 모든 게임 평균.
        avg_score: avgMap.get(group.id) ?? 0,
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
    const avgMap = await this.computeGroupAverages([id]);
    // entity 객체를 그대로 두고 응답 직렬화 시 추가 필드 동봉.
    return { ...group, avg_score: avgMap.get(id) ?? 0 };
  }

  /**
   * 클럽 리더보드: 멤버 전원의 누적 평균 / 최고 점수 / 경기 수를 집계하고
   * 평균 점수 내림차순으로 정렬해 반환한다.
   * 본인의 위치(myRank)도 함께 동봉.
   *
   * 정책:
   *  - 본인이 해당 클럽 멤버여야 조회 가능 (플랫폼 관리자 제외)
   *  - 경기 수 0인 멤버는 entries 하단에 위치 (avg 0 처리)
   */
  async getClubLeaderboard(groupId: number, requesterId: string) {
    // 멤버십 검증
    const myMembership = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: requesterId },
    });
    if (!myMembership && !isPlatformAdmin(requesterId)) {
      throw new ForbiddenException('클럽 멤버만 리더보드를 볼 수 있습니다.');
    }

    // 멤버 + 유저 정보
    const members = await this.groupMemberRepository.find({
      where: { group_id: groupId },
      relations: ['user'],
    });
    if (members.length === 0) {
      return {
        metric: 'avg',
        totalParticipants: 0,
        myRank: null,
        entries: [],
      };
    }

    const userIds = members.map((m) => m.user_id);
    // 모든 멤버의 게임을 한 번에 조회해 메모리에서 집계 (N+1 회피).
    const games = await this.gameRepository.find({
      where: { user_id: In(userIds) },
    });

    const statsByUser = new Map<
      string,
      { sum: number; highest: number; count: number }
    >();
    for (const g of games) {
      const cur =
        statsByUser.get(g.user_id) ?? { sum: 0, highest: 0, count: 0 };
      cur.sum += g.total_score;
      if (g.total_score > cur.highest) cur.highest = g.total_score;
      cur.count++;
      statsByUser.set(g.user_id, cur);
    }

    type Entry = {
      userId: string;
      nickname: string;
      avg: number;
      highest: number;
      gameCount: number;
    };

    const entries: Entry[] = members.map((m) => {
      const s = statsByUser.get(m.user_id) ?? { sum: 0, highest: 0, count: 0 };
      return {
        userId: m.user_id,
        nickname: m.user?.nickname ?? '알 수 없음',
        avg: s.count > 0 ? Number((s.sum / s.count).toFixed(1)) : 0,
        highest: s.highest,
        gameCount: s.count,
      };
    });

    // 정렬: 경기 있는 멤버 우선, 그 안에서 avg desc, 동률 시 highest desc.
    entries.sort((a, b) => {
      const aHas = a.gameCount > 0 ? 1 : 0;
      const bHas = b.gameCount > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (b.avg !== a.avg) return b.avg - a.avg;
      return b.highest - a.highest;
    });

    const ranked = entries.map((e, i) => ({ rank: i + 1, ...e }));
    const me = ranked.find((e) => e.userId === requesterId);

    return {
      metric: 'avg',
      totalParticipants: ranked.length,
      myRank: me
        ? {
            rank: me.rank,
            avg: me.avg,
            highest: me.highest,
            gameCount: me.gameCount,
          }
        : null,
      entries: ranked,
    };
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

    // 1인 1클럽 정책: 이미 다른 클럽에 가입된 상태면 새 가입 신청 차단.
    const otherMembership = await this.groupMemberRepository.findOne({
      where: { user_id: userId },
    });
    if (otherMembership) {
      throw new ConflictException(
        '이미 가입된 클럽이 있어 다른 클럽에 신청할 수 없습니다. 먼저 탈퇴 후 시도해주세요.',
      );
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

    // 신규 멤버십 발생 → club_joined 배지 평가 (실패해도 승인 흐름 차단 X).
    void this.badgesService
      .checkAndAward(request.user_id)
      .catch((err) => console.error('[Groups] 가입 승인 후 배지 평가 실패:', err));

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
          // 플랫폼 어드민 여부 — 클라가 클럽 ADMIN 뱃지를 숨기기 위해 사용.
          is_platform_admin: isPlatformAdmin(member.user_id),
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

  /**
   * 내가 ADMIN인 모든 클럽의 pending 가입 신청 합계.
   *
   * 하단 네비/헤더 뱃지 표시용. ADMIN이 아닌 일반 멤버는 항상 0.
   */
  async countPendingJoinRequestsForAdmin(userId: string): Promise<number> {
    const adminMemberships = await this.groupMemberRepository.find({
      where: { user_id: userId, role: GroupRole.ADMIN },
    });
    if (adminMemberships.length === 0) return 0;
    const groupIds = adminMemberships.map((m) => m.group_id);
    return this.joinRequestRepository.count({
      where: {
        group_id: In(groupIds),
        status: JoinRequestStatus.PENDING,
      },
    });
  }

  /**
   * 멤버를 ADMIN으로 승격(권한 위임).
   *
   * 호출자는 본인이 해당 클럽의 ADMIN이어야 한다.
   * 대상이 이미 ADMIN이거나 본인 자신이면 멱등 처리하지 않고 ConflictException 발생.
   *
   * @throws NotFoundException 클럽이 없음
   * @throws ForbiddenException 호출자가 ADMIN이 아님
   * @throws NotFoundException 대상이 해당 클럽 멤버가 아님
   * @throws ConflictException 대상이 본인이거나 이미 ADMIN
   */
  async promoteToAdmin(
    groupId: number,
    currentUserId: string,
    targetUserId: string,
  ): Promise<{ ok: true }> {
    if (currentUserId === targetUserId) {
      throw new ConflictException('본인은 위임 대상이 될 수 없습니다.');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('클럽을 찾을 수 없습니다.');
    }

    const me = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: currentUserId },
    });
    if (!me || me.role !== GroupRole.ADMIN) {
      throw new ForbiddenException('운영자만 권한을 위임할 수 있습니다.');
    }

    const target = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException('해당 사용자는 이 클럽의 멤버가 아닙니다.');
    }
    if (target.role === GroupRole.ADMIN) {
      throw new ConflictException('이미 운영자입니다.');
    }

    target.role = GroupRole.ADMIN;
    await this.groupMemberRepository.save(target);
    return { ok: true };
  }

  /**
   * 클럽 탈퇴.
   *
   * 정책:
   * - 일반 MEMBER: 즉시 탈퇴
   * - 다른 ADMIN이 또 있는 ADMIN: 즉시 탈퇴
   * - 유일한 ADMIN인데 다른 멤버가 남아 있음 → ConflictException (권한 위임 필요)
   * - 본인이 클럽의 유일 멤버 → 본인 row 삭제 + 클럽 자체 삭제(CASCADE로 멤버십/조인요청 정리)
   *
   * 클럽 게임 기록(games.group_id) 등은 보존된다.
   *
   * @throws NotFoundException 해당 클럽 멤버가 아님
   * @throws ConflictException 유일 ADMIN + 다른 멤버 존재
   */
  async leaveGroup(
    groupId: number,
    userId: string,
  ): Promise<{ ok: true; group_deleted: boolean }> {
    const me = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: userId },
    });
    if (!me) {
      throw new NotFoundException('가입된 클럽이 아닙니다.');
    }

    const totalMembers = await this.groupMemberRepository.count({
      where: { group_id: groupId },
    });

    // 유일 멤버 케이스: 본인 row + 클럽 자체 삭제.
    if (totalMembers === 1) {
      await this.groupMemberRepository.delete({
        group_id: groupId,
        user_id: userId,
      });
      // group_members, group_join_requests는 group.id에 onDelete CASCADE.
      await this.groupRepository.delete({ id: groupId });
      return { ok: true, group_deleted: true };
    }

    // ADMIN인데 다른 ADMIN이 없으면 위임 필요 (C3).
    if (me.role === GroupRole.ADMIN) {
      const otherAdmins = await this.groupMemberRepository.count({
        where: { group_id: groupId, role: GroupRole.ADMIN },
      });
      if (otherAdmins <= 1) {
        throw new ConflictException(
          '마지막 운영자입니다. 다른 멤버에게 운영자 권한을 위임한 후 탈퇴할 수 있습니다.',
        );
      }
    }

    await this.groupMemberRepository.delete({
      group_id: groupId,
      user_id: userId,
    });
    return { ok: true, group_deleted: false };
  }

  /**
   * 회원 추방. 운영자(ADMIN)가 다른 일반 멤버를 클럽에서 제거한다.
   *
   * 차단 정책:
   * - 호출자가 ADMIN이 아니면 ForbiddenException
   * - 자기 자신을 추방하려고 하면 ConflictException (탈퇴 기능을 사용)
   * - 대상이 클럽 멤버가 아니면 NotFoundException
   * - 대상이 ADMIN이면 추방 불가 (다른 ADMIN끼리는 위임/해제 흐름을 따라야 함)
   *
   * 추방 성공 시 대상에게 CLUB_KICKED 알림을 발송한다.
   */
  async kickMember(
    groupId: number,
    actorUserId: string,
    targetUserId: string,
  ): Promise<{ ok: true }> {
    if (actorUserId === targetUserId) {
      throw new ConflictException('본인은 추방할 수 없습니다. 탈퇴 기능을 사용하세요.');
    }

    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('클럽을 찾을 수 없습니다.');
    }

    const me = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: actorUserId },
    });
    if (!me || me.role !== GroupRole.ADMIN) {
      throw new ForbiddenException('운영자만 회원을 추방할 수 있습니다.');
    }

    const target = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException('해당 사용자는 이 클럽의 멤버가 아닙니다.');
    }
    if (target.role === GroupRole.ADMIN) {
      throw new ConflictException(
        '운영자는 추방할 수 없습니다. 운영자 권한을 위임받거나 본인이 직접 탈퇴하도록 안내해주세요.',
      );
    }

    await this.groupMemberRepository.delete({
      group_id: groupId,
      user_id: targetUserId,
    });

    // 추방된 사용자에게 알림. 실패해도 추방 자체는 성공으로 처리.
    void this.notificationsService
      .create({
        userId: targetUserId,
        type: NotificationType.CLUB_KICKED,
        title: '클럽에서 제거됨',
        body: `${group.name} 클럽에서 운영자에 의해 제거되었습니다.`,
        targetId: String(groupId),
      })
      .catch((err) =>
        console.error('[Groups] 추방 알림 전송 실패:', err),
      );

    return { ok: true };
  }

  // ─── 클럽 공지사항 ──────────────────────────────────────

  /**
   * 클럽 공지 목록 조회. 클럽 멤버 누구나 호출 가능.
   * 정렬: pinned desc → created_at desc.
   */
  async listAnnouncements(groupId: number, viewerUserId: string) {
    await this.assertMembership(groupId, viewerUserId);
    const rows = await this.announcementRepository.find({
      where: { group_id: groupId },
      relations: ['author'],
      order: { pinned: 'DESC', created_at: 'DESC' },
    });
    return rows.map((a) => ({
      id: a.id,
      group_id: a.group_id,
      title: a.title,
      body: a.body,
      pinned: a.pinned,
      created_at: a.created_at,
      updated_at: a.updated_at,
      author: {
        id: a.author?.id,
        nickname: a.author?.nickname,
        profile_image_url: a.author?.profile_image_url,
      },
    }));
  }

  /**
   * 공지 생성. 운영자만 호출 가능.
   * 작성 후 클럽 멤버 전원에게 CLUB_ANNOUNCEMENT 알림(작성자 제외).
   */
  async createAnnouncement(
    groupId: number,
    authorUserId: string,
    params: { title: string; body: string; pinned?: boolean },
  ) {
    await this.assertAdmin(groupId, authorUserId);
    const title = params.title?.trim();
    const body = params.body?.trim();
    if (!title || !body) {
      throw new BadRequestException('제목과 본문을 모두 입력해주세요.');
    }

    const entity = this.announcementRepository.create({
      group_id: groupId,
      author_id: authorUserId,
      title,
      body,
      pinned: params.pinned ?? false,
    });
    const saved = await this.announcementRepository.save(entity);

    // 같은 클럽 멤버(작성자 제외)에게 알림 발송. 실패해도 작성 자체는 성공.
    const memberRows = await this.groupMemberRepository.find({
      where: { group_id: groupId },
    });
    const recipientIds = memberRows
      .map((m) => m.user_id)
      .filter((id) => id !== authorUserId);
    const group = await this.groupRepository.findOne({ where: { id: groupId } });
    if (recipientIds.length > 0) {
      void this.notificationsService
        .createBulk(recipientIds, {
          type: NotificationType.CLUB_ANNOUNCEMENT,
          title: `${group?.name ?? '클럽'} 공지`,
          body: title,
          targetId: String(saved.id),
        })
        .catch((err) =>
          console.error('[Groups] 공지 알림 전송 실패:', err),
        );
    }

    return saved;
  }

  /**
   * 공지 수정. 운영자만.
   */
  async updateAnnouncement(
    groupId: number,
    announcementId: number,
    actorUserId: string,
    patch: { title?: string; body?: string; pinned?: boolean },
  ) {
    await this.assertAdmin(groupId, actorUserId);
    const row = await this.announcementRepository.findOne({
      where: { id: announcementId, group_id: groupId },
    });
    if (!row) throw new NotFoundException('공지를 찾을 수 없습니다.');

    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (!t) throw new BadRequestException('제목은 비울 수 없습니다.');
      row.title = t;
    }
    if (patch.body !== undefined) {
      const b = patch.body.trim();
      if (!b) throw new BadRequestException('본문은 비울 수 없습니다.');
      row.body = b;
    }
    if (patch.pinned !== undefined) row.pinned = patch.pinned;

    return this.announcementRepository.save(row);
  }

  /**
   * 공지 삭제. 운영자만.
   */
  async deleteAnnouncement(
    groupId: number,
    announcementId: number,
    actorUserId: string,
  ): Promise<{ ok: true }> {
    await this.assertAdmin(groupId, actorUserId);
    const result = await this.announcementRepository.delete({
      id: announcementId,
      group_id: groupId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('공지를 찾을 수 없습니다.');
    }
    return { ok: true };
  }

  /** 멤버 여부 확인 (공지 조회 권한 검증용). 멤버가 아니면 ForbiddenException. */
  private async assertMembership(groupId: number, userId: string): Promise<void> {
    const exists = await this.groupMemberRepository.findOne({
      where: { group_id: groupId, user_id: userId },
    });
    if (!exists && !isPlatformAdmin(userId)) {
      throw new ForbiddenException('클럽 멤버만 접근할 수 있습니다.');
    }
  }
}
