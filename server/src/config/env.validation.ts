/**
 * 启动期环境变量校验：密钥/口令只来自环境变量，缺失或仍是占位符时快速失败。
 * 返回原对象（不做类型转换），避免 ConfigService.get 与 process.env 类型不一致。
 */
export const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'APP_MASTER_KEY', 'JWT_SECRET'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const invalid = REQUIRED_ENV_KEYS.filter((key) => {
    const value = config[key];
    // '<...>' 是 .env.example 的占位符，未替换时视为未配置
    return typeof value !== 'string' || value.trim() === '' || value.includes('<');
  });

  if (invalid.length > 0) {
    throw new Error(
      `[env] 缺失或仍是占位符: ${invalid.join(', ')}；请复制 .env.example 为 .env 并填写真实值（密钥禁止硬编码、禁止写日志）`,
    );
  }

  if (!/^postgresql:\/\//.test(String(config.DATABASE_URL))) {
    throw new Error('[env] DATABASE_URL 必须是 postgresql:// 开头的连接串');
  }

  return config;
}
