import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { Game } from '../games/entities/game.entity';
import { Frame } from '../games/entities/frame.entity';
import {
  WEEKLY_CHALLENGES,
  WeeklyChallengeKey,
} from './challenge-catalog';

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Game)
    private readonly gameRepository: Repository<Game>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
  ) {}

  /**
   * 사용자의 이번 주 챌린지 진행률 조회.
   *
   * 정의된 모든 챌린지에 대해 현재 값/목표/달성률(0~100)을 반환한다.
   * 주 경계: KST(Asia/Seoul) 월요일 00:00 ~ 일요일 23:59:59.
   */
  async getMyWeekly(userId: string) {
    const { start, end } = this._kstWeekRangeUtc();

    // 이번 주 게임 + frames(스트라이크 카운트용)
    const games = await this.gameRepository.find({
      where: {
        user_id: userId,
        play_date: Between(this._ymdKst(start), this._ymdKst(end)),
      },
      relations: ['frames'],
    });

    const gameCount = games.length;
    const totalScoreSum = games.reduce((s, g) => s + g.total_score, 0);
    const avgScore =
      gameCount > 0 ? Math.round(totalScoreSum / gameCount) : 0;

    // 스트라이크 카운트
    let strikes = 0;
    for (const g of games) {
      for (const f of g.frames ?? []) {
        if (f.first_roll === 10) strikes++;
        if (f.frame_number === 10) {
          if (f.second_roll === 10) strikes++;
          if (f.third_roll === 10) strikes++;
        }
      }
    }

    return WEEKLY_CHALLENGES.map((def) => {
      let current = 0;
      let valid = true;
      switch (def.key) {
        case WeeklyChallengeKey.GAMES_5:
          current = gameCount;
          break;
        case WeeklyChallengeKey.AVG_180:
          // 3게임 이상일 때만 의미 있음. 미만이면 진행 중 표기는 하지만 달성 불가.
          current = gameCount >= 3 ? avgScore : 0;
          valid = gameCount >= 3;
          break;
        case WeeklyChallengeKey.STRIKES_30:
          current = strikes;
          break;
      }
      const percent = def.target > 0
        ? Math.min(100, Math.round((current / def.target) * 100))
        : 0;
      const achieved = valid && current >= def.target;
      return {
        key: def.key,
        name: def.name,
        description: def.description,
        target: def.target,
        unit: def.unit,
        current,
        percent,
        achieved,
        // 주 시작/끝 (ISO UTC)
        week_start: start.toISOString(),
        week_end: end.toISOString(),
      };
    });
  }

  // ─── KST 주 경계 헬퍼 ────────────────────────────

  /**
   * 현재 시각이 속한 KST 주의 월요일 00:00 ~ 일요일 23:59:59:999 (UTC Date 반환).
   * 월요일 시작이 한국 볼링 동호회/주간 챌린지 정서에 더 자연스러움.
   */
  private _kstWeekRangeUtc(): { start: Date; end: Date } {
    const nowUtc = new Date();
    // 현재 시각의 KST 표현(에포크에 9시간 더한 UTC Date로 흉내내기).
    const kstNow = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
    const day = kstNow.getUTCDay(); // 0=일 1=월 ... 6=토
    const daysSinceMonday = (day + 6) % 7; // 월요일=0, 일요일=6
    // 이번 주 월요일 KST 00:00
    const kstMonday = new Date(kstNow);
    kstMonday.setUTCDate(kstNow.getUTCDate() - daysSinceMonday);
    kstMonday.setUTCHours(0, 0, 0, 0);
    // 이번 주 일요일 KST 23:59:59.999
    const kstSunday = new Date(kstMonday);
    kstSunday.setUTCDate(kstMonday.getUTCDate() + 6);
    kstSunday.setUTCHours(23, 59, 59, 999);

    // KST → UTC 환산 (9시간 빼기)
    const startUtc = new Date(kstMonday.getTime() - 9 * 60 * 60 * 1000);
    const endUtc = new Date(kstSunday.getTime() - 9 * 60 * 60 * 1000);
    return { start: startUtc, end: endUtc };
  }

  /**
   * UTC Date → KST yyyy-MM-dd 문자열.
   * play_date 컬럼이 MySQL DATE 타입이라 Between으로 비교할 때 같은 포맷이 필요.
   */
  private _ymdKst(d: Date): string {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  }
}
