import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { FcmToken } from './entities/fcm-token.entity';

/**
 * Firebase Admin SDK를 사용해 FCM 푸시를 전송한다.
 *
 * 초기화 방법 (둘 중 하나):
 * 1. `FIREBASE_SERVICE_ACCOUNT_PATH` 환경변수에 JSON 파일 경로 지정
 * 2. `GOOGLE_APPLICATION_CREDENTIALS` 환경변수 (gcloud 기본) 사용 → applicationDefault()
 *
 * 초기화에 실패하면 `enabled=false`로 남고, send()는 조용히 no-op이 된다.
 * (개발 환경에서 키 없이도 서버가 죽지 않도록)
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
  ) {}

  onModuleInit() {
    if (admin.apps.length > 0) {
      this.enabled = true;
      return;
    }
    try {
      const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (saPath) {
        const abs = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
        const raw = fs.readFileSync(abs, 'utf8');
        const json = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(json) });
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
      this.enabled = true;
      this.logger.log('Firebase Admin initialized');
    } catch (e) {
      this.enabled = false;
      this.logger.warn(
        `Firebase Admin init skipped: ${(e as Error).message}. Push send will be a no-op.`,
      );
    }
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    return this.sendToUsers([userId], payload);
  }

  async sendToUsers(
    userIds: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    if (!this.enabled || userIds.length === 0) return;

    const rows = await this.fcmTokenRepository.find({
      where: { userId: In(userIds) },
    });
    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) return;

    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
      });

      // 무효 토큰 정리
      const invalid: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code ?? '';
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalid.push(tokens[i]);
          } else {
            this.logger.warn(`FCM send error token=${tokens[i]}: ${code}`);
          }
        }
      });
      if (invalid.length > 0) {
        await this.fcmTokenRepository.delete({ token: In(invalid) });
        this.logger.log(`Removed ${invalid.length} invalid FCM tokens`);
      }
      this.logger.log(`FCM sent success=${res.successCount} failure=${res.failureCount}`);
    } catch (e) {
      this.logger.error(`FCM send failed: ${(e as Error).message}`);
    }
  }
}
