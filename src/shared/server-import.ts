import type { ServerConfig } from './types';
import { InputError, validateConfig } from './validation';

export const MAX_SERVERS = 200;
export const MAX_SERVER_IMPORT_BYTES = 8 * 1024 * 1024;

/** Validate the entire selection before returning any configs to be saved. */
export function validateServerImport(value: unknown): ServerConfig[] {
  const items = Array.isArray(value) ? value : [value];
  if (!items.length) throw new InputError('配置数组不能为空，请至少提供一台服务器');
  if (items.length > MAX_SERVERS) throw new InputError(`单次最多导入 ${MAX_SERVERS} 台服务器`);
  const configs: ServerConfig[] = [];
  const errors: string[] = [];
  for (const [index, item] of items.entries()) {
    try {
      configs.push(validateConfig(item));
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      errors.push(`第 ${index + 1} 项：${error.message}`);
    }
  }
  if (errors.length) throw new InputError(`配置校验失败，整批未导入：\n${errors.join('\n')}`);
  return configs;
}
