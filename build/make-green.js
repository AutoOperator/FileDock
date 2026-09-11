#!/usr/bin/env node
'use strict';
/*
 * 绿色版打包：把 `electron-builder --win --dir` 的产物 dist/win-unpacked
 * 整理为 dist/文件仓/，并预建 config/ 目录（首次运行即识别为便携模式，数据跟文件夹走）。
 *
 * 用法：node build/make-green.js
 * 前置：需先运行 `electron-builder --win --dir` 生成 dist/win-unpacked
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const src = path.join(distDir, 'win-unpacked');
const dst = path.join(distDir, '文件仓');

if (!fs.existsSync(src)) {
  console.error(`[make-green] 找不到 ${src}`);
  console.error('[make-green] 请先运行: electron-builder --win --dir');
  process.exit(1);
}

// 清理旧的 文件仓 目录（忽略不存在）
fs.rmSync(dst, { recursive: true, force: true });

// 重命名 win-unpacked -> 文件仓
fs.renameSync(src, dst);

// 预建 config 目录，让应用首次运行即识别为便携模式
fs.mkdirSync(path.join(dst, 'config'), { recursive: true });

const exe = path.join(dst, 'FileDock.exe');
console.log('绿色版已生成: dist/文件仓/');
console.log(`  双击 ${fs.existsSync(exe) ? 'dist/文件仓/FileDock.exe' : 'dist/文件仓/ 内的可执行文件'} 即可运行`);
console.log('  config/ 存放配置（便携模式，数据跟文件夹走）');
