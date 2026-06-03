import * as dotenv from 'dotenv';
dotenv.config();

// FCM(googleapis.com) outbound 시 일부 네트워크에서 IPv6가 ETIMEDOUT으로 떨어진다.
// Node 20+의 Happy Eyeballs(autoSelectFamily=true)가 IPv4/IPv6를 병렬로 붙어서
// IPv6 timeout이 AggregateError에 같이 묶여 Firebase Admin 호출 전체가 실패함.
// IPv4 우선 + 자동 패밀리 선택 해제로 IPv4 단일 경로로 강제.
import * as dns from 'node:dns';
import * as net from 'node:net';
dns.setDefaultResultOrder('ipv4first');
// Node 20.0 도입, 20.5에서 setDefaultAutoSelectFamily 추가
if (typeof (net as any).setDefaultAutoSelectFamily === 'function') {
  (net as any).setDefaultAutoSelectFamily(false);
}

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Flutter 앱 또는 외부 클라이언트와의 연동을 위해 CORS를 활성화합니다.
  app.enableCors();

  // 프로필 이미지를 base64 Data URI로 전송하므로 기본 100KB 한도를 확장.
  // 클라 측에서도 350KB 한도(maxDataUriLength)로 차단하지만, 응답 조회 본문이 큰 경우를 대비해 여유.
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // [DEBUG] 인입 요청 로그 (메서드/경로/상태/소요시간). 진단 끝나면 제거 가능.
  const httpLogger = new Logger('HTTP');
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      httpLogger.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Strike Log API')
    .setDescription('볼링 클럽 관리 API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3001;
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  // 호스트 인자를 명시하지 않아 Node가 IPv4+IPv6 듀얼스택으로 listen하도록 한다 (Railway 호환).
  await app.listen(port);
  console.log(`[${nodeEnv}] Application is running on port ${port}`);
  console.log(`Swagger UI: /api`);
}
bootstrap().catch((err) => {
  console.error('Error starting server', err);
});
