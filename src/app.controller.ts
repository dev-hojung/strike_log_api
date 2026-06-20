import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { PRIVACY_POLICY_HTML } from './legal/privacy-policy.html';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * 개인정보처리방침 공개 페이지. Play Store가 요구하는 공개 URL.
   * Flutter 앱의 PrivacyPolicyPage와 동일 내용을 유지한다.
   */
  @Public()
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  privacy(): string {
    return PRIVACY_POLICY_HTML;
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
