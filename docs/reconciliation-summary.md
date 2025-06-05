# 核账功能总结

## 概述

系统现在提供两套完整的核账功能：总账核账和用户核账。

## 1. 总账核账

### 功能
验证整体财务数据的平衡性

### 核账公式
```
总销售额（售卡+续费） = 所有会员卡余额 + 所有会员已消费金额
```

### 使用方法
```bash
npm run test:reconciliation
```

### 数据来源
- **销售额**: `getCradTurnover.aspx` - 获取售卡统计
- **会员余额**: `getListSYKSMembers.aspx` - 获取所有会员卡余额
- **消费统计**: `getListOrderRecordTJ.aspx` - 获取会员消费统计

## 2. 用户核账 ⭐ **新功能**

### 功能
验证每个用户的账目平衡性

### 核账公式
```
用户总充值金额 = 账户当前余额 + 已消费金额
```

### 使用方法
```bash
# 所有用户核账
npm run user-reconciliation

# 单个用户核账
npm run user-reconciliation user 478926

# 帮助信息
npm run user-reconciliation --help
```

### 数据来源 🎯 **使用正确接口**
- **充值记录**: `getListOrderMvip.aspx` - 获取完整充值历史
- **当前余额**: `getListSYKSMembers.aspx` - 获取会员卡余额
- **消费记录**: `getListPreAboutMemberSK.aspx` - 获取上课消费记录

## 核账准确性对比

### 之前的问题
- ❌ 只能看到最后一次充值金额，无法获取完整充值历史
- ❌ 无法准确计算用户的总充值金额

### 现在的解决方案
- ✅ 使用 `getListOrderMvip.aspx` 获取完整充值历史
- ✅ 支持多次充值记录的准确累加
- ✅ 显示充值次数统计
- ✅ 提供详细的差额分析

## 输出示例

### 用户核账控制台输出
```
🔍 开始核账用户: 张三
✅ 张三 (13812345678)
   充值: ¥800.00 (2笔) | 余额: ¥127.00 | 消费: ¥673.00

🔍 开始核账用户: 李四  
❌ 李四 (13987654321)
   充值: ¥1000.00 (3笔) | 余额: ¥200.00 | 消费: ¥750.00
   差额: ¥50.00 | 准确度: 95.0%

📊 用户核账总结
============================================================
总用户数:     150
平账用户:     142 (94.7%)
不平账用户:   8
总差额:       ¥125.50
平均差额:     ¥0.84
```

### 数据文件输出
- **总账核账**: `src/logs/reconciliation_YYYYMMDD.json`
- **用户核账**: `src/output/user-reconciliation-YYYY-MM-DDTHH-mm-ss.json`

## 数据安全

所有输出文件都已自动添加到 `.gitignore` 中：
```gitignore
# 财务和用户数据（敏感信息）
*reconciliation_*.json
*user-reconciliation*.json
src/output/
src/logs/
```

## 接口映射表

| 功能 | 接口 | 主要数据字段 | 用途 |
|------|------|-------------|------|
| 总账-销售统计 | `getCradTurnover.aspx` | `allAmountsk`, `allAmountxf` | 获取售卡和续费总额 |
| 总账-会员余额 | `getListSYKSMembers.aspx` | `Amount` | 获取所有会员卡余额 |
| 总账-消费统计 | `getListOrderRecordTJ.aspx` | `sumAmount` | 获取会员消费统计 |
| 用户-充值记录 | `getListOrderMvip.aspx` | `Amount`, `OrderType` | 获取用户完整充值历史 |
| 用户-当前余额 | `getListSYKSMembers.aspx` | `Amount` | 获取用户会员卡余额 |
| 用户-消费记录 | `getListPreAboutMemberSK.aspx` | `ConsumptionOfClass` | 获取用户上课消费 |

## 定时任务

- **总账核账**: 每天晚上23:00自动执行
- **用户核账**: 按需手动执行

## 故障排除

1. **Token问题**: 系统会自动验证和更新Token
2. **数据差异**: 优先检查是否有退费、调账等特殊操作
3. **网络问题**: 内置重试机制和请求频率控制

## 后续改进方向

1. **退费记录**: 寻找退费记录接口，完善核账准确性
2. **调账记录**: 获取手动调账操作记录
3. **自动化**: 可考虑将用户核账也设置为定时任务

---

现在系统具备了完整的双重核账能力，能够从总账和用户两个维度确保财务数据的准确性！ 