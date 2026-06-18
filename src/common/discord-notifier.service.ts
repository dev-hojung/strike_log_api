import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface DiscordNotifyOptions {
  source: 'http' | 'cron' | string;
  title: string;
  message: string;
  stack?: string;
  statusCode?: number;
  requestPath?: string;
  extra?: unknown;
}

export interface DiscordInquiryOptions {
  title: string;
  message: string;
  fields?: { name: string; value: string; inline?: boolean }[];
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline: boolean }[];
  timestamp: string;
}

interface ChannelConfig {
  url: string;
  mention: string;
}

/**
 * Discord 채널 알림 서비스.
 *
 * 두 종류의 채널을 분리해서 운용한다:
 * - 에러: DISCORD_WEBHOOK_URL (+ 선택 DISCORD_ALERT_MENTION)
 * - 문의: DISCORD_INQUIRY_WEBHOOK_URL (+ 선택 DISCORD_INQUIRY_MENTION)
 *
 * URL 미설정 시 해당 채널만 disabled. 다른 채널엔 영향 없음.
 */
@Injectable()
export class DiscordNotifierService implements OnModuleInit {
  private readonly logger = new Logger(DiscordNotifierService.name);
  private readonly errorChannel: ChannelConfig;
  private readonly inquiryChannel: ChannelConfig;
  private readonly lastSent = new Map<string, number>();

  private static readonly DEDUP_WINDOW_MS = 60_000;
  private static readonly MAX_DESCRIPTION_LEN = 1500;

  // embed colors
  private static readonly COLOR_RED = 0xe53935;
  private static readonly COLOR_ORANGE = 0xfb8c00;
  private static readonly COLOR_GREY = 0x9e9e9e;
  private static readonly COLOR_GREEN = 0x4caf50;
  private static readonly COLOR_BLUE = 0x1e88e5;

  constructor() {
    this.errorChannel = {
      url: (process.env.DISCORD_WEBHOOK_URL ?? '').trim(),
      mention: (process.env.DISCORD_ALERT_MENTION ?? '').trim(),
    };
    this.inquiryChannel = {
      url: (process.env.DISCORD_INQUIRY_WEBHOOK_URL ?? '').trim(),
      mention: (process.env.DISCORD_INQUIRY_MENTION ?? '').trim(),
    };

    if (!this.errorChannel.url) {
      this.logger.warn(
        'DISCORD_WEBHOOK_URL 미설정 — 에러 알림 비활성화 (로컬 dev 모드)',
      );
    }
    if (!this.inquiryChannel.url) {
      this.logger.warn(
        'DISCORD_INQUIRY_WEBHOOK_URL 미설정 — 문의 알림 비활성화',
      );
    }
  }

  /**
   * Discord embed으로 에러를 알린다 (에러 채널).
   * - de-dup: 동일 fingerprint는 60초 내 1회만 전송
   * - fire-and-forget: 호출자는 await 없이 void로 호출할 것
   * - 알림 자체 실패는 warn 로그로 흘려보냄 (throw 금지)
   */
  async notifyError(opts: DiscordNotifyOptions): Promise<void> {
    if (!this.errorChannel.url) return;

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

    const embed: DiscordEmbed = {
      title,
      description,
      color,
      fields,
      timestamp: new Date().toISOString(),
    };
    await this.sendEmbed(this.errorChannel, embed, { withMention: true });
  }

  /**
   * 사용자가 인앱 폼으로 보낸 문의를 문의 채널에 알린다.
   */
  async notifyInquiry(opts: DiscordInquiryOptions): Promise<void> {
    if (!this.inquiryChannel.url) return;

    const description =
      opts.message.length > DiscordNotifierService.MAX_DESCRIPTION_LEN
        ? opts.message.slice(0, DiscordNotifierService.MAX_DESCRIPTION_LEN) + '…'
        : opts.message;

    const embed: DiscordEmbed = {
      title: opts.title,
      description,
      color: DiscordNotifierService.COLOR_BLUE,
      fields: (opts.fields ?? []).map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? true,
      })),
      timestamp: new Date().toISOString(),
    };
    await this.sendEmbed(this.inquiryChannel, embed, { withMention: true });
  }

  /**
   * 서버 부팅 시 헬스 체크용 알림 1회 발송 (에러 채널).
   * DISCORD_NOTIFY_STARTUP=on 일 때만 보낸다 (매 재배포마다 보내면 노이즈가 커서 기본 OFF).
   */
  onModuleInit(): void {
    if (!this.errorChannel.url) return;
    if (process.env.DISCORD_NOTIFY_STARTUP !== 'on') return;
    const env = process.env.NODE_ENV ?? 'development';
    const embed: DiscordEmbed = {
      title: `🟢 Strike Log API 시작됨`,
      description: `환경: \`${env}\`\nDiscord webhook 연동 정상.`,
      color: DiscordNotifierService.COLOR_GREEN,
      fields: [],
      timestamp: new Date().toISOString(),
    };
    void this.sendEmbed(this.errorChannel, embed, { withMention: false });
  }

  /**
   * 공통 webhook 발송 헬퍼. 멘션 포함 여부는 호출자가 결정.
   * 호출 실패는 warn으로 흘려보내고 throw 금지(재귀 방지).
   */
  private async sendEmbed(
    channel: ChannelConfig,
    embed: DiscordEmbed,
    opts: { withMention: boolean },
  ): Promise<void> {
    const payload: Record<string, unknown> = { embeds: [embed] };
    if (opts.withMention && channel.mention) {
      payload.content = channel.mention;
      payload.allowed_mentions = { parse: ['users', 'roles', 'everyone'] };
    }
    try {
      const res = await fetch(channel.url, {
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
