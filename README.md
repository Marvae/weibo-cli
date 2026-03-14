# weibo-cli

Weibo CLI - fetch trending, search, and user data from the terminal.

[中文文档](./README.zh-CN.md)

## Features

- 🔥 **Hot searches** - Realtime trending topics
- 🔍 **Search** - Posts, users, topics, videos, articles
- 👤 **User profiles** - Feeds, following, followers
- 📝 **Post details** - Content, comments, engagement stats

## Installation

```bash
npm install -g @marvae24/weibo-cli
```

Or run directly:

```bash
npx @marvae24/weibo-cli hot
```


## Usage

### Hot Searches

```bash
# Get realtime hot searches (top 50)
weibo hot

# Limit results
weibo hot --limit 10

# Get topic detail by keyword
weibo hot "coffee"

# JSON output
weibo hot --json
```

### Search

```bash
# Search posts (default)
weibo search "coffee"

# Search users
weibo search "coffee" --type user

# Search topics
weibo search "music" --type topic

# Get topic stats (read count, discussion count)
weibo search "travel" --stats

# Search types: content, user, topic, realtime, hot, video, image, article
weibo search "cat" --type video --limit 5
```

### User

```bash
# Get user profile by UID
weibo user 123456789

# Get user feeds
weibo user 123456789 --feeds

# Get hot feeds (sorted by engagement)
weibo user 123456789 --feeds --hot

# Get following list
weibo user 123456789 --following

# Get followers list
weibo user 123456789 --followers

# Pagination
weibo user 123456789 --feeds --limit 20 --page 2
```

### Post

```bash
# Get post detail
weibo post 5000000000000000

# Get comments
weibo post 5000000000000000 --comments

# JSON output
weibo post 5000000000000000 --json
```

### Global Options

```bash
# Show request URLs and response status
weibo hot --verbose

# JSON output (available for all commands)
weibo hot --json
```

## Rate Limiting

The CLI uses Weibo's mobile web API without authentication. Rate limits apply:

- Automatic retry with exponential backoff (1s → 2s → 4s)
- If you hit rate limits, wait a few minutes before retrying
- For heavy usage, set `WEIBO_COOKIE` environment variable

```bash
WEIBO_COOKIE="SUB=...; SUBP=..." weibo hot
```

## Tech Stack

- TypeScript
- Node.js 18+
- Commander.js

## License

MIT
