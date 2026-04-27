import { Controller, Get, Post, Body, Param, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { isPlatformAdmin } from '../common/admin';

@ApiTags('games')
@ApiBearerAuth('access-token')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /**
   * 본인 또는 플랫폼 관리자만 다른 user_id 자원에 접근하도록 검증.
   * 보수적 정책: 자기 자신 또는 관리자만 허용.
   */
  private assertSelfOrAdmin(actorId: string, targetId: string) {
    if (actorId !== targetId && !isPlatformAdmin(actorId)) {
      throw new ForbiddenException('다른 사용자의 게임 정보에 접근할 수 없습니다.');
    }
  }

  /**
   * 새로운 게임 기록 생성
   */
  @ApiOperation({ summary: '게임 기록 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['total_score'],
      properties: {
        total_score: { type: 'number', example: 189 },
        play_date: { type: 'string', format: 'date-time', example: '2024-04-19T14:00:00Z' },
        location: { type: 'string', example: '강남 볼링장' },
        frames: {
          type: 'array',
          items: { type: 'object' },
          description: '프레임별 투구 데이터',
        },
        is_club_game: { type: 'boolean', example: false },
        room_id: { type: 'string', nullable: true, example: 'ROOM-ABC' },
        club_rank: { type: 'number', nullable: true, example: 1 },
        started_at: { type: 'string', nullable: true, example: '2024-04-19T14:00:00Z' },
        ended_at: { type: 'string', nullable: true, example: '2024-04-19T14:30:00Z' },
      },
    },
  })
  @Post()
  createGame(
    @CurrentUser('id') userId: string,
    @Body()
    createData: {
      total_score: number;
      play_date?: Date;
      location?: string;
      frames?: any[];
      is_club_game?: boolean;
      room_id?: string | null;
      club_rank?: number | null;
      started_at?: string | null;
      ended_at?: string | null;
    },
  ) {
    return this.gamesService.createGame(userId, createData);
  }

  /**
   * 특정 방 코드로 저장된 클럽 게임 참가자 전원의 기록 조회
   */
  @ApiOperation({ summary: '클럽 게임 방 기록 조회 (방 코드 기준)' })
  @ApiParam({ name: 'room_id', description: '게임 방 ID', example: 'ROOM-ABC' })
  @Get('club/:room_id')
  getClubGameByRoom(@Param('room_id') room_id: string) {
    return this.gamesService.getClubGameByRoom(room_id);
  }

  /**
   * 사용자 통계 (평균 점수, 최고 점수, 최근 10게임) 조회
   * 본인 또는 플랫폼 관리자만 접근 가능 (보수적 정책).
   */
  @ApiOperation({ summary: '유저 통계 조회 (평균/최고/최근 10게임) — 본인/관리자만' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/statistics')
  getUserStatistics(@Param('user_id') user_id: string, @CurrentUser('id') actorId: string) {
    this.assertSelfOrAdmin(actorId, user_id);
    return this.gamesService.getUserStatistics(user_id);
  }

  /**
   * 최근 게임 1건 상세 요약 조회 — 본인/관리자만.
   */
  @ApiOperation({ summary: '최근 게임 1건 상세 조회 — 본인/관리자만' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/recent')
  getRecentGame(@Param('user_id') user_id: string, @CurrentUser('id') actorId: string) {
    this.assertSelfOrAdmin(actorId, user_id);
    return this.gamesService.getRecentGame(user_id);
  }

  /**
   * 내 게임 기록 리스트 조회
   */
  @ApiOperation({ summary: '내 게임 기록 목록 조회' })
  @Get('me')
  getMyGames(@CurrentUser('id') userId: string) {
    return this.gamesService.getMyGames(userId);
  }

  /**
   * 이번 달 프레임 통계 (스트라이크, 스페어, 오픈, 올커버 게임 수)
   * 본인/관리자만.
   */
  @ApiOperation({
    summary: '이번 달 프레임 통계 조회 (스트라이크/스페어/오픈/올커버) — 본인/관리자만',
  })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/monthly-frame-stats')
  getMonthlyFrameStats(@Param('user_id') user_id: string, @CurrentUser('id') actorId: string) {
    this.assertSelfOrAdmin(actorId, user_id);
    return this.gamesService.getMonthlyFrameStats(user_id);
  }

  /**
   * 게임 상세 기록 조회 — 본인 게임만 조회 가능.
   */
  @ApiOperation({ summary: '게임 상세 기록 조회 — 본인만' })
  @ApiParam({ name: 'id', description: '게임 ID', example: '42' })
  @Get(':id/detail')
  getGameDetail(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.gamesService.getGameDetail(+id, userId);
  }
}
