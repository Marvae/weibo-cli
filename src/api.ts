const WEIBO_BASE = 'https://m.weibo.cn';
const SEARCH_URL = `${WEIBO_BASE}/api/container/getIndex`;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff delays in milliseconds.

const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: `${WEIBO_BASE}/`,
};

export interface TrendingItem {
  id: number;
  description: string;
  trending: number;
  url: string;
}

export interface UserProfile {
  id: number;
  screen_name?: string;
  verified?: boolean;
  verified_reason?: string;
  description?: string;
  profile_url?: string;
  followers_count?: number;
  follow_count?: number;
  statuses_count?: number;
  avatar_hd?: string;
}

export interface FeedItem {
  id: string;
  mid?: string;
  text?: string;
  created_at?: string;
  source?: string;
  comments_count?: number;
  reposts_count?: number;
  attitudes_count?: number;
  user?: UserProfile;
}

export type SearchFeedType = 'content' | 'realtime' | 'hot' | 'video' | 'image' | 'article';
export type SearchStatsType = SearchFeedType | 'topic';

export interface SearchStats {
  read_count?: number;
  discussion_count?: number;
  host?: string;
  media_count?: number;
}

export interface HotTopicDetail {
  read_count: number;
  discussion_count: number;
  interaction_count: number;
  original_count: number;
}

export interface PostDetail extends FeedItem {
  ip_location?: string;
}

export interface TopicItem {
  title_sub?: string;
  desc1?: string;
  desc2?: string;
  scheme?: string;
}

export interface CommentItem {
  id: string;
  text?: string;
  created_at?: string;
  source?: string;
  like_counts?: number;
  user?: UserProfile;
}

export interface ArticleItem {
  doc_id: string;
  title?: string;
  desc?: string;
  source?: string;
  time?: string;
  url?: string;
  pic?: string;
}

interface WeiboEnvelope {
  ok?: number;
  msg?: string;
  data?: any;
}

const FEED_SEARCH_CONTAINER_BY_TYPE: Record<SearchFeedType, string> = {
  content: '100103type=1',
  realtime: '100103type=61',
  hot: '100103type=60',
  video: '100103type=64',
  image: '100103type=63',
  article: '100103type=21',
};

const SEARCH_STATS_CONTAINER_BY_TYPE: Record<SearchStatsType, string> = {
  content: '100103type=1',
  realtime: '100103type=61',
  hot: '100103type=60',
  video: '100103type=64',
  image: '100103type=63',
  article: '100103type=21',
  topic: '100103type=38',
};

const HOT_CONTAINER_BY_CATEGORY: Record<'realtime' | 'finance' | 'ent' | 'sports' | 'game', string> = {
  realtime: '106003type=25&t=3&disable_hot=1&filter_type=realtimehot',
  finance: '102803_ctg1_4188_-_ctg1_4188',
  ent: '102803_ctg1_4288_-_ctg1_4288',
  sports: '102803_ctg1_4388_-_ctg1_4388',
  game: '102803_ctg1_5088_-_ctg1_5088',
};

export class WeiboApi {
  verbose = false;
  private cookieHeader?: string;

  private getCookieFromEnv(): string | undefined {
    const envCookie = process.env.WEIBO_COOKIE?.trim();
    if (!envCookie) {
      return undefined;
    }

    const pairs = envCookie
      .split(';')
      .map((entry) => entry.trim())
      .filter((entry) => entry.includes('='));

    if (pairs.length === 0) {
      return undefined;
    }

    return pairs.join('; ');
  }

  private async ensureVisitorCookie(): Promise<string | undefined> {
    if (this.cookieHeader) {
      return this.cookieHeader;
    }

    const envCookie = this.getCookieFromEnv();
    if (envCookie) {
      this.cookieHeader = envCookie;
      return this.cookieHeader;
    }

    const response = await fetch('https://visitor.passport.weibo.cn/visitor/genvisitor2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': DEFAULT_HEADERS['User-Agent'],
      },
      body: new URLSearchParams({
        cb: 'visitor_callback',
        from: 'weibo',
        tid: '',
        return_url: `${WEIBO_BASE}/`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch visitor cookie: HTTP ${response.status}`);
    }

    const body = await response.text();
    const match = body.match(/visitor_callback\((.*)\)/);
    if (!match?.[1]) {
      throw new Error('Unexpected visitor cookie response');
    }

    const payload = JSON.parse(match[1]);
    const sub = payload?.data?.sub;
    const subp = payload?.data?.subp;

    if (!sub || !subp) {
      throw new Error('Missing SUB/SUBP in visitor cookie payload');
    }

    this.cookieHeader = `SUB=${sub}; SUBP=${subp}`;
    return this.cookieHeader;
  }

  private async requestJson(
    pathOrUrl: string,
    params?: Record<string, string>,
    retryCount = 0,
  ): Promise<WeiboEnvelope> {
    const cookie = await this.ensureVisitorCookie();
    const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : `${WEIBO_BASE}${pathOrUrl}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    if (cookie) {
      headers.Cookie = cookie;
    }

    if (this.verbose) {
      console.error(`[verbose] GET ${url.toString()}`);
    }

    const response = await fetch(url, { headers });

    if (this.verbose) {
      console.error(`[verbose] HTTP ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      throw new Error(`Request failed: HTTP ${response.status} ${url.toString()}`);
    }

    const rawBody = await response.text();
    let payload: WeiboEnvelope;
    try {
      payload = JSON.parse(rawBody) as WeiboEnvelope;
    } catch {
      throw new Error(`Invalid JSON response from Weibo API: ${url.toString()}`);
    }

    // Handle throttling: ok=-100 means visitor re-authentication is needed.
    if (payload?.ok === -100 && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount] ?? 4000;
      if (this.verbose) {
        console.error(`[verbose] API returned ok=-100 (rate limited), retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      this.cookieHeader = undefined; // Refresh cookie for the next attempt.
      return this.requestJson(pathOrUrl, params, retryCount + 1);
    }

    // Retry budget exhausted.
    if (payload?.ok === -100) {
      throw new Error('Rate limited by Weibo API. Please wait a few minutes and try again.');
    }

    return payload;
  }

  private async requestText(
    pathOrUrl: string,
    params?: Record<string, string>,
    retryOnVisitorPage = true,
  ): Promise<string> {
    const cookie = await this.ensureVisitorCookie();
    const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : `${WEIBO_BASE}${pathOrUrl}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
    if (cookie) {
      headers.Cookie = cookie;
    }

    if (this.verbose) {
      console.error(`[verbose] GET ${url.toString()}`);
    }

    const response = await fetch(url, { headers });

    if (this.verbose) {
      console.error(`[verbose] HTTP ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      throw new Error(`Request failed: HTTP ${response.status} ${url.toString()}`);
    }

    const text = await response.text();
    if (retryOnVisitorPage && text.includes('Sina Visitor System')) {
      if (this.verbose) {
        console.error('[verbose] got Sina Visitor System page, refreshing visitor cookie and retrying once');
      }
      this.cookieHeader = undefined;
      return this.requestText(pathOrUrl, params, false);
    }

    return text;
  }

  /**
   * Gets Weibo hot ranking items for the selected category.
   *
   * @param limit Maximum number of items to return.
   * @param category Hot list category.
   * @returns A list of normalized hot ranking items.
   * @throws {Error} When the request fails or the selected category has no supported ranking payload.
   */
  async getTrending(
    limit = 15,
    category: 'realtime' | 'finance' | 'ent' | 'sports' | 'game' = 'realtime',
  ): Promise<TrendingItem[]> {
    const containerid = HOT_CONTAINER_BY_CATEGORY[category] ?? HOT_CONTAINER_BY_CATEGORY.realtime;
    let result: WeiboEnvelope;

    try {
      result = await this.requestJson(SEARCH_URL, {
        containerid,
      });
    } catch (error) {
      if (category !== 'realtime') {
        throw new Error(`Hot category '${category}' is unavailable: API no longer returns valid JSON.`);
      }
      throw error;
    }

    const cards = result?.data?.cards;
    if (!Array.isArray(cards)) {
      if (category !== 'realtime') {
        throw new Error(`Hot category '${category}' is unavailable: API returned no hot ranking cards.`);
      }
      return [];
    }

    const hotCard = cards.find((card: any) => Array.isArray(card?.card_group));
    const groups = hotCard?.card_group;
    if (Array.isArray(groups)) {
      const items = groups
        .filter((item: any) => item?.desc)
        .slice(0, limit)
        .map((item: any, idx: number) => {
          const rawHeat = String(item?.desc_extr ?? '0');
          const heatMatch = rawHeat.match(/\d+/);
          return {
            id: idx,
            description: String(item.desc),
            trending: heatMatch ? Number(heatMatch[0]) : 0,
            url: String(item?.scheme ?? ''),
          };
        });

      if (category !== 'realtime' && items.length === 0) {
        throw new Error(`Hot category '${category}' is unavailable: API returned empty ranking group.`);
      }

      return items;
    }

    if (category !== 'realtime') {
      throw new Error(`Hot category '${category}' is unavailable: API returned feed posts instead of hot rankings.`);
    }

    return [];
  }

  /**
   * Searches regular content feed results by keyword.
   *
   * @param keyword Search keyword.
   * @param limit Maximum number of posts.
   * @param page Search page number.
   * @returns A list of normalized feed items.
   * @throws {Error} When the underlying request fails.
   */
  async searchContent(keyword: string, limit = 15, page = 1): Promise<FeedItem[]> {
    return this.searchFeedByType(keyword, 'content', limit, page);
  }

  /**
   * Searches feed results by explicit feed type.
   *
   * @param keyword Search keyword.
   * @param type Feed search type.
   * @param limit Maximum number of posts.
   * @param page Search page number.
   * @returns A list of normalized feed items.
   * @throws {Error} When `type` is `article` or the request fails.
   */
  async searchFeedByType(keyword: string, type: SearchFeedType, limit = 15, page = 1): Promise<FeedItem[]> {
    if (type === 'article') {
      throw new Error('Use search --type article via searchArticles().');
    }

    const result = await this.requestJson(SEARCH_URL, {
      containerid: this.buildSearchContainerId(FEED_SEARCH_CONTAINER_BY_TYPE[type], keyword),
      page_type: 'searchall',
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards)) {
      return [];
    }

    const feedCards: any[] = [];
    for (const card of cards) {
      if (card?.card_type === 9) {
        feedCards.push(card);
      } else if (Array.isArray(card?.card_group)) {
        for (const grouped of card.card_group) {
          if (grouped?.card_type === 9) {
            feedCards.push(grouped);
          }
        }
      }
    }

    return feedCards
      .slice(0, limit)
      .map((card) => this.toFeedItem(card?.mblog))
      .filter((item): item is FeedItem => Boolean(item));
  }

  /**
   * Searches article results by keyword.
   *
   * @param keyword Search keyword.
   * @param limit Maximum number of articles.
   * @param page Search page number.
   * @returns A list of normalized article items.
   * @throws {Error} When the request fails.
   */
  async searchArticles(keyword: string, limit = 15, page = 1): Promise<ArticleItem[]> {
    const result = await this.requestJson(SEARCH_URL, {
      containerid: this.buildSearchContainerId(FEED_SEARCH_CONTAINER_BY_TYPE.article, keyword),
      page_type: 'searchall',
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards)) {
      return [];
    }

    const articleCard = cards.find((card: any) => Array.isArray(card?.wboxParam?.data));
    const items = articleCard?.wboxParam?.data;
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .slice(0, limit)
      .map((item: any) => ({
        doc_id: String(item?.doc_id ?? ''),
        title: this.stripTags(String(item?.title ?? '')),
        desc: this.stripTags(String(item?.desc ?? '')),
        source: typeof item?.source === 'string' ? item.source : undefined,
        time: typeof item?.time === 'string' ? item.time : undefined,
        url: this.extractUrlFromScheme(item?.scheme),
        pic: typeof item?.pic === 'string' ? item.pic : undefined,
      }))
      .filter((item) => Boolean(item.doc_id || item.title || item.url));
  }

  /**
   * Extracts topic-level search statistics.
   *
   * @param keyword Search keyword.
   * @param type Search type used for the initial stats request.
   * @param page Search page number.
   * @returns Parsed stats, or `null` if the payload has no recognizable counters.
   * @throws {Error} When the request fails.
   */
  async getSearchStats(keyword: string, type: SearchStatsType = 'content', page = 1): Promise<SearchStats | null> {
    const result = await this.requestJson(SEARCH_URL, {
      containerid: this.buildSearchContainerId(SEARCH_STATS_CONTAINER_BY_TYPE[type], keyword),
      page_type: 'searchall',
      page: String(page),
    });

    let stats = this.extractSearchStats(result);
    if (stats) {
      return stats;
    }

    if (type !== 'topic') {
      const topicResult = await this.requestJson(SEARCH_URL, {
        containerid: this.buildSearchContainerId(SEARCH_STATS_CONTAINER_BY_TYPE.topic, keyword),
        page_type: 'searchall',
        page: String(page),
      });
      stats = this.extractSearchStats(topicResult);
    }

    return stats;
  }

  /**
   * Searches users by keyword.
   *
   * @param keyword Search keyword.
   * @param limit Maximum number of users.
   * @param page Search page number.
   * @returns A list of normalized user profiles.
   * @throws {Error} When the request fails.
   */
  async searchUsers(keyword: string, limit = 10, page = 1): Promise<UserProfile[]> {
    const result = await this.requestJson(SEARCH_URL, {
      containerid: this.buildSearchContainerId('100103type=3', keyword),
      page_type: 'searchall',
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards) || cards.length < 1) {
      return [];
    }

    const userCard = cards.find((card: any) =>
      Array.isArray(card?.card_group) && card.card_group.some((item: any) => item?.user?.id),
    );
    const cardGroup = userCard?.card_group;
    if (!Array.isArray(cardGroup)) {
      return [];
    }

    return cardGroup
      .slice(0, limit)
      .map((item: any) => this.toUserProfile(item?.user))
      .filter((item): item is UserProfile => Boolean(item));
  }

  /**
   * Gets a user's public profile by UID.
   *
   * @param uid Weibo user ID.
   * @returns Parsed user profile, or `null` when unavailable.
   * @throws {Error} When the request fails.
   */
  async getProfile(uid: string): Promise<UserProfile | null> {
    const result = await this.requestJson('/api/container/getIndex', {
      type: 'uid',
      value: uid,
    });

    return this.toUserProfile(result?.data?.userInfo) ?? null;
  }

  /**
   * Gets a user's feed posts with pagination until `limit` is reached.
   *
   * @param uid Weibo user ID.
   * @param limit Maximum number of feed items.
   * @returns A list of normalized feed items.
   * @throws {Error} When the request fails.
   */
  async getFeeds(uid: string, limit = 15): Promise<FeedItem[]> {
    const profileResult = await this.requestJson('/api/container/getIndex', {
      type: 'uid',
      value: uid,
    });

    const tabs = profileResult?.data?.tabsInfo?.tabs;
    const containerId = Array.isArray(tabs)
      ? tabs.find((tab: any) => tab?.tabKey === 'weibo')?.containerid
      : undefined;

    if (!containerId) {
      return [];
    }

    const feeds: FeedItem[] = [];
    let sinceId = '';
    const seenSinceIds = new Set<string>();

    while (feeds.length < limit) {
      const result = await this.requestJson('/api/container/getIndex', {
        type: 'uid',
        value: uid,
        containerid: String(containerId),
        since_id: sinceId,
      });

      const cards = result?.data?.cards;
      if (!Array.isArray(cards) || cards.length === 0) {
        break;
      }

      for (const card of cards) {
        const item = this.toFeedItem(card?.mblog);
        if (item) {
          feeds.push(item);
        }
        if (feeds.length >= limit) {
          break;
        }
      }

      const nextSinceId = result?.data?.cardlistInfo?.since_id;
      if (!nextSinceId) {
        break;
      }
      const nextSinceIdString = String(nextSinceId);
      if (seenSinceIds.has(nextSinceIdString)) {
        break;
      }
      seenSinceIds.add(nextSinceIdString);
      sinceId = nextSinceIdString;
    }

    return feeds;
  }

  /**
   * Searches topics by keyword.
   *
   * @param keyword Search keyword.
   * @param limit Maximum number of topics.
   * @param page Search page number.
   * @returns A list of topic cards.
   * @throws {Error} When the request fails.
   */
  async searchTopics(keyword: string, limit = 15, page = 1): Promise<TopicItem[]> {
    const result = await this.requestJson(SEARCH_URL, {
      containerid: this.buildSearchContainerId('100103type=38', keyword),
      page_type: 'searchall',
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards) || cards.length < 1) {
      return [];
    }

    const cardGroup = cards[0]?.card_group;
    if (!Array.isArray(cardGroup)) {
      return [];
    }

    return cardGroup.slice(0, limit).map((item: any) => ({
      title_sub: item?.title_sub,
      desc1: item?.desc1,
      desc2: item?.desc2,
      scheme: item?.scheme,
    }));
  }

  /**
   * Gets a user's hot feed posts.
   *
   * @param uid Weibo user ID.
   * @param limit Maximum number of posts.
   * @returns A list of normalized hot feed items.
   * @throws {Error} When the request fails.
   */
  async getHotFeeds(uid: string, limit = 15): Promise<FeedItem[]> {
    const result = await this.requestJson('/api/container/getIndex', {
      containerid: `231002${uid}_-_HOTMBLOG`,
      type: 'uid',
      value: uid,
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards)) {
      return [];
    }

    return cards
      .filter((card: any) => card?.card_type === 9)
      .slice(0, limit)
      .map((card: any) => this.toFeedItem(card?.mblog))
      .filter((item): item is FeedItem => Boolean(item));
  }

  /**
   * Gets users that the given UID follows.
   *
   * @param uid Weibo user ID.
   * @param limit Maximum number of users.
   * @param page Pagination page number.
   * @returns A list of normalized user profiles.
   * @throws {Error} When the request fails.
   */
  async getFollowing(uid: string, limit = 15, page = 1): Promise<UserProfile[]> {
    const result = await this.requestJson('/api/container/getIndex', {
      containerid: `231051_-_followers_-_${uid}`,
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards) || cards.length < 1) {
      return [];
    }

    const cardGroup = cards[cards.length - 1]?.card_group;
    if (!Array.isArray(cardGroup)) {
      return [];
    }

    return cardGroup
      .slice(0, limit)
      .map((item: any) => this.toUserProfile(item?.user))
      .filter((item): item is UserProfile => Boolean(item));
  }

  /**
   * Gets followers of the given UID.
   *
   * @param uid Weibo user ID.
   * @param limit Maximum number of users.
   * @param page Pagination page number.
   * @returns A list of normalized user profiles.
   * @throws {Error} When the request fails.
   */
  async getFollowers(uid: string, limit = 15, page = 1): Promise<UserProfile[]> {
    const result = await this.requestJson('/api/container/getIndex', {
      containerid: `231051_-_fans_-_${uid}`,
      page: String(page),
    });

    const cards = result?.data?.cards;
    if (!Array.isArray(cards) || cards.length < 1) {
      return [];
    }

    const cardGroup = cards[cards.length - 1]?.card_group;
    if (!Array.isArray(cardGroup)) {
      return [];
    }

    return cardGroup
      .slice(0, limit)
      .map((item: any) => this.toUserProfile(item?.user))
      .filter((item): item is UserProfile => Boolean(item));
  }

  /**
   * Gets reposts for a feed item.
   *
   * @param feedId Weibo post ID.
   * @param page Pagination page number.
   * @returns A list of repost feed items.
   * @throws {Error} When the request fails.
   */
  async getReposts(feedId: string, page = 1): Promise<FeedItem[]> {
    const result = await this.requestJson('/api/statuses/repostTimeline', {
      id: feedId,
      page: String(page),
    });

    if (result?.ok === 0) {
      return [];
    }

    const reposts = result?.data?.data;
    if (!Array.isArray(reposts)) {
      return [];
    }

    return reposts
      .map((item: any) => this.toFeedItem(item))
      .filter((item): item is FeedItem => Boolean(item));
  }

  /**
   * Gets topic summary information and feed list.
   *
   * @param topicName Topic keyword without the outer `#` wrappers.
   * @param page Pagination page number.
   * @returns Topic summary metadata plus feed items.
   * @throws {Error} When the request fails.
   */
  async getTopicInfo(topicName: string, page = 1): Promise<{ summary: Record<string, any>; feeds: FeedItem[] }> {
    const result = await this.requestJson(SEARCH_URL, {
      containerid: `100808${encodeURIComponent(topicName)}`,
      page: String(page),
    });

    const cards = result?.data?.cards;
    const cardlistInfo = result?.data?.cardlistInfo;
    const summary: Record<string, any> = {};

    if (cardlistInfo) {
      summary.title = cardlistInfo.title_top ?? topicName;
      summary.desc = cardlistInfo.desc ?? '';
    }

    const feeds: FeedItem[] = [];
    if (Array.isArray(cards)) {
      for (const card of cards) {
        if (card?.card_type === 9) {
          const item = this.toFeedItem(card?.mblog);
          if (item) feeds.push(item);
        } else if (Array.isArray(card?.card_group)) {
          for (const grouped of card.card_group) {
            if (grouped?.card_type === 9) {
              const item = this.toFeedItem(grouped?.mblog);
              if (item) feeds.push(item);
            }
          }
        }
      }
    }

    return { summary, feeds };
  }

  /**
   * Gets comments for a specific feed item.
   *
   * @param feedId Weibo post ID.
   * @param page Pagination page number.
   * @returns A list of normalized comments.
   * @throws {Error} When the request fails.
   */
  async getComments(feedId: string, page = 1): Promise<CommentItem[]> {
    const result = await this.requestJson('/api/comments/show', {
      id: feedId,
      page: String(page),
    });

    const comments = result?.data?.data;
    if (!Array.isArray(comments)) {
      return [];
    }

    return comments.map((comment: any) => ({
      id: String(comment?.id ?? ''),
      text: this.stripTags(String(comment?.text ?? '')),
      created_at: comment?.created_at,
      source: comment?.source,
      like_counts: comment?.like_counts,
      user: this.toUserProfile(comment?.user) ?? undefined,
    }));
  }

  /**
   * Gets detail metrics for a hot topic.
   *
   * @param keyword Topic keyword. Optional surrounding `#` characters are allowed.
   * @returns Parsed topic counters.
   * @throws {Error} When the request fails.
   */
  async getHotTopicDetail(keyword: string): Promise<HotTopicDetail> {
    const normalizedKeyword = keyword.replace(/^#+|#+$/g, '');
    const result = await this.requestJson('https://m.s.weibo.com/ajax_topic/detail', {
      q: `#${normalizedKeyword}#`,
    });

    const payload = result?.data ?? result;
    const topicCount = payload?.baseInfo?.count ?? payload?.count ?? {};

    const readCount = this.toCount(topicCount?.read) ?? this.findCountByKeys(payload, ['read_count', 'read_num']);
    const discussionCount =
      this.toCount(topicCount?.t_r_num ?? topicCount?.discussion_count ?? topicCount?.discussion ?? topicCount?.discuss) ??
      this.findCountByKeys(payload, ['discussion_count', 'discuss_count', 'discussion_num', 'discuss_num', 't_r_num']);
    const interactionCount =
      this.toCount(topicCount?.interact ?? topicCount?.interaction_count ?? topicCount?.interaction_num) ??
      this.findCountByKeys(payload, ['interaction_count', 'interaction_num', 'interact_count', 'interact_num', 'interact']);
    const originalCount =
      this.toCount(topicCount?.ori_m ?? topicCount?.original_count ?? topicCount?.ori_count) ??
      this.findCountByKeys(payload, ['original_count', 'ori_count', 'origin_count', 'origin_num', 'ori_m']);

    return {
      read_count: readCount ?? 0,
      discussion_count: discussionCount ?? 0,
      interaction_count: interactionCount ?? 0,
      original_count: originalCount ?? 0,
    };
  }

  /**
   * Gets post detail information from the mobile detail page.
   *
   * @param postId Weibo post ID.
   * @returns Post detail if render data is parseable, otherwise `null`.
   * @throws {Error} When the request fails.
   */
  async getPostDetail(postId: string): Promise<PostDetail | null> {
    const html = await this.requestText(`/detail/${postId}`);
    const renderData = this.parseRenderData(html);
    if (!Array.isArray(renderData) || renderData.length === 0) {
      if (this.verbose) {
        console.error('[verbose] detail render_data not found or empty');
      }
      return null;
    }

    if (this.verbose) {
      const first = renderData[0];
      const keys = first && typeof first === 'object' ? Object.keys(first).slice(0, 20) : [];
      console.error(`[verbose] detail render_data entries=${renderData.length}, first_keys=${keys.join(',')}`);
    }

    const status = this.findStatusNode(renderData);
    if (!status) {
      if (this.verbose) {
        console.error('[verbose] detail status node not found in render_data');
      }
      return null;
    }

    if (this.verbose) {
      const countKeys = Object.keys(status).filter((key) => /(repost|comment|attitude|like|digg)/i.test(key));
      console.error(`[verbose] detail status_count_keys=${countKeys.join(',')}`);
    }

    const base = this.toFeedItem(status);
    if (!base) {
      return null;
    }

    return {
      ...base,
      ip_location: this.normalizeIpLocation(status?.region_name ?? status?.ip_location),
    };
  }

  private extractSearchStats(result: WeiboEnvelope): SearchStats | null {
    const headCards = result?.data?.cardlistInfo?.cardlist_head_cards;
    const cards = result?.data?.cards;

    const readCount = this.findCountByKeys(headCards, ['read_count', 'read_num', 'total_read']);
    const discussionCount = this.findCountByKeys(headCards, [
      'discussion_count',
      'discuss_count',
      'discussion_num',
      'discuss_num',
    ]);
    const mediaCount = this.findCountByKeys(headCards, ['media_count', 'media_num']);
    const host =
      this.findStringByKeys(headCards, ['host', 'hosts', 'host_name', 'topic_host']) ?? this.findHostFromTexts(headCards);

    const textStats = this.findStatsFromTexts(this.collectTextValues(headCards));
    const topicStats = this.findStatsFromTopicCards(cards);

    const stats: SearchStats = {
      read_count: readCount ?? textStats.read_count ?? topicStats.read_count,
      discussion_count: discussionCount ?? textStats.discussion_count ?? topicStats.discussion_count,
      host: host ?? textStats.host ?? topicStats.host,
      media_count: mediaCount ?? textStats.media_count ?? topicStats.media_count,
    };

    if (!stats.read_count && !stats.discussion_count && !stats.host && !stats.media_count) {
      return null;
    }

    return stats;
  }

  private findStatsFromTopicCards(cards: any): SearchStats {
    if (!Array.isArray(cards)) {
      return {};
    }

    const topicCard = cards.find((card: any) => Array.isArray(card?.card_group));
    if (!topicCard?.card_group?.length) {
      return {};
    }

    const first = topicCard.card_group[0];
    const texts = this.collectTextValues([first?.desc1, first?.desc2, first?.title_sub]);
    return this.findStatsFromTexts(texts);
  }

  private findStatsFromTexts(texts: string[]): SearchStats {
    const stats: SearchStats = {};

    for (const text of texts) {
      if (stats.discussion_count == null) {
        const discussionMatch = text.match(/([\d,.]+(?:\.\d+)?[万亿]?)\s*讨论/);
        if (discussionMatch?.[1]) {
          stats.discussion_count = this.toCount(discussionMatch[1]);
        }
      }

      if (stats.read_count == null) {
        const readMatch = text.match(/([\d,.]+(?:\.\d+)?[万亿]?)\s*阅读/);
        if (readMatch?.[1]) {
          stats.read_count = this.toCount(readMatch[1]);
        }
      }

      if (stats.media_count == null) {
        const mediaMatch = text.match(/([\d,.]+(?:\.\d+)?[万亿]?)\s*媒体/);
        if (mediaMatch?.[1]) {
          stats.media_count = this.toCount(mediaMatch[1]);
        }
      }

      if (!stats.host) {
        const hostMatch = text.match(/主持人[：:\s]*([^，,\s]+)/);
        if (hostMatch?.[1]) {
          stats.host = hostMatch[1].trim();
        }
      }
    }

    return stats;
  }

  private parseRenderData(html: string): any[] {
    const markers = ['window.$render_data =', 'var $render_data =', '$render_data ='];

    for (const marker of markers) {
      const json = this.extractJsonArrayAfterMarker(html, marker);
      if (!json) {
        continue;
      }
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        continue;
      }
    }

    return [];
  }

  private extractJsonArrayAfterMarker(input: string, marker: string): string | null {
    const markerIndex = input.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }

    const start = input.indexOf('[', markerIndex + marker.length);
    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let idx = start; idx < input.length; idx += 1) {
      const ch = input[idx];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '[') {
        depth += 1;
      } else if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, idx + 1);
        }
      }
    }

    return null;
  }

  private extractUrlFromScheme(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'sinaweibo:' && parsed.searchParams.has('url')) {
        return parsed.searchParams.get('url') ?? undefined;
      }
    } catch {
      return value;
    }

    return value;
  }

  private findStatusNode(input: any): any | null {
    const stack: any[] = [input];
    const visited = new Set<any>();

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (!Array.isArray(current)) {
        const maybeStatus =
          current.id &&
          (typeof current.text === 'string' ||
            typeof current.text_raw === 'string' ||
            typeof current.created_at === 'string' ||
            current.user);
        if (maybeStatus) {
          return current;
        }

        const priorityKeys = ['status', 'statusInfo', 'mblog', 'status_data', 'detail', 'weibo'];
        for (const key of priorityKeys) {
          if (current[key] && typeof current[key] === 'object') {
            stack.push(current[key]);
          }
        }
      }

      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
      } else {
        for (const value of Object.values(current)) {
          if (value && typeof value === 'object') {
            stack.push(value);
          }
        }
      }
    }

    return null;
  }

  private findHostFromTexts(input: any): string | undefined {
    const texts = this.collectTextValues(input);
    for (const text of texts) {
      const match = text.match(/主持人[：:\s]*([^，,\s]+)/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private findCountByKeys(input: any, keys: string[]): number | undefined {
    const value = this.findValueByKeys(input, keys);
    return this.toCount(value);
  }

  private findStringByKeys(input: any, keys: string[]): string | undefined {
    const value = this.findValueByKeys(input, keys);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return undefined;
  }

  private findValueByKeys(input: any, keys: string[]): unknown {
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    const stack: any[] = [input];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') {
        continue;
      }

      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
        continue;
      }

      for (const [key, value] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase())) {
          return value;
        }
        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }

    return undefined;
  }

  private collectTextValues(input: any): string[] {
    const texts: string[] = [];
    const stack: any[] = [input];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) {
        continue;
      }

      if (typeof current === 'string') {
        const trimmed = current.trim();
        if (trimmed) {
          texts.push(trimmed);
        }
        continue;
      }

      if (Array.isArray(current)) {
        for (const item of current) {
          stack.push(item);
        }
        continue;
      }

      if (typeof current === 'object') {
        for (const value of Object.values(current)) {
          stack.push(value);
        }
      }
    }

    return texts;
  }

  private toCount(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/,/g, '').trim();
    const match = normalized.match(/(\d+(?:\.\d+)?)([万亿]?)/);
    if (!match) {
      return undefined;
    }

    const num = Number(match[1]);
    if (!Number.isFinite(num)) {
      return undefined;
    }

    if (match[2] === '亿') {
      return Math.round(num * 100000000);
    }
    if (match[2] === '万') {
      return Math.round(num * 10000);
    }
    return Math.round(num);
  }

  private toNumericCount(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return this.toCount(value);
    }
    return undefined;
  }

  private normalizeIpLocation(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/^发布于\s*/, '').trim();
  }

  private stripTags(input: string): string {
    return input
      .replace(/<br\s*\/?>(\n)?/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toUserProfile(user: any): UserProfile | null {
    if (!user?.id) {
      return null;
    }

    const id = Number(user.id);
    if (!Number.isFinite(id)) {
      return null;
    }

    return {
      id,
      screen_name: user.screen_name,
      verified: user.verified,
      verified_reason: user.verified_reason,
      description: user.description,
      profile_url: user.profile_url,
      followers_count: user.followers_count,
      follow_count: user.follow_count,
      statuses_count: user.statuses_count,
      avatar_hd: user.avatar_hd,
    };
  }

  private buildSearchContainerId(typeContainer: string, keyword: string): string {
    return `${typeContainer}&q=${encodeURIComponent(keyword)}`;
  }

  private toFeedItem(mblog: any): FeedItem | null {
    if (!mblog?.id) {
      return null;
    }

    const text =
      typeof mblog.text_raw === 'string' && mblog.text_raw.trim()
        ? mblog.text_raw
        : typeof mblog.text === 'string'
          ? mblog.text
          : '';

    return {
      id: String(mblog.id),
      mid: mblog.mid,
      text: this.stripTags(text),
      created_at: mblog.created_at,
      source: mblog.source,
      comments_count: this.toNumericCount(mblog.comments_count ?? mblog.comments ?? mblog.comments_num),
      reposts_count: this.toNumericCount(mblog.reposts_count ?? mblog.reposts ?? mblog.repost_count),
      attitudes_count: this.toNumericCount(
        mblog.attitudes_count ?? mblog.attitudes ?? mblog.likes ?? mblog.like_count ?? mblog.digg_count,
      ),
      user: this.toUserProfile(mblog.user) ?? undefined,
    };
  }
}
