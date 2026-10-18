#!/usr/bin/env node
'use strict';
/*
 * 绿色版打包：把 `electron-builder --win --dir` 的产物整理为 dist/文件仓/，
 * 布局按既定规范——根目录一眼可见的只有「FileDock.exe + 使用说明.txt + 一个运行文件夹」：
 *
 *   文件仓/
 *   ├─ FileDock.exe      40KB 启动器（源码 tools/launcher/launch.c，编译件在 build/launcher/）：
 *   │                    设 PORTABLE_EXECUTABLE_DIR 后启动 app\FileDock.exe
 *   ├─ 使用说明.txt
 *   ├─ app/              Electron 运行时 + 应用本体（win-unpacked 原样）
 *   └─ config/           用户数据（首跑自动识别，跟文件夹走）
 *
 * 用法：npm run build（= electron-builder --win --dir && node build/make-green.js）
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const src = path.join(distDir, 'win-unpacked');
const dst = path.join(distDir, '文件仓');
const launcher = path.join(__dirname, 'launcher', 'FileDock.exe');

if (!fs.existsSync(src)) {
  console.error(`[make-green] 找不到 ${src}`);
  console.error('[make-green] 请先运行: electron-builder --win --dir');
  process.exit(1);
}
if (!fs.existsSync(launcher)) {
  console.error(`[make-green] 找不到启动器 ${launcher}`);
  process.exit(1);
}

// 清理旧的 文件仓 目录。Windows 下任何进程把该目录当工作目录（终端/资源管理器
// 停在里面）都会让删除报 EPERM——这是打包失败的常见首因，给出人话提示
try {
  fs.rmSync(dst, { recursive: true, force: true });
} catch (e) {
  console.error(`[make-green] 无法清理旧的 ${dst}（${e.code}）。`);
  console.error('[make-green] 多半有终端/资源管理器停在这个文件夹里，请离开该目录后重试。');
  process.exit(1);
}
fs.mkdirSync(dst, { recursive: true });

// win-unpacked 原样收进 app/
fs.renameSync(src, path.join(dst, 'app'));

// 根目录：启动器 + 使用说明 + 空 config（首跑即绿色模式，数据跟文件夹走）
fs.copyFileSync(launcher, path.join(dst, 'FileDock.exe'));
fs.mkdirSync(path.join(dst, 'config'), { recursive: true });

// 使用说明随包分发（文案在仓库 build/ 下维护，避免手动放进 dist 被下次打包清掉）
const notes = path.join(__dirname, '使用说明.txt');
if (fs.existsSync(notes)) {
  fs.copyFileSync(notes, path.join(dst, '使用说明.txt'));
}

console.log('绿色版已生成: dist/文件仓/');
console.log('  根目录: FileDock.exe（启动器）+ 使用说明.txt + app/ + config/');
console.log('  双击 FileDock.exe 即可运行，config/ 数据跟文件夹走');

