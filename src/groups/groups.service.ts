import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupMember, GroupRole } from './entities/group-member.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(GroupMember)
    private readonly groupMemberRepository: Repository<GroupMember>,
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
    return this.groupRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  /**
   * 내가 가입한 클럽 리스트 및 멤버 요약 조회 (대시보드용)
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

      // 엔티티 순환 참조 및 불필요한 데이터 제거 후 요약본 반환
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        cover_image_url: group.cover_image_url,
        created_at: group.created_at,
        memberCount: members.length,
        memberSummary: members.slice(0, 3), // 화면에 보여줄 3명만 추출
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

  /**
   * 클럽 가입 요청
   */
  async joinGroup(id: number, user_id: string) {
    // validation만 수행하고 변수를 안쓰므로 예외만 통과시키도록 처리
    await this.getGroupDetail(id);

    const exist = await this.groupMemberRepository.findOne({
      where: { group_id: id, user_id },
    });
    if (exist) {
      throw new BadRequestException('이미 가입된 클럽입니다.');
    }

    const member = this.groupMemberRepository.create({
      group_id: id,
      user_id,
      role: GroupRole.MEMBER,
    });
    return this.groupMemberRepository.save(member);
  }

  /**
   * 클럽 멤버 리스트 반환
   */
  async getMembers(id: number) {
    return this.groupMemberRepository.find({
      where: { group_id: id },
      relations: ['user'], // 유저 정보도 함께
      order: { role: 'ASC', joined_at: 'ASC' },
    });
  }
}
