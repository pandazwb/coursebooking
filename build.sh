#!/bin/bash

# 清理 dist 目录
rm -rf dist

# 编译 TypeScript
npm run build

# 复制配置文件
mkdir -p dist/config
cp src/config/auth.json dist/config/
cp src/config/token.json dist/config/
cp src/config/price-strategy.json dist/config/

# 创建日志目录
mkdir -p dist/logs

# 确保文件存在
if [ ! -f "dist/app.js" ]; then
    echo "Error: dist/app.js not found after build"
    exit 1
fi

# 显示构建结果
echo "Build completed. Files in dist directory:"
ls -la dist/ 