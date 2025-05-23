# 约课价格自动调整系统

## 开发环境设置

1. 安装依赖：
```bash
npm install
```

2. 复制配置文件模板：
```bash
cp src/config/token.template.json src/config/token.json
cp src/config/auth.template.json src/config/auth.json
```

3. 编辑配置文件，填入相应的值：
- `src/config/auth.json`: 登录凭证
- `src/config/token.json`: token 信息（会自动更新）
- `src/config/price-strategy.json`: 价格策略配置

## 运行

### 本地开发
```bash
npm run dev
```

### 生产环境部署
1. 安装 PM2：
```bash
npm install pm2 -g
```

2. 构建和启动：
```bash
npm run pm2:start
```

3. 重启应用：
```bash
npm run pm2:restart
```

## 文件说明
- `src/config/token.json`: 存储 token 信息（不要提交到 Git）
- `src/config/auth.json`: 存储登录凭证（不要提交到 Git）
- `src/config/price-strategy.json`: 价格策略配置
- `dist/`: 编译后的文件（不要提交到 Git）
- `logs/`: 日志文件（不要提交到 Git）
```