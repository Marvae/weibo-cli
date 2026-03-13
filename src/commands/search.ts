import { Command } from 'commander';
import { SearchFeedType, SearchStatsType, WeiboApi } from '../api';
import { outputResult, parsePositiveInt, stripHtml } from './utils';

const FEED_TYPES = new Set<SearchFeedType>(['content', 'realtime', 'hot', 'video', 'image']);
const SEARCH_TYPES = new Set(['content', 'user', 'topic', 'realtime', 'hot', 'video', 'image', 'article']);
const STATS_TYPES = new Set<SearchStatsType>(['content', 'realtime', 'hot', 'video', 'image', 'topic']);

/**
 * Registers the `search` command for content, users, topics, and stats.
 *
 * @param program Commander program instance.
 * @param api Weibo API client used for remote calls.
 * @returns Nothing. The command is registered by side effect.
 * @throws {Error} Propagates API and validation errors during command execution.
 */
export function registerSearchCommand(program: Command, api: WeiboApi): void {
  program
    .command('search <keyword>')
    .description('Search Weibo content, users, or topics')
    .option('-t, --type <type>', 'Search type: content (default), user, topic, realtime, hot, video, image, article', 'content')
    .option('--stats', 'Show topic stats from cardlistInfo.cardlist_head_cards')
    .option('-l, --limit <number>', 'Number of items', '15')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--json', 'Output JSON')
    .action(async (keyword: string, opts) => {
      const limit = parsePositiveInt(opts.limit, 15);
      const page = parsePositiveInt(opts.page, 1);
      const json = Boolean(opts.json);
      const type = String(opts.type ?? 'content');

      if (!SEARCH_TYPES.has(type)) {
        throw new Error(`Unsupported search type: ${type}`);
      }

      if (opts.stats) {
        const statsType: SearchStatsType = STATS_TYPES.has(type as SearchStatsType)
          ? (type as SearchStatsType)
          : 'content';
        const stats = await api.getSearchStats(keyword, statsType, page);
        const data = json
          ? stats
          : stats
            ? {
                read_count: stats.read_count ?? 0,
                discussion_count: stats.discussion_count ?? 0,
                host: stats.host ?? '',
                media_count: stats.media_count ?? 0,
              }
            : null;
        outputResult(data, json);
        return;
      }

      if (type === 'user') {
        const users = await api.searchUsers(keyword, limit, page);
        const data = json
          ? users
          : users.map((u) => ({
              id: u.id,
              name: u.screen_name,
              followers: u.followers_count ?? 0,
              posts: u.statuses_count ?? 0,
              verified: u.verified ? u.verified_reason || true : false,
            }));
        outputResult(data, json);
        return;
      }

      if (type === 'topic') {
        const topics = await api.searchTopics(keyword, limit, page);
        const data = json
          ? topics
          : topics.map((t) => ({
              title: t.title_sub ?? '',
              desc: t.desc1 ?? t.desc2 ?? '',
              link: t.scheme ?? '',
            }));
        outputResult(data, json);
        return;
      }

      if (type === 'article') {
        const articles = await api.searchArticles(keyword, limit, page);
        const data = json
          ? articles
          : articles.map((item) => ({
              doc_id: item.doc_id,
              title: item.title ?? '',
              source: item.source ?? '',
              time: item.time ?? '',
              url: item.url ?? '',
            }));
        outputResult(data, json);
        return;
      }

      const feedType: SearchFeedType = FEED_TYPES.has(type as SearchFeedType) ? (type as SearchFeedType) : 'content';
      const items = await api.searchFeedByType(keyword, feedType, limit, page);
      const data = json
        ? items
        : items.map((item) => ({
            id: item.id,
            user: item.user?.screen_name ?? '',
            text: stripHtml(item.text),
            comments: item.comments_count ?? 0,
            reposts: item.reposts_count ?? 0,
            likes: item.attitudes_count ?? 0,
            created_at: item.created_at ?? '',
          }));
      outputResult(data, json);
    });
}
