import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestContextInterceptor } from './common/request-context.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX') ?? 'api';
  app.setGlobalPrefix(prefix);

  // 全局输入校验：白名单 + 丢弃多余字段 + 类型转换（防注入/越权字段）
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // 请求上下文拦截器：把认证用户注入 AsyncLocalStorage，供 Prisma 审计中间件读取（T1.3 / 深入设计 §2.4）
  app.useGlobalInterceptors(new RequestContextInterceptor());

  const origins = (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: false });
  app.enableShutdownHooks();

  const port = Number(config.get<string>('PORT') ?? 3001);
  const host = config.get<string>('HOST') ?? '127.0.0.1';
  await app.listen(port, host);
  logger.log(`API 已启动：http://${host}:${port}/${prefix} （日志不含任何密钥）`);
}

bootstrap().catch((error: unknown) => {
  // 仅打印错误摘要，不回显环境变量内容
  console.error('[bootstrap] 启动失败：', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
