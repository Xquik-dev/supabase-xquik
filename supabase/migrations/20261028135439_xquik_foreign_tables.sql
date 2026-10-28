set local lock_timeout = '5s';
set local statement_timeout = '1min';

do $$
declare
  stale record;
begin
  for stale in
    select c.relname as name
    from pg_foreign_table t
    join pg_class c on c.oid = t.ftrelid
    join pg_foreign_server s on s.oid = t.ftserver
    where c.relnamespace = 'xquik'::regnamespace and s.srvname = 'xquik_server'
      and not exists (
        select from (values
          ('autocomplete_search', array['endpoint=/api/v1/x/search/autocomplete', 'response_path=/users'], array['q text', 'types text', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('check_follow', array['endpoint=/api/v1/x/followers/check', 'response_path='], array['source text', 'target text', 'fields text', 'omit text', 'attrs jsonb']),
          ('compare_styles', array['endpoint=/api/v1/styles/compare', 'response_path='], array['username1 text', 'username2 text', 'attrs jsonb']),
          ('export_draw', array['endpoint=/api/v1/draws/{id}/export?format=json', 'response_path='], array['id text', 'type text', 'attrs jsonb']),
          ('export_extraction', array['endpoint=/api/v1/extractions/{id}/export?format=json', 'response_path='], array['id text', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minPosts bigint', 'maxPosts bigint', 'minLikes bigint', 'minReplies bigint', 'minRetweets bigint', 'minViews bigint', 'hasDescription boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'hasMedia boolean', 'verified boolean', 'lang text', 'search text', 'sinceDate text', 'untilDate text', 'attrs jsonb']),
          ('find_communities', array['endpoint=/api/v1/x/communities/find', 'response_path=/communities', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_account', array['endpoint=/api/v1/account', 'response_path='], array['attrs jsonb']),
          ('get_all_community_tweets', array['endpoint=/api/v1/x/communities/tweets', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['communityId text', 'q text', 'queryType text', 'cursor text', 'pageSize bigint', 'language text', 'fromUser text', 'toUser text', 'mentioning text', 'sinceDate text', 'untilDate text', 'withinTime text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minViews bigint', 'minQuotes bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_article', array['endpoint=/api/v1/x/articles/{tweetId}', 'response_path='], array['tweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_batch_tweets', array['endpoint=/api/v1/x/tweets', 'response_path=/tweets'], array['ids text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_batch_user_tweets', array['endpoint=/api/v1/x/users/batch/tweets', 'response_path=/tweets'], array['ids text', 'usernames text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_batch_users', array['endpoint=/api/v1/x/users/batch', 'response_path=/users'], array['ids text', 'usernames text', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_bookmark_folders', array['endpoint=/api/v1/x/bookmarks/folders', 'response_path=/folders', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['cursor text', 'attrs jsonb']),
          ('get_bookmarks', array['endpoint=/api/v1/x/bookmarks', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['folderId text', 'cursor text', 'attrs jsonb']),
          ('get_broadcast', array['endpoint=/api/v1/x/broadcasts/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_analytics', array['endpoint=/api/v1/x/communities/{id}/analytics', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_info', array['endpoint=/api/v1/x/communities/{id}/info', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_media', array['endpoint=/api/v1/x/communities/{id}/media', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_members', array['endpoint=/api/v1/x/communities/{id}/members', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_moderators', array['endpoint=/api/v1/x/communities/{id}/moderators', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_notes_contributor', array['endpoint=/api/v1/x/community-notes/contributors/{alias}', 'response_path='], array['alias text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_topics', array['endpoint=/api/v1/x/communities/topics', 'response_path=/topics'], array['limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_community_tweets', array['endpoint=/api/v1/x/communities/{id}/tweets', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'queryType text', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_credit_topup_status', array['endpoint=/api/v1/credits/topup/status', 'response_path='], array['session_id text', 'attrs jsonb']),
          ('get_credits', array['endpoint=/api/v1/credits', 'response_path='], array['attrs jsonb']),
          ('get_dm_history', array['endpoint=/api/v1/x/dm/{userId}/history', 'response_path=/messages', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['userId text', 'account text', 'cursor text', 'maxId text', 'attrs jsonb']),
          ('get_draft', array['endpoint=/api/v1/drafts/{id}', 'response_path='], array['id text', 'attrs jsonb']),
          ('get_draw', array['endpoint=/api/v1/draws/{id}', 'response_path=/winners'], array['id text', 'attrs jsonb']),
          ('get_event', array['endpoint=/api/v1/events/{id}', 'response_path='], array['id text', 'attrs jsonb']),
          ('get_extraction', array['endpoint=/api/v1/extractions/{id}', 'response_path=/results', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['id text', 'limit bigint', 'cursor text', 'wait bigint', 'outputMode text', 'outputPreset text', 'fieldStyle text', 'includeRaw boolean', 'attrs jsonb']),
          ('get_followers_you_know', array['endpoint=/api/v1/x/users/{id}/followers-you-know', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_football_box_score', array['endpoint=/api/v1/x/sports/{league}/games/{id}/box-score', 'response_path='], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_football_player_props', array['endpoint=/api/v1/x/sports/{league}/games/{id}/player-props', 'response_path=/categories'], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_football_plays', array['endpoint=/api/v1/x/sports/{league}/games/{id}/plays', 'response_path=/quarters'], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_football_roster', array['endpoint=/api/v1/x/sports/{league}/games/{id}/roster', 'response_path=/rosters'], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_football_scoreboard', array['endpoint=/api/v1/x/sports/{league}/games/{id}', 'response_path=/periods'], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_guest_wallet_status', array['endpoint=/api/v1/guest-wallets/status', 'response_path='], array['attrs jsonb']),
          ('get_job', array['endpoint=/api/v1/x/jobs/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_job_locations', array['endpoint=/api/v1/x/jobs/locations', 'response_path=/locations'], array['q text', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_keyword_monitor', array['endpoint=/api/v1/monitors/keywords/{id}', 'response_path=/eventTypes'], array['id text', 'attrs jsonb']),
          ('get_list', array['endpoint=/api/v1/x/lists/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_list_followers', array['endpoint=/api/v1/x/lists/{id}/followers', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'after text', 'pageSize bigint', 'maxScan bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_list_members', array['endpoint=/api/v1/x/lists/{id}/members', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'after text', 'pageSize bigint', 'maxScan bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_list_tweets', array['endpoint=/api/v1/x/lists/{id}/tweets', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'after text', 'mode text', 'pageSize bigint', 'sinceTime text', 'untilTime text', 'includeReplies boolean', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'cardName text', 'source text', 'excludeSource text', 'geocode text', 'sinceId text', 'maxId text', 'near text', 'within text', 'withinTime text', 'nativeRetweets boolean', 'safe boolean', 'news boolean', 'keywords text', 'place text', 'placeCountry text', 'pointRadius text', 'boundingBox text', 'advancedQuery text', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_monitor', array['endpoint=/api/v1/monitors/{id}', 'response_path=/eventTypes'], array['id text', 'attrs jsonb']),
          ('get_notifications', array['endpoint=/api/v1/x/notifications', 'response_path=/notifications', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['type text', 'cursor text', 'attrs jsonb']),
          ('get_popular_communities', array['endpoint=/api/v1/x/communities/popular', 'response_path=/communities', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['topicId text', 'topic text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_post_monitor', array['endpoint=/api/v1/monitors/posts/{id}', 'response_path=/media'], array['id text', 'attrs jsonb']),
          ('get_post_monitor_metrics', array['endpoint=/api/v1/monitors/posts/{id}/metrics', 'response_path=/buckets'], array['id text', 'hours bigint', 'attrs jsonb']),
          ('get_radar', array['endpoint=/api/v1/radar', 'response_path=/items'], array['after text', 'category text', 'hours bigint', 'limit bigint', 'region text', 'source text', 'attrs jsonb']),
          ('get_similar_users', array['endpoint=/api/v1/x/users/{id}/similar', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_space', array['endpoint=/api/v1/x/spaces/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_space_replay', array['endpoint=/api/v1/x/spaces/{id}/replay', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_sports_game_audience', array['endpoint=/api/v1/x/sports/{league}/games/{id}/audience', 'response_path='], array['league text', 'id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_sports_game_posts', array['endpoint=/api/v1/x/sports/{league}/games/{id}/posts', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['league text', 'id text', 'queryType text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_style', array['endpoint=/api/v1/styles/{id}', 'response_path=/tweets'], array['id text', 'attrs jsonb']),
          ('get_style_performance', array['endpoint=/api/v1/styles/{id}/performance', 'response_path=/tweets'], array['id text', 'attrs jsonb']),
          ('get_suggested_communities', array['endpoint=/api/v1/x/communities/suggested', 'response_path=/communities'], array['limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_ticket', array['endpoint=/api/v1/support/tickets/{id}', 'response_path=/messages'], array['id text', 'attrs jsonb']),
          ('get_timeline', array['endpoint=/api/v1/x/timeline', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['seenTweetIds text', 'cursor text', 'attrs jsonb']),
          ('get_top_tweets', array['endpoint=/api/v1/x/tweets/top', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['metric text', 'window text', 'country text', 'language text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_trends', array['endpoint=/api/v1/trends', 'response_path=/trends'], array['woeid bigint', 'count bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_embed', array['endpoint=/api/v1/x/tweets/{id}/embed', 'response_path='], array['id text', 'theme text', 'hideMedia boolean', 'hideThread boolean', 'omitScript boolean', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_favoriters', array['endpoint=/api/v1/x/tweets/{id}/favoriters', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_hidden_replies', array['endpoint=/api/v1/x/tweets/{id}/hidden-replies', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_insights', array['endpoint=/api/v1/x/tweets/{id}/insights', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_quotes', array['endpoint=/api/v1/x/tweets/{id}/quotes', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'pageSize bigint', 'includeReplies boolean', 'queryType text', 'sinceTime text', 'untilTime text', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'cardName text', 'source text', 'excludeSource text', 'geocode text', 'sinceId text', 'maxId text', 'near text', 'within text', 'withinTime text', 'nativeRetweets boolean', 'safe boolean', 'news boolean', 'keywords text', 'listId text', 'place text', 'placeCountry text', 'pointRadius text', 'boundingBox text', 'advancedQuery text', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_replies', array['endpoint=/api/v1/x/tweets/{id}/replies', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'after text', 'mode text', 'limit bigint', 'pageSize bigint', 'scope text', 'maxDepth bigint', 'sort text', 'excludeOriginalAuthor boolean', 'includeOriginalPost boolean', 'includeHidden boolean', 'hasMediaOnly boolean', 'sinceTime text', 'untilTime text', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_repost_check', array['endpoint=/api/v1/x/tweets/{id}/retweeters/check', 'response_path='], array['id text', 'user text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_retweeter_ids', array['endpoint=/api/v1/x/tweets/{id}/retweeter-ids', 'response_path=/ids', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'attrs jsonb']),
          ('get_tweet_retweeters', array['endpoint=/api/v1/x/tweets/{id}/retweeters', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'includeRetweetTimestamp boolean', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'enrichProfiles boolean', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_subtitles', array['endpoint=/api/v1/x/tweets/{id}/subtitles', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_tweet_thread', array['endpoint=/api/v1/x/tweets/{id}/thread', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user', array['endpoint=/api/v1/x/users/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_affiliates', array['endpoint=/api/v1/x/users/{id}/affiliates', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_articles', array['endpoint=/api/v1/x/users/{id}/articles', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_follower_ids', array['endpoint=/api/v1/x/users/{id}/follower-ids', 'response_path=/ids', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'attrs jsonb']),
          ('get_user_followers', array['endpoint=/api/v1/x/users/{id}/followers', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'after text', 'pageSize bigint', 'maxScan bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'enrichProfiles boolean', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_following', array['endpoint=/api/v1/x/users/{id}/following', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'after text', 'pageSize bigint', 'maxScan bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'enrichProfiles boolean', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_following_ids', array['endpoint=/api/v1/x/users/{id}/following-ids', 'response_path=/ids', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'attrs jsonb']),
          ('get_user_highlights', array['endpoint=/api/v1/x/users/{id}/highlights', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_insights', array['endpoint=/api/v1/x/users/{id}/insights', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_likes', array['endpoint=/api/v1/x/users/{id}/likes', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_list_memberships', array['endpoint=/api/v1/x/users/{id}/list-memberships', 'response_path=/lists', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_lists', array['endpoint=/api/v1/x/users/{id}/lists', 'response_path=/lists', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_live_status', array['endpoint=/api/v1/x/users/{id}/live', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_media', array['endpoint=/api/v1/x/users/{id}/media', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_mentions', array['endpoint=/api/v1/x/users/{id}/mentions', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'sinceTime text', 'untilTime text', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'withinTime text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_replies', array['endpoint=/api/v1/x/users/{id}/replies', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'pageSize bigint', 'sinceTime text', 'untilTime text', 'includeParentTweet boolean', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'cardName text', 'source text', 'excludeSource text', 'geocode text', 'sinceId text', 'maxId text', 'near text', 'within text', 'withinTime text', 'nativeRetweets boolean', 'safe boolean', 'news boolean', 'keywords text', 'listId text', 'place text', 'placeCountry text', 'pointRadius text', 'boundingBox text', 'advancedQuery text', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_subscriptions', array['endpoint=/api/v1/x/users/{id}/subscriptions', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_tweets', array['endpoint=/api/v1/x/users/{id}/tweets', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'pageSize bigint', 'sinceTime text', 'untilTime text', 'includeReplies boolean', 'includeParentTweet boolean', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'cardName text', 'source text', 'excludeSource text', 'geocode text', 'sinceId text', 'maxId text', 'near text', 'within text', 'withinTime text', 'nativeRetweets boolean', 'safe boolean', 'news boolean', 'keywords text', 'listId text', 'place text', 'placeCountry text', 'pointRadius text', 'boundingBox text', 'advancedQuery text', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_user_verified_followers', array['endpoint=/api/v1/x/users/{id}/verified-followers', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['id text', 'cursor text', 'mode text', 'after text', 'pageSize bigint', 'maxScan bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'enrichProfiles boolean', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_write_action_status', array['endpoint=/api/v1/x/write-actions/{id}', 'response_path='], array['id text', 'attrs jsonb']),
          ('get_x_account', array['endpoint=/api/v1/x/accounts/{id}', 'response_path='], array['id text', 'attrs jsonb']),
          ('get_x_hashflags', array['endpoint=/api/v1/x/hashflags', 'response_path=/hashflags'], array['q text', 'activeOnly boolean', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_x_news_story_versions', array['endpoint=/api/v1/x/news/{id}/versions', 'response_path=/versions'], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_x_trend_locations', array['endpoint=/api/v1/x/trends/locations', 'response_path=/locations'], array['country text', 'placeType text', 'q text', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_x_trends', array['endpoint=/api/v1/x/trends', 'response_path=/trends'], array['woeid bigint', 'country text', 'location text', 'count bigint', 'at text', 'fields text', 'omit text', 'attrs jsonb']),
          ('get_x_trends_history', array['endpoint=/api/v1/x/trends/history', 'response_path=/snapshots', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['woeid bigint', 'country text', 'location text', 'from text', 'to text', 'every text', 'count bigint', 'limit bigint', 'cursor text', 'fields text', 'omit text', 'attrs jsonb']),
          ('list_community_notes_contributor_deleted_notes', array['endpoint=/api/v1/x/community-notes/contributors/{alias}/deleted-notes', 'response_path=/notes', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['alias text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('list_community_notes_contributor_notes', array['endpoint=/api/v1/x/community-notes/contributors/{alias}/notes', 'response_path=/notes', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['alias text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('list_drafts', array['endpoint=/api/v1/drafts', 'response_path=/drafts', 'cursor_param=afterCursor', 'cursor_path=/nextCursor'], array['limit bigint', 'afterCursor text', 'attrs jsonb']),
          ('list_draws', array['endpoint=/api/v1/draws', 'response_path=/draws', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_events', array['endpoint=/api/v1/events', 'response_path=/events', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'monitorId text', 'keywordMonitorId text', 'postMonitorId text', 'eventType text', 'attrs jsonb']),
          ('list_extractions', array['endpoint=/api/v1/extractions', 'response_path=/extractions', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'toolType text', 'status text', 'attrs jsonb']),
          ('list_football_games', array['endpoint=/api/v1/x/sports/{league}/games', 'response_path=/games'], array['league text', 'from text', 'to text', 'team text', 'fields text', 'omit text', 'attrs jsonb']),
          ('list_keyword_monitors', array['endpoint=/api/v1/monitors/keywords', 'response_path=/monitors', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_monitors', array['endpoint=/api/v1/monitors', 'response_path=/monitors', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_post_monitors', array['endpoint=/api/v1/monitors/posts', 'response_path=/monitors', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_styles', array['endpoint=/api/v1/styles', 'response_path=/styles', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_tickets', array['endpoint=/api/v1/support/tickets', 'response_path=/tickets', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_webhook_deliveries', array['endpoint=/api/v1/webhooks/{id}/deliveries', 'response_path=/deliveries', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['id text', 'limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_webhooks', array['endpoint=/api/v1/webhooks', 'response_path=/webhooks', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('list_x_accounts', array['endpoint=/api/v1/x/accounts', 'response_path=/accounts', 'cursor_param=cursor', 'cursor_path=/nextCursor'], array['limit bigint', 'cursor text', 'attrs jsonb']),
          ('lookup_tweet', array['endpoint=/api/v1/x/tweets/{id}', 'response_path='], array['id text', 'fields text', 'omit text', 'attrs jsonb']),
          ('resolve_links', array['endpoint=/api/v1/x/links/resolve', 'response_path=/links'], array['urls text', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_communities', array['endpoint=/api/v1/x/communities/search', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['communityId text', 'q text', 'queryType text', 'cursor text', 'pageSize bigint', 'language text', 'fromUser text', 'toUser text', 'mentioning text', 'sinceDate text', 'untilDate text', 'withinTime text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minViews bigint', 'minQuotes bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'sinceId text', 'maxId text', 'nativeRetweets boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_community_members', array['endpoint=/api/v1/x/communities/{id}/members/search', 'response_path=/users'], array['id text', 'q text', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_jobs', array['endpoint=/api/v1/x/jobs/search', 'response_path=/jobs', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'location text', 'locationId text', 'locationType text', 'seniority text', 'employmentType text', 'company text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_lists', array['endpoint=/api/v1/x/lists/search', 'response_path=/lists', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_spaces', array['endpoint=/api/v1/x/spaces/search', 'response_path=/spaces', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'queryType text', 'cursor text', 'pageSize bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_tweets', array['endpoint=/api/v1/x/tweets/search', 'response_path=/tweets', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'queryType text', 'mode text', 'cursor text', 'sinceTime text', 'untilTime text', 'limit bigint', 'fromUser text', 'toUser text', 'mentioning text', 'language text', 'sinceDate text', 'untilDate text', 'mediaType text', 'minLikes bigint', 'minRetweets bigint', 'minReplies bigint', 'minQuotes bigint', 'minViews bigint', 'minBookmarks bigint', 'maxFaves bigint', 'maxRetweets bigint', 'maxReplies bigint', 'maxQuotes bigint', 'blueVerifiedOnly boolean', 'cardName text', 'source text', 'excludeSource text', 'geocode text', 'sinceId text', 'maxId text', 'near text', 'within text', 'withinTime text', 'nativeRetweets boolean', 'safe boolean', 'news boolean', 'verifiedOnly boolean', 'replies text', 'retweets text', 'quotes text', 'exactPhrase text', 'excludeWords text', 'anyWords text', 'hashtags text', 'cashtags text', 'url text', 'conversationId text', 'inReplyToTweetId text', 'quotesOfTweetId text', 'retweetsOfTweetId text', 'keywords text', 'listId text', 'place text', 'placeCountry text', 'pointRadius text', 'boundingBox text', 'advancedQuery text', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_users', array['endpoint=/api/v1/x/users/search', 'response_path=/users', 'cursor_param=cursor', 'cursor_path=/next_cursor'], array['q text', 'cursor text', 'pageSize bigint', 'minFollowers bigint', 'maxFollowers bigint', 'minFollowing bigint', 'maxFollowing bigint', 'minStatuses bigint', 'maxStatuses bigint', 'minAccountAgeDays bigint', 'verifiedOnly boolean', 'blueVerifiedOnly boolean', 'verifiedType text', 'hasWebsite boolean', 'hasLocation boolean', 'hasEmail boolean', 'businessEmailOnly boolean', 'emailDomains text', 'bioContains text', 'locationContains text', 'usernameContains text', 'enrichProfiles boolean', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_x_places', array['endpoint=/api/v1/x/places/search', 'response_path=/places'], array['q text', 'limit bigint', 'fields text', 'omit text', 'attrs jsonb']),
          ('search_xquik_documentation_with_query', array['endpoint=/ask', 'response_path='], array['query text', 'site text', 'mode text', 'response_format text', 'streaming boolean', 'attrs jsonb']),
          ('translate_tweet', array['endpoint=/api/v1/x/tweets/{id}/translation', 'response_path='], array['id text', 'language text', 'fields text', 'omit text', 'attrs jsonb']),
          ('translate_user_bio', array['endpoint=/api/v1/x/users/{id}/translation', 'response_path='], array['id text', 'language text', 'fields text', 'omit text', 'attrs jsonb'])
        ) wanted (name, options, columns)
        where (wanted.name, wanted.options, wanted.columns) = (
          c.relname::text,
          t.ftoptions,
          array(
            select format('%s %s', a.attname, format_type(a.atttypid, a.atttypmod))
            from pg_attribute a
            where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            order by a.attnum
          )
        )
      )
  loop
    execute format('drop foreign table xquik.%I', stale.name);
  end loop;
end
$$;

create foreign table if not exists xquik.autocomplete_search (
  "q" text,
  "types" text,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/search/autocomplete', response_path '/users');

create foreign table if not exists xquik.check_follow (
  "source" text,
  "target" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/followers/check', response_path '');

create foreign table if not exists xquik.compare_styles (
  "username1" text,
  "username2" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/styles/compare', response_path '');

create foreign table if not exists xquik.export_draw (
  "id" text,
  "type" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/draws/{id}/export?format=json', response_path '');

create foreign table if not exists xquik.export_extraction (
  "id" text,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minPosts" bigint,
  "maxPosts" bigint,
  "minLikes" bigint,
  "minReplies" bigint,
  "minRetweets" bigint,
  "minViews" bigint,
  "hasDescription" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "hasMedia" boolean,
  "verified" boolean,
  "lang" text,
  "search" text,
  "sinceDate" text,
  "untilDate" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/extractions/{id}/export?format=json', response_path '');

create foreign table if not exists xquik.find_communities (
  "q" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/find', response_path '/communities', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_account (
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/account', response_path '');

create foreign table if not exists xquik.get_all_community_tweets (
  "communityId" text,
  "q" text,
  "queryType" text,
  "cursor" text,
  "pageSize" bigint,
  "language" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "sinceDate" text,
  "untilDate" text,
  "withinTime" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minViews" bigint,
  "minQuotes" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/tweets', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_article (
  "tweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/articles/{tweetId}', response_path '');

create foreign table if not exists xquik.get_batch_tweets (
  "ids" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets', response_path '/tweets');

create foreign table if not exists xquik.get_batch_user_tweets (
  "ids" text,
  "usernames" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/batch/tweets', response_path '/tweets');

create foreign table if not exists xquik.get_batch_users (
  "ids" text,
  "usernames" text,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/batch', response_path '/users');

create foreign table if not exists xquik.get_bookmark_folders (
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/bookmarks/folders', response_path '/folders', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_bookmarks (
  "folderId" text,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/bookmarks', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_broadcast (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/broadcasts/{id}', response_path '');

create foreign table if not exists xquik.get_community_analytics (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/analytics', response_path '');

create foreign table if not exists xquik.get_community_info (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/info', response_path '');

create foreign table if not exists xquik.get_community_media (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/media', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_community_members (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/members', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_community_moderators (
  "id" text,
  "cursor" text,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/moderators', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_community_notes_contributor (
  "alias" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/community-notes/contributors/{alias}', response_path '');

create foreign table if not exists xquik.get_community_topics (
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/topics', response_path '/topics');

create foreign table if not exists xquik.get_community_tweets (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "queryType" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/tweets', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_credit_topup_status (
  "session_id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/credits/topup/status', response_path '');

create foreign table if not exists xquik.get_credits (
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/credits', response_path '');

create foreign table if not exists xquik.get_dm_history (
  "userId" text,
  "account" text,
  "cursor" text,
  "maxId" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/dm/{userId}/history', response_path '/messages', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_draft (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/drafts/{id}', response_path '');

create foreign table if not exists xquik.get_draw (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/draws/{id}', response_path '/winners');

create foreign table if not exists xquik.get_event (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/events/{id}', response_path '');

create foreign table if not exists xquik.get_extraction (
  "id" text,
  "limit" bigint,
  "cursor" text,
  "wait" bigint,
  "outputMode" text,
  "outputPreset" text,
  "fieldStyle" text,
  "includeRaw" boolean,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/extractions/{id}', response_path '/results', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.get_followers_you_know (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/followers-you-know', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_football_box_score (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/box-score', response_path '');

create foreign table if not exists xquik.get_football_player_props (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/player-props', response_path '/categories');

create foreign table if not exists xquik.get_football_plays (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/plays', response_path '/quarters');

create foreign table if not exists xquik.get_football_roster (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/roster', response_path '/rosters');

create foreign table if not exists xquik.get_football_scoreboard (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}', response_path '/periods');

create foreign table if not exists xquik.get_guest_wallet_status (
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/guest-wallets/status', response_path '');

create foreign table if not exists xquik.get_job (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/jobs/{id}', response_path '');

create foreign table if not exists xquik.get_job_locations (
  "q" text,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/jobs/locations', response_path '/locations');

create foreign table if not exists xquik.get_keyword_monitor (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/keywords/{id}', response_path '/eventTypes');

create foreign table if not exists xquik.get_list (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/lists/{id}', response_path '');

create foreign table if not exists xquik.get_list_followers (
  "id" text,
  "cursor" text,
  "mode" text,
  "after" text,
  "pageSize" bigint,
  "maxScan" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/lists/{id}/followers', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_list_members (
  "id" text,
  "cursor" text,
  "mode" text,
  "after" text,
  "pageSize" bigint,
  "maxScan" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/lists/{id}/members', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_list_tweets (
  "id" text,
  "cursor" text,
  "after" text,
  "mode" text,
  "pageSize" bigint,
  "sinceTime" text,
  "untilTime" text,
  "includeReplies" boolean,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "cardName" text,
  "source" text,
  "excludeSource" text,
  "geocode" text,
  "sinceId" text,
  "maxId" text,
  "near" text,
  "within" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "safe" boolean,
  "news" boolean,
  "keywords" text,
  "place" text,
  "placeCountry" text,
  "pointRadius" text,
  "boundingBox" text,
  "advancedQuery" text,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/lists/{id}/tweets', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_monitor (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/{id}', response_path '/eventTypes');

create foreign table if not exists xquik.get_notifications (
  "type" text,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/notifications', response_path '/notifications', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_popular_communities (
  "topicId" text,
  "topic" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/popular', response_path '/communities', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_post_monitor (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/posts/{id}', response_path '/media');

create foreign table if not exists xquik.get_post_monitor_metrics (
  "id" text,
  "hours" bigint,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/posts/{id}/metrics', response_path '/buckets');

create foreign table if not exists xquik.get_radar (
  "after" text,
  "category" text,
  "hours" bigint,
  "limit" bigint,
  "region" text,
  "source" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/radar', response_path '/items');

create foreign table if not exists xquik.get_similar_users (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/similar', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_space (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/spaces/{id}', response_path '');

create foreign table if not exists xquik.get_space_replay (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/spaces/{id}/replay', response_path '');

create foreign table if not exists xquik.get_sports_game_audience (
  "league" text,
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/audience', response_path '');

create foreign table if not exists xquik.get_sports_game_posts (
  "league" text,
  "id" text,
  "queryType" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games/{id}/posts', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_style (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/styles/{id}', response_path '/tweets');

create foreign table if not exists xquik.get_style_performance (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/styles/{id}/performance', response_path '/tweets');

create foreign table if not exists xquik.get_suggested_communities (
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/suggested', response_path '/communities');

create foreign table if not exists xquik.get_ticket (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/support/tickets/{id}', response_path '/messages');

create foreign table if not exists xquik.get_timeline (
  "seenTweetIds" text,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/timeline', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_top_tweets (
  "metric" text,
  "window" text,
  "country" text,
  "language" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/top', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_trends (
  "woeid" bigint,
  "count" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/trends', response_path '/trends');

create foreign table if not exists xquik.get_tweet_embed (
  "id" text,
  "theme" text,
  "hideMedia" boolean,
  "hideThread" boolean,
  "omitScript" boolean,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/embed', response_path '');

create foreign table if not exists xquik.get_tweet_favoriters (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/favoriters', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_hidden_replies (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/hidden-replies', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_insights (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/insights', response_path '');

create foreign table if not exists xquik.get_tweet_quotes (
  "id" text,
  "cursor" text,
  "mode" text,
  "pageSize" bigint,
  "includeReplies" boolean,
  "queryType" text,
  "sinceTime" text,
  "untilTime" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "cardName" text,
  "source" text,
  "excludeSource" text,
  "geocode" text,
  "sinceId" text,
  "maxId" text,
  "near" text,
  "within" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "safe" boolean,
  "news" boolean,
  "keywords" text,
  "listId" text,
  "place" text,
  "placeCountry" text,
  "pointRadius" text,
  "boundingBox" text,
  "advancedQuery" text,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/quotes', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_replies (
  "id" text,
  "cursor" text,
  "after" text,
  "mode" text,
  "limit" bigint,
  "pageSize" bigint,
  "scope" text,
  "maxDepth" bigint,
  "sort" text,
  "excludeOriginalAuthor" boolean,
  "includeOriginalPost" boolean,
  "includeHidden" boolean,
  "hasMediaOnly" boolean,
  "sinceTime" text,
  "untilTime" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/replies', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_repost_check (
  "id" text,
  "user" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/retweeters/check', response_path '');

create foreign table if not exists xquik.get_tweet_retweeter_ids (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/retweeter-ids', response_path '/ids', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_retweeters (
  "id" text,
  "cursor" text,
  "includeRetweetTimestamp" boolean,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "enrichProfiles" boolean,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/retweeters', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_tweet_subtitles (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/subtitles', response_path '');

create foreign table if not exists xquik.get_tweet_thread (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/thread', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}', response_path '');

create foreign table if not exists xquik.get_user_affiliates (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/affiliates', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_articles (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/articles', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_follower_ids (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/follower-ids', response_path '/ids', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_followers (
  "id" text,
  "cursor" text,
  "mode" text,
  "after" text,
  "pageSize" bigint,
  "maxScan" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "enrichProfiles" boolean,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/followers', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_following (
  "id" text,
  "cursor" text,
  "mode" text,
  "after" text,
  "pageSize" bigint,
  "maxScan" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "enrichProfiles" boolean,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/following', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_following_ids (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/following-ids', response_path '/ids', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_highlights (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/highlights', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_insights (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/insights', response_path '');

create foreign table if not exists xquik.get_user_likes (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/likes', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_list_memberships (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/list-memberships', response_path '/lists', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_lists (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/lists', response_path '/lists', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_live_status (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/live', response_path '');

create foreign table if not exists xquik.get_user_media (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/media', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_mentions (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "sinceTime" text,
  "untilTime" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/mentions', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_replies (
  "id" text,
  "cursor" text,
  "mode" text,
  "pageSize" bigint,
  "sinceTime" text,
  "untilTime" text,
  "includeParentTweet" boolean,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "cardName" text,
  "source" text,
  "excludeSource" text,
  "geocode" text,
  "sinceId" text,
  "maxId" text,
  "near" text,
  "within" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "safe" boolean,
  "news" boolean,
  "keywords" text,
  "listId" text,
  "place" text,
  "placeCountry" text,
  "pointRadius" text,
  "boundingBox" text,
  "advancedQuery" text,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/replies', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_subscriptions (
  "id" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/subscriptions', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_tweets (
  "id" text,
  "cursor" text,
  "mode" text,
  "pageSize" bigint,
  "sinceTime" text,
  "untilTime" text,
  "includeReplies" boolean,
  "includeParentTweet" boolean,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "cardName" text,
  "source" text,
  "excludeSource" text,
  "geocode" text,
  "sinceId" text,
  "maxId" text,
  "near" text,
  "within" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "safe" boolean,
  "news" boolean,
  "keywords" text,
  "listId" text,
  "place" text,
  "placeCountry" text,
  "pointRadius" text,
  "boundingBox" text,
  "advancedQuery" text,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/tweets', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_user_verified_followers (
  "id" text,
  "cursor" text,
  "mode" text,
  "after" text,
  "pageSize" bigint,
  "maxScan" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "enrichProfiles" boolean,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/verified-followers', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.get_write_action_status (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/write-actions/{id}', response_path '');

create foreign table if not exists xquik.get_x_account (
  "id" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/accounts/{id}', response_path '');

create foreign table if not exists xquik.get_x_hashflags (
  "q" text,
  "activeOnly" boolean,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/hashflags', response_path '/hashflags');

create foreign table if not exists xquik.get_x_news_story_versions (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/news/{id}/versions', response_path '/versions');

create foreign table if not exists xquik.get_x_trend_locations (
  "country" text,
  "placeType" text,
  "q" text,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/trends/locations', response_path '/locations');

create foreign table if not exists xquik.get_x_trends (
  "woeid" bigint,
  "country" text,
  "location" text,
  "count" bigint,
  "at" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/trends', response_path '/trends');

create foreign table if not exists xquik.get_x_trends_history (
  "woeid" bigint,
  "country" text,
  "location" text,
  "from" text,
  "to" text,
  "every" text,
  "count" bigint,
  "limit" bigint,
  "cursor" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/trends/history', response_path '/snapshots', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.list_community_notes_contributor_deleted_notes (
  "alias" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/community-notes/contributors/{alias}/deleted-notes', response_path '/notes', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.list_community_notes_contributor_notes (
  "alias" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/community-notes/contributors/{alias}/notes', response_path '/notes', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.list_drafts (
  "limit" bigint,
  "afterCursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/drafts', response_path '/drafts', cursor_param 'afterCursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_draws (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/draws', response_path '/draws', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_events (
  "limit" bigint,
  "cursor" text,
  "monitorId" text,
  "keywordMonitorId" text,
  "postMonitorId" text,
  "eventType" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/events', response_path '/events', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_extractions (
  "limit" bigint,
  "cursor" text,
  "toolType" text,
  "status" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/extractions', response_path '/extractions', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_football_games (
  "league" text,
  "from" text,
  "to" text,
  "team" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/sports/{league}/games', response_path '/games');

create foreign table if not exists xquik.list_keyword_monitors (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/keywords', response_path '/monitors', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_monitors (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors', response_path '/monitors', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_post_monitors (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/monitors/posts', response_path '/monitors', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_styles (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/styles', response_path '/styles', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_tickets (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/support/tickets', response_path '/tickets', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_webhook_deliveries (
  "id" text,
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/webhooks/{id}/deliveries', response_path '/deliveries', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_webhooks (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/webhooks', response_path '/webhooks', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.list_x_accounts (
  "limit" bigint,
  "cursor" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/accounts', response_path '/accounts', cursor_param 'cursor', cursor_path '/nextCursor');

create foreign table if not exists xquik.lookup_tweet (
  "id" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}', response_path '');

create foreign table if not exists xquik.resolve_links (
  "urls" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/links/resolve', response_path '/links');

create foreign table if not exists xquik.search_communities (
  "communityId" text,
  "q" text,
  "queryType" text,
  "cursor" text,
  "pageSize" bigint,
  "language" text,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "sinceDate" text,
  "untilDate" text,
  "withinTime" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minViews" bigint,
  "minQuotes" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "sinceId" text,
  "maxId" text,
  "nativeRetweets" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/search', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_community_members (
  "id" text,
  "q" text,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/communities/{id}/members/search', response_path '/users');

create foreign table if not exists xquik.search_jobs (
  "q" text,
  "location" text,
  "locationId" text,
  "locationType" text,
  "seniority" text,
  "employmentType" text,
  "company" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/jobs/search', response_path '/jobs', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_lists (
  "q" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/lists/search', response_path '/lists', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_spaces (
  "q" text,
  "queryType" text,
  "cursor" text,
  "pageSize" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/spaces/search', response_path '/spaces', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_tweets (
  "q" text,
  "queryType" text,
  "mode" text,
  "cursor" text,
  "sinceTime" text,
  "untilTime" text,
  "limit" bigint,
  "fromUser" text,
  "toUser" text,
  "mentioning" text,
  "language" text,
  "sinceDate" text,
  "untilDate" text,
  "mediaType" text,
  "minLikes" bigint,
  "minRetweets" bigint,
  "minReplies" bigint,
  "minQuotes" bigint,
  "minViews" bigint,
  "minBookmarks" bigint,
  "maxFaves" bigint,
  "maxRetweets" bigint,
  "maxReplies" bigint,
  "maxQuotes" bigint,
  "blueVerifiedOnly" boolean,
  "cardName" text,
  "source" text,
  "excludeSource" text,
  "geocode" text,
  "sinceId" text,
  "maxId" text,
  "near" text,
  "within" text,
  "withinTime" text,
  "nativeRetweets" boolean,
  "safe" boolean,
  "news" boolean,
  "verifiedOnly" boolean,
  "replies" text,
  "retweets" text,
  "quotes" text,
  "exactPhrase" text,
  "excludeWords" text,
  "anyWords" text,
  "hashtags" text,
  "cashtags" text,
  "url" text,
  "conversationId" text,
  "inReplyToTweetId" text,
  "quotesOfTweetId" text,
  "retweetsOfTweetId" text,
  "keywords" text,
  "listId" text,
  "place" text,
  "placeCountry" text,
  "pointRadius" text,
  "boundingBox" text,
  "advancedQuery" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/search', response_path '/tweets', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_users (
  "q" text,
  "cursor" text,
  "pageSize" bigint,
  "minFollowers" bigint,
  "maxFollowers" bigint,
  "minFollowing" bigint,
  "maxFollowing" bigint,
  "minStatuses" bigint,
  "maxStatuses" bigint,
  "minAccountAgeDays" bigint,
  "verifiedOnly" boolean,
  "blueVerifiedOnly" boolean,
  "verifiedType" text,
  "hasWebsite" boolean,
  "hasLocation" boolean,
  "hasEmail" boolean,
  "businessEmailOnly" boolean,
  "emailDomains" text,
  "bioContains" text,
  "locationContains" text,
  "usernameContains" text,
  "enrichProfiles" boolean,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/search', response_path '/users', cursor_param 'cursor', cursor_path '/next_cursor');

create foreign table if not exists xquik.search_x_places (
  "q" text,
  "limit" bigint,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/places/search', response_path '/places');

create foreign table if not exists xquik.search_xquik_documentation_with_query (
  "query" text,
  "site" text,
  "mode" text,
  "response_format" text,
  "streaming" boolean,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/ask', response_path '');

create foreign table if not exists xquik.translate_tweet (
  "id" text,
  "language" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/tweets/{id}/translation', response_path '');

create foreign table if not exists xquik.translate_user_bio (
  "id" text,
  "language" text,
  "fields" text,
  "omit" text,
  attrs jsonb
)
  server xquik_server
  options (endpoint '/api/v1/x/users/{id}/translation', response_path '');
