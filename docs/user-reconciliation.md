# 用户核账功能

## 功能概述

用户核账功能用于检查每个用户的账目平衡，验证以下等式：
```
用户总充值金额 = 账户当前余额 + 已消费金额
```

## 核账原理

### 数据来源
1. **充值记录**: 从 `getListOrderMvip.aspx` 获取用户的完整充值历史
2. **当前余额**: 从 `getListSYKSMembers.aspx` 获取用户的 `Amount`  
3. **消费记录**: 从 `getListPreAboutMemberSK.aspx` 获取用户的 `ConsumptionOfClass`

### 核账逻辑
- **总充值金额**: 用户所有充值记录的金额累加（使用 `getListOrderMvip.aspx`）
- **当前余额**: 用户所有会员卡的余额累加
- **总消费金额**: 用户所有上课记录的消费金额累加
- **理论余额**: 总充值 - 总消费
- **实际差额**: 理论余额 - 当前余额

## 使用方法

### 1. 所有用户核账

```bash
# 对所有用户进行核账
npm run user-reconciliation

# 或者直接运行脚本
npx ts-node src/scripts/user-reconciliation.ts
```

### 2. 单个用户核账

```bash
# 按用户ID核账
npm run user-reconciliation user 478926

# 指定用户名（便于识别）
npm run user-reconciliation user 478926 "张三"
```

### 3. 帮助信息

```bash
npm run user-reconciliation --help
```

### 4. 在代码中调用

```typescript
import { userReconciliationService } from './src/services/user-reconciliation-service';

// 所有用户核账
const summary = await userReconciliationService.reconcileAllUsers();

// 单个用户核账
const result = await userReconciliationService.reconcileUser('478926', '张三');
```

## 输出结果

### 控制台输出示例

```
🔍 开始所有用户核账...
============================================================

🔍 开始核账用户: 张三
✅ 张三 (13812345678)
   充值: ¥500.00 (2笔) | 余额: ¥127.00 | 消费: ¥373.00

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

⚠️  问题用户列表:
   李四: 差额 ¥50.00
   王五: 差额 ¥25.50
   ...
```

### JSON文件输出

文件保存在 `src/output/user-reconciliation-YYYY-MM-DDTHH-mm-ss.json`

```json
{
  "exportTime": "2025-06-05 15:30:25",
  "summary": {
    "totalUsers": 150,
    "balancedUsers": 142,
    "unbalancedUsers": 8,
    "totalDifference": 125.50,
    "averageDifference": 0.84,
    "accuracyRate": 94.7,
    "problemUsers": [...]
  },
  "userReconciliations": [
    {
      "userInfo": {
        "ID": "478926",
        "Name": "张三",
        "Phone": "13812345678"
      },
      "vipCards": [...],
      "courseConsumptions": [...],
      "reconciliation": {
        "totalPurchase": 500.00,
        "currentBalance": 127.00,
        "totalConsumption": 373.00,
        "calculatedBalance": 127.00,
        "difference": 0.00,
        "isBalanced": true,
        "balanceAccuracy": 100.0
      }
    }
  ]
}
```

## 数据字段说明

### 用户核账数据 (UserReconciliationData)

#### reconciliation 字段：
- `totalPurchase`: 总充值金额（所有充值记录金额累加）
- `currentBalance`: 当前余额（所有会员卡余额累加）
- `totalConsumption`: 总消费金额（所有上课消费累加）
- `calculatedBalance`: 计算余额（总充值 - 总消费）
- `difference`: 差额（计算余额 - 当前余额）
- `isBalanced`: 是否平账（差额 < 0.01元）
- `balanceAccuracy`: 余额准确度百分比
- `paymentCount`: 充值次数

### 核账总结 (UserReconciliationSummary)
- `totalUsers`: 参与核账的总用户数
- `balancedUsers`: 账目平衡的用户数
- `unbalancedUsers`: 账目不平衡的用户数
- `totalDifference`: 所有用户差额的绝对值累加
- `averageDifference`: 平均差额
- `accuracyRate`: 准确率（平账用户比例）
- `problemUsers`: 存在问题的用户列表

## 数据准确性提升

### ✅ 已解决的问题

1. **多次充值问题**: 现在使用 `getListOrderMvip.aspx` 接口获取完整充值历史
2. **充值记录完整性**: 可以获取每笔充值的详细信息（金额、时间、订单号等）

### ⚠️ 仍需关注的问题

1. **退费和调账**: 系统可能存在退费、手动调账等操作
2. **数据一致性**: 不同接口返回的数据可能存在时间差或同步问题

## 进一步改进建议

为了达到更高的核账准确性，建议关注以下接口：

### 1. 用户退费记录接口
```
目标: 获取用户的退费记录
期望格式:
{
  "退费时间": "2025-02-01", 
  "退费金额": 100.00,
  "退费原因": "...",
  "原订单号": "..."
}
```

### 2. 用户账户变动记录接口
```
目标: 获取所有账户余额变动记录（充值、消费、退费、调账等）
期望格式:
{
  "变动时间": "2025-01-15",
  "变动类型": "充值|消费|退费|调账",
  "变动金额": 500.00,
  "变动前余额": 100.00,
  "变动后余额": 600.00,
  "备注": "..."
}
```

## 建议的改进方案

1. **与系统管理员确认**：
   - 现有 `PurchaseAmount` 是否为累计充值金额
   - 是否存在其他充值记录查询接口

2. **数据验证**：
   - 对比总账核账结果，验证单用户核账的准确性
   - 分析差额较大的用户，找出数据差异原因

3. **分阶段实施**：
   - 先基于现有数据实现基础核账功能
   - 发现问题后，再寻找补充数据源

## 注意事项

1. **数据安全**: ⚠️ 输出文件包含敏感用户信息，已自动加入 .gitignore
2. **性能考虑**: 大量用户核账可能需要较长时间
3. **网络稳定**: 需要稳定的网络连接访问多个API
4. **数据准确性**: 结果准确性依赖于接口数据的完整性

## 故障排除

### 常见问题

1. **Token失效**: 系统会自动尝试更新Token
2. **网络超时**: 内置重试机制和请求频率控制
3. **数据为空**: 检查用户是否有会员卡记录

### 调试建议

1. 先测试单个用户核账，验证逻辑正确性
2. 对比总账核账和用户核账的结果
3. 分析差额较大的用户，查找数据源问题 