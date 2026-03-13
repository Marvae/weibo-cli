import { Command } from 'commander';
import { WeiboApi } from '../api';
import { outputResult, parsePositiveInt, stripHtml } from './utils';

/**
 * Registers the `post` command for post details and comments.
 *
 * @param program Commander program instance.
 * @param api Weibo API client used for remote calls.
 * @returns Nothing. The command is registered by side effect.
 * @throws {Error} Propagates API and validation errors during command execution.
 */
export function registerPostCommand(program: Command, api: WeiboApi): void {
  program
    .command('post <postId>')
    .description('Get post detail or comments')
    .option('--comments', 'Show comments')
    .option('-l, --limit <number>', 'Number of items', '15')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--json', 'Output JSON')
    .action(async (postId: string, opts) => {
      const page = parsePositiveInt(opts.page, 1);
      const limit = parsePositiveInt(opts.limit, 15);
      const json = Boolean(opts.json);

      if (opts.comments) {
        const comments = await api.getComments(postId, page);
        const data = json
          ? comments.slice(0, limit)
          : comments.slice(0, limit).map((c) => ({
              id: c.id,
              user: c.user?.screen_name ?? '',
              likes: c.like_counts ?? 0,
              text: stripHtml(c.text),
              created_at: c.created_at ?? '',
            }));
        outputResult(data, json);
        return;
      }

      const detail = await api.getPostDetail(postId);
      const data = json
        ? detail
        : detail
          ? {
              id: detail.id,
              user: detail.user?.screen_name ?? '',
              text: stripHtml(detail.text),
              reposts: detail.reposts_count ?? 0,
              comments: detail.comments_count ?? 0,
              likes: detail.attitudes_count ?? 0,
              ip_location: detail.ip_location ?? '',
              created_at: detail.created_at ?? '',
            }
          : null;
      outputResult(data, json);
    });
}
