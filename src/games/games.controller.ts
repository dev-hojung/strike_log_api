import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /**
   * 새로운 게임 기록 생성
   */
  @ApiOperation({ summary: '게임 기록 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['user_id', 'total_score'],
      properties: {
        user_id: { type: 'string', example: 'uuid-1234' },
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
    @Body()
    createData: {
      user_id: string;
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
    if (!createData.user_id) {
      throw new BadRequestException('user_id가 필요합니다.');
    }
    const user_id = createData.user_id;
    return this.gamesService.createGame(user_id, createData);
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
   */
  @ApiOperation({ summary: '유저 통계 조회 (평균/최고/최근 10게임)' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/statistics')
  getUserStatistics(@Param('user_id') user_id: string) {
    return this.gamesService.getUserStatistics(user_id);
  }

  /**
   * 최근 게임 1건 상세 요약 조회
   */
  @ApiOperation({ summary: '최근 게임 1건 상세 조회' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/recent')
  getRecentGame(@Param('user_id') user_id: string) {
    return this.gamesService.getRecentGame(user_id);
  }

  /**
   * 내 게임 기록 리스트 조회
   */
  @ApiOperation({ summary: '내 게임 기록 목록 조회' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('me/:user_id')
  getMyGames(@Param('user_id') user_id: string) {
    return this.gamesService.getMyGames(user_id);
  }

  /**
   * 이번 달 프레임 통계 (스트라이크, 스페어, 오픈, 올커버 게임 수)
   */
  @ApiOperation({ summary: '이번 달 프레임 통계 조회 (스트라이크/스페어/오픈/올커버)' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get('users/:user_id/monthly-frame-stats')
  getMonthlyFrameStats(@Param('user_id') user_id: string) {
    return this.gamesService.getMonthlyFrameStats(user_id);
  }

  /**
   * 게임 상세 기록 조회
   */
  @ApiOperation({ summary: '게임 상세 기록 조회' })
  @ApiParam({ name: 'id', description: '게임 ID', example: '42' })
  @ApiParam({ name: 'user_id', description: '유저 ID', example: 'uuid-1234' })
  @Get(':id/detail/:user_id')
  getGameDetail(@Param('id') id: string, @Param('user_id') user_id: string) {
    return this.gamesService.getGameDetail(+id, user_id);
  }
}
