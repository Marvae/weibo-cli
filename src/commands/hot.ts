import { Command } from 'commander';
import { WeiboApi } from '../api';
import { outputResult, parsePositiveInt } from './utils';

/**
 * Registers the `hot` command for realtime hot rankings and topic details.
 *
 * @param program Commander program instance.
 * @param api Weibo API client used for remote calls.
 * @returns Nothing. The command is registered by side effect.
 * @throws {Error} Propagates API and validation errors during command execution.
 */
export function registerHotCommand(program: Command, api: WeiboApi): void {
  program
    .command('hot [keyword]')
    .description('Get Weibo realtime hot searches or hot topic detail')
    .option('-l, --limit <number>', 'Number of hot items', '50')
    .option('--json', 'Output JSON')
    .action(async (keyword: string | undefined, opts) => {
      const limit = parsePositiveInt(opts.limit, 50);
      const json = Boolean(opts.json);

      if (keyword) {
        const detail = await api.getHotTopicDetail(keyword);
        const data = json
          ? detail
          : {
              keyword,
              read_count: detail.read_count,
              discussion_count: detail.discussion_count,
              interaction_count: detail.interaction_count,
              original_count: detail.original_count,
            };
        outputResult(data, json);
        return;
      }

      const items = await api.getTrending(limit, 'realtime');
      const data = json
        ? items
        : items.map((item, index) => ({
            rank: index + 1,
            heat: item.trending,
            keyword: item.description,
            link: item.url,
          }));

      outputResult(data, json);
    });
}
