import { Injectable, Logger } from '@nestjs/common';

export interface DiscordNotifyOptions {
  source: 'http' | 'cron' | string;
  title: string;
  message: string;
  stack?: string;
  statusCode?: number;
  requestPath?: string;
  extra?: unknown;
}

@Injectable()
export class DiscordNotifierService {
  private readonly logger = new Logger(DiscordNotifierService.name);
  private readonly enabled: boolean;
  private readonly webhookUrl: string;
  private readonly lastSent = new Map<string, number>();

  private static readonly DEDUP_WINDOW_MS = 60_000;
  private static readonly MAX_DESCRIPTION_LEN = 1500;

  // embed colors
  private static readonly COLOR_RED = 0xe53935;
  private static readonly COLOR_ORANGE = 0xfb8c00;
  private static readonly COLOR_GREY = 0x9e9e9e;

  constructor() {
    const url = process.env.DISCORD_WEBHOOK_URL ?? '';
    if (!url) {
      this.logger.warn(
        'DISCORD_WEBHOOK_URL 미설정 — Discord 알림 비활성화 (로컬 dev 모드)',
      );
      this.enabled = false;
      this.webhookUrl = '';
    } else {
      this.enabled = true;
      this.webhookUrl = url;
    }
  }

  /**
   * Discord embed으로 에러를 알린다.
   * - de-dup: 동일 fingerprint는 60초 내 1회만 전송
   * - fire-and-forget: 호출자는 await 없이 void로 호출할 것
   * - 알림 자체 실패는 warn 로그로 흘려보냄 (throw 금지)
   */
  async notifyError(opts: DiscordNotifyOptions): Promise<void> {
    if (!this.enabled) return;

    const { source, title, message, stack, statusCode, requestPath, extra } = opts;

    // de-dup fingerprint
    const firstStackLine = stack ? stack.split('\n')[1]?.trim() ?? '' : '';
    const fingerprint = `${title}::${firstStackLine || message.slice(0, 100)}`;
    const now = Date.now();
    const last = this.lastSent.get(fingerprint) ?? 0;
    if (now - last < DiscordNotifierService.DEDUP_WINDOW_MS) return;
    this.lastSent.set(fingerprint, now);

    // embed color
    let color = DiscordNotifierService.COLOR_GREY;
    if (source === 'http' && statusCode !== undefined && statusCode >= 500) {
      color = DiscordNotifierService.COLOR_RED;
    } else if (source === 'cron') {
      color = DiscordNotifierService.COLOR_ORANGE;
    }

    // description: message + stack 코드블록
    let description = message;
    if (stack) {
      const codeBlock = `\`\`\`\n${stack}\n\`\`\``;
      const full = `${message}\n${codeBlock}`;
      description =
        full.length > DiscordNotifierService.MAX_DESCRIPTION_LEN
          ? full.slice(0, DiscordNotifierService.MAX_DESCRIPTION_LEN) + '…'
          : full;
    }

    // optional fields
    const fields: { name: string; value: string; inline: boolean }[] = [];
    if (source) fields.push({ name: 'source', value: source, inline: true });
    if (statusCode !== undefined)
      fields.push({ name: 'statusCode', value: String(statusCode), inline: true });
    if (requestPath)
      fields.push({ name: 'requestPath', value: requestPath, inline: true });
    if (extra !== undefined)
      fields.push({
        name: 'extra',
        value: `\`\`\`json\n${JSON.stringify(extra, null, 2).slice(0, 500)}\n\`\`\``,
        inline: false,
      });

    const payload = {
      embeds: [
        {
          title,
          description,
          color,
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.warn(
          `Discord webhook 응답 오류: ${res.status} ${res.statusText}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Discord webhook 전송 실패 (무시): ${(err as Error).message}`,
      );
    }
  }
}
