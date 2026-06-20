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

  /**
   * AdMob app-ads.txt (광고 인벤토리 인증). 도메인 루트로 제공해야 한다.
   * AdMob이 스토어 등록정보의 개발자 웹사이트 도메인에서 이 파일을 크롤링한다.
   */
  @Public()
  @Get('app-ads.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  appAdsTxt(): string {
    return 'google.com, pub-2629679506425191, DIRECT, f08c47fec0942fa0\n';
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
