import { Command } from 'commander';
import { WeiboApi } from '../api';
import { outputResult, parsePositiveInt, stripHtml } from './utils';

/**
 * Registers the `user` command for profile, feed, following, and follower lookups.
 *
 * @param program Commander program instance.
 * @param api Weibo API client used for remote calls.
 * @returns Nothing. The command is registered by side effect.
 * @throws {Error} Propagates API and validation errors during command execution.
 */
export function registerUserCommand(program: Command, api: WeiboApi): void {
  program
    .command('user <uid>')
    .description('Get user profile, feeds, following, or followers')
    .option('--feeds', 'Show user feeds')
    .option('--hot', 'Show hot feeds (use with --feeds)')
    .option('--following', 'Show following list')
    .option('--followers', 'Show followers list')
    .option('-l, --limit <number>', 'Number of items', '15')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--json', 'Output JSON')
    .action(async (uid: string, opts) => {
      const limit = parsePositiveInt(opts.limit, 15);
      const page = parsePositiveInt(opts.page, 1);
      const json = Boolean(opts.json);

      if (opts.following) {
        const users = await api.getFollowing(uid, limit, page);
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
      } else if (opts.followers) {
        const users = await api.getFollowers(uid, limit, page);
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
      } else if (opts.feeds && opts.hot) {
        const feeds = await api.getHotFeeds(uid, limit);
        const data = json
          ? feeds
          : feeds.map((f) => ({
              id: f.id,
              text: stripHtml(f.text),
              comments: f.comments_count ?? 0,
              reposts: f.reposts_count ?? 0,
              likes: f.attitudes_count ?? 0,
              created_at: f.created_at ?? '',
            }));
        outputResult(data, json);
      } else if (opts.feeds) {
        const feeds = await api.getFeeds(uid, limit);
        const data = json
          ? feeds
          : feeds.map((f) => ({
              id: f.id,
              text: stripHtml(f.text),
              comments: f.comments_count ?? 0,
              reposts: f.reposts_count ?? 0,
              likes: f.attitudes_count ?? 0,
              created_at: f.created_at ?? '',
            }));
        outputResult(data, json);
      } else {
        // Default: show profile
        const profile = await api.getProfile(uid);
        const data = json
          ? profile
          : profile
            ? {
                id: profile.id,
                name: profile.screen_name,
                description: profile.description,
                followers: profile.followers_count,
                following: profile.follow_count,
                posts: profile.statuses_count,
                verified: profile.verified ? profile.verified_reason || true : false,
              }
            : null;
        outputResult(data, json);
      }
    });
}
