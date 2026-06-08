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
 * 초기화 우선순위:
 * 1. `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` 환경변수
 * 2. `FIREBASE_SERVICE_ACCOUNT_PATH` 환경변수의 JSON 파일
 * 3. `GOOGLE_APPLICATION_CREDENTIALS` (gcloud 기본) → applicationDefault()
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
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
      const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

      if (projectId && clientEmail && privateKeyRaw) {
        // .env의 PEM은 \n이 리터럴로 들어오므로 실제 개행으로 복원
        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      } else if (saPath) {
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
    if (!this.enabled) {
      this.logger.warn(
        `sendToUsers skipped (admin disabled). users=${userIds.join(',')} title="${payload.title}"`,
      );
      return;
    }
    if (userIds.length === 0) return;

    const rows = await this.fcmTokenRepository.find({
      where: { userId: In(userIds) },
    });
    const tokens = rows.map((r) => r.token);
    this.logger.log(
      `sendToUsers users=${userIds.join(',')} tokens=${tokens.length} title="${payload.title}" data=${JSON.stringify(payload.data ?? {})}`,
    );
    if (tokens.length === 0) {
      this.logger.warn(`No FCM tokens for users=${userIds.join(',')} — push not sent.`);
      return;
    }

    const start = Date.now();
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: {
          priority: 'high',
          notification: {
            // 클라이언트에서 만든 high-importance 채널과 일치시켜야
            // 백그라운드 푸시도 heads-up으로 뜬다.
            channelId: 'strike_log_default_v2',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            // Android 자동 그룹화는 4개 이상 누적되면 후속 알림에 SILENT을 붙인다.
            // 동일 tag로 통일해 신규 알림이 기존 알림을 대체하도록 강제.
            // (앱 내부 알림 페이지엔 DB 기반으로 모든 이력이 남아있음)
            tag: 'strike_log_default_v2',
          },
        },
        apns: {
          payload: {
            aps: { sound: 'default' },
          },
        },
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
      this.logger.log(
        `FCM sent success=${res.successCount} failure=${res.failureCount} elapsed=${Date.now() - start}ms`,
      );
    } catch (e) {
      this.logger.error(
        `FCM send failed after ${Date.now() - start}ms: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 시스템 공지 전용. fcm_tokens 테이블의 모든 토큰(로그아웃 디바이스 포함)에 푸시.
   * 개인 알림과 다르게 userId 필터링을 안 함.
   */
  async sendToAllDevices(payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(
        `sendToAllDevices skipped (admin disabled). title="${payload.title}"`,
      );
      return;
    }
    const rows = await this.fcmTokenRepository.find();
    const tokens = rows.map((r) => r.token);
    this.logger.log(
      `sendToAllDevices tokens=${tokens.length} title="${payload.title}"`,
    );
    if (tokens.length === 0) {
      this.logger.warn('No FCM tokens — broadcast not sent.');
      return;
    }

    // FCM multicast 한도 500. 안전하게 500개씩 잘라서 보낸다.
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    const start = Date.now();
    let totalSuccess = 0;
    let totalFailure = 0;
    const invalid: string[] = [];

    for (const chunk of chunks) {
      try {
        const res = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: {
            priority: 'high',
            notification: {
              channelId: 'strike_log_default_v2',
              priority: 'high',
              defaultSound: true,
              defaultVibrateTimings: true,
              tag: 'strike_log_default_v2',
            },
          },
          apns: { payload: { aps: { sound: 'default' } } },
        });
        totalSuccess += res.successCount;
        totalFailure += res.failureCount;
        res.responses.forEach((r, i) => {
          if (!r.success) {
            const code = r.error?.code ?? '';
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/invalid-argument'
            ) {
              invalid.push(chunk[i]);
            } else {
              this.logger.warn(`broadcast send error token=${chunk[i]}: ${code}`);
            }
          }
        });
      } catch (e) {
        this.logger.error(
          `broadcast chunk failed: ${(e as Error).message}`,
        );
      }
    }

    if (invalid.length > 0) {
      await this.fcmTokenRepository.delete({ token: In(invalid) });
      this.logger.log(`Removed ${invalid.length} invalid FCM tokens`);
    }
    this.logger.log(
      `broadcast done success=${totalSuccess} failure=${totalFailure} elapsed=${Date.now() - start}ms`,
    );
  }
}
