/**
 * 备份脚本共享的纯函数（无副作用，便于单测）。
 */

export function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * 生成「文件系统安全 + 字典序可排序」的时间戳标签（本地时区，无分隔符）。
 * 例：2026-11-03T07:23:29 -> 20261103T072329
 */
export function timestampTag(d = new Date()) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}
