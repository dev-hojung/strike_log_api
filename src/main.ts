import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Flutter 앱 또는 외부 클라이언트와의 연동을 위해 CORS를 활성화합니다.
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Strike Log API')
    .setDescription('볼링 클럽 관리 API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}
bootstrap().catch((err) => {
  console.error('Error starting server', err);
});
