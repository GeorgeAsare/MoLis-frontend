;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="872ba2df-45d1-7d25-b267-2dd25075c32e")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,993394,e=>{"use strict";e.i(128328);var t,s=e.i(86086),r=e.i(55956),a=e.i(10429);let i=`${a.DOCS_URL}/guides/platform/logs#querying-with-the-logs-explorer`,n=[{label:"Recent Errors",mode:"simple",searchString:"[Ee]rror|\\s[45][0-9][0-9]\\s",for:["api"]},{label:"Commits",mode:"simple",searchString:"COMMIT",for:["database"]},{label:"Commits By User",description:"Count of commits made by users on the database",mode:"custom",searchString:`select
  p.user_name,
  count(*) as count
from postgres_logs
  left join unnest(metadata) as m on true
  left join unnest(m.parsed) as p on true
where
  regexp_contains(event_message, 'COMMIT')
group by
  p.user_name
  `,for:["database"]},{label:"Metadata IP",description:"List all IP addresses that used the Supabase API",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  h.x_real_ip
from edge_logs
  left join unnest(metadata) as m on true
  left join unnest(m.request) as r on true
  left join unnest(r.headers) as h on true
where h.x_real_ip is not null
`,for:["api"]},{label:"Requests by Geography",description:"List all ISO 3166-1 alpha-2 country codes that used the Supabase API",mode:"custom",searchString:`select
  cf.country,
  count(*) as count
from edge_logs
  left join unnest(metadata) as m on true
  left join unnest(m.request) as r on true
  left join unnest(r.cf) as cf on true
group by
  cf.country
order by
  count desc
`,for:["api"]},{label:"Slow Response Time",mode:"custom",description:"List all Supabase API requests that are slow",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.origin_time
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.origin_time > 1000
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"500 Request Codes",description:"List all Supabase API requests that responded witha 5XX status code",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.status_code
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.status_code >= 500
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"Top Paths",description:"List the most requested Supabase API paths",mode:"custom",searchString:`select
  r.path as path,
  r.search as params,
  count(timestamp) as c
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as r
group by
  path,
  params
order by
  c desc
limit 100
`,for:["api"]},{label:"REST Requests",description:"List all PostgREST requests",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as r
where
  path like '%rest/v1%'
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"Errors",description:"List all Postgres error messages with ERROR, FATAL, or PANIC severity",mode:"custom",searchString:`select
  cast(t.timestamp as datetime) as timestamp,
  p.error_severity,
  event_message
from postgres_logs as t
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as p
where
  p.error_severity in ('ERROR', 'FATAL', 'PANIC')
order by
  timestamp desc
limit 100
`,for:["database"]},{label:"Error Count by User",description:"Count of errors by users",mode:"custom",searchString:`select
  count(t.timestamp) as count,
  p.user_name,
  p.error_severity
from postgres_logs as t
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as p
where
  p.error_severity in ('ERROR', 'FATAL', 'PANIC')
group by
  p.user_name,
  p.error_severity
order by
  count desc
limit 100
`,for:["database"]},{label:"Auth Endpoint Events",description:"Endpoint events filtered by path",mode:"custom",searchString:`select
  t.timestamp,
  event_message
from auth_logs as t
where
  regexp_contains(event_message,"level.{3}(info|warning||error|fatal)")
  -- and regexp_contains(event_message,"path.{3}(/token|/recover|/signup|/otp)")
limit 100
`,for:["database"]},{label:"Auth Audit Logs",description:"Audit logs for auth events",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message, metadata 
from auth_audit_logs 
limit 10
`,for:["database"]},{label:"Storage Object Requests",description:"Number of requests done on Storage Objects",mode:"custom",searchString:`select
  r.method as http_verb,
  r.path as filepath,
  count(*) as num_requests
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) AS r
  cross join unnest(r.headers) AS h
where
  path like '%storage/v1/object/%'
group by
  r.path, r.method
order by
  num_requests desc
limit 100
`,for:["api"]},{label:"Storage Egress Requests",description:"Check the number of requests done on Storage Affecting Egress",mode:"custom",searchString:`select
  request.method as http_verb,
  request.path as filepath,
  (responseHeaders.cf_cache_status = 'HIT') as cached,
  count(*) as num_requests
from
  edge_logs
  cross join unnest(metadata) as metadata
  cross join unnest(metadata.request) as request
  cross join unnest(metadata.response) as response
  cross join unnest(response.headers) as responseHeaders
where
  (path like '%storage/v1/object/%' or path like '%storage/v1/render/%')
  and request.method = 'GET'
group by 1, 2, 3
order by num_requests desc
limit 100;
`,for:["api"]},{label:"Storage Top Cache Misses",description:"The top Storage requests that miss caching",mode:"custom",searchString:`select
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
group by path, search
order by count desc
limit 100;
`,for:["api"]}],o={search_query:e=>`regexp_contains(event_message, '${e}')`},l={postgres_logs:{...o,database:e=>`identifier = '${e}'`,"severity.error":"parsed.error_severity in ('ERROR', 'FATAL', 'PANIC')","severity.noError":"parsed.error_severity not in ('ERROR', 'FATAL', 'PANIC')","severity.log":"parsed.error_severity = 'LOG'"},edge_logs:{...o,database:e=>`identifier = '${e}'`,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499","product.database":"request.path like '/rest/%' or request.path like '/graphql/%'","product.storage":"request.path like '/storage/%'","product.auth":"request.path like '/auth/%'","product.realtime":"request.path like '/realtime/%'","method.get":"request.method = 'GET'","method.post":"request.method = 'POST'","method.put":"request.method = 'PUT'","method.patch":"request.method = 'PATCH'","method.delete":"request.method = 'DELETE'","method.options":"request.method = 'OPTIONS'"},function_edge_logs:{...o,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499"},function_logs:{...o,"severity.error":"metadata.level = 'error'","severity.notError":"metadata.level != 'error'","severity.log":"metadata.level = 'log'","severity.info":"metadata.level = 'info'","severity.debug":"metadata.level = 'debug'","severity.warn":"metadata.level = 'warn'"},auth_logs:{...o,"severity.error":"metadata.level = 'error' or metadata.level = 'fatal'","severity.warning":"metadata.level = 'warning'","severity.info":"metadata.level = 'info'","status_code.server_error":"cast(metadata.status as int64) between 500 and 599","status_code.client_error":"cast(metadata.status as int64) between 400 and 499","status_code.redirection":"cast(metadata.status as int64) between 300 and 399","status_code.success":"cast(metadata.status as int64) between 200 and 299","endpoints.admin":'REGEXP_CONTAINS(metadata.path, "/admin")',"endpoints.signup":'REGEXP_CONTAINS(metadata.path, "/signup|/invite|/verify")',"endpoints.authentication":'REGEXP_CONTAINS(metadata.path, "/token|/authorize|/callback|/otp|/magiclink")',"endpoints.recover":'REGEXP_CONTAINS(metadata.path, "/recover")',"endpoints.user":'REGEXP_CONTAINS(metadata.path, "/user")',"endpoints.logout":'REGEXP_CONTAINS(metadata.path, "/logout")'},realtime_logs:{...o},storage_logs:{...o},postgrest_logs:{...o,database:e=>`identifier = '${e}'`},pgbouncer_logs:{...o},supavisor_logs:{...o,database:e=>`m.project like '${e}%'`},pg_upgrade_logs:{...o},pg_cron_logs:{...o},etl_replication_logs:{...o,pipeline_id:e=>`pipeline_id = ${e}`}};var u=((t={}).EDGE="edge_logs",t.POSTGRES="postgres_logs",t.FUNCTIONS="function_logs",t.FN_EDGE="function_edge_logs",t.AUTH="auth_logs",t.AUTH_AUDIT="auth_audit_logs",t.REALTIME="realtime_logs",t.STORAGE="storage_logs",t.POSTGREST="postgrest_logs",t.SUPAVISOR="supavisor_logs",t.PGBOUNCER="pgbouncer_logs",t.PG_UPGRADE="pg_upgrade_logs",t.PG_CRON="pg_cron_logs",t.ETL="etl_replication_logs",t);let d={postgres_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events with ERROR, PANIC, or FATAL"},{key:"noError",label:"No Error",description:"Show all non-error events"},{key:"log",label:"Log",description:"Show all events that are log severity"}]}},edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]},product:{label:"Product",key:"product",options:[{key:"database",label:"Database",description:""},{key:"auth",label:"Auth",description:""},{key:"storage",label:"Storage",description:""},{key:"realtime",label:"Realtime",description:""}]},method:{label:"Method",key:"method",options:[{key:"get",label:"GET",description:""},{key:"options",label:"OPTIONS",description:""},{key:"put",label:"PUT",description:""},{key:"post",label:"POST",description:""},{key:"patch",label:"PATCH",description:""},{key:"delete",label:"DELETE",description:""}]}},...s.IS_PLATFORM?{function_edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]}}}:{},function_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:'Show all events that are "error" severity'},{key:"warn",label:"Warning",description:'Show all events that are "warn" severity'},{key:"info",label:"Info",description:'Show all events that are "info" severity'},{key:"debug",label:"Debug",description:'Show all events that are "debug" severity'},{key:"log",label:"Log",description:'Show all events that are "log" severity'}]}},auth_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events that have error or fatal severity"},{key:"warning",label:"Warning",description:"Show all events that have warning severity"},{key:"info",label:"Info",description:"Show all events that have info severity"}]},status_code:{label:"Status Code",key:"status_code",options:[{key:"server_error",label:"Server Error",description:"Show all requests with 5XX status code"},{key:"client_error",label:"Client Error",description:"Show all requests with 4XX status code"},{key:"redirection",label:"Redirection",description:"Show all requests that have 3XX status code"},{key:"success",label:"Success",description:"Show all requests that have 2XX status code"}]},endpoints:{label:"Endpoints",key:"endpoints",options:[{key:"admin",label:"Admin",description:"Show all admin requests"},{key:"signup",label:"Sign up",description:"Show all signup and authorization requests"},{key:"recover",label:"Password Recovery",description:"Show all password recovery requests"},{key:"authentication",label:"Authentication",description:"Show all authentication flow requests (login, otp, and Oauth2)"},{key:"user",label:"User",description:"Show all user data requests"},{key:"logout",label:"Logout",description:"Show all logout requests"}]}}},c=[{text:"Last 15 minutes",calcFrom:()=>(0,r.default)().subtract(15,"minute").toISOString(),calcTo:()=>""},{text:"Last 30 minutes",calcFrom:()=>(0,r.default)().subtract(30,"minute").toISOString(),calcTo:()=>""},{text:"Last hour",calcFrom:()=>(0,r.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,r.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,r.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 2 days",calcFrom:()=>(0,r.default)().subtract(2,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,r.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 5 days",calcFrom:()=>(0,r.default)().subtract(5,"day").toISOString(),calcTo:()=>""}],h=[{text:"Last hour",calcFrom:()=>(0,r.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,r.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,r.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,r.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 7 days",calcFrom:()=>(0,r.default)().subtract(7,"day").toISOString(),calcTo:()=>""}];e.s(["EXPLORER_DATEPICKER_HELPERS",0,h,"FILTER_OPTIONS",0,d,"LOGS_EXPLORER_DOCS_URL",0,i,"LOGS_LARGE_DATE_RANGE_DAYS_THRESHOLD",0,2,"LOGS_SOURCE_DESCRIPTION",0,{edge_logs:"Logs obtained from the network edge, containing all API requests",postgres_logs:"Database logs obtained directly from Postgres",function_logs:"Function logs generated from runtime execution",function_edge_logs:"Function call logs, containing the request and response",auth_logs:"Errors, warnings, and performance details from the auth service",auth_audit_logs:"Audit records of user signups, logins, and account changes",realtime_logs:"Realtime server for Postgres logical replication broadcasting",storage_logs:"Object storage logs",postgrest_logs:"RESTful API web server logs",supavisor_logs:"Shared connection pooler logs for PostgreSQL",pgbouncer_logs:"Dedicated connection pooler for PostgreSQL",pg_upgrade_logs:"Logs generated by the Postgres version upgrade process",pg_cron_logs:"Postgres logs from pg_cron cron jobs",etl_replication_logs:"Logs from the replication process"},"LOGS_TABLES",0,{api:"edge_logs",database:"postgres_logs",functions:"function_logs",fn_edge:"function_edge_logs",auth:"auth_logs",realtime:"realtime_logs",storage:"storage_logs",postgrest:"postgrest_logs",supavisor:"supavisor_logs",pg_upgrade:"pg_upgrade_logs",pg_cron:"postgres_logs",pgbouncer:"pgbouncer_logs",etl:"etl_replication_logs"},"LOG_ROUTES_WITH_REPLICA_SUPPORT",0,["/project/[ref]/logs/edge-logs","/project/[ref]/logs/pooler-logs","/project/[ref]/logs/postgres-logs","/project/[ref]/logs/postgrest-logs"],"LogsTableName",()=>u,"PREVIEWER_DATEPICKER_HELPERS",0,c,"SQL_FILTER_TEMPLATES",0,l,"TEMPLATES",0,n,"TIER_QUERY_LIMITS",0,{FREE:{text:"1 day",value:1,unit:"day",promptUpgrade:!0},PRO:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},PAYG:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},TEAM:{text:"28 days",value:28,unit:"day",promptUpgrade:!0},ENTERPRISE:{text:"90 days",value:90,unit:"day",promptUpgrade:!1},PLATFORM:{text:"1 day",value:1,unit:"day",promptUpgrade:!1}},"getDefaultHelper",0,e=>e.find(e=>e.default)||e[0]])},586468,(e,t,s)=>{var r;let a;e.e,r=function e(){"use strict";var t="u">typeof self?self:"u">typeof window?window:void 0!==t?t:{},s=!t.document&&!!t.postMessage,r=t.IS_PAPA_WORKER||!1,a={},i=0,n={parse:function(s,r){var o,l=(r=r||{}).dynamicTyping||!1;if(S(l)&&(r.dynamicTypingFunction=l,l={}),r.dynamicTyping=l,r.transform=!!S(r.transform)&&r.transform,r.worker&&n.WORKERS_SUPPORTED){var p=function(){if(!n.WORKERS_SUPPORTED)return!1;var s,r,o=(s=t.URL||t.webkitURL||null,r=e.toString(),n.BLOB_URL||(n.BLOB_URL=s.createObjectURL(new Blob(["var global = (function() { if (typeof self !== 'undefined') { return self; } if (typeof window !== 'undefined') { return window; } if (typeof global !== 'undefined') { return global; } return {}; })(); global.IS_PAPA_WORKER=true; ","(",r,")();"],{type:"text/javascript"})))),l=new t.Worker(o);return l.onmessage=m,l.id=i++,a[l.id]=l}();return p.userStep=r.step,p.userChunk=r.chunk,p.userComplete=r.complete,p.userError=r.error,r.step=S(r.step),r.chunk=S(r.chunk),r.complete=S(r.complete),r.error=S(r.error),delete r.worker,void p.postMessage({input:s,config:r,workerId:p.id})}var g=null;return n.NODE_STREAM_INPUT,"string"==typeof s?(s=65279===(o=s).charCodeAt(0)?o.slice(1):o,g=r.download?new u(r):new c(r)):!0===s.readable&&S(s.read)&&S(s.on)?g=new h(r):(t.File&&s instanceof File||s instanceof Object)&&(g=new d(r)),g.stream(s)},unparse:function(e,t){var s=!1,r=!0,a=",",i="\r\n",o='"',l=o+o,u=!1,d=null,c=!1;if("object"==typeof t){if("string"!=typeof t.delimiter||n.BAD_DELIMITERS.filter(function(e){return -1!==t.delimiter.indexOf(e)}).length||(a=t.delimiter),("boolean"==typeof t.quotes||"function"==typeof t.quotes||Array.isArray(t.quotes))&&(s=t.quotes),"boolean"!=typeof t.skipEmptyLines&&"string"!=typeof t.skipEmptyLines||(u=t.skipEmptyLines),"string"==typeof t.newline&&(i=t.newline),"string"==typeof t.quoteChar&&(o=t.quoteChar),"boolean"==typeof t.header&&(r=t.header),Array.isArray(t.columns)){if(0===t.columns.length)throw Error("Option columns is empty");d=t.columns}void 0!==t.escapeChar&&(l=t.escapeChar+o),("boolean"==typeof t.escapeFormulae||t.escapeFormulae instanceof RegExp)&&(c=t.escapeFormulae instanceof RegExp?t.escapeFormulae:/^[=+\-@\t\r].*$/)}var h=RegExp(g(o),"g");if("string"==typeof e&&(e=JSON.parse(e)),Array.isArray(e)){if(!e.length||Array.isArray(e[0]))return p(null,e,u);if("object"==typeof e[0])return p(d||Object.keys(e[0]),e,u)}else if("object"==typeof e)return"string"==typeof e.data&&(e.data=JSON.parse(e.data)),Array.isArray(e.data)&&(e.fields||(e.fields=e.meta&&e.meta.fields||d),e.fields||(e.fields=Array.isArray(e.data[0])?e.fields:"object"==typeof e.data[0]?Object.keys(e.data[0]):[]),Array.isArray(e.data[0])||"object"==typeof e.data[0]||(e.data=[e.data])),p(e.fields||[],e.data||[],u);throw Error("Unable to serialize unrecognized input");function p(e,t,s){var n="";"string"==typeof e&&(e=JSON.parse(e)),"string"==typeof t&&(t=JSON.parse(t));var o=Array.isArray(e)&&0<e.length,l=!Array.isArray(t[0]);if(o&&r){for(var u=0;u<e.length;u++)0<u&&(n+=a),n+=f(e[u],u);0<t.length&&(n+=i)}for(var d=0;d<t.length;d++){var c=o?e.length:t[d].length,h=!1,p=o?0===Object.keys(t[d]).length:0===t[d].length;if(s&&!o&&(h="greedy"===s?""===t[d].join("").trim():1===t[d].length&&0===t[d][0].length),"greedy"===s&&o){for(var g=[],m=0;m<c;m++){var _=l?e[m]:m;g.push(t[d][_])}h=""===g.join("").trim()}if(!h){for(var y=0;y<c;y++){0<y&&!p&&(n+=a);var b=o&&l?e[y]:y;n+=f(t[d][b],y)}d<t.length-1&&(!s||0<c&&!p)&&(n+=i)}}return n}function f(e,t){if(null==e)return"";if(e.constructor===Date)return JSON.stringify(e).slice(1,25);var r=!1;c&&"string"==typeof e&&c.test(e)&&(e="'"+e,r=!0);var i=e.toString().replace(h,l);return(r=r||!0===s||"function"==typeof s&&s(e,t)||Array.isArray(s)&&s[t]||function(e,t){for(var s=0;s<t.length;s++)if(-1<e.indexOf(t[s]))return!0;return!1}(i,n.BAD_DELIMITERS)||-1<i.indexOf(a)||" "===i.charAt(0)||" "===i.charAt(i.length-1))?o+i+o:i}}};if(n.RECORD_SEP="\x1e",n.UNIT_SEP="\x1f",n.BYTE_ORDER_MARK="\uFEFF",n.BAD_DELIMITERS=["\r","\n",'"',n.BYTE_ORDER_MARK],n.WORKERS_SUPPORTED=!s&&!!t.Worker,n.NODE_STREAM_INPUT=1,n.LocalChunkSize=0xa00000,n.RemoteChunkSize=5242880,n.DefaultDelimiter=",",n.Parser=f,n.ParserHandle=p,n.NetworkStreamer=u,n.FileStreamer=d,n.StringStreamer=c,n.ReadableStreamStreamer=h,t.jQuery){var o=t.jQuery;o.fn.parse=function(e){var s=e.config||{},r=[];return this.each(function(e){if(!("INPUT"===o(this).prop("tagName").toUpperCase()&&"file"===o(this).attr("type").toLowerCase()&&t.FileReader)||!this.files||0===this.files.length)return!0;for(var a=0;a<this.files.length;a++)r.push({file:this.files[a],inputElem:this,instanceConfig:o.extend({},s)})}),a(),this;function a(){if(0!==r.length){var t,s,a,l=r[0];if(S(e.before)){var u=e.before(l.file,l.inputElem);if("object"==typeof u){if("abort"===u.action)return t=l.file,s=l.inputElem,a=u.reason,void(S(e.error)&&e.error({name:"AbortError"},t,s,a));if("skip"===u.action)return void i();"object"==typeof u.config&&(l.instanceConfig=o.extend(l.instanceConfig,u.config))}else if("skip"===u)return void i()}var d=l.instanceConfig.complete;l.instanceConfig.complete=function(e){S(d)&&d(e,l.file,l.inputElem),i()},n.parse(l.file,l.instanceConfig)}else S(e.complete)&&e.complete()}function i(){r.splice(0,1),a()}}}function l(e){this._handle=null,this._finished=!1,this._completed=!1,this._halted=!1,this._input=null,this._baseIndex=0,this._partialLine="",this._rowCount=0,this._start=0,this._nextChunk=null,this.isFirstChunk=!0,this._completeResults={data:[],errors:[],meta:{}},(function(e){var t=b(e);t.chunkSize=parseInt(t.chunkSize),e.step||e.chunk||(t.chunkSize=null),this._handle=new p(t),(this._handle.streamer=this)._config=t}).call(this,e),this.parseChunk=function(e,s){if(this.isFirstChunk&&S(this._config.beforeFirstChunk)){var a=this._config.beforeFirstChunk(e);void 0!==a&&(e=a)}this.isFirstChunk=!1,this._halted=!1;var i=this._partialLine+e;this._partialLine="";var o=this._handle.parse(i,this._baseIndex,!this._finished);if(!this._handle.paused()&&!this._handle.aborted()){var l=o.meta.cursor;this._finished||(this._partialLine=i.substring(l-this._baseIndex),this._baseIndex=l),o&&o.data&&(this._rowCount+=o.data.length);var u=this._finished||this._config.preview&&this._rowCount>=this._config.preview;if(r)t.postMessage({results:o,workerId:n.WORKER_ID,finished:u});else if(S(this._config.chunk)&&!s){if(this._config.chunk(o,this._handle),this._handle.paused()||this._handle.aborted())return void(this._halted=!0);o=void 0,this._completeResults=void 0}return this._config.step||this._config.chunk||(this._completeResults.data=this._completeResults.data.concat(o.data),this._completeResults.errors=this._completeResults.errors.concat(o.errors),this._completeResults.meta=o.meta),this._completed||!u||!S(this._config.complete)||o&&o.meta.aborted||(this._config.complete(this._completeResults,this._input),this._completed=!0),u||o&&o.meta.paused||this._nextChunk(),o}this._halted=!0},this._sendError=function(e){S(this._config.error)?this._config.error(e):r&&this._config.error&&t.postMessage({workerId:n.WORKER_ID,error:e,finished:!1})}}function u(e){var t;(e=e||{}).chunkSize||(e.chunkSize=n.RemoteChunkSize),l.call(this,e),this._nextChunk=s?function(){this._readChunk(),this._chunkLoaded()}:function(){this._readChunk()},this.stream=function(e){this._input=e,this._nextChunk()},this._readChunk=function(){if(this._finished)this._chunkLoaded();else{if(t=new XMLHttpRequest,this._config.withCredentials&&(t.withCredentials=this._config.withCredentials),s||(t.onload=v(this._chunkLoaded,this),t.onerror=v(this._chunkError,this)),t.open(this._config.downloadRequestBody?"POST":"GET",this._input,!s),this._config.downloadRequestHeaders){var e=this._config.downloadRequestHeaders;for(var r in e)t.setRequestHeader(r,e[r])}if(this._config.chunkSize){var a=this._start+this._config.chunkSize-1;t.setRequestHeader("Range","bytes="+this._start+"-"+a)}try{t.send(this._config.downloadRequestBody)}catch(e){this._chunkError(e.message)}s&&0===t.status&&this._chunkError()}},this._chunkLoaded=function(){var e;4===t.readyState&&(t.status<200||400<=t.status?this._chunkError():(this._start+=this._config.chunkSize?this._config.chunkSize:t.responseText.length,this._finished=!this._config.chunkSize||this._start>=(null===(e=t.getResponseHeader("Content-Range"))?-1:parseInt(e.substring(e.lastIndexOf("/")+1))),this.parseChunk(t.responseText)))},this._chunkError=function(e){var s=t.statusText||e;this._sendError(Error(s))}}function d(e){(e=e||{}).chunkSize||(e.chunkSize=n.LocalChunkSize),l.call(this,e);var t,s,r="u">typeof FileReader;this.stream=function(e){this._input=e,s=e.slice||e.webkitSlice||e.mozSlice,r?((t=new FileReader).onload=v(this._chunkLoaded,this),t.onerror=v(this._chunkError,this)):t=new FileReaderSync,this._nextChunk()},this._nextChunk=function(){this._finished||this._config.preview&&!(this._rowCount<this._config.preview)||this._readChunk()},this._readChunk=function(){var e=this._input;if(this._config.chunkSize){var a=Math.min(this._start+this._config.chunkSize,this._input.size);e=s.call(e,this._start,a)}var i=t.readAsText(e,this._config.encoding);r||this._chunkLoaded({target:{result:i}})},this._chunkLoaded=function(e){this._start+=this._config.chunkSize,this._finished=!this._config.chunkSize||this._start>=this._input.size,this.parseChunk(e.target.result)},this._chunkError=function(){this._sendError(t.error)}}function c(e){var t;l.call(this,e=e||{}),this.stream=function(e){return t=e,this._nextChunk()},this._nextChunk=function(){if(!this._finished){var e,s=this._config.chunkSize;return s?(e=t.substring(0,s),t=t.substring(s)):(e=t,t=""),this._finished=!t,this.parseChunk(e)}}}function h(e){l.call(this,e=e||{});var t=[],s=!0,r=!1;this.pause=function(){l.prototype.pause.apply(this,arguments),this._input.pause()},this.resume=function(){l.prototype.resume.apply(this,arguments),this._input.resume()},this.stream=function(e){this._input=e,this._input.on("data",this._streamData),this._input.on("end",this._streamEnd),this._input.on("error",this._streamError)},this._checkIsFinished=function(){r&&1===t.length&&(this._finished=!0)},this._nextChunk=function(){this._checkIsFinished(),t.length?this.parseChunk(t.shift()):s=!0},this._streamData=v(function(e){try{t.push("string"==typeof e?e:e.toString(this._config.encoding)),s&&(s=!1,this._checkIsFinished(),this.parseChunk(t.shift()))}catch(e){this._streamError(e)}},this),this._streamError=v(function(e){this._streamCleanUp(),this._sendError(e)},this),this._streamEnd=v(function(){this._streamCleanUp(),r=!0,this._streamData("")},this),this._streamCleanUp=v(function(){this._input.removeListener("data",this._streamData),this._input.removeListener("end",this._streamEnd),this._input.removeListener("error",this._streamError)},this)}function p(e){var t,s,r,a=/^\s*-?(\d+\.?|\.\d+|\d+\.\d+)([eE][-+]?\d+)?\s*$/,i=/^((\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z)))$/,o=this,l=0,u=0,d=!1,c=!1,h=[],p={data:[],errors:[],meta:{}};if(S(e.step)){var m=e.step;e.step=function(t){if(p=t,v())y();else{if(y(),0===p.data.length)return;l+=t.data.length,e.preview&&l>e.preview?s.abort():(p.data=p.data[0],m(p,o))}}}function _(t){return"greedy"===e.skipEmptyLines?""===t.join("").trim():1===t.length&&0===t[0].length}function y(){return p&&r&&(E("Delimiter","UndetectableDelimiter","Unable to auto-detect delimiting character; defaulted to '"+n.DefaultDelimiter+"'"),r=!1),e.skipEmptyLines&&(p.data=p.data.filter(function(e){return!_(e)})),v()&&function(){if(p)if(Array.isArray(p.data[0])){for(var t=0;v()&&t<p.data.length;t++)p.data[t].forEach(s);p.data.splice(0,1)}else p.data.forEach(s);function s(t,s){S(e.transformHeader)&&(t=e.transformHeader(t,s)),h.push(t)}}(),function(){if(!p||!e.header&&!e.dynamicTyping&&!e.transform)return p;function t(t,s){var r,n=e.header?{}:[];for(r=0;r<t.length;r++){var o,l,d=r,c=t[r];e.header&&(d=r>=h.length?"__parsed_extra":h[r]),e.transform&&(c=e.transform(c,d)),o=d,l=c,e.dynamicTypingFunction&&void 0===e.dynamicTyping[o]&&(e.dynamicTyping[o]=e.dynamicTypingFunction(o)),c=!0===(e.dynamicTyping[o]||e.dynamicTyping)?"true"===l||"TRUE"===l||"false"!==l&&"FALSE"!==l&&(!function(e){if(a.test(e)){var t=parseFloat(e);if(-0x20000000000000<t&&t<0x20000000000000)return!0}return!1}(l)?i.test(l)?new Date(l):""===l?null:l:parseFloat(l)):l,"__parsed_extra"===d?(n[d]=n[d]||[],n[d].push(c)):n[d]=c}return e.header&&(r>h.length?E("FieldMismatch","TooManyFields","Too many fields: expected "+h.length+" fields but parsed "+r,u+s):r<h.length&&E("FieldMismatch","TooFewFields","Too few fields: expected "+h.length+" fields but parsed "+r,u+s)),n}var s=1;return!p.data.length||Array.isArray(p.data[0])?(p.data=p.data.map(t),s=p.data.length):p.data=t(p.data,0),e.header&&p.meta&&(p.meta.fields=h),u+=s,p}()}function v(){return e.header&&0===h.length}function E(e,t,s,r){var a={type:e,code:t,message:s};void 0!==r&&(a.row=r),p.errors.push(a)}this.parse=function(a,i,o){var l=e.quoteChar||'"';if(e.newline||(e.newline=function(e,t){e=e.substring(0,1048576);var s=RegExp(g(t)+"([^]*?)"+g(t),"gm"),r=(e=e.replace(s,"")).split("\r"),a=e.split("\n"),i=1<a.length&&a[0].length<r[0].length;if(1===r.length||i)return"\n";for(var n=0,o=0;o<r.length;o++)"\n"===r[o][0]&&n++;return n>=r.length/2?"\r\n":"\r"}(a,l)),r=!1,e.delimiter)S(e.delimiter)&&(e.delimiter=e.delimiter(a),p.meta.delimiter=e.delimiter);else{var u=function(t,s,r,a,i){var o,l,u,d;i=i||[",","	","|",";",n.RECORD_SEP,n.UNIT_SEP];for(var c=0;c<i.length;c++){var h=i[c],p=0,g=0,m=0;u=void 0;for(var y=new f({comments:a,delimiter:h,newline:s,preview:10}).parse(t),b=0;b<y.data.length;b++)if(r&&_(y.data[b]))m++;else{var v=y.data[b].length;g+=v,void 0!==u?0<v&&(p+=Math.abs(v-u),u=v):u=v}0<y.data.length&&(g/=y.data.length-m),(void 0===l||p<=l)&&(void 0===d||d<g)&&1.99<g&&(l=p,o=h,d=g)}return{successful:!!(e.delimiter=o),bestDelimiter:o}}(a,e.newline,e.skipEmptyLines,e.comments,e.delimitersToGuess);u.successful?e.delimiter=u.bestDelimiter:(r=!0,e.delimiter=n.DefaultDelimiter),p.meta.delimiter=e.delimiter}var c=b(e);return e.preview&&e.header&&c.preview++,t=a,p=(s=new f(c)).parse(t,i,o),y(),d?{meta:{paused:!0}}:p||{meta:{paused:!1}}},this.paused=function(){return d},this.pause=function(){d=!0,s.abort(),t=S(e.chunk)?"":t.substring(s.getCharIndex())},this.resume=function(){o.streamer._halted?(d=!1,o.streamer.parseChunk(t,!0)):setTimeout(o.resume,3)},this.aborted=function(){return c},this.abort=function(){c=!0,s.abort(),p.meta.aborted=!0,S(e.complete)&&e.complete(p),t=""}}function g(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function f(e){var t,s=(e=e||{}).delimiter,r=e.newline,a=e.comments,i=e.step,o=e.preview,l=e.fastMode,u=t=void 0===e.quoteChar||null===e.quoteChar?'"':e.quoteChar;if(void 0!==e.escapeChar&&(u=e.escapeChar),("string"!=typeof s||-1<n.BAD_DELIMITERS.indexOf(s))&&(s=","),a===s)throw Error("Comment character same as delimiter");!0===a?a="#":("string"!=typeof a||-1<n.BAD_DELIMITERS.indexOf(a))&&(a=!1),"\n"!==r&&"\r"!==r&&"\r\n"!==r&&(r="\n");var d=0,c=!1;this.parse=function(n,h,p){if("string"!=typeof n)throw Error("Input must be a string");var f=n.length,m=s.length,_=r.length,y=a.length,b=S(i),v=[],E=[],k=[],R=d=0;if(!n)return W();if(e.header&&!h){var w=n.split(r)[0].split(s),T=[],O={},I=!1;for(var A in w){var C=w[A];S(e.transformHeader)&&(C=e.transformHeader(C,A));var L=C,x=O[C]||0;for(0<x&&(I=!0,L=C+"_"+x),O[C]=x+1;T.includes(L);)L=L+"_"+x;T.push(L)}if(I){var N=n.split(r);N[0]=T.join(s),n=N.join(r)}}if(l||!1!==l&&-1===n.indexOf(t)){for(var P=n.split(r),$=0;$<P.length;$++){if(k=P[$],d+=k.length,$!==P.length-1)d+=r.length;else if(p)break;if(!a||k.substring(0,y)!==a){if(b){if(v=[],G(k.split(s)),K(),c)return W()}else G(k.split(s));if(o&&o<=$)return v=v.slice(0,o),W(!0)}}return W()}for(var j=n.indexOf(s,d),q=n.indexOf(r,d),F=RegExp(g(u)+g(t),"g"),D=n.indexOf(t,d);;)if(n[d]!==t)if(a&&0===k.length&&n.substring(d,d+y)===a){if(-1===q)return W();d=q+_,q=n.indexOf(r,d),j=n.indexOf(s,d)}else if(-1!==j&&(j<q||-1===q))k.push(n.substring(d,j)),d=j+m,j=n.indexOf(s,d);else{if(-1===q)break;if(k.push(n.substring(d,q)),B(q+_),b&&(K(),c))return W();if(o&&v.length>=o)return W(!0)}else for(D=d,d++;;){if(-1===(D=n.indexOf(t,D+1)))return p||E.push({type:"Quotes",code:"MissingQuotes",message:"Quoted field unterminated",row:v.length,index:d}),z();if(D===f-1)return z(n.substring(d,D).replace(F,t));if(t!==u||n[D+1]!==u){if(t===u||0===D||n[D-1]!==u){-1!==j&&j<D+1&&(j=n.indexOf(s,D+1)),-1!==q&&q<D+1&&(q=n.indexOf(r,D+1));var M=H(-1===q?j:Math.min(j,q));if(n.substr(D+1+M,m)===s){k.push(n.substring(d,D).replace(F,t)),n[d=D+1+M+m]!==t&&(D=n.indexOf(t,d)),j=n.indexOf(s,d),q=n.indexOf(r,d);break}var U=H(q);if(n.substring(D+1+U,D+1+U+_)===r){if(k.push(n.substring(d,D).replace(F,t)),B(D+1+U+_),j=n.indexOf(s,d),D=n.indexOf(t,d),b&&(K(),c))return W();if(o&&v.length>=o)return W(!0);break}E.push({type:"Quotes",code:"InvalidQuotes",message:"Trailing quote on quoted field is malformed",row:v.length,index:d}),D++}}else D++}return z();function G(e){v.push(e),R=d}function H(e){var t=0;if(-1!==e){var s=n.substring(D+1,e);s&&""===s.trim()&&(t=s.length)}return t}function z(e){return p||(void 0===e&&(e=n.substring(d)),k.push(e),d=f,G(k),b&&K()),W()}function B(e){d=e,G(k),k=[],q=n.indexOf(r,d)}function W(e){return{data:v,errors:E,meta:{delimiter:s,linebreak:r,aborted:c,truncated:!!e,cursor:R+(h||0)}}}function K(){i(W()),v=[],E=[]}},this.abort=function(){c=!0},this.getCharIndex=function(){return d}}function m(e){var t=e.data,s=a[t.workerId],r=!1;if(t.error)s.userError(t.error,t.file);else if(t.results&&t.results.data){var i={abort:function(){r=!0,_(t.workerId,{data:[],errors:[],meta:{aborted:!0}})},pause:y,resume:y};if(S(s.userStep)){for(var n=0;n<t.results.data.length&&(s.userStep({data:t.results.data[n],errors:t.results.errors,meta:t.results.meta},i),!r);n++);delete t.results}else S(s.userChunk)&&(s.userChunk(t.results,i,t.file),delete t.results)}t.finished&&!r&&_(t.workerId,t.results)}function _(e,t){var s=a[e];S(s.userComplete)&&s.userComplete(t),s.terminate(),delete a[e]}function y(){throw Error("Not implemented.")}function b(e){if("object"!=typeof e||null===e)return e;var t=Array.isArray(e)?[]:{};for(var s in e)t[s]=b(e[s]);return t}function v(e,t){return function(){e.apply(t,arguments)}}function S(e){return"function"==typeof e}return r&&(t.onmessage=function(e){var s=e.data;if(void 0===n.WORKER_ID&&s&&(n.WORKER_ID=s.workerId),"string"==typeof s.input)t.postMessage({workerId:n.WORKER_ID,results:n.parse(s.input,s.config),finished:!0});else if(t.File&&s.input instanceof File||s.input instanceof Object){var r=n.parse(s.input,s.config);r&&t.postMessage({workerId:n.WORKER_ID,results:r,finished:!0})}}),(u.prototype=Object.create(l.prototype)).constructor=u,(d.prototype=Object.create(l.prototype)).constructor=d,(c.prototype=Object.create(c.prototype)).constructor=c,(h.prototype=Object.create(l.prototype)).constructor=h,n},"function"==typeof define&&define.amd?void 0!==(a=r())&&e.v(a):t.exports=r()},813412,e=>{"use strict";var t=e.i(755175),s=e.i(586468);function r(e){return e.map(e=>{let t={};for(let s of Object.keys(e)){let r=e[s];t[s]="object"==typeof r?JSON.stringify(r):r}return t})}e.s(["convertResultsToCSV",0,function(e){if(0===e.length)return;let t=function(e){let t=Array.from(e)[0];if(t)return Object.keys(t)}(e),a=r(e);return s.default.unparse(a,{columns:t})},"convertResultsToJSON",0,function(e){if(0!==e.length)return JSON.stringify(e,null,2)},"convertResultsToMarkdown",0,function(e){let s=r(e);if(0===s.length)return;let a=Object.keys(s[0]),i=s.map(e=>a.map(t=>String(e[t]??""))),n=[a,...i];return(0,t.markdownTable)(n)},"formatCellValue",0,function(e){return null===e?"NULL":"string"==typeof e?e:JSON.stringify(e)},"formatClipboardValue",0,function(e){return null===e?"":"object"==typeof e||Array.isArray(e)?JSON.stringify(e):String(e)},"isLargeValue",0,function(e){if(null==e)return!1;if("object"==typeof e)return!0;let t=String(e);return t.length>60||t.includes("\n")}])},884892,e=>{"use strict";let t=class{_line;_text;_lines;model;offset;lineNumber;constructor(e,t,s){this.model=e,this.offset=t,this.lineNumber=s,this._text=e.getValue(),this._lines=this._text.split(/\r?\n/g),this._line=this._lines[s]}hasNext(){return this.lineNumber>=0||this.offset>=0}isFowardDQuote(){return!!this.hasForward()&&34===this.peekForward()}isNextDQuote(){return!!this.hasNext()&&34===this.peekNext()}isNextPeriod(){return!!this.hasNext()&&46===this.peekNext()}peekNext(){return this.offset<0?10*(this.lineNumber>0):this._line.charCodeAt(this.offset)}hasForward(){return this.lineNumber<this._lines.length||this.offset<this._line.length}peekForward(){return this.offset===this._line.length?10*(this.lineNumber!==this._lines.length):this._line.charCodeAt(this.offset+1)}next(){if(this.offset<0)return this.lineNumber>0?(this.lineNumber--,this._line=this._lines[this.lineNumber],this.offset=this._line.length-1,10):(this.lineNumber=-1,0);let e=this._line.charCodeAt(this.offset);return this.offset--,e}readArguments(){let e=0,t=0,s=0,r=0;for(;this.hasNext();){let a=this.next();switch(a){case 40:if(--e<0)return r;break;case 41:e++;break;case 123:s--;break;case 125:s++;break;case 91:t--;break;case 93:t++;break;case 34:case 39:for(;this.hasNext()&&a!==this.next(););break;case 44:!e&&!t&&!s&&r++}}return -1}readIdent(){let e=!1,t=!1,s="";for(;this.hasNext();){let r=this.peekNext();if(e&&!t&&!this._isIdentPart(r))break;if(r=this.next(),!e&&t&&34===r){e=!0;continue}if(e||32!==r&&9!==r&&10!=r){if(!e&&(34===r||this._isIdentPart(r)))e=!0,t=34===r,s=String.fromCharCode(r)+s;else if(e)if(t){if(0===r||(s=String.fromCharCode(r)+s,34===r))break}else s=String.fromCharCode(r)+s}}return s}readIdents(e){let t=[];for(;e>0;){e--;let s=this.readIdent();if(!s||(t.push(s),!this.isNextPeriod()))break}return t.reverse()}_isIdentPart(e){return 95===e||e>=97&&e<=122||e>=65&&e<=90||e>=48&&e<=57}};e.s(["default",0,t])},460988,e=>{"use strict";var t=e.i(372181);e.i(128328);var s=e.i(86086),r=e.i(55956),a=e.i(691152),i=e.i(539256),n=e.i(416340),o=e.i(285006),l=e.i(993394),u=e.i(813412),d=e.i(884892);let c=e=>r.default.utc(Number(e)/1e3).toISOString(),h=e=>{let t=16===String(e).length;return!Number.isNaN(Number(e))&&t},p=(e,t)=>Object.keys(e).filter(t=>e[t]).flatMap(s=>{let r=t?`${t}.${s}`:s;return"object"==typeof e[s]?p(e[s],r):[r]}),g=(e,t)=>{let s=Object.keys(t),r=l.SQL_FILTER_TEMPLATES[e],i=e=>{let s=r[e],i=(0,a.default)(t,e);if(void 0!==i&&"function"==typeof s)return s(i);if(void 0===s)if("string"==typeof i)return`${e} = '${i}'`;else return`${e} = ${i}`;return void 0===i&&"function"==typeof s?null:s&&!1===i?null:s},n=s.map(e=>{if(void 0===t[e]||"string"==typeof t[e]&&0===t[e].length)return null;if("object"==typeof t[e]){let s=p(t[e],e).map(i).filter(Boolean);return s.length>0?`(${s.join(" or ")})`:null}{let t=i(e);return null===t?null:`(${t})`}}).filter(Boolean).join(" and ");return n?"where "+n:""},f=e=>{switch(e){case"edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response`;case"pg_cron_logs":case"postgres_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed`;case"function_logs":case"auth_logs":return"cross join unnest(metadata) as metadata";case"function_edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.response) as response
  cross join unnest(m.request) as request`;case"supavisor_logs":return"cross join unnest(metadata) as m";default:return""}},m=s.IS_PLATFORM?"where ( parsed.application_name = 'pg_cron' or regexp_contains(event_message, 'cron job') )":"where ( parsed.application_name = 'pg_cron' or event_message::text LIKE '%cron job%' )",_=e=>{let t=e.reduce((e,t)=>{let s=y(t);return e[s]+=1,e},{second:0,minute:0,hour:0,day:0});return Object.keys(t).reduce((e,s)=>t[e]>t[s]?e:s)},y=e=>({0:"second",1:"minute",2:"hour",3:"day"})[["second","minute","hour"].map(t=>e.get(t)).reduce((e,t)=>(0===t&&(e+=1),e),0)];function b(e){return e.map((e,t)=>{let s=[`## Log ${t+1}`];if(e.timestamp){let t,r=Number(e.timestamp);if(isFinite(r))t=new Date(r/1e3).toISOString();else if("string"==typeof e.timestamp){let s=new Date(e.timestamp);t=isNaN(s.getTime())?e.timestamp:s.toISOString()}else t=String(e.timestamp);s.push(`**Timestamp:** ${t}`)}e.event_message&&s.push(`**Message:** ${e.event_message}`);let{id:r,timestamp:a,event_message:i,...n}=e;return Object.keys(n).length>0&&s.push("","**Details:**","```json",JSON.stringify(n,null,2),"```"),s.join("\n")}).join("\n\n---\n\n")}let v={api:"API Gateway (Edge Network)",database:"Postgres Database",functions:"Edge Functions",fn_edge:"Edge Functions (edge runtime)",auth:"Auth",realtime:"Realtime",storage:"Storage",supavisor:"Supavisor (connection pooling)",postgrest:"PostgREST",pg_upgrade:"Postgres upgrade",pg_cron:"pg_cron",pgbouncer:"PgBouncer",etl:"ETL"},S={edge_logs:"API Gateway (Edge Network)",postgres_logs:"Postgres Database",function_logs:"Edge Functions",function_edge_logs:"Edge Functions (edge runtime)",auth_logs:"Auth",auth_audit_logs:"Auth (audit)",realtime_logs:"Realtime",storage_logs:"Storage",postgrest_logs:"PostgREST",supavisor_logs:"Supavisor (connection pooling)",pgbouncer_logs:"PgBouncer",pg_upgrade_logs:"Postgres upgrade",pg_cron_logs:"pg_cron",etl_replication_logs:"ETL"};e.s(["apiKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.apikey?.[0]?.apikey?.[0];if(t)return t.error?`${t.prefix}... <invalid: ${t.error}>`:`${t.prefix}...`},"buildLogsPrompt",0,function(e,t,s){let r,a,i=(t&&t in v?v[t]:null)??(s?(r=s.match(/\bfrom\s+(\w+)/i),(a=r?.[1])&&a in S?S[a]:null):null),n=i?` from the **${i}** service`:"",o=s?`

**Query used:**
\`\`\`sql
${s.trim()}
\`\`\``:"";return`I have ${e.length} Supabase log entr${1===e.length?"y":"ies"}${n} I'd like help debugging:

`+b(e)+o+"\n\nWhat do these logs indicate? What steps can I take to resolve it? Keep your answer very concise and actionable. Max 2 or 3 bullet points."},"checkForILIKEClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(ILIKE)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"checkForWithClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(WITH)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"extractEdgeFunctionName",0,function(e){if("string"!=typeof e||!e)return"";let t=e.split("/").filter(Boolean);return t[t.length-1]??""},"fillTimeseries",0,(e,t,s,a,i,n,o=20,l)=>{let u;if(0===e.length&&!(i&&n))return[];if(e.length>o)return e.map(e=>{let s=e[t],a=h(s)?c(s):r.default.utc(s).toISOString();return e[t]=a,e});if(e.length<=1&&!(i&&n))return e;let d=e.map(e=>r.default.utc(e[t])),p=n?r.default.utc(n):r.default.utc(Math.max.apply(null,d)),g=i?r.default.utc(i):r.default.utc(Math.min.apply(null,d)),f=e.length>0?d:[g,p],m=1;if(l){let e=l.match(/^(\d+)(m|h|d|s)$/);e?(m=parseInt(e[1],10),u=({s:"second",m:"minute",h:"hour",d:"day"})[e[2]]):u=_(f)}else u=_(f);0!==e.length||l||(u="minute");let y=e.map(e=>{let a=e[t],i=h(a)?c(a):r.default.utc(a).toISOString();return Array.isArray(s)&&0===s.length?{[t]:i}:(e[t]=i,e)}),b=g;for(;b.isBefore(p)||b.isSame(p);){if(!d.find(e=>e.year()===b.year()&&e.month()===b.month()&&e.date()===b.date()&&e.hour()===b.hour()&&e.minute()===b.minute()&&e.second()===b.second())){let e=("string"==typeof s?[s]:s).reduce((e,t)=>({...e,[t]:a}),{});y.push({[t]:b.toISOString(),...e})}b=b.add(m,u)}return y},"formatLogsAsCsv",0,function(e){return(0,u.convertResultsToCSV)(e)??""},"formatLogsAsJson",0,function(e){return JSON.stringify(e,null,2)},"formatLogsAsMarkdown",0,b,"genChartQuery",0,(e,t,s)=>{let a,i,n,o,u,d,[c,h]=(a=t.iso_timestamp_end?(0,r.default)(t.iso_timestamp_end):(0,r.default)(),i=t.iso_timestamp_start?(0,r.default)(t.iso_timestamp_start):(0,r.default)(),n="minute",o=360,u=a.diff(i,"minute"),d=a.diff(i,"hour"),u>720?(n="hour",o=120):d>72&&(n="day",o=7),[i.add(-o,n),n]),p=g(e,s),_=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 500";case"postgres_logs":case"pg_cron_logs":return"parsed.error_severity IN ('ERROR', 'FATAL', 'PANIC')";case"auth_logs":return"metadata.level = 'error' OR SAFE_CAST(metadata.status AS INT64) >= 400";case"function_logs":return"metadata.level IN ('error', 'fatal')";default:return"false"}}(e),y=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 400 AND response.status_code < 500";case"postgres_logs":return"parsed.error_severity IN ('WARNING')";case"auth_logs":return"metadata.level = 'warning'";case"function_logs":return"metadata.level IN ('warning')";default:return"false"}}(e);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,p=m);let b=f(e);return`
SELECT
-- log-event-chart
  timestamp_trunc(t.timestamp, ${h}) as timestamp,
  count(CASE WHEN NOT (${_} OR ${y}) THEN 1 END) as ok_count,
  count(CASE WHEN ${_} THEN 1 END) as error_count,
  count(CASE WHEN ${y} THEN 1 END) as warning_count,
FROM
  ${e} t
  ${b}
  ${p?p+` and t.timestamp > '${c.toISOString()}'`:`where t.timestamp > '${c.toISOString()}'`}
GROUP BY
timestamp
ORDER BY
  timestamp ASC
  `},"genCountQuery",0,(e,t)=>{let s=g(e,t);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,s=m);let r=f(e);return`SELECT count(*) as count FROM ${e} ${r} ${s}`},"genDefaultQuery",0,(e,t,r=100)=>{let a=g(e,t),i=f(e),n="order by timestamp desc";switch(e){case"edge_logs":if(!s.IS_PLATFORM)return`
-- local dev edge_logs query
select id, edge_logs.timestamp, event_message, request.method, request.path, request.search, response.status_code
from edge_logs
${i}
${a}
${n}
limit ${r};
`;return`select id, identifier, timestamp, event_message, request.method, request.path, request.search, response.status_code
  from ${e}
  ${i}
  ${a}
  ${n}
  limit ${r}
  `;case"postgres_logs":if(!s.IS_PLATFORM)return`
select postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint
from postgres_logs
${i}
${a}
${n}
limit ${r}
  `;return`select identifier, postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint from ${e}
  ${i}
  ${a}
  ${n}
  limit ${r}
  `;case"function_logs":return`select id, ${e}.timestamp, event_message, metadata.event_type, metadata.function_id, metadata.execution_id, metadata.level from ${e}
  ${i}
  ${a}
  ${n}
  limit ${r}
    `;case"auth_logs":return`select id, ${e}.timestamp, event_message, metadata.level, metadata.status, metadata.path, metadata.msg as msg, metadata.error from ${e}
  ${i}
  ${a}
  ${n}
  limit ${r}
    `;case"function_edge_logs":if(!s.IS_PLATFORM)return`
select id, function_edge_logs.timestamp, event_message
from function_edge_logs
${n}
limit ${r}
`;return`select id, ${e}.timestamp, event_message, response.status_code, request.method, request.pathname, m.function_id, m.execution_id, m.execution_time_ms, m.deployment_id, m.version from ${e}
  ${i}
  ${a}
  ${n}
  limit ${r}
  `;case"supavisor_logs":return`select id, ${e}.timestamp, event_message from ${e} ${i} ${a} ${n} limit ${r}`;case"pg_upgrade_logs":return`select id, ${e}.timestamp, event_message from ${e} ${i} ${a} ${n} limit 100`;default:return`select id, ${e}.timestamp, event_message from ${e}
  ${a}
  ${n}
  limit ${r}
  `;case"pg_cron_logs":let o=a?`${m} AND ${a.substring(6)}`:m;return`select id, postgres_logs.timestamp, event_message, parsed.error_severity, parsed.query
from postgres_logs
${i}
${o}
${n}
limit ${r}
`}},"genSingleLogQuery",0,(e,t)=>`select id, timestamp, event_message, metadata from ${e} where id = '${t}' limit 1`,"isDefaultLogPreviewFormat",0,e=>e&&e.timestamp&&e.event_message&&e.id,"isUnixMicro",0,h,"jwtAPIKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.apikey?.[0];if(!t)return;if(t.invalid)return"<invalid>";let s=t?.payload?.[0];return s&&"HS256"===s.algorithm&&"supabase"===s.issuer&&["anon","service_role"].includes(s.role)&&!s.subject?s.role:"<unrecognized>"},"maybeShowUpgradePromptIfNotEntitled",0,(e,t)=>!!t&&Math.abs((0,r.default)().diff((0,r.default)(e),"day"))>t,"role",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.authorization?.[0];if(!t||t.invalid)return;let s=t?.payload?.[0];if(s&&s.role)return s.role},"unixMicroToIsoTimestamp",0,c,"useEditorHints",0,()=>{let e=(0,t.useMonaco)();(0,n.useEffect)(()=>{if(e){let t=e.languages.registerCompletionItemProvider("pgsql",{triggerCharacters:["`"," ","."],provideCompletionItems:function(t,s,r){let a=new d.default(t,s.column-2,s.lineNumber-1);if(a.isNextDQuote())return{suggestions:[]};let n=[],l=o.default.schemas.filter(e=>a._text.includes(e.reference));if(0===l.length&&(l=o.default.schemas),a.isNextPeriod()){let t=l.flatMap(e=>e.fields).flatMap(e=>{let[t,...s]=e.path.split(".");return s}).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));n=n.concat(t)}if("`"===r.triggerCharacter||" "===r.triggerCharacter){let t=o.default.schemas.map(t=>({label:t.reference,kind:e.languages.CompletionItemKind.Class,insertText:t.reference})),s=l.flatMap(e=>e.fields).flatMap(e=>e.path.split(".").slice(0,-1)).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));n=(n=n.concat(s)).concat(t)}return{suggestions:(0,i.default)(n,"label")}}});return()=>{t.dispose()}}},[e])}])}]);

//# debugId=872ba2df-45d1-7d25-b267-2dd25075c32e
//# sourceMappingURL=0~h38cid222tb.js.map