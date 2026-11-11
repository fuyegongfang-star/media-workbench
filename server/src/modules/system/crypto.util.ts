import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from 'node:crypto';

/**
 * 敏感字段加密（深入设计 §3.1）：AES-256-GCM，主密钥取自环境变量 APP_MASTER_KEY（64 位 hex）。
 * 密文格式：base64( iv(12) || authTag(16) || ciphertext )。
 *
 * 设计护栏（与 §3.1 一致）：
 * - 绝不写日志、绝不返回明文；明文为空返回空串（表示未配置）。
 * - 主密钥缺失/占位时仅在 encrypt/decrypt 实际调用时抛错，不在模块加载期阻断启动。
 * - 同一条明文每次加密密文不同（随机 IV），防止可预测。
 */
const ALGO: CipherGCMTypes = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export class SecretCrypto {
  private readonly key: Buffer;

  constructor(masterKeyHex: string) {
    const buf = Buffer.from(masterKeyHex, 'hex');
    if (buf.length !== 32) {
      throw new Error('[crypto] APP_MASTER_KEY 必须是 64 位 hex（32 字节）');
    }
    this.key = buf;
  }

  encrypt(plain: string): string {
    if (!plain) return '';
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payload: string): string {
    if (!payload) return '';
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}

let singleton: SecretCrypto | null = null;

/** 懒加载主密钥加密器（运行时读取环境变量，便于无 .env 时仍能启动）。 */
export function getSecretCrypto(): SecretCrypto {
  if (!singleton) {
    const master = process.env.APP_MASTER_KEY;
    if (!master || master.includes('<')) {
      throw new Error('[crypto] APP_MASTER_KEY 未配置（请在 .env 填写 64 位 hex 主密钥）');
    }
    singleton = new SecretCrypto(master);
  }
  return singleton;
}

/** 敏感字段脱敏展示：保留前缀 3 位 + 尾 4 位，中间打码（不泄露明文）。 */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
