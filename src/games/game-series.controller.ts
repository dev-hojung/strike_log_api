import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GameSeriesService } from './game-series.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { isPlatformAdmin } from '../common/admin';

@ApiTags('game-series')
@ApiBearerAuth('access-token')
@Controller('game-series')
export class GameSeriesController {
  constructor(private readonly seriesService: GameSeriesService) {}

  private assertSelfOrAdmin(actorId: string, targetId: string) {
    if (actorId !== targetId && !isPlatformAdmin(actorId)) {
      throw new ForbiddenException('다른 사용자의 시리즈에 접근할 수 없습니다.');
    }
  }

  @ApiOperation({ summary: '시리즈 시작' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['target_game_count'],
      properties: {
        target_game_count: { type: 'number', example: 3 },
        started_at: { type: 'string', nullable: true, example: '2026-05-14T03:00:00Z' },
      },
    },
  })
  @Post()
  createSeries(
    @CurrentUser('id') userId: string,
    @Body() body: { target_game_count: number; started_at?: string },
  ) {
    return this.seriesService.createSeries(userId, body);
  }

  @ApiOperation({ summary: '시리즈 종료' })
  @ApiParam({ name: 'id', type: 'number' })
  @Post(':id/complete')
  completeSeries(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seriesService.completeSeries(userId, id);
  }

  @ApiOperation({ summary: '시리즈 단건 조회 (게임 목록 포함)' })
  @ApiParam({ name: 'id', type: 'number' })
  @Get(':id')
  getSeries(
    @CurrentUser('id') userId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.seriesService.getSeriesWithGames(userId, id);
  }

  @ApiOperation({ summary: '사용자 최근 시리즈 목록' })
  @ApiParam({ name: 'userId', type: 'string' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @Get('users/:userId/recent')
  listRecent(
    @CurrentUser('id') actorId: string,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    this.assertSelfOrAdmin(actorId, userId);
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.seriesService.listRecentSeries(
      userId,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
    );
  }

  @ApiOperation({ summary: '사용자 베스트 시리즈 (완주 기준 총점 최고)' })
  @ApiParam({ name: 'userId', type: 'string' })
  @Get('users/:userId/best')
  getBest(
    @CurrentUser('id') actorId: string,
    @Param('userId') userId: string,
  ) {
    this.assertSelfOrAdmin(actorId, userId);
    return this.seriesService.getBestSeries(userId);
  }
}
