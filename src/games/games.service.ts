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
    createData: { total_score: number; play_date?: Date; frames?: Frame[] },
  ) {
    const game = this.gameRepository.create({
      user_id,
      total_score: createData.total_score,
      play_date: createData.play_date || new Date(),
      frames: createData.frames, // typeorm이 Frame 엔티티들을 cascade=true로 함께 생성해 줌
    });
    return this.gameRepository.save(game);
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
