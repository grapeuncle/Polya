/**
 * 符号计算校验层（engines/symbolicVerifier.ts）的单元测试。
 * 运行：npm run test:symbolic
 */
import {
  extractEquations,
  formatSymbolicVerification,
  latexToMathjs,
  verifyEquations,
} from '../engines/symbolicVerifier.ts';

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('=== 符号校验层测试 ===\n');

// --- latexToMathjs ---
console.log('[LaTeX 归一化]');
check('\\frac{6}{3} → 分式', latexToMathjs('\\frac{6}{3}') === '((6)/(3))');
check('\\sqrt{4} → sqrt(4)', latexToMathjs('\\sqrt{4}') === 'sqrt(4)');
check('\\cdot → *', latexToMathjs('a \\cdot b') === 'a * b');
check('x^{2} → x^(2)', latexToMathjs('x^{2}') === 'x^(2)');
check('不等号 → null', latexToMathjs('x \\geq 1') === null);
check('纯中文 text → null', latexToMathjs('\\text{判别式}') === null);

// --- extractEquations ---
console.log('\n[等式抽取]');
const eqs1 = extractEquations('展开得 $x^2 - 5x + 6 = (x-2)(x-3)$，所以成立');
check('LaTeX 段抽取', eqs1.some((e) => e.raw === 'x^2 - 5x + 6=(x-2)(x-3)'));
const eqs2 = extractEquations('面积 S = 3 * 4 + 1 平方厘米');
check('纯文本行抽取', eqs2.some((e) => e.lhs.trim() === 'S'));
const eqs3 = extractEquations('判别式 Δ = b^2 - 4ac，大于零');
check('希腊字母开头不误抽', eqs3.length === 0);

// --- verifyEquations：正确恒等式 ---
console.log('\n[校验：应通过]');
const v1 = verifyEquations('$(x+1)^2 = x^2 + 2x + 1$');
check('完全平方公式 verified', v1.checks[0]?.verdict === 'verified' && v1.contradictionCount === 0);
const v2 = verifyEquations('$\\frac{6}{3} = 2$');
check('纯数值等式 verified', v2.checks[0]?.verdict === 'verified');
const v3 = verifyEquations('$x^2 - 5x + 6 = (x-2)(x-3)$');
check('因式分解 verified', v3.checks[0]?.verdict === 'verified');

// --- verifyEquations：可证明的矛盾 ---
console.log('\n[校验：应发现矛盾]');
const w1 = verifyEquations('$x + 1 = x + 2$');
check('常数差矛盾 contradiction', w1.checks[0]?.verdict === 'contradiction' && w1.contradictionCount === 1);
const w2 = verifyEquations('$\\frac{6}{3} = 3$');
check('纯数值错误 contradiction', w2.checks[0]?.verdict === 'contradiction');

// --- verifyEquations：条件等式（待解方程），不得误报矛盾 ---
console.log('\n[校验：条件等式不误报]');
const c1 = verifyEquations('$(x+1)^2 = x^2 + 1$');
check('错误展开 → conditional 而非 contradiction', c1.checks[0]?.verdict === 'conditional' && c1.contradictionCount === 0);
const c2 = verifyEquations('$x - 2 = 0$');
check('待解方程 x-2=0 → conditional', c2.checks[0]?.verdict === 'conditional' && c2.contradictionCount === 0);
const c3 = verifyEquations('$x^2 - 5x + 6 = 0$');
check('缺省示例原方程 → conditional', c3.checks[0]?.verdict === 'conditional' && c3.contradictionCount === 0);
const c4 = verifyEquations('$p \\cdot q = 6$ 且 $p + q = -5$');
check('约束条件 p·q=6、p+q=-5 → conditional', c4.checks.every((c) => c.verdict === 'conditional') && c4.contradictionCount === 0);

// --- verifyEquations：应跳过 ---
console.log('\n[校验：应跳过]');
const s1 = verifyEquations('解得 $x = 2$');
check('变量取值不判定', s1.checks.length === 0);
const s2 = verifyEquations('这一步移项合并，得到最终结果。');
check('无等式返回空', s2.checks.length === 0);
const s3 = verifyEquations('');
check('空内容不抛错', s3.checks.length === 0);

// --- formatSymbolicVerification ---
console.log('\n[输出格式]');
const md = formatSymbolicVerification(w1);
check('包含客观校验标题', md.includes('符号引擎客观校验'));
check('包含矛盾提示', md.includes('矛盾'));
check('空结果返回空串', formatSymbolicVerification(s1) === '');

console.log(`\n汇总: ${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed > 0 ? 1 : 0);
