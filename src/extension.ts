// 扩展主入口：注册命令、激活 Webview 面板、管理 API 密钥。
import * as vscode from 'vscode';
import { PanelManager } from './PanelManager';
import { SECRET_KEY } from './engines/factory';

export function activate(context: vscode.ExtensionContext): void {
  // 命令：打开辅导面板。
  context.subscriptions.push(
    vscode.commands.registerCommand('polya-solver.start', () => {
      PanelManager.createOrShow(context);
    })
  );

  // 命令：用编辑器中选中的文本作为题目求解。
  context.subscriptions.push(
    vscode.commands.registerCommand('polya-solver.solveSelection', () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.document.getText(editor.selection).trim();
      if (!selection) {
        vscode.window.showWarningMessage('Polya：请先在编辑器中选择题目文本。');
        return;
      }
      PanelManager.createOrShow(context, selection);
    })
  );

  // 命令：安全地设置 / 清除 API 密钥（存入 SecretStorage）。
  context.subscriptions.push(
    vscode.commands.registerCommand('polya-solver.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'Polya：设置大模型 API 密钥',
        prompt: '密钥将安全存储在 VS Code SecretStorage 中。留空则清除。',
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) {
        return;
      }
      if (key.trim() === '') {
        await context.secrets.delete(SECRET_KEY);
        vscode.window.showInformationMessage('Polya：已清除 API 密钥。');
      } else {
        await context.secrets.store(SECRET_KEY, key.trim());
        vscode.window.showInformationMessage('Polya：API 密钥已安全保存。');
      }
    })
  );
}

export function deactivate(): void {
  PanelManager.current?.dispose();
}
