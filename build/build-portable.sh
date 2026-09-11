#!/bin/bash
# FileDock Windows 绿色版构建脚本（Linux 交叉构建）
# 用法：bash build/build-portable.sh
# 产物：dist/文件仓/  文件夹绿色版（双击 FileDock.exe 即用）
#      dist/FileDock-Portable-1.0.0.exe  NSIS 单文件自解压版
# 说明：沙箱内核不支持 32 位 ELF，故用 wine64 包装成 wine，
#       并用 64 位 rcedit-x64.exe 替换 32 位 rcedit-ia32.exe。
set -e
cd "$(dirname "$0")/.."

ELECTRON_VER=31.7.7
NPMMIRROR=https://registry.npmmirror.com
EB_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
WSCACHE=/root/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0

echo "===== [1/7] 安装 wine（64位 + 32位支持）====="
if ! command -v /usr/lib/wine/wine64 >/dev/null 2>&1; then
  dpkg --add-architecture i386
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y wine64 wine32 p7zip-full
else
  echo "wine64 已安装，跳过"
fi

# 创建 wine 包装器指向 wine64（沙箱无法运行 32 位 ELF 加载器）
cat > /usr/local/bin/wine <<'EOF'
#!/bin/sh
exec /usr/lib/wine/wine64 "$@"
EOF
chmod +x /usr/local/bin/wine
cp /usr/local/bin/wine /usr/local/bin/wine64

echo "===== [2/7] 预下载 winCodeSign 并用 64 位 rcedit 替换 32 位 ====="
if [ ! -f "$WSCACHE/rcedit-x64.exe" ]; then
  mkdir -p /tmp/wcs
  curl -sS -L -m 180 -o /tmp/wcs/winCodeSign.7z \
    "$EB_MIRROR/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
  mkdir -p "$WSCACHE"
  7z x /tmp/wcs/winCodeSign.7z -o"$WSCACHE" >/dev/null
fi
# 关键：用 64 位 rcedit 覆盖 32 位，否则 wine64 无法加载 PE32 rcedit-ia32.exe
cp -f "$WSCACHE/rcedit-x64.exe" "$WSCACHE/rcedit-ia32.exe"

echo "===== [3/7] 安装 npm 依赖（跳过 electron 二进制下载）====="
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
npm install --registry=$NPMMIRROR --no-audit --no-fund

echo "===== [4/7] 下载 electron Windows 二进制到 node_modules/electron/dist ====="
if [ ! -f node_modules/electron/dist/electron.exe ]; then
  curl -sS -L -m 300 -o /tmp/electron.zip \
    "$ELECTRON_MIRROR/$ELECTRON_VER/electron-v$ELECTRON_VER-win32-x64.zip"
  rm -rf node_modules/electron/dist
  mkdir -p node_modules/electron/dist
  (cd node_modules/electron/dist && unzip -q /tmp/electron.zip)
  echo "electron.exe" > node_modules/electron/path.txt
else
  echo "electron.exe 已存在，跳过"
fi

export ELECTRON_MIRROR=$ELECTRON_MIRROR
export ELECTRON_BUILDER_BINARIES_MIRROR=$EB_MIRROR

echo "===== [5/7] 构建绿色文件夹版（推荐）====="
rm -rf dist
npx electron-builder --win --dir
# 整理产物：重命名为"文件仓"，预建 config 目录（让首次运行即识别为便携模式）
# 用独立脚本 make-green.js 完成，避免内联 shell 在不同环境下丢失中文目录
node build/make-green.js
echo "绿色版目录: dist/文件仓/"

echo "===== [6/7] 构建 NSIS 单文件自解压版 ====="
npx electron-builder --win portable
echo "单文件版: dist/FileDock-Portable-1.0.0.exe"

echo "===== [7/7] 完成 ====="
echo ""
echo "绿色文件夹版（推荐）：dist/文件仓/"
echo "  ├─ FileDock.exe      双击运行"
echo "  ├─ config/           配置文件（便携模式，数据跟文件夹走）"
echo "  └─ ...（其他运行时文件）"
echo ""
echo "单文件自解压版：dist/FileDock-Portable-1.0.0.exe"
ls -lh dist/FileDock-Portable-*.exe
