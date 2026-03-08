import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game } from './entities/game.entity';
import { Frame } from './entities/frame.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
  ) {}

  /**
   * 새로운 볼링 게임 기록 생성
   */
  async createGame(
    user_id: string,
    createData: { total_score: number; play_date?: Date; location?: string; frames?: Frame[] },
  ) {
    const game = this.gameRepository.create({
      user_id,
      total_score: createData.total_score,
      play_date: createData.play_date || new Date(),
      location: createData.location,
      frames: createData.frames, // typeorm이 Frame 엔티티들을 cascade=true로 함께 생성해 줌
    });
    return this.gameRepository.save(game);
  }

  /**
   * 유저의 볼링 통계 정보 (평균, 최고 점수, 최근 10경기) 조회
   */
  async getUserStatistics(user_id: string) {
    const allGames = await this.gameRepository.find({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });

    if (allGames.length === 0) {
      return {
        averageScore: 0,
        highestScore: 0,
        highestScoreDate: null,
        recentTrend: [],
      };
    }

    const totalScoreSum = allGames.reduce((sum, game) => sum + game.total_score, 0);
    const averageScore = Math.round(totalScoreSum / allGames.length);

    let highestScore = 0;
    let highestScoreDate: Date | null = null;
    allGames.forEach((game) => {
      if (game.total_score > highestScore) {
        highestScore = game.total_score;
        highestScoreDate = game.play_date;
      }
    });

    // 최근 10경기는 최신순으로 정렬되어 있으므로 처음 10개를 가져와서, 차트에 그리기 위해 오래된 순으로 역순 정렬
    const recentTrend = allGames
      .slice(0, 10)
      .reverse()
      .map((game) => ({
        score: game.total_score,
        date: game.play_date,
      }));

    return {
      averageScore,
      highestScore,
      highestScoreDate,
      recentTrend,
    };
  }

  /**
   * 최근 게임 1건 조회
   */
  async getRecentGame(user_id: string) {
    const game = await this.gameRepository.findOne({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });
    if (!game) {
      throw new NotFoundException('최근 게임 기록이 없습니다.');
    }
    return game;
  }

  /**
   * 내 게임 기록 목록 조회
   */
  async getMyGames(user_id: string) {
    return this.gameRepository.find({
      where: { user_id },
      order: { play_date: 'DESC', created_at: 'DESC' },
    });
  }

  /**
   * 특정 게임의 상세 정보(프레임 포함) 조회
   */
  async getGameDetail(id: number, user_id: string) {
    const game = await this.gameRepository.findOne({
      where: { id, user_id },
      relations: ['frames'], // 프레임 기록 함께 반환
    });

    if (!game) {
      throw new NotFoundException('해당 게임 기록을 찾을 수 없습니다.');
    }
    return game;
  }
}
