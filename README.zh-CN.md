# weibo-cli

微博命令行工具 - 在终端获取热搜、搜索和用户数据。

[English](./README.md)

## 功能

- 🔥 **热搜** - 实时热搜榜、话题详情
- 🔍 **搜索** - 微博、用户、话题、视频、文章
- 👤 **用户** - 资料、动态、关注、粉丝
- 📝 **微博** - 详情、评论

## 安装

```bash
npm install -g @marvae24/weibo-cli
```

或者直接用 npx：

```bash
npx @marvae24/weibo-cli hot
```


## 使用

### 热搜

```bash
# 获取热搜榜（前50条）
weibo hot

# 限制数量
weibo hot --limit 10

# 获取话题详情
weibo hot "咖啡"

# JSON 输出
weibo hot --json
```

### 搜索

```bash
# 搜索微博（默认）
weibo search "咖啡"

# 搜索用户
weibo search "咖啡" --type user

# 搜索话题
weibo search "音乐" --type topic

# 查看话题统计（阅读量、讨论量）
weibo search "旅行" --stats

# 搜索类型：content, user, topic, realtime, hot, video, image, article
weibo search "猫" --type video --limit 5
```

### 用户

```bash
# 获取用户资料（需要 UID）
weibo user 123456789

# 获取用户动态
weibo user 123456789 --feeds

# 获取热门动态（按互动量排序）
weibo user 123456789 --feeds --hot

# 获取关注列表
weibo user 123456789 --following

# 获取粉丝列表
weibo user 123456789 --followers

# 分页
weibo user 123456789 --feeds --limit 20 --page 2
```

### 微博

```bash
# 获取微博详情
weibo post 5000000000000000

# 获取评论
weibo post 5000000000000000 --comments

# JSON 输出
weibo post 5000000000000000 --json
```

### 全局选项

```bash
# 显示请求 URL 和响应状态
weibo hot --verbose

# JSON 输出（所有命令都支持）
weibo hot --json
```

## 限流

本工具使用微博移动端 API，无需登录。如遇限流：

- 自动重试，指数退避（1秒 → 2秒 → 4秒）
- 频繁调用请稍等几分钟
- 高频使用可设置 `WEIBO_COOKIE` 环境变量

```bash
WEIBO_COOKIE="SUB=...; SUBP=..." weibo hot
```

## 技术栈

- TypeScript
- Node.js 18+
- Commander.js

## 许可证

MIT
