// 让 TypeScript 识别以 text loader 导入的 .css 文件。
declare module '*.css' {
  const content: string;
  export default content;
}
