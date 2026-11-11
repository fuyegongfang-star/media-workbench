import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

// 兼容两种启动方式：从仓库根启动 / 从 server 目录启动
const envFiles = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')].filter((f) =>
  existsSync(f),
);

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: envFiles,
      validate: validateEnv,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
