import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /**
   * 새로운 게임 기록 생성
   * 클라이언트가 user_id를 누락했을 때 'undefined' 문자열 변환으로 인한 외래키 제약조건 에러를 방지하기 위해 예외 처리를 추가했습니다.
   *
   * @param createData 게임 생성에 필요한 데이터 (user_id 필수 포함)
   * @returns 생성된 게임 기록
   * @throws {BadRequestException} user_id가 누락되었을 경우 발생
   */
  @Post()
  createGame(
    @Body()
    createData: {
      user_id: string;
      total_score: number;
      play_date?: Date;
      location?: string;
      frames?: any[]; // Frame DTO 대신 any 사용 최소화를 위해 임시 배열 허용
    },
  ) {
    if (!createData.user_id) {
      throw new BadRequestException('user_id가 필요합니다.');
    }
    // 실제 운영 시 @Req() req를 통해 req.user.id 등 토큰 기반 유저id 주입 필요
    // 여기서는 테스트를 위해 Body에 user_id를 포함한다고 가정.
    const user_id = createData.user_id;
    return this.gamesService.createGame(user_id, createData);
  }

  /**
   * 사용자 통계 (평균 점수, 최고 점수, 최근 10게임) 조회
   */
  @Get('users/:user_id/statistics')
  getUserStatistics(@Param('user_id') user_id: string) {
    return this.gamesService.getUserStatistics(user_id);
  }

  /**
   * 최근 게임 1건 상세 요약 조회
   */
  @Get('users/:user_id/recent')
  getRecentGame(@Param('user_id') user_id: string) {
    return this.gamesService.getRecentGame(user_id);
  }

  /**
   * 내 게임 기록 리스트 조회
   * FIXME: user_id는 토큰에서 추출해야 하나 임시로 Param/Query 취급.
   */
  @Get('me/:user_id')
  getMyGames(@Param('user_id') user_id: string) {
    return this.gamesService.getMyGames(user_id);
  }

  /**
   * 게임 상세 기록 조회
   */
  @Get(':id/detail/:user_id')
  getGameDetail(@Param('id') id: string, @Param('user_id') user_id: string) {
    return this.gamesService.getGameDetail(+id, user_id);
  }
}
