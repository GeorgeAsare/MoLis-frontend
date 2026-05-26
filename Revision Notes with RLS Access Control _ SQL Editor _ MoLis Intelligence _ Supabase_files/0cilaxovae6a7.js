;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="16d714d7-fa20-b0b2-6d48-c0e4fd398e39")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(705541),a=e.i(964574),r=e.i(739114),n=e.i(667286),i=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:i=!1,createSchema:c=!1}){let u=new Headers;s&&u.set("x-connection-encrypted",s);let d=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:i,createSchema:c}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:s,sql:d,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let c=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([c.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:i.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...o})}])},888525,760255,284399,e=>{"use strict";e.i(850036);var t=e.i(479084),s=e.i(739114),a=e.i(714403),r=e.i(392491);function n(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function i({projectRef:e,connectionString:r,indexStatements:n,onSuccess:o,onError:l}){if(!e){let e=Error("Project ref is required");return l&&l(e),Promise.reject(e)}if(0===n.length){let e=Error("No index statements provided");return l&&l(e),Promise.reject(e)}try{return await (0,a.executeSql)({projectRef:e,connectionString:r,sql:t.safeSql`${(0,t.joinSqlFragments)(n,";\n")};`}),s.toast.success("Successfully created index"),o&&o(),Promise.resolve()}catch(e){return s.toast.error(`Failed to create index: ${e.message}`),l&&l(e),Promise.reject(e)}}function o(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!r.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,i,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=o(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,o,"getIndexAdvisorExtensions",0,n,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return r.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var l=e.i(450972),c=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,c.useSelectedProjectQuery)(),{data:t}=(0,l.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=n(t??[]),r=!!s&&!!a,i=r&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:r,isIndexAdvisorEnabled:i}}],888525);var u=e.i(221628),d=e.i(416340),m=e.i(232520),p=e.i(837710),_=e.i(610144),h=e.i(967052);let f=({open:e,setOpen:t})=>{let a=(0,h.useTrack)(),{data:r}=(0,c.useSelectedProjectQuery)(),{data:i}=(0,l.useDatabaseExtensionsQuery)({projectRef:r?.ref,connectionString:r?.connectionString}),{hypopg:o,indexAdvisor:d}=n(i),{mutateAsync:p,isPending:f}=(0,_.useDatabaseExtensionEnableMutation)(),x=async()=>{if(void 0===r)return s.toast.error("Project is required");try{o?.installed_version===null&&await p({projectRef:r?.ref,connectionString:r?.connectionString,name:o.name,schema:o?.schema??"extensions",version:o.default_version}),d?.installed_version===null&&await p({projectRef:r?.ref,connectionString:r?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),s.toast.success("Successfully enabled Index Advisor!"),t(!1)}catch(e){s.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,u.jsx)(m.AlertDialog,{open:e,onOpenChange:()=>t(!e),children:(0,u.jsxs)(m.AlertDialogContent,{size:"medium",children:[(0,u.jsxs)(m.AlertDialogHeader,{children:[(0,u.jsx)(m.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,u.jsxs)(m.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,u.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,u.jsxs)("p",{children:["Enable this will install the ",(0,u.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,u.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,u.jsxs)(m.AlertDialogFooter,{children:[(0,u.jsx)(m.AlertDialogCancel,{children:"Cancel"}),(0,u.jsx)(m.AlertDialogAction,{onClick:e=>{e.preventDefault(),x(),a("index_advisor_enable_button_clicked",{origin:"dialog"})},disabled:f,children:f?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,h.useTrack)(),[t,s]=(0,d.useState)(!1);return(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)(p.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_enable_button_clicked",{origin:"banner"})},children:"Enable"}),(0,u.jsx)(f,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,f],284399)},820308,775159,e=>{"use strict";e.i(850036);var t,s,a=e.i(479084),r=e.i(55956),n=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>n],775159);var i=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,r.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,r.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,r.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,r.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,r.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,r.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,r.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,r.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,r.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,r.default)().toISOString(),availableIn:["team","enterprise"]}],l={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()};function c(e){return e.replace(/^WHERE/,"AND")}let u=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),i=!n&&r?e.value:`'${e.value}'`,o=!n&&String(i).toLowerCase(),l=n?e.value:o;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},d={[n.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
        -- reports-api-total-requests
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          count(t.id) as count
        FROM edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${u(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC`},topRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${u(e)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          count desc
        limit 10
        `},errorCounts:{queryType:"logs",sql:e=>`
        -- reports-api-error-counts
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          count(t.id) as count
        FROM edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        WHERE
          response.status_code >= 400
        ${u(e,!1)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
        `},topErrorRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-error-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        where
          response.status_code >= 400
        ${u(e,!1)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          count desc
        limit 10
        `},responseSpeed:{queryType:"logs",sql:e=>`
        -- reports-api-response-speed
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          avg(response.origin_time) as avg
        FROM
          edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${u(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
      `},topSlowRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-slow-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count,
          avg(response.origin_time) as avg
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        ${u(e)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          avg desc
        limit 10
        `},networkTraffic:{queryType:"logs",sql:e=>`
        -- reports-api-network-traffic
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          coalesce(
            safe_divide(
              sum(
                cast(coalesce(headers.content_length, "0") as int64)
              ),
              1000000
            ),
            0
          ) as ingress_mb,
          coalesce(
            safe_divide(
              sum(
                cast(coalesce(resp_headers.content_length, "0") as int64)
              ),
              1000000
            ),
            0
          ) as egress_mb,
        FROM
          edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          cross join unnest(response.headers) as resp_headers
          ${u(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
        `},requestsByCountry:{queryType:"logs",sql:e=>`
        -- reports-api-requests-by-country
        select
          cf.country as country,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          cross join unnest(request.cf) as cf
        where
          cf.country is not null
        ${u(e,!1)}
        group by
          cf.country
        `}}},[n.AUTH]:{title:"",queries:{}},[n.STORAGE]:{title:"Storage",queries:{cacheHitRate:{queryType:"logs",sql:e=>`
        -- reports-storage-cache-hit-rate
SELECT
  timestamp_trunc(timestamp, hour) as timestamp,
  countif( h.cf_cache_status in ('HIT', 'STALE', 'REVALIDATED', 'UPDATING') ) as hit_count,
  countif( h.cf_cache_status in ('MISS', 'NONE/UNKNOWN', 'EXPIRED', 'BYPASS', 'DYNAMIC') ) as miss_count
from edge_logs f
  cross join unnest(f.metadata) as m
  cross join unnest(m.request) as r
  cross join unnest(m.response) as res
  cross join unnest(res.headers) as h
where starts_with(r.path, '/storage/v1/object') and r.method = 'GET'
  ${u(e,!1)}
group by timestamp
order by timestamp desc
`},topCacheMisses:{queryType:"logs",sql:e=>`
        -- reports-storage-top-cache-misses
SELECT
  r.path as path,
  r.search as search,
  count(id) as count
from edge_logs f
  cross join unnest(f.metadata) as m
  cross join unnest(m.request) as r
  cross join unnest(m.response) as res
  cross join unnest(res.headers) as h
where starts_with(r.path, '/storage/v1/object')
  and r.method = 'GET'
  and h.cf_cache_status in ('MISS', 'NONE/UNKNOWN', 'EXPIRED', 'BYPASS', 'DYNAMIC')
  ${u(e,!1)}
group by path, search
order by count desc
limit 12
    `}}},[n.QUERY_PERFORMANCE]:{title:"Query performance",queries:{mostFrequentlyInvoked:{queryType:"db",safeSql:(e,t,s,r=!1,n=!1)=>a.safeSql`
        -- reports-query-performance-most-frequently-invoked
set search_path to public, extensions;

select
    auth.rolname,
    statements.query,
    statements.calls,
    -- -- Postgres 13, 14, 15
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.min_exec_time + statements.min_plan_time as min_time,
    statements.max_exec_time + statements.max_plan_time as max_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    -- -- Postgres <= 12
    -- total_time,
    -- min_time,
    -- max_time,
    -- mean_time,
    coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows,
    statements.rows as rows_read,
    case
      when (statements.shared_blks_hit + statements.shared_blks_read) > 0
      then round(
        (statements.shared_blks_hit * 100.0) /
        (statements.shared_blks_hit + statements.shared_blks_read),
        2
      )
      else 0
    end as cache_hit_rate${r?a.safeSql`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:a.safeSql``}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?c(t):a.safeSql``}
  ${s||a.safeSql`order by statements.calls desc`}
  limit 20`},mostTimeConsuming:{queryType:"db",safeSql:(e,t,s,r=!1,n=!1)=>a.safeSql`
        -- reports-query-performance-most-time-consuming
set search_path to public, extensions;

-- compute total time once up front so we don't need a window function over all rows
with grand_total as (
  select coalesce(nullif(sum(total_exec_time + total_plan_time), 0), 1) as v
  from pg_stat_statements where calls > 0
)
select
    auth.rolname,
    statements.query,
    statements.calls,
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    coalesce(
      ((statements.total_exec_time + statements.total_plan_time) /
        (select v from grand_total)) *
        100,
      0
    ) as prop_total_time${r?a.safeSql`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:a.safeSql``}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?c(t):a.safeSql``}
  ${s||a.safeSql`order by total_time desc`}
  limit 20`},slowestExecutionTime:{queryType:"db",safeSql:(e,t,s,r=!1,n=!1)=>a.safeSql`
        -- reports-query-performance-slowest-execution-time
set search_path to public, extensions;

select
    auth.rolname,
    statements.query,
    statements.calls,
    -- -- Postgres 13, 14, 15
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.min_exec_time + statements.min_plan_time as min_time,
    statements.max_exec_time + statements.max_plan_time as max_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    -- -- Postgres <= 12
    -- total_time,
    -- min_time,
    -- max_time,
    -- mean_time,
    coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows${r?a.safeSql`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:a.safeSql``}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?c(t):a.safeSql``}
  ${s||a.safeSql`order by max_time desc`}
  limit 20`},queryHitRate:{queryType:"db",safeSql:e=>a.safeSql`-- reports-query-performance-cache-and-index-hit-rate
select
    'index hit rate' as name,
    (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read),0) as ratio
  from pg_statio_user_indexes
  union all
  select
    'table hit rate' as name,
    sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read),0) as ratio
  from pg_statio_user_tables;`},unified:{queryType:"db",safeSql:(e,t,s,r=!1,n=!1,i=1,o=20)=>{let l=(i-1)*o,u=n&&r?l+10*o:l+o,d=r?Math.min(u,500):u;return a.safeSql`
        -- reports-query-performance-unified
        set search_path to public, extensions;

        -- compute total time once up front so we don't need a window function over all rows
        with grand_total as (
          select coalesce(nullif(sum(total_exec_time + total_plan_time), 0), 1) as v
          from pg_stat_statements where calls > 0
        ),
        base as (
          select
            auth.rolname,
            statements.query,
            statements.calls,
            statements.total_exec_time + statements.total_plan_time as total_time,
            statements.min_exec_time + statements.min_plan_time as min_time,
            statements.max_exec_time + statements.max_plan_time as max_time,
            statements.mean_exec_time + statements.mean_plan_time as mean_time,
            coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows,
            statements.rows as rows_read,
            statements.shared_blks_hit as debug_hit,
            statements.shared_blks_read as debug_read,
            case
              when (statements.shared_blks_hit + statements.shared_blks_read) > 0
              then (statements.shared_blks_hit::numeric * 100.0) /
                   (statements.shared_blks_hit + statements.shared_blks_read)
              else 0
            end as cache_hit_rate,
            coalesce(
              ((statements.total_exec_time + statements.total_plan_time) /
                (select v from grand_total)) *
                100,
              0
            ) as prop_total_time
          from pg_stat_statements as statements
            inner join pg_authid as auth on statements.userid = auth.oid
          -- skip queries that were never actually executed
          WHERE statements.calls > 0 ${t?c(t):a.safeSql``}
          ${s||a.safeSql`order by total_time desc`}
          ${null!==d?a.safeSql`limit ${(0,a.literal)(d)}`:a.safeSql``}
        ),
        query_results as (
          select
            base.*${r?a.safeSql`,
            case
              when (lower(base.query) like 'select%' or lower(base.query) like 'with pgrst%')
              then (
                select json_build_object(
                  'has_suggestion', array_length(index_statements, 1) > 0,
                  'startup_cost_before', startup_cost_before,
                  'startup_cost_after', startup_cost_after,
                  'total_cost_before', total_cost_before,
                  'total_cost_after', total_cost_after,
                  'index_statements', index_statements
                )
                from index_advisor(base.query)
              )
              else null
            end as index_advisor_result`:a.safeSql``}
          from base
        )
        select *
        from query_results
        ${n&&r?a.safeSql`where (index_advisor_result->>'has_suggestion')::boolean = true`:a.safeSql``}
        ${s||a.safeSql`order by total_time desc`}
        limit ${(0,a.literal)(o)} offset ${(0,a.literal)(l)}`}},slowQueriesCount:{queryType:"db",safeSql:()=>a.safeSql`
        -- reports-query-performance-slow-queries-count
        set search_path to public, extensions;

        -- Count of slow queries (> 1 second average)
        SELECT count(*) as slow_queries_count
        -- alias needed to reference columns in WHERE
        FROM pg_stat_statements as statements
        -- skip never-executed queries; mean_exec_time > 1000ms = avg over 1 second
        WHERE statements.calls > 0 AND statements.mean_exec_time > 1000;`},queryMetrics:{queryType:"db",safeSql:(e,t,s,r=!1,n=!1)=>a.safeSql`
        -- reports-query-performance-metrics
        set search_path to public, extensions;

        SELECT
          COALESCE(ROUND(AVG(statements.rows::numeric / NULLIF(statements.calls, 0)), 1), 0) as avg_rows_per_call,
          COUNT(*) FILTER (WHERE statements.total_exec_time + statements.total_plan_time > 1000) as slow_queries,
          COALESCE(
            ROUND(
              SUM(statements.shared_blks_hit) * 100.0 /
              NULLIF(SUM(statements.shared_blks_hit + statements.shared_blks_read), 0),
              2
            ), 0
          ) || '%' as cache_hit_rate
        FROM pg_stat_statements as statements
        -- skip queries that were never actually executed
        WHERE statements.calls > 0 ${t?c(t):a.safeSql``}
        ${s||a.safeSql``}`}}},[n.DATABASE]:{title:"database",queries:{largeObjects:{queryType:"db",safeSql:e=>a.safeSql`-- reports-database-large-objects
SELECT
        SCHEMA_NAME,
        relname,
        table_size
      FROM
        (SELECT
          pg_catalog.pg_namespace.nspname AS SCHEMA_NAME,
          relname,
          pg_total_relation_size(pg_catalog.pg_class.oid) AS table_size
        FROM pg_catalog.pg_class
        JOIN pg_catalog.pg_namespace ON relnamespace = pg_catalog.pg_namespace.oid
        ) t
      WHERE SCHEMA_NAME NOT LIKE 'pg_%'
      ORDER BY table_size DESC
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,l,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,d,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>i,"generateRegexpWhere",0,u],820308)},749199,e=>{"use strict";var t=e.i(125356),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),i=e.i(189329);e.s(["default",0,({sql:e,params:o=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:c})=>{let{data:u}=(0,n.useSelectedProjectQuery)(),d=(0,i.useDatabaseSelectorStateSnapshot)(),{data:m}=(0,a.useReadReplicasQuery)({projectRef:u?.ref}),p=(m||[]).find(e=>e.identifier===d.selectedDatabaseId)?.connectionString,_=d.selectedDatabaseId,h="function"==typeof e?e([]):e,{data:f,error:x,isPending:y,isRefetching:g,refetch:b}=(0,t.useQuery)({queryKey:["projects",u?.ref,"db",{...o,sql:h,identifier:_},l,c],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:u?.ref,connectionString:p||u?.connectionString,sql:h},e).then(e=>e.result),enabled:!!h,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:x||("object"==typeof f?f?.error:""),data:f,isLoading:y,isRefetching:g,params:o,runQuery:b,resolvedSql:h}}])},695781,e=>{"use strict";let t=(0,e.i(679709).default)("Pen",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]]);e.s(["Edit2",0,t],695781)},303213,e=>{"use strict";var t=e.i(221628),s=e.i(344580),a=e.i(896779),r=e.i(416340),n=e.i(67318),i=e.i(739114),o=e.i(837710),l=e.i(20482),c=e.i(348481),u=e.i(40892),d=e.i(660908),m=e.i(538482),p=e.i(531837),_=e.i(420985),h=e.i(635494),f=e.i(48189),x=e.i(432478);let y=p.object({name:p.string().min(1,"Required"),description:p.string().optional()});e.s(["CreateReportModal",0,({visible:e,onCancel:p,afterSubmit:g})=>{let b=(0,a.useRouter)(),{profile:S}=(0,x.useProfile)(),{data:j}=(0,h.useSelectedProjectQuery)(),q=j?.ref??"default",v=(0,r.useMemo)(()=>{let{its:e,ite:t,isHelper:s,helperText:a}=b.query,r=new URLSearchParams;e&&"string"==typeof e&&r.set("its",e),t&&"string"==typeof t&&r.set("ite",t),s&&"string"==typeof s&&r.set("isHelper",s),a&&"string"==typeof a&&r.set("helperText",a);let n=r.toString();return n?`?${n}`:""},[b.query]),{mutate:E,isPending:A}=(0,_.useContentUpsertMutation)({onSuccess:(e,t)=>{i.toast.success("Successfully created new report");let s=t.payload.id;b.push(`/project/${q}/observability/${s}${v}`),g()},onError:e=>{i.toast.error(`Failed to create report: ${e.message}`)}}),w=async({name:e,description:t})=>q?S?void E({projectRef:q,payload:{id:(0,f.uuidv4)(),type:"report",name:e,description:t||"",visibility:"project",owner_id:S?.id,content:{schema_version:1,period_start:{time_period:"7d",date:""},period_end:{time_period:"today",date:""},interval:"1d",layout:[]}}}):console.error("Profile is required"):console.error("Project ref is required"),R=()=>{p(),I.reset()},I=(0,n.useForm)({resolver:(0,s.zodResolver)(y),defaultValues:{name:"",description:""}}),{isDirty:T}=I.formState;return(0,t.jsx)(u.Modal,{visible:e,onCancel:R,hideFooter:!0,header:"Create a custom report",size:"small",children:(0,t.jsx)(l.Form,{...I,children:(0,t.jsxs)("form",{onSubmit:I.handleSubmit(w),noValidate:!0,children:[(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:I.control,name:"name",render:({field:e})=>(0,t.jsx)(m.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(c.Input,{...e,id:"name"})})})})}),(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:I.control,name:"description",render:({field:e})=>(0,t.jsx)(m.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(u.Modal.Separator,{}),(0,t.jsxs)(u.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(o.Button,{htmlType:"reset",type:"default",onClick:R,disabled:A,children:"Cancel"}),(0,t.jsx)(o.Button,{htmlType:"submit",loading:A,disabled:A||!T,children:"Create report"})]})]})})})}])},300679,258373,490058,e=>{"use strict";var t=e.i(10429);e.s(["generateObservabilityMenuItems",0,function(e){let{ref:s,preservedQueryParams:a,showOverview:r,isSupamonitorEnabled:n,storageSupported:i,isPlatform:o=t.IS_PLATFORM}=e,l=[...r?[{name:"Overview",key:"observability",url:`/project/${s}/observability${a}`}]:[],...n?[{name:"Query Insights",key:"query-insights",url:`/project/${s}/observability/query-insights${a}`}]:[{name:"Query Performance",key:"query-performance",url:`/project/${s}/observability/query-performance${a}`}],...o?[{name:"API Gateway",key:"api-overview",url:`/project/${s}/observability/api-overview${a}`}]:[]],c=[{name:"Database",key:"database",url:`/project/${s}/observability/database${a}`},{name:"Data API",key:"postgrest",url:`/project/${s}/observability/postgrest${a}`},{name:"Auth",key:"auth",url:`/project/${s}/observability/auth${a}`},{name:"Edge Functions",key:"edge-functions",url:`/project/${s}/observability/edge-functions${a}`},...i?[{name:"Storage",key:"storage",url:`/project/${s}/observability/storage${a}`}]:[],{name:"Realtime",key:"realtime",url:`/project/${s}/observability/realtime${a}`}],u=[{title:"GENERAL",key:"general-section",items:l}];return o&&u.push({title:"PRODUCT",key:"product-section",items:c}),u}],300679);var s=e.i(221628),a=e.i(26898),r=e.i(695781),n=e.i(944109),i=e.i(23370),o=e.i(561978),l=e.i(837710),c=e.i(874311),u=e.i(862326),d=e.i(2579),m=e.i(432478);e.s(["ObservabilityMenuItem",0,({item:e,pageKey:t,onSelectEdit:p,onSelectDelete:_})=>{let{profile:h}=(0,m.useProfile)(),{can:f}=(0,d.useAsyncCheckPermissions)(a.PermissionAction.UPDATE,"user_content",{resource:{type:"report",visibility:e.report.visibility,owner_id:e.report.owner_id},subject:{id:h?.id}}),x=(0,s.jsx)(u.Menu.Item,{active:e.key===t,children:(0,s.jsxs)("div",{className:"flex w-full items-center justify-between gap-1",children:[(0,s.jsx)("span",{className:"truncate",children:e.name}),f&&(0,s.jsxs)(c.DropdownMenu,{children:[(0,s.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,s.jsx)(l.Button,{type:"text",className:"px-1 opacity-50 hover:opacity-100",icon:(0,s.jsx)(n.MoreVertical,{size:12,strokeWidth:2}),onClick:e=>{e.preventDefault(),e.stopPropagation()}})}),(0,s.jsxs)(c.DropdownMenuContent,{align:"start",className:"w-32 *:gap-x-2",children:[(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&p()},children:[(0,s.jsx)(r.Edit2,{size:12}),(0,s.jsx)("div",{children:"Rename report"})]}),(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&_()},children:[(0,s.jsx)(i.Trash,{size:12}),(0,s.jsx)("div",{children:"Delete report"})]})]})]})]})});return(0,s.jsx)(o.default,{href:e.url,className:"block",children:x},e.key+"-menukey")}],258373);var p=e.i(479084),_=e.i(125356),h=e.i(246230),f=e.i(714403),x=e.i(635494),y=e.i(837508);async function g({projectRef:e,connectionString:t}){let{result:s}=await (0,f.executeSql)({projectRef:e,connectionString:t,sql:p.safeSql`SELECT current_setting('shared_preload_libraries', true) AS libraries`});return(s[0]?.libraries??"").split(",").some(e=>"supamonitor"===e.trim())}e.s(["useSupamonitorStatus",0,function(){let{data:e}=(0,x.useSelectedProjectQuery)(),{data:t,isLoading:s}=(({projectRef:e,connectionString:t},{enabled:s=!0,...a}={})=>{let{data:r}=(0,x.useSelectedProjectQuery)(),n=r?.status===y.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,_.useQuery)({queryKey:h.databaseKeys.supamonitorEnabled(e),queryFn:()=>g({projectRef:e,connectionString:t}),enabled:s&&void 0!==e&&n,...a})})({projectRef:e?.ref,connectionString:e?.connectionString});return{isSupamonitorEnabled:t??!1,isLoading:s}}],490058)},256337,e=>{"use strict";var t=e.i(221628),s=e.i(26898);e.i(128328);var a=e.i(657588),r=e.i(158639),n=e.i(231175),i=e.i(896779),o=e.i(197451),l=e.i(416340),c=e.i(739114),u=e.i(862326),d=e.i(498377),m=e.i(466472),p=e.i(108151),_=e.i(300679),h=e.i(258373),f=e.i(490058),x=e.i(303213),y=e.i(344580),g=e.i(67318),b=e.i(837710),S=e.i(20482),j=e.i(348481),q=e.i(40892),v=e.i(660908),E=e.i(538482),A=e.i(531837),w=e.i(420985);let R=A.object({name:A.string().min(1,"Required"),description:A.string().optional()}),I=({selectedReport:e,initialValues:s,onCancel:a})=>{let{ref:n}=(0,r.useParams)(),{mutate:i,isPending:o}=(0,w.useContentUpsertMutation)({onSuccess:()=>{c.toast.success("Successfully updated report"),a()},onError:e=>{c.toast.error(`Failed to update report: ${e.message}`)}}),u=()=>{a(),d.reset()},d=(0,g.useForm)({resolver:(0,y.zodResolver)(R),defaultValues:s}),{formState:m,reset:p}=d,{isDirty:_}=m;return(0,l.useEffect)(()=>{_||p(s)},[s,_,p]),(0,t.jsx)(q.Modal,{visible:void 0!==e,onCancel:u,hideFooter:!0,header:"Update custom report",size:"small",children:(0,t.jsx)(S.Form,{...d,children:(0,t.jsxs)("form",{onSubmit:d.handleSubmit(t=>n?e&&e.id?void(e.project_id&&i({projectRef:n,payload:{...e,owner_id:e.owner_id,project_id:e.project_id,id:e.id,name:t.name,description:t.description||""}})):void 0:console.error("Project ref is required")),noValidate:!0,children:[(0,t.jsx)(q.Modal.Content,{children:(0,t.jsx)(S.FormField,{control:d.control,name:"name",render:({field:e})=>(0,t.jsx)(E.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(S.FormControl,{children:(0,t.jsx)(j.Input,{...e,id:"name"})})})})}),(0,t.jsx)(q.Modal.Content,{children:(0,t.jsx)(S.FormField,{control:d.control,name:"description",render:({field:e})=>(0,t.jsx)(E.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(S.FormControl,{children:(0,t.jsx)(v.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(q.Modal.Separator,{}),(0,t.jsxs)(q.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(b.Button,{htmlType:"reset",type:"default",onClick:u,disabled:o,children:"Cancel"}),(0,t.jsx)(b.Button,{htmlType:"submit",loading:o,disabled:o||!_,children:"Save custom report"})]})]})})})};var T=e.i(215312),C=e.i(388147),k=e.i(586011),N=e.i(738927),O=e.i(2579),L=e.i(912793),P=e.i(10429),D=e.i(432478);e.s(["default",0,()=>{let e=(0,i.useRouter)(),{profile:y}=(0,D.useProfile)(),{ref:g,id:b}=(0,r.useParams)(),S=b||e.pathname.split("/")[4]||"observability",j=(0,a.useFlag)("observabilityOverview"),{isSupamonitorEnabled:q}=(0,f.useSupamonitorStatus)(),v=(0,L.useIsFeatureEnabled)("project_storage:all"),{can:E}=(0,O.useAsyncCheckPermissions)(s.PermissionAction.CREATE,"user_content",{resource:{type:"report",owner_id:y?.id},subject:{id:y?.id}}),A=(0,l.useMemo)(()=>{let{its:t,ite:s,isHelper:a,helperText:r}=e.query,n=new URLSearchParams;t&&"string"==typeof t&&n.set("its",t),s&&"string"==typeof s&&n.set("ite",s),a&&"string"==typeof a&&n.set("isHelper",a),r&&"string"==typeof r&&n.set("helperText",r);let i=n.toString();return i?`?${i}`:""},[e.query]),{data:w,isPending:R}=(0,N.useContentQuery)({projectRef:g,type:"report"}),{mutate:$,isPending:M}=(0,k.useContentDeleteMutation)({onSuccess:()=>{B(!1),c.toast.success("Successfully deleted report"),e.push(`/project/${g}/observability`)},onError:e=>{c.toast.error(`Failed to delete report: ${e.message}`)}}),[F,B]=(0,l.useState)(!1),[U,z]=(0,o.useQueryState)("newReport",o.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),[H,Q]=(0,l.useState)(),[Y,G]=(0,l.useState)();function K(e){return"report"===e.type}let W=function(){if(!w)return[];let e=w?.content.filter(K);return(e?.sort((e,t)=>e.name<t.name?-1:+(e.name>t.name))).map((e,t)=>({id:e.id,name:e.name,description:e.description||"",key:e.id||t+"-report",url:`/project/${g}/observability/${e.id}${A}`,hasDropdownActions:!0,report:e}))}(),V=(0,_.generateObservabilityMenuItems)({ref:g,preservedQueryParams:A,showOverview:j,isSupamonitorEnabled:q,storageSupported:v,isPlatform:P.IS_PLATFORM});return(0,t.jsx)("div",{children:R?(0,t.jsxs)("div",{className:"px-5 my-4 space-y-2",children:[(0,t.jsx)(p.ShimmeringLoader,{}),(0,t.jsx)(p.ShimmeringLoader,{className:"w-3/4"}),(0,t.jsx)(p.ShimmeringLoader,{className:"w-1/2"})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-6",children:[(0,t.jsx)(C.ProductMenu,{page:S,menu:V.map(e=>({...e,items:e.items.map(e=>({...e,items:[]}))}))}),P.IS_PLATFORM&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-px w-full bg-border-overlay"}),(0,t.jsxs)("div",{className:"mx-2",children:[(0,t.jsxs)(u.Menu,{type:"pills",children:[(0,t.jsx)(u.Menu.Group,{title:(0,t.jsxs)("span",{className:"flex w-full items-center justify-between relative h-6",children:[(0,t.jsx)("span",{className:"uppercase font-mono",children:"Custom Reports"}),W.length>0&&(0,t.jsx)(T.ButtonTooltip,{type:"default",size:"tiny",icon:(0,t.jsx)(n.Plus,{}),disabled:!E,className:"flex items-center justify-center h-6 w-6 absolute top-0 -right-1",onClick:()=>{z(!0)},tooltip:{content:{side:"bottom",text:E?void 0:"You need additional permissions to create custom reports"}}})]})}),W.length>0&&W.map(e=>(0,t.jsx)(h.ObservabilityMenuItem,{item:e,pageKey:S,onSelectEdit:()=>{G(e.report)},onSelectDelete:()=>{Q(e.report),B(!0)}},e.id))]}),0===W.length?(0,t.jsx)("div",{className:"px-2",children:(0,t.jsx)(d.InnerSideBarEmptyPanel,{title:"No custom reports yet",description:"Create and save custom reports to track your project metrics",actions:(0,t.jsx)(T.ButtonTooltip,{type:"default",icon:(0,t.jsx)(n.Plus,{}),disabled:!E,onClick:()=>{z(!0)},tooltip:{content:{side:"bottom",text:E?void 0:"You need additional permissions to create custom reports"}},children:"New custom report"})})}):null]})]}),(0,t.jsx)(I,{onCancel:()=>G(void 0),selectedReport:Y,initialValues:{name:Y?.name||"",description:Y?.description||""}}),(0,t.jsx)(m.default,{title:"Delete custom report",confirmLabel:"Delete report",confirmLabelLoading:"Deleting report",size:"medium",loading:M,visible:F,onCancel:()=>B(!1),onConfirm:()=>void 0===g?console.error("Project ref is required"):H?.id===void 0?console.error("Report ID is required"):void $({projectRef:g,ids:[H.id]}),children:(0,t.jsx)("div",{className:"text-sm text-foreground-light grid gap-4",children:(0,t.jsx)("div",{className:"grid gap-1",children:(0,t.jsxs)("p",{children:["Are you sure you want to delete '",H?.name,"'?"]})})})}),(0,t.jsx)(x.CreateReportModal,{visible:U,onCancel:()=>z(!1),afterSubmit:()=>z(!1)})]})})}],256337)},920807,e=>{"use strict";var t=e.i(221628),s=e.i(511524),a=e.i(774107);e.i(481541);var r=e.i(115037),n=e.i(807403),i=e.i(843819),o=e.i(671452),l=e.i(541635),c=e.i(928253),u=e.i(308837),d=e.i(608831),m=e.i(822219),p=e.i(416340),_=e.i(843778);e.s(["AnimatedLogos",0,({iconSize:e=36,className:h})=>{let[f,x]=(0,p.useState)(0),y=Math.round(2.67*e),g=Math.round(2.22*e),b=Math.round(5.33*e),S=Math.round(3.56*e),j=Math.round(2.22*e),q=Math.round(3.33*e),v=[{id:"webhook",name:"Custom Endpoint",icon:(0,t.jsx)(u.BracesIcon,{size:e})},{id:"otlp",name:"OTLP",icon:(0,t.jsx)(l.Otlp,{fill:"currentColor",size:e})},{id:"datadog",name:"Datadog",icon:(0,t.jsx)(n.Datadog,{fill:"currentColor",size:e})},{id:"loki",name:"Loki",icon:(0,t.jsx)(i.Grafana,{fill:"currentColor",size:e})},{id:"s3",name:"Amazon S3",icon:(0,t.jsx)(d.Cloud,{size:e})},{id:"sentry",name:"Sentry",icon:(0,t.jsx)(c.Sentry,{fill:"currentColor",size:e})},{id:"axiom",name:"Axiom",icon:(0,t.jsx)(r.Axiom,{fill:"currentColor",size:e})},{id:"last9",name:"Last9",icon:(0,t.jsx)(o.Last9,{fill:"currentColor",size:e})},{id:"syslog",name:"Syslog",icon:(0,t.jsx)(m.Server,{size:e})}];(0,p.useEffect)(()=>{let e=setInterval(()=>{x(e=>(e+1)%v.length)},2500);return()=>clearInterval(e)},[v.length]);let E=()=>(f-1+v.length)%v.length,A=()=>(f+1)%v.length,w={hidden:{x:`calc(-50% + ${q}px)`,y:"-50%",scale:.6,opacity:0,filter:"blur(1px)"},right:{x:`calc(-50% + ${j}px)`,y:"-50%",scale:.8,opacity:.5,zIndex:2,filter:"blur(1px)"},center:{x:"-50%",y:"-50%",scale:1,opacity:1,zIndex:3,filter:"blur(0px)"},left:{x:`calc(-50% - ${j}px)`,y:"-50%",scale:.8,opacity:.5,zIndex:2,filter:"blur(1px)"},exit:{x:`calc(-50% - ${q}px)`,y:"-50%",scale:.6,opacity:0,filter:"blur(1px)"}},R=[E(),f,A()];return(0,t.jsxs)("div",{className:(0,_.cn)("relative overflow-hidden",h??"mx-auto mb-8"),style:{width:b,height:S},children:[(0,t.jsx)(s.AnimatePresence,{initial:!1,children:v.map((e,s)=>{if(!R.includes(s))return null;let r=s===f?"center":s===E()?"left":s===A()?"right":"hidden",n=s===f?y:g;return(0,t.jsx)(a.motion.div,{className:"absolute top-1/2 left-1/2 flex items-center justify-center rounded-lg",style:{width:n,height:n},variants:w,initial:"hidden",animate:r,exit:"exit",transition:{duration:.5,ease:"easeInOut"},children:(0,t.jsx)("span",{children:e.icon})},e.id)})}),(0,t.jsx)("div",{className:"absolute -inset-4 bg-linear-to-r from-background-surface-75 via-transparent to-background-surface-75 z-40"})]})}])},212846,e=>{"use strict";var t=e.i(221628);e.i(128328);var s=e.i(86086),a=e.i(947748),r=e.i(158639),n=e.i(660445),i=e.i(416340),o=e.i(825713),l=e.i(256337),c=e.i(888525);e.i(69870);var u=e.i(260727),d=e.i(670447),m=e.i(470754),p=e.i(284399),_=e.i(124416),h=e.i(967052);let f=()=>{let e=(0,h.useTrack)(),{ref:s}=(0,r.useParams)(),{dismissBanner:n}=(0,m.useBannerStack)(),[,i]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(s??""),!1);return(0,t.jsx)(d.BannerCard,{onDismiss:()=>{i(!0),n("index-advisor-banner"),e("index_advisor_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("div",{className:"flex flex-col gap-y-2 items-start",children:(0,t.jsx)("div",{className:"p-2 rounded-lg bg-warning-300 text-warning",children:(0,t.jsx)(u.Lightbulb,{size:16})})}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Enable Index Advisor"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Recommends indexes to improve query performance."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(p.EnableIndexAdvisorButton,{})})]})})};var x=e.i(561978),y=e.i(587433),g=e.i(837710),b=e.i(920807),S=e.i(10429);let j=()=>{let{ref:e}=(0,r.useParams)(),s=(0,h.useTrack)(),{dismissBanner:n}=(0,m.useBannerStack)(),[,i]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(e??""),!1);return(0,t.jsx)(d.BannerCard,{onDismiss:()=>{i(!0),n("metrics-api-banner"),s("metrics_api_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-2 items-start",children:[(0,t.jsx)(y.Badge,{variant:"success",className:"-ml-0.5 uppercase inline-flex items-center mb-2",children:"Beta"}),(0,t.jsx)(b.AnimatedLogos,{iconSize:20,className:"h-[22px]!"})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Export Metrics to your dashboards"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Visualize over 200 database performance and health metrics with our Metrics API."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(g.Button,{type:"default",size:"tiny",asChild:!0,children:(0,t.jsx)(x.default,{href:`${S.DOCS_URL}/guides/telemetry/metrics`,target:"_blank",onClick:()=>s("metrics_api_banner_cta_button_clicked"),children:"Get started for free"})})})]})})};var q=e.i(902780),v=e.i(912793),E=e.i(951138);let A=({title:e,children:u})=>{let{ref:d}=(0,r.useParams)(),p=(0,n.usePathname)(),{addBanner:h,dismissBanner:x}=(0,m.useBannerStack)(),{isIndexAdvisorAvailable:y,isIndexAdvisorEnabled:g}=(0,c.useIndexAdvisorStatus)(),[b]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(d??""),!1),[S]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(d??""),!1);(0,i.useEffect)(()=>{!b&&s.IS_PLATFORM?h({id:"metrics-api-banner",isDismissed:!1,content:(0,t.jsx)(j,{}),priority:1}):x("metrics-api-banner")},[b,h,x]);let E=(0,i.useRef)(p);(0,i.useEffect)(()=>{let e=p?.includes("/query-performance");e&&y&&!g&&!S?h({id:"index-advisor-banner",isDismissed:!1,content:(0,t.jsx)(f,{}),priority:3}):(S||!e||g)&&x("index-advisor-banner"),E.current=p},[p,y,g,S,h,x]);let{reportsAll:A}=(0,v.useIsFeatureEnabled)(["reports:all"]);return A?(0,t.jsx)(o.ProjectLayout,{product:"Observability",browserTitle:{section:e},productMenu:(0,t.jsx)(l.default,{}),isBlocking:!1,children:u}):(0,t.jsx)(q.UnknownInterface,{urlBack:`/project/${d}`})},w=(0,E.withAuth)(e=>{let{ref:s}=(0,r.useParams)(),{reportsAll:a}=(0,v.useIsFeatureEnabled)(["reports:all"]);return a?(0,t.jsx)(A,{...e}):(0,t.jsx)(q.UnknownInterface,{urlBack:`/project/${s}`})});e.s(["default",0,w],212846)}]);

//# debugId=16d714d7-fa20-b0b2-6d48-c0e4fd398e39
//# sourceMappingURL=0b.l3bi-7e3mk.js.map