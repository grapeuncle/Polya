/**
 * 从 Cursor/VS Code 插件配置导入 Polya Web 应用 .env
 * 来源：%APPDATA%/Cursor/User/settings.json
 * 密钥：优先 settings 明文 polyaSolver.apiKey，其次尝试 SecretStorage（仅检测是否存在）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function cursorSettingsPath() {
  const appData = process.env.APPDATA || '';
  return path.join(appData, 'Cursor', 'User', 'settings.json');
}

function readSettings() {
  const p = cursorSettingsPath();
  if (!fs.existsSync(p)) {
    throw new Error(`未找到 Cursor 设置：${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pick(cfg, key, fallback = '') {
  const v = cfg[key];
  return v === undefined || v === null || v === '' ? fallback : String(v);
}

function buildEnv(cfg, existingEnv = '') {
  const engine = pick(cfg, 'polyaSolver.engine', 'deepseek');
  const apiKeyFromSettings = pick(cfg, 'polyaSolver.apiKey', '');

  // 保留已有 .env 中的密钥（若 settings 无明文）
  let apiKey = apiKeyFromSettings;
  if (!apiKey && existingEnv) {
    const m = existingEnv.match(/^POLYA_API_KEY=(.*)$/m);
    if (m && m[1].trim()) {
      apiKey = m[1].trim();
    }
  }

  const lines = [
    '# 由 scripts/import-cursor-settings.mjs 从 Cursor 插件配置导入',
    `# 来源：${cursorSettingsPath()}`,
    `# 导入时间：${new Date().toISOString()}`,
    '',
    `POLYA_ENGINE=${engine}`,
    `POLYA_API_KEY=${apiKey}`,
    '',
    `POLYA_OPENAI_BASE_URL=${pick(cfg, 'polyaSolver.openai.baseUrl', 'https://api.openai.com/v1')}`,
    `POLYA_OPENAI_MODEL=${pick(cfg, 'polyaSolver.openai.model', 'gpt-4o-mini')}`,
    '',
    `POLYA_ANTHROPIC_BASE_URL=${pick(cfg, 'polyaSolver.anthropic.baseUrl', 'https://api.anthropic.com')}`,
    `POLYA_ANTHROPIC_MODEL=${pick(cfg, 'polyaSolver.anthropic.model', 'claude-3-5-sonnet-latest')}`,
    '',
    // deepseek 引擎走 OpenAI 兼容 /v1，勿与 anthropic 端点混淆
    `POLYA_DEEPSEEK_BASE_URL=${pick(cfg, 'polyaSolver.deepseek.baseUrl', 'https://api.deepseek.com/v1').replace(/\\/anthropic\\/?$/, '/v1')}`,
    `POLYA_DEEPSEEK_MODEL=${pick(cfg, 'polyaSolver.deepseek.model', 'deepseek-chat')}`,
    '',
    `PORT=${process.env.PORT || '3001'}`,
    '',
    '# 客户端偏好（写入注释，由浏览器 localStorage 使用）',
    `# POLYA_DIFFICULTY=${pick(cfg, 'polyaSolver.difficulty', 'standard')}`,
    `# POLYA_TEACHER_MODE=${pick(cfg, 'polyaSolver.teacherMode', 'false')}`,
    '',
  ];

  return {
    content: lines.join('\n'),
    meta: {
      engine,
      hasApiKey: Boolean(apiKey),
      deepseekModel: pick(cfg, 'polyaSolver.deepseek.model', 'deepseek-chat'),
      difficulty: pick(cfg, 'polyaSolver.difficulty', 'standard'),
      teacherMode: pick(cfg, 'polyaSolver.teacherMode', 'false'),
    },
  };
}

async function checkSecretExists() {
  const dbPath = path.join(
    process.env.APPDATA || '',
    'Cursor',
    'User',
    'globalStorage',
    'state.vscdb'
  );
  if (!fs.existsSync(dbPath)) {
    return { exists: false, reason: 'state.vscdb 不存在' };
  }
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);
    const extId = 'polya-tutor.polya-solver';
    const key = `secret://{"extensionId":"${extId}","key":"polyaSolver.apiKey"}`;
    const stmt = db.prepare('SELECT length(value) as len FROM ItemTable WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const len = stmt.getAsObject().len;
      stmt.free();
      db.close();
      return { exists: true, encryptedBytes: len };
    }
    stmt.free();
    db.close();
    return { exists: false, reason: 'SecretStorage 中无 polyaSolver.apiKey 记录' };
  } catch (e) {
    return { exists: false, reason: e.message };
  }
}

async function main() {
  console.log('从 Cursor 插件配置导入 Polya 设置...\n');

  const cfg = readSettings();
  const envPath = path.join(root, '.env');
  const existingEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const { content, meta } = buildEnv(cfg, existingEnv);
  const secret = await checkSecretExists();

  fs.writeFileSync(envPath, content, 'utf8');

  console.log('已写入:', envPath);
  console.log('  引擎:', meta.engine);
  console.log('  DeepSeek 模型:', meta.deepseekModel);
  console.log('  难度（请在前端 localStorage 生效）:', meta.difficulty);
  console.log('  API 密钥:', meta.hasApiKey ? '已从 settings 导入' : '未导入（见下方说明）');

  if (secret.exists) {
    console.log(
      '\n检测到 Cursor SecretStorage 中有加密密钥（',
      secret.encryptedBytes,
      '字节），无法自动解密。'
    );
    console.log('请任选其一：');
    console.log('  1. 在 .env 中手动填写 POLYA_API_KEY=你的密钥');
    console.log('  2. 在 Cursor 中打开旧插件，运行「Polya: 设置 API 密钥」查看后复制到 .env');
  } else if (!meta.hasApiKey) {
    console.log('\n未找到 API 密钥。请在 .env 设置 POLYA_API_KEY 或环境变量 DEEPSEEK_API_KEY。');
    if (secret.reason) {
      console.log('  SecretStorage:', secret.reason);
    }
  }

  // 同步客户端默认偏好到说明文件（可选 localStorage 种子）
  const prefsPath = path.join(root, 'public', 'imported-prefs.json');
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(
    prefsPath,
    JSON.stringify(
      {
        difficulty: meta.difficulty,
        teacherMode: meta.teacherMode === 'true',
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('\n客户端偏好种子（首次访问时自动应用）:', prefsPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
