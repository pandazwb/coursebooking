# 数据安全指南

## 概述

本系统处理敏感的用户数据和财务信息，必须严格遵守数据安全规范。

## 敏感数据类型

### 1. 用户个人信息
- 姓名、手机号、微信头像
- 会员卡信息和余额
- 上课记录和消费历史

### 2. 财务数据
- 课程价格和收入统计
- 核账报告和差额信息
- 会员卡销售和消费记录

### 3. 系统配置
- API认证Token
- 邮箱配置信息
- 数据库连接信息

## 文件保护

### 自动忽略的文件（已在.gitignore中）

```
# 认证和配置文件
src/config/token.json
src/config/auth.json

# 用户数据导出文件
src/output/
*user-course-records*.json
*user-records*.json
*export*.json

# 财务核账文件
*reconciliation_*.json

# 日志文件
src/logs/
*.log
```

### 保留的模板文件

```
src/config/token.template.json
src/config/auth.template.json
```

## 安全操作规范

### 1. 数据导出
- ✅ 仅在必要时导出数据
- ✅ 使用完毕后立即删除导出文件
- ✅ 不要通过邮件或即时消息传输导出文件
- ❌ 绝不将导出文件提交到版本控制

### 2. 配置管理
- ✅ 使用模板文件作为配置示例
- ✅ 将真实配置文件添加到.gitignore
- ✅ 定期更新Token和密码
- ❌ 不要在代码中硬编码敏感信息

### 3. 日志管理
- ✅ 定期清理过期日志文件
- ✅ 确保日志不包含密码或Token
- ❌ 不要将包含敏感信息的日志提交到版本控制

## 应急响应

### 如果意外提交了敏感数据

1. **立即行动**
   ```bash
   # 从最近的提交中移除敏感文件
   git rm --cached path/to/sensitive/file
   git commit -m "Remove sensitive data"
   
   # 如果已推送，需要强制推送（谨慎使用）
   git push --force
   ```

2. **彻底清理历史**
   ```bash
   # 使用git filter-branch移除历史记录中的敏感文件
   git filter-branch --force --index-filter \
   'git rm --cached --ignore-unmatch path/to/sensitive/file' \
   --prune-empty --tag-name-filter cat -- --all
   ```

3. **通知相关人员**
   - 立即通知团队成员
   - 更新相关的Token和密码
   - 评估数据泄露影响

### 预防措施

1. **提交前检查**
   ```bash
   # 检查待提交的文件
   git status
   git diff --cached
   ```

2. **使用pre-commit钩子**
   ```bash
   # 在.git/hooks/pre-commit中添加检查脚本
   #!/bin/sh
   if git diff --cached --name-only | grep -E "(token\.json|auth\.json|.*user-records.*\.json)"; then
       echo "错误: 尝试提交敏感文件!"
       exit 1
   fi
   ```

## 访问控制

### 生产环境
- 限制对配置文件的访问权限
- 使用环境变量替代配置文件
- 定期审计文件访问日志

### 开发环境
- 使用测试数据而非真实用户数据
- 定期清理开发环境中的导出文件
- 不要在开发分支中使用生产环境配置

## 合规要求

### 数据保护法规
- 遵守当地数据保护法规（如GDPR、个保法）
- 用户数据仅用于业务必需目的
- 提供数据删除和修改机制

### 内部规范
- 定期进行安全培训
- 建立数据处理审批流程
- 记录数据访问和处理日志

## 联系方式

如有安全相关问题，请联系：
- 技术负责人：[技术负责人联系方式]
- 数据保护官：[DPO联系方式]

---

**重要提醒**：数据安全是每个开发者的责任。当发现任何安全问题时，请立即报告。 