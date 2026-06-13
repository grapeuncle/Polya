// 测试脚本：提交平面向量综合题并收集完整解题结果
import http from 'http';
import fs from 'fs';
import katex from 'katex';

const BASE = 'http://localhost:3001';
const OUTPUT_FILE = 'c:/zmz/prj/Polya/test_output.txt';

const PROBLEM = `已知平面向量 $\\vec{a},\\vec{b}$ 满足 $|\\vec{a}|=|\\vec{b}|=1$，$\\langle\\vec{a},\\vec{b}\\rangle=\\dfrac{\\pi}{3}$.

（1）求 $|2\\vec{a}+\\vec{b}|$ 和 $|\\vec{a}-2\\vec{b}|$ 的值；

（2）是否存在实数 $k$，使得向量 $\\vec{a}+k\\vec{b}$ 与 $\\vec{a}-k\\vec{b}$ 互相垂直？若存在，求出 $k$ 的值；若不存在，请说明理由；

（3）若向量 $\\vec{c}=x\\vec{a}+y\\vec{b}$（$x,y\\in\\mathbb{R}$）满足 $|\\vec{c}|=2$，求证：$x^2+xy+y^2=4$，并求 $x+y$ 的取值范围；

（4）若向量 $\\vec{d}$ 满足 $(\\vec{d}-\\vec{a})\\cdot(\\vec{d}-2\\vec{b})=0$，求 $|\\vec{d}|$ 的最大值和最小值.`;

function post(apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(apiPath, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'text/event-stream',
      },
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: body, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const outStream = fs.createWriteStream(OUTPUT_FILE);
  const log = (msg) => {
    console.log(msg);
    outStream.write(msg + '\n');
  };

  log('=== 平面向量综合题测试 ===\n');
  log('测试时间: ' + new Date().toISOString());

  log('\n📌 步骤1: 创建会话...');
  const sessionRes = await post('/api/session', { difficulty: 'standard' });
  log('Status: ' + sessionRes.status);
  log('SessionId: ' + sessionRes.body?.sessionId);
  const sessionId = sessionRes.body?.sessionId;
  if (!sessionId) {
    log('❌ 无法获取 sessionId');
    outStream.end();
    return;
  }

  log('\n📌 步骤2: 提交题目并接收 SSE 流...\n');
  log('='.repeat(80));

  const problemData = JSON.stringify({ problem: PROBLEM, sessionId });
  const url = new URL('/api/solve', BASE);
  
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(problemData),
      'Accept': 'text/event-stream',
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let buffer = '';
      let eventCount = 0;
      let currentEvent = '';
      let allContent = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            eventCount++;
            try {
              const parsed = JSON.parse(data);
              const type = parsed.type || currentEvent;
              log(`\n[事件 #${eventCount}] 类型: ${type}`);
              
              if (type === 'solutionPhaseSteps') {
                log(`  阶段: ${parsed.phase}`);
                if (parsed.steps) {
                  for (const step of parsed.steps) {
                    log(`  步骤ID: ${step.id}`);
                    log(`  ---内容开始---`);
                    log(step.content);
                    log(`  ---内容结束---`);
                    allContent += step.content + '\n';
                  }
                }
              } else if (type === 'solution') {
                log('  ✅ 最终解题结果:');
                log(JSON.stringify(parsed.solution, null, 2));
              } else if (type === 'solveError') {
                log(`  ❌ 错误: ${parsed.message}`);
              } else {
                log(`  数据: ${JSON.stringify(parsed).slice(0, 500)}`);
              }
            } catch (e) {
              log(`  [原始数据] ${data.slice(0, 500)}`);
            }
          }
        }
      });

      res.on('end', () => {
        log('\n' + '='.repeat(80));
        log(`📊 总计收到 ${eventCount} 个事件`);

        // KaTeX 渲染验证
        log('\n🔬 KaTeX 公式渲染验证:');
        const formulas = extractFormulas(allContent);
        log(`  检测到 ${formulas.length} 个公式`);
        let okCount = 0;
        let failCount = 0;
        for (const { display, tex } of formulas) {
          try {
            katex.renderToString(tex, { throwOnError: true, displayMode: display });
            okCount++;
          } catch (e) {
            failCount++;
            log(`  ❌ 渲染失败 [${display ? '块' : '行内'}]: ${tex.slice(0, 60)}...`);
            log(`     错误: ${e.message}`);
            if (failCount >= 5) {
              log(`  ...以及更多失败（仅展示前5个）`);
              break;
            }
          }
        }
        log(`  ✅ ${okCount} 个通过 / ❌ ${failCount} 个失败`);

        log('\n完整输出已保存到: ' + OUTPUT_FILE);
        outStream.end();
        resolve({ eventCount, okCount, failCount });
      });

      res.on('error', (err) => {
        log('❌ 响应错误: ' + err.message);
        outStream.end();
        reject(err);
      });
    });

    req.on('error', (err) => {
      log('❌ 请求错误: ' + err.message);
      outStream.end();
      reject(err);
    });
    req.write(problemData);
    req.end();
  });
}

run().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

/** 从文本中提取所有 LaTeX 公式（$$...$$ 和 $...$），返回 { display, tex } 数组。 */
function extractFormulas(text) {
  const formulas = [];
  // 块级公式 $$...$$
  const blockRe = /\$\$([\s\S]*?)\$\$/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    formulas.push({ display: true, tex: m[1].trim() });
  }
  // 行内公式 $...$ (跳过 $$ 以及被转义的 \$)
  const inlineRe = /(?<!\\)\$((?:[^$]|\\\$)+?)(?<!\\)\$/g;
  while ((m = inlineRe.exec(text)) !== null) {
    // 确保不是块级占位
    if (!text.slice(m.index - 1, m.index).startsWith('$') && !text.slice(m.index + m[0].length, m.index + m[0].length + 1).startsWith('$')) {
      formulas.push({ display: false, tex: m[1].trim() });
    }
  }
  return formulas;
}
