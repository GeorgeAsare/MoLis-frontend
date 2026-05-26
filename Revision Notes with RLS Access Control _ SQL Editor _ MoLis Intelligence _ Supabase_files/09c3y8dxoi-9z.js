;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="40a61daa-1223-d161-a5fa-c5167642a096")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,867467,e=>{"use strict";var t=e.i(416340);e.s(["useChanged",0,function(e){let a=(0,t.useRef)(null),r=a.current!==e;return(0,t.useEffect)(()=>{a.current=e}),r},"useChangedSync",0,function(e){let a=(0,t.useRef)(null),r=a.current!==e;return a.current=e,r}])},961748,e=>{"use strict";let t=(0,e.i(679709).default)("ShieldOff",[["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71",key:"1jlk70"}],["path",{d:"M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",key:"18rp1v"}]]);e.s(["ShieldOff",0,t],961748)},581561,e=>{"use strict";let t=(0,e.i(679709).default)("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);e.s(["default",0,t])},148618,e=>{"use strict";var t=e.i(581561);e.s(["Calendar",()=>t.default])},507648,(e,t,a)=>{var r=e.r(203941),n=e.r(297926),i=e.r(615573),s=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),a=arguments[0],l=e;l--;)t[l-1]=arguments[l];return r(s(a)?i(a):[a],n(t,1))}},707409,e=>{"use strict";var t=e.i(507648),a=e.i(827047);let r=["int2","int4","int8","float4","float8","numeric","double precision"],n=["json","jsonb"],i=["text","varchar"],s=["timestamp","timestamptz"],l=["date"],o=["time","timetz"],c=(0,t.default)(s,l,o),d=["uuid","bool","vector","bytea"],u=(0,a.default)((0,t.default)(r,n,i,c,d));e.s(["DATETIME_TYPES",0,c,"DATE_TYPES",0,l,"JSON_TYPES",0,n,"NUMERICAL_TYPES",0,r,"OTHER_DATA_TYPES",0,d,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,i,"TIMESTAMP_TYPES",0,s,"TIME_TYPES",0,o])},647307,e=>{"use strict";var t=e.i(850036),a=e.i(705541),r=e.i(964574),n=e.i(739114),i=e.i(801834),s=e.i(714403);async function l({name:e,projectRef:a,connectionString:r}){let n=t.default.schemas.create({name:e,owner:"postgres"}).sql,{result:i}=await (0,s.executeSql)({projectRef:a,connectionString:r,sql:n,queryKey:["schema","create"]});return i}e.s(["useSchemaCreateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,r){let{projectRef:n}=a;await (0,i.invalidateSchemasQuery)(o,n),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to create schema: ${e.message}`):t(e,a,r)},...s})}])},801528,e=>{"use strict";let t=(0,e.i(679709).default)("ListPlus",[["path",{d:"M11 12H3",key:"51ecnj"}],["path",{d:"M16 6H3",key:"1wxfjs"}],["path",{d:"M16 18H3",key:"12xzn7"}],["path",{d:"M18 9v6",key:"1twb98"}],["path",{d:"M21 12h-6",key:"bt1uis"}]]);e.s(["ListPlus",0,t],801528)},973512,e=>{"use strict";var t=e.i(221628),a=e.i(802715),r=e.i(416340),n=e.i(837710),i=e.i(788070),s=e.i(368136),l=e.i(194125);e.s(["ActionBar",0,({loading:e=!1,disableApply:o=!1,hideApply:c=!1,children:d,applyButtonLabel:u="Apply",backButtonLabel:p="Back",applyFunction:m,closePanel:f=a.default,formId:h,visible:g=!0})=>{let[y,v]=(0,r.useState)(!1),x=(0,r.useCallback)(async()=>{v(!0),await new Promise(e=>m?.(e)),v(!1)},[m]),b=(0,r.useCallback)(()=>{if(!y&&!e&&!o&&!c)if(h){let e=document.getElementById(h);e&&e.requestSubmit()}else m&&x()},[y,e,o,c,h,m,x]);return(0,l.useShortcut)(s.SHORTCUT_IDS.ACTION_BAR_SAVE,b,{enabled:g}),(0,t.jsxs)("div",{className:"flex w-full items-center gap-3 border-t border-default px-3 py-4",children:[d,(0,t.jsxs)("div",{className:"flex items-center gap-3 ml-auto",children:[(0,t.jsx)(n.Button,{type:"default",htmlType:"button",onClick:f,disabled:y||e,children:p}),void 0!==m?(0,t.jsx)(n.Button,{onClick:x,disabled:o||y||e,loading:y||e,iconRight:y||e?void 0:(0,t.jsx)(i.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u}):c?(0,t.jsx)("div",{}):(0,t.jsx)(n.Button,{disabled:e||o,loading:e,"data-testid":"action-bar-save-row",htmlType:"submit",form:h,iconRight:e?void 0:(0,t.jsx)(i.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u})]})]})}])},282376,338468,e=>{"use strict";var t=e.i(679709);let a=(0,t.default)("ToggleRight",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"6",ry:"6",key:"f2vt7d"}],["circle",{cx:"16",cy:"12",r:"2",key:"4ma0v8"}]]);e.s(["ToggleRight",0,a],282376);let r=(0,t.default)("Type",[["polyline",{points:"4 7 4 4 20 4 20 7",key:"1nosan"}],["line",{x1:"9",x2:"15",y1:"20",y2:"20",key:"swin9y"}],["line",{x1:"12",x2:"12",y1:"4",y2:"20",key:"1tx1rr"}]]);e.s(["Type",0,r],338468)},1962,e=>{"use strict";var t=e.i(221628),a=e.i(416340),r=e.i(608652),n=e.i(600317),i="Progress",[s,l]=(0,r.createContextScope)(i),[o,c]=s(i),d=a.forwardRef((e,a)=>{var r,i;let{__scopeProgress:s,value:l=null,max:c,getValueLabel:d=m,...u}=e;(c||0===c)&&!g(c)&&console.error((r=`${c}`,`Invalid prop \`max\` of value \`${r}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let p=g(c)?c:100;null===l||y(l,p)||console.error((i=`${l}`,`Invalid prop \`value\` of value \`${i}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let v=y(l,p)?l:null,x=h(v)?d(v,p):void 0;return(0,t.jsx)(o,{scope:s,value:v,max:p,children:(0,t.jsx)(n.Primitive.div,{"aria-valuemax":p,"aria-valuemin":0,"aria-valuenow":h(v)?v:void 0,"aria-valuetext":x,role:"progressbar","data-state":f(v,p),"data-value":v??void 0,"data-max":p,...u,ref:a})})});d.displayName=i;var u="ProgressIndicator",p=a.forwardRef((e,a)=>{let{__scopeProgress:r,...i}=e,s=c(u,r);return(0,t.jsx)(n.Primitive.div,{"data-state":f(s.value,s.max),"data-value":s.value??void 0,"data-max":s.max,...i,ref:a})});function m(e,t){return`${Math.round(e/t*100)}%`}function f(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function h(e){return"number"==typeof e}function g(e){return h(e)&&!isNaN(e)&&e>0}function y(e,t){return h(e)&&!isNaN(e)&&e<=t&&e>=0}p.displayName=u,e.s(["Indicator",0,p,"Progress",0,d,"ProgressIndicator",0,p,"Root",0,d,"createProgressScope",0,l],294372);var v=e.i(294372),v=v,x=e.i(843778);let b=a.forwardRef(({className:e,value:a,...r},n)=>(0,t.jsx)(v.Root,{ref:n,className:(0,x.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...r,children:(0,t.jsx)(v.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(a||0)}%)`}})}));b.displayName=v.Root.displayName,e.s(["Progress",0,b],1962)},474325,e=>{"use strict";var t=e.i(221628),a=e.i(217553),r=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:n,action:i,message:s,description:l="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(a.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:s}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[n||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(r.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:l}),i]})]})]})])},509847,e=>{"use strict";e.s(["databasePoliciesKeys",0,{list:(e,t)=>["projects",e,"database-policies",t].filter(Boolean)}])},929486,(e,t,a)=>{var r=Object.prototype.hasOwnProperty;t.exports=function(e,t){return null!=e&&r.call(e,t)}},460224,(e,t,a)=>{var r=e.r(929486),n=e.r(129718);t.exports=function(e,t){return null!=e&&n(e,t,r)}},461250,(e,t,a)=>{var r=e.r(291996),n=e.r(949667),i=e.r(684912),s=Math.ceil,l=Math.max;t.exports=function(e,t,a){t=(a?n(e,t,a):void 0===t)?1:l(i(t),0);var o=null==e?0:e.length;if(!o||t<1)return[];for(var c=0,d=0,u=Array(s(o/t));c<o;)u[d++]=r(e,c,c+=t);return u}},321605,25912,e=>{"use strict";var t=e.i(248593),a=e.i(125356);let r={list:e=>["projects",e,"database-publications"]};e.s(["databasePublicationsKeys",0,r],25912);var n=e.i(234745),i=e.i(635494);async function s({projectRef:e,connectionString:a},r){if(!e)throw Error("projectRef is required");let i=new Headers;a&&i.set("x-connection-encrypted",a);let{data:l,error:o}=await (0,n.get)("/platform/pg-meta/{ref}/publications",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:i,signal:r});return o&&(0,n.handleError)(o),l}let l=({projectRef:e,connectionString:t},{enabled:n=!0,...i}={})=>(0,a.useQuery)({queryKey:r.list(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),enabled:n&&void 0!==e,...i});e.s(["useDatabasePublicationsQuery",0,l,"useIsTableRealtimeEnabled",0,({id:e})=>{let{data:t}=(0,i.useSelectedProjectQuery)(),{data:a}=l({projectRef:t?.ref,connectionString:t?.connectionString}),r=(a??[]).find(e=>"supabase_realtime"===e.name);return(r?.tables??[]).some(t=>t.id===e)}],321605)},587768,e=>{"use strict";var t=e.i(850036),a=e.i(705541),r=e.i(964574),n=e.i(739114),i=e.i(25912),s=e.i(714403);async function l({projectRef:e,connectionString:a,id:r,tables:n,publish_insert:i,publish_update:o,publish_delete:c,publish_truncate:d}){let{sql:u}=t.default.publications.update(r,{tables:n,publish_insert:i,publish_update:o,publish_delete:c,publish_truncate:d}),{result:p}=await (0,s.executeSql)({projectRef:e,connectionString:a,sql:u,queryKey:["publication","update",r]});return p}e.s(["useDatabasePublicationUpdateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,r){let{projectRef:n}=a;await o.invalidateQueries({queryKey:i.databasePublicationsKeys.list(n)}),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to update database publication: ${e.message}`):t(e,a,r)},...s})}])},983783,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(158639),r=e.i(197451),n=e.i(416340);e.s(["useQuerySchemaState",0,()=>{var e;let{ref:i}=(0,a.useParams)(),s=window.localStorage&&i&&i.length>0&&window.localStorage.getItem(t.LOCAL_STORAGE_KEYS.LAST_SELECTED_SCHEMA(i))||"public",[l,o]=(e=(0,n.useMemo)(()=>s,[i]),(0,r.useQueryState)("schema",r.parseAsString.withDefault(e).withOptions({clearOnDefault:!1})));return(0,n.useEffect)(()=>{window.localStorage&&i&&i.length>0&&window.localStorage.setItem(t.LOCAL_STORAGE_KEYS.LAST_SELECTED_SCHEMA(i),l)},[l,i]),{selectedSchema:l,setSelectedSchema:o}}])},238944,e=>{"use strict";var t=e.i(896779),a=e.i(416340),r=e.i(323796);e.s(["useUrlState",0,function({replace:e=!0,arrayKeys:n=[]}={}){let i=JSON.stringify(n),s=(0,a.useMemo)(()=>new Set(n),[i]),l=(0,t.useRouter)(),o=(0,a.useMemo)(()=>Object.fromEntries(Object.entries(l.query).map(([e,t])=>s.has(e)?Array.isArray(t)?[e,t]:[e,[t]]:[e,t])),[s,l.query]),c=(0,r.default)(o);return[o,(0,a.useCallback)(t=>{let a=c.current,r="function"==typeof t?t(a):t,n=Object.fromEntries(Object.entries({...a,...r}).filter(([,e])=>!!e));(e?l.replace:l.push)({pathname:l.pathname,query:n},void 0,{shallow:!0,scroll:!1})},[l,e])]}])},630497,e=>{"use strict";let t=(0,e.i(679709).default)("LockOpen",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1",key:"1mm8w8"}]]);e.s(["Unlock",0,t],630497)},425861,e=>{"use strict";var t=e.i(221628),a=e.i(843778);e.s(["TwoOptionToggle",0,({options:e,width:r=50,activeOption:n,onClickOption:i,borderOverride:s="border-stronger"})=>(0,t.jsxs)("div",{className:`relative border ${s} rounded-md h-7`,style:{padding:1,width:(r+1)*2},children:[(0,t.jsx)("span",{style:{width:r,translate:n===e[1]?"0px":`${r-2}px`},"aria-hidden":"true",className:(0,a.cn)("z-0 inline-block rounded-sm h-full bg-overlay-hover shadow-sm transform","transition-all ease-in-out border border-strong")}),e.map((e,s)=>{let l;return(0,t.jsx)("span",{style:{width:r+1},className:`
              ${n===e?"text-foreground":"text-foreground-light"}
              ${0===s?"right-0":"left-0"}
              ${(l=n===e,`absolute top-0 z-1 text-xs inline-flex h-full items-center justify-center font-medium
    ${l?"hover:text-foreground-light hover:text-foreground":"hover:text-foreground"} hover:text-foreground focus:z-10 focus:outline-hidden focus:border-blue-300 focus:ring-blue
    transition ease-in-out duration-150`)}
              cursor-pointer
            `,onClick:()=>i(e),children:(0,t.jsx)("span",{className:(0,a.cn)("capitalize hover:text-foreground",n===e?"text-foreground":"text-foreground-light"),children:e})},`toggle_${s}`)})]})])},127731,e=>{"use strict";var t=e.i(220412);new WeakMap,new WeakMap;let a={get url(){return`file://${e.P("node_modules/.pnpm/valtio@1.12.0_@types+react@19.2.14_react@19.2.6/node_modules/valtio/esm/vanilla/utils.mjs")}`}},r=Symbol();e.s(["devtools",0,function(e,n){let i;"string"==typeof n&&(console.warn("string name option is deprecated, use { name }. https://github.com/pmndrs/valtio/pull/400"),n={name:n});let{enabled:s,name:l="",...o}=n||{};try{i=(null!=s?s:(a.env?a.env.MODE:void 0)!=="production")&&window.__REDUX_DEVTOOLS_EXTENSION__}catch{}if(!i){(a.env?a.env.MODE:void 0)!=="production"&&s&&console.warn("[Warning] Please install/enable Redux devtools extension");return}let c=!1,d=i.connect({name:l,...o}),u=(0,t.subscribe)(e,a=>{let n=a.filter(([e,t])=>t[0]!==r).map(([e,t])=>`${e}:${t.map(String).join(".")}`).join(", ");if(n)if(c)c=!1;else{let a=Object.assign({},(0,t.snapshot)(e));delete a[r],d.send({type:n,updatedAt:new Date().toLocaleString()},a)}}),p=d.subscribe(a=>{var n,i,s,l,o,u;if("ACTION"===a.type&&a.payload)try{Object.assign(e,JSON.parse(a.payload))}catch(e){console.error("please dispatch a serializable value that JSON.parse() and proxy() support\n",e)}if("DISPATCH"===a.type&&a.state)((null==(n=a.payload)?void 0:n.type)==="JUMP_TO_ACTION"||(null==(i=a.payload)?void 0:i.type)==="JUMP_TO_STATE")&&(c=!0,Object.assign(e,JSON.parse(a.state))),e[r]=a;else if("DISPATCH"===a.type&&(null==(s=a.payload)?void 0:s.type)==="COMMIT")d.init((0,t.snapshot)(e));else if("DISPATCH"===a.type&&(null==(l=a.payload)?void 0:l.type)==="IMPORT_STATE"){let r=null==(o=a.payload.nextLiftedState)?void 0:o.actionsById,n=(null==(u=a.payload.nextLiftedState)?void 0:u.computedStates)||[];c=!0,n.forEach(({state:a},n)=>{let i=r[n]||"No action found";Object.assign(e,a),0===n?d.init((0,t.snapshot)(e)):d.send(i,(0,t.snapshot)(e))})}});return d.init((0,t.snapshot)(e)),()=>{u(),null==p||p()}},"proxyMap",0,function(e){let a=(0,t.proxy)({data:Array.from(e||[]),has(e){return this.data.some(t=>t[0]===e)},set(e,t){let a=this.data.find(t=>t[0]===e);return a?a[1]=t:this.data.push([e,t]),this},get(e){var t;return null==(t=this.data.find(t=>t[0]===e))?void 0:t[1]},delete(e){let t=this.data.findIndex(t=>t[0]===e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},toJSON(){return new Map(this.data)},forEach(e){this.data.forEach(t=>{e(t[1],t[0],this)})},keys(){return this.data.map(e=>e[0]).values()},values(){return this.data.map(e=>e[1]).values()},entries(){return new Map(this.data).entries()},get[Symbol.toStringTag](){return"Map"},[Symbol.iterator](){return this.entries()}});return Object.defineProperties(a,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(a),a},"proxySet",0,function(e){let a=(0,t.proxy)({data:Array.from(new Set(e)),has(e){return -1!==this.data.indexOf(e)},add(e){let a=!1;return"object"==typeof e&&null!==e&&(a=-1!==this.data.indexOf((0,t.proxy)(e))),-1!==this.data.indexOf(e)||a||this.data.push(e),this},delete(e){let t=this.data.indexOf(e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},forEach(e){this.data.forEach(t=>{e(t,t,this)})},get[Symbol.toStringTag](){return"Set"},toJSON(){return new Set(this.data)},[Symbol.iterator](){return this.data[Symbol.iterator]()},values(){return this.data.values()},keys(){return this.data.values()},entries(){return new Set(this.data).entries()}});return Object.defineProperties(a,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(a),a}],127731)},152285,e=>{"use strict";var t=e.i(221628),a=e.i(137446),r=e.i(416340),n=e.i(938933);let i=({defaultActiveId:e,activeId:i,type:s="pills",size:l="tiny",block:o,onChange:c,onClick:d,scrollable:u,wrappable:p,addOnBefore:m,addOnAfter:f,listClassNames:h,baseClassNames:g,refs:y,children:v})=>{let x=[];r.Children.forEach(v,e=>{(0,r.isValidElement)(e)&&x.push(e)});let[b,_]=(0,r.useState)(i??e??x?.[0]?.props?.id);(0,r.useMemo)(()=>{i&&i!==b&&_(i)},[i]);let S=(0,n.default)("tabs");function j(e){d?.(e),e!==b&&(c?.(e),_(e))}let E=[S[s].list];return u&&E.push(S.scrollable),p&&E.push(S.wrappable),h&&E.push(h),(0,t.jsxs)(a.Tabs.Root,{value:b,className:[S.base,g].join(" "),ref:y?.base,children:[(0,t.jsxs)(a.Tabs.List,{className:E.join(" "),ref:y?.list,children:[m,x.map(e=>{let r=b===e.props.id,n=[S[s].base,S.size[l]];return r?n.push(S[s].active):n.push(S[s].inactive),o&&n.push(S.block),(0,t.jsxs)(a.Tabs.Trigger,{onKeyDown:t=>{"Enter"===t.key&&(t.preventDefault(),j(e.props.id))},onClick:()=>j(e.props.id),value:e.props.id,className:n.join(" "),children:[e.props.icon,(0,t.jsx)("span",{children:e.props.label}),e.props.iconRight]},`${e.props.id}-tab-button`)}),f]}),x]})};i.Panel=({children:e,id:r,className:i})=>{let s=(0,n.default)("tabs");return(0,t.jsx)(a.Tabs.Content,{value:r,className:[s.content,i].join(" "),children:e})},e.s(["default",0,i])},200409,e=>{"use strict";var t=e.i(152285);e.s(["Tabs",()=>t.default])},77215,e=>{"use strict";let t=(0,e.i(679709).default)("AlignLeft",[["line",{x1:"21",x2:"3",y1:"6",y2:"6",key:"1fp77t"}],["line",{x1:"15",x2:"3",y1:"12",y2:"12",key:"v6grx8"}],["line",{x1:"17",x2:"3",y1:"18",y2:"18",key:"1awlsn"}]]);e.s(["AlignLeft",0,t],77215)},102703,e=>{"use strict";var t=e.i(221628),a=e.i(758825),r=e.i(690885),n=e.i(833063),i=e.i(561978),s=e.i(416340),l=e.i(837710);let o=(0,s.forwardRef)(({icon:e,title:o,description:c,url:d,urlLabel:u="Read more",defaultVisibility:p=!1,hideCollapse:m=!1,button:f,className:h="",block:g=!1},y)=>{let[v,x]=(0,s.useState)(p);return(0,t.jsx)("div",{ref:y,role:"alert",className:`${g?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${h}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:o})})]}),c&&!m?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>x(!v),children:v?(0,t.jsx)(n.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(r.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||d||f)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${v?"mt-3":""}`,style:{maxHeight:500*!!v},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c}),d&&(0,t.jsx)("div",{children:(0,t.jsx)(l.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(a.ExternalLink,{}),children:(0,t.jsx)(i.default,{href:d,target:"_blank",rel:"noreferrer",children:u})})}),f&&(0,t.jsx)("div",{children:f})]})]})})});o.displayName="InformationBox",e.s(["default",0,o])},768441,757489,e=>{"use strict";e.i(850036);var t=e.i(479084);function a({search:e,ignoredSchemas:r=[]}={}){let n=(0,t.joinSqlFragments)(r.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
    table_privileges as (
      select
        c.oid::int as id,
        n.nspname as schema_name,
        c.relname as name,
        c.relkind as kind,

        -- Anon Privileges
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'SELECT') as anon_select,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'INSERT') as anon_insert,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'UPDATE') as anon_update,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'DELETE') as anon_delete,

        -- Authenticated Privileges
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'SELECT') as auth_select,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'INSERT') as auth_insert,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'UPDATE') as auth_update,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'DELETE') as auth_delete,

        -- Service Role Privileges
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'SELECT') as srv_select,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'INSERT') as srv_insert,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'UPDATE') as srv_update,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'DELETE') as srv_delete

      from pg_class c
      join pg_namespace n
        on n.oid = c.relnamespace
      left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        on true
      left join pg_roles pr
        on pr.oid = acl.grantee
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        ${n?t.safeSql`and n.nspname not in (${n})`:t.safeSql``}
        ${e?t.safeSql`and (n.nspname || '.' || c.relname) ilike ${(0,t.literal)(`%${e}%`)}`:t.safeSql``}
      group by c.oid, n.nspname, c.relname, c.relkind
    ),
    table_grants as (
      select
        id,
        schema_name,
        name,
        kind,
        case
          -- 1. Strict Granted: All 3 roles possess ALL 4 privileges
          when (
            anon_select and anon_insert and anon_update and anon_delete and
            auth_select and auth_insert and auth_update and auth_delete and
            srv_select and srv_insert and srv_update and srv_delete
          ) then 'granted'

          -- 2. Strict Revoked: NO role possesses ANY privilege
          when not (
            anon_select or anon_insert or anon_update or anon_delete or
            auth_select or auth_insert or auth_update or auth_delete or
            srv_select or srv_insert or srv_update or srv_delete
          ) then 'revoked'

          -- 3. Custom: Anything in between
          else 'custom'
        end as status
      from table_privileges
    )
  `}function r({search:e,ignoredSchemas:a=[]}={}){let n=(0,t.joinSqlFragments)(a.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
    function_privileges as (
      select
        n.nspname as schema_name,
        p.proname as name,

        -- Aggregate EXECUTE across all overloads + all 3 roles
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'EXECUTE') as anon_execute,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'EXECUTE') as auth_execute,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'EXECUTE') as srv_execute

      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
      left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        on true
      left join pg_roles pr
        on pr.oid = acl.grantee
      where p.prokind in ('f', 'w')
        ${n?t.safeSql`and n.nspname not in (${n})`:t.safeSql``}
        ${e?t.safeSql`and (n.nspname || '.' || p.proname) ilike ${(0,t.literal)(`%${e}%`)}`:t.safeSql``}
      group by n.nspname, p.proname
    ),
    function_grants as (
      select
        schema_name,
        name,
        case
          when anon_execute and auth_execute and srv_execute then 'granted'
          when not (anon_execute or auth_execute or srv_execute) then 'revoked'
          else 'custom'
        end as status
      from function_privileges
    )
  `}function n({schema:e="public"}={}){return t.safeSql`
    select
      count(*)::int as grant_count
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    join pg_roles r on r.oid = d.defaclrole
    where n.nspname = ${(0,t.literal)(e)}
      and r.rolname = 'postgres'
      and d.defaclobjtype in ('r', 'f', 'S')
      and exists (
        select 1
        from aclexplode(d.defaclacl) acl
        join pg_roles gr on gr.oid = acl.grantee
        where gr.rolname in ('anon', 'authenticated', 'service_role')
      )
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let a=[];for(let r of["anon","authenticated","service_role"])"grant"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,t.ident)(r)}`,t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,t.ident)(r)}`,t.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,t.ident)(r)}`):a.push(t.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,t.ident)(r)}`,t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,t.ident)(r)}`,t.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,t.ident)(r)}`);return"revoke"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):a.push(t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),t.safeSql`${(0,t.joinSqlFragments)(a,";\n")};`},"buildFunctionPrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let r=(0,t.joinSqlFragments)(e.map(e=>{let a=e.indexOf("."),r=e.slice(0,a),n=e.slice(a+1);return t.safeSql`(${(0,t.literal)(r)},${(0,t.literal)(n)})`}),", "),n="grant"===a?t.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:t.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return t.safeSql`
    do $$
    declare
      nspname name;
      proname name;
      arg_types text;
    begin
      for nspname, proname, arg_types in
        select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname, p.proname) in (${r})
      loop
        execute format('${n}', nspname, proname, arg_types);
      end loop;
    end $$;
  `},"buildTablePrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let r="grant"===a?t.safeSql`grant select, insert, update, delete on table %I.%I to anon, authenticated, service_role`:t.safeSql`revoke all on table %I.%I from anon, authenticated, service_role`;return t.safeSql`
    do $$
    declare
      nspname name;
      relname name;
    begin
      for nspname, relname in
        select n.nspname, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.oid in (${(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", ")})
      loop
        execute format('${r}', nspname, relname);
      end loop;
    end $$;
  `},"getDefaultPrivilegesStateSql",0,n,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:a=[]}){let n=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${r({ignoredSchemas:a})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${n})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:a,limit:n,ignoredSchemas:i=[]}){return t.safeSql`
    with ${r({search:e,ignoredSchemas:i})}
    select
      (select count(*)::int from function_grants) as total_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'schema', fg.schema_name,
              'name', fg.name,
              'status', fg.status
            )
          )
          from (
            select *
            from function_grants
            order by schema_name, name
            offset ${(0,t.literal)(a)}
            limit ${(0,t.literal)(n)}
          ) fg
        ),
        '[]'::jsonb
      ) as functions;
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:r=[]}){let n=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${a({ignoredSchemas:r})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${n})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:r,limit:n,ignoredSchemas:i=[]}){return t.safeSql`
    with ${a({search:e,ignoredSchemas:i})}
    select
      (select count(*)::int from table_grants) as total_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', tg.id,
              'schema', tg.schema_name,
              'name', tg.name,
              'status', tg.status
            )
          )
          from (
            select *
            from table_grants
            order by schema_name, name
            offset ${(0,t.literal)(r)}
            limit ${(0,t.literal)(n)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var i=e.i(46932),s=e.i(818135),l=e.i(714403);async function o({projectRef:e,connectionString:t,schema:a},r){if(!e)throw Error("projectRef is required");let i=n({schema:a}),{result:s}=await (0,l.executeSql)({projectRef:e,connectionString:t,sql:i,queryKey:["default-privileges-state"]},r);return 3===s[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:t,schema:a},{enabled:r=!0}={})=>(0,i.queryOptions)({queryKey:s.privilegeKeys.defaultPrivileges(e,a),queryFn:({signal:r})=>o({projectRef:e,connectionString:t,schema:a},r),enabled:r&&void 0!==e})],768441)},691337,e=>{"use strict";var t=e.i(850036),a=e.i(705541),r=e.i(964574),n=e.i(739114),i=e.i(509847),s=e.i(714403);async function l({projectRef:e,connectionString:a,payload:r}){let n=new Headers;a&&n.set("x-connection-encrypted",a);let{sql:i}=t.default.policies.create(r),{result:o}=await (0,s.executeSql)({projectRef:e,connectionString:a,sql:i,queryKey:["policy","create"]});return o}e.s(["createDatabasePolicy",0,l,"useDatabasePolicyCreateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,r){let{projectRef:n}=a;await o.invalidateQueries({queryKey:i.databasePoliciesKeys.list(n)}),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to create database policy: ${e.message}`):t(e,a,r)},...s})}])},41921,e=>{"use strict";e.i(850036);var t=e.i(479084),a=e.i(460224),r=e.i(931078),n=e.i(824183);e.i(705541),e.i(739114),e.i(234745),e.i(10429),e.i(237948);e.s(["acceptGeneratedPolicy",0,e=>({...e,definition:void 0===e.definition?void 0:(0,t.acceptUntrustedSql)(e.definition),check:void 0===e.check?void 0:(0,t.acceptUntrustedSql)(e.check)}),"createPayloadForCreatePolicy",0,e=>{let{name:a,schema:r,table:n,command:i,definition:s,check:l,roles:o}=e;return{name:a,schema:r,table:n,action:"PERMISSIVE",command:i||void 0,definition:s?(0,t.untrustedSql)(s):void 0,check:l?(0,t.untrustedSql)(l):void 0,roles:o.length>0?o:void 0}},"createPayloadForUpdatePolicy",0,(e,a)=>{let{definition:r,check:i}=e,s=r?r.replace(/\s+/g," ").trim():r,l=i?i.replace(/\s+/g," ").trim():i,o={id:a.id};return(0,n.default)(e.name,a.name)||(o.name=e.name),(0,n.default)(s,a.definition)||(o.definition=s?(0,t.untrustedSql)(s):void 0),(0,n.default)(l,a.check)||(o.check=l?(0,t.untrustedSql)(l):void 0),(0,n.default)(e.roles,a.roles)||(0===e.roles.length?o.roles=["public"]:o.roles=e.roles||void 0),o},"createSQLPolicy",0,(e,t)=>{let{definition:i,check:s}=e,l={...e,definition:i?i.replace(/\s+/g," ").trim():void 0===i?null:i,check:s?s.replace(/\s+/g," ").trim():void 0===s?null:s};if(!t||(0,r.default)(t))return(e=>{let{name:t,definition:a,check:r,command:n,schema:i,table:s}=e,l=0===e.roles.length?["public"]:e.roles;return{description:`Add policy for the ${n} operation under the policy "${t}"`,statement:`CREATE POLICY "${t}" ON "${i}"."${s}"
AS PERMISSIVE FOR ${n}
TO ${l.join(", ")}
${a?`USING (${a})`:""}
${r?`WITH CHECK (${r})`:""}`}})(l);if((0,n.default)(e,t))return{};let o={};return((0,n.default)(l.name,t.name)||(o.name=l.name),(0,n.default)(l.definition,t.definition)||(o.definition=l.definition),(0,n.default)(l.check,t.check)||(o.check=l.check),(0,n.default)(l.roles,t.roles)||(o.roles=l.roles),(0,r.default)(o))?{}:((e,t)=>{let{name:r,schema:n,table:i}=e,s=(0,a.default)(t,["definition"]),l=(0,a.default)(t,["check"]),o=(0,a.default)(t,["name"]),c=(0,a.default)(t,["roles"]),d=Object.keys(t),u=`Update policy's ${1===d.length?d[0]:`${d.slice(0,d.length-1).join(", ")} and ${d[d.length-1]}`} `,p=0===(t?.roles??[]).length?["public"]:t.roles,m=`ALTER POLICY "${r}" ON "${n}"."${i}"`;return{description:u,statement:["BEGIN;",...s?[`  ${m} USING (${t.definition});`]:[],...l?[`  ${m} WITH CHECK (${t.check});`]:[],...c?[`  ${m} TO ${p.join(", ")};`]:[],...o?[`  ${m} RENAME TO "${t.name}";`]:[],"COMMIT;"].join("\n")}})(l,o)}],41921)},64102,e=>{"use strict";var t=e.i(221628),a=e.i(416340),r=e.i(843778);let n=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:a,header:r,disabled:n,className:i})=>{let s=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${n?" opacity-30":" opacity-100"}`,`${i}`];return(0,t.jsxs)("div",{id:a,className:s.join(" "),children:[r,e]})},"FormSectionContent",0,({children:e,loading:r=!0,loaders:i,fullWidth:s,className:l})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${s&&"col-span-12!"}
        ${l}
      `,children:r?i?Array(i).fill(0).map((e,a)=>(0,t.jsx)(n,{},a)):a.Children.map(e,(e,a)=>(0,t.jsx)(n,{},a)):e}),"FormSectionLabel",0,({children:e,className:a="",description:n})=>void 0!==n?(0,t.jsxs)("div",{className:(0,r.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",a),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),n]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${a}`,children:e})])},101369,e=>{"use strict";var t=e.i(221628),a=e.i(843778);let r=({max:e=100,value:r=0,barClass:n="bg-foreground",bgClass:i="",type:s="vertical",borderClass:l="",labelBottom:o="",labelBottomClass:c="tabular-nums",labelTop:d="",labelTopClass:u=""})=>{if("horizontal"===s){let s=Number(r/e*100),p=`${s}%`,m=o||d;return(0,t.jsxs)("div",{className:"flex flex-col w-full",children:[m&&(0,t.jsxs)("div",{className:"flex align-baseline justify-between pb-1 space-x-8",children:[(0,t.jsx)("p",{className:(0,a.cn)("text-foreground text-sm truncate capitalize-sentence",d.length>0&&"max-w-[75%]",c),children:o}),(0,t.jsx)("p",{className:(0,a.cn)("text-foreground-light text-sm",u),children:d})]}),(0,t.jsx)("div",{className:`relative rounded-sm h-1 overflow-hidden w-full border p-0 ${i||"bg-surface-400"} ${l||"border-none"}`,children:(0,t.jsx)("div",{className:`absolute rounded-sm inset-x-0 bottom-0 h-1 ${n} transition-all`,style:{width:p}})})]})}{let a=Number(r/e*35);return a<2&&(a=2),(0,t.jsx)("div",{className:`relative rounded-sm w-5 overflow-hidden border p-1 ${i||"bg-gray-400"} ${l||"border-none"}`,style:{height:35},children:(0,t.jsx)("div",{className:`absolute inset-x-0 bottom-0 w-5 ${n}`,style:{height:a}})})}};e.s(["SparkBar",0,r,"default",0,r])},577846,(e,t,a)=>{var r=e.r(714530);t.exports=function(e,t){return r(t,function(t){return e[t]})}},943262,(e,t,a)=>{var r=e.r(577846),n=e.r(375493);t.exports=function(e){return null==e?[]:r(e,n(e))}},690707,(e,t,a)=>{var r=e.r(491761),n=e.r(775484),i=e.r(141892),s=e.r(684912),l=e.r(943262),o=Math.max;t.exports=function(e,t,a,c){e=n(e)?e:l(e),a=a&&!c?s(a):0;var d=e.length;return a<0&&(a=o(d+a,0)),i(e)?a<=d&&e.indexOf(t,a)>-1:!!d&&r(e,t,a)>-1}},976676,e=>{"use strict";let t=(0,e.i(679709).default)("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);e.s(["FileText",0,t],976676)},554222,e=>{"use strict";var t=e.i(221628),a=e.i(344580),r=e.i(416340),n=e.i(67318),i=e.i(739114),s=e.i(837710),l=e.i(253214),o=e.i(20482),c=e.i(348481),d=e.i(538482),u=e.i(531837),p=e.i(647307),m=e.i(635494);let f=u.object({name:u.string().min(1,"Please provide a name for your schema")});e.s(["SchemaEditor",0,({visible:e,onSuccess:u,closePanel:h})=>{let{data:g}=(0,m.useSelectedProjectQuery)(),{mutateAsync:y,isPending:v}=(0,p.useSchemaCreateMutation)(),x=async e=>{if(void 0===g)return console.error("Project is required");try{await y({projectRef:g.ref,connectionString:g.connectionString,name:e.name}),u(e.name),i.toast.success(`Successfully created schema "${e.name}"`)}catch(e){i.toast.error(`Failed to create schema: ${e}`)}},b=(0,n.useForm)({resolver:(0,a.zodResolver)(f),defaultValues:{name:""}}),{reset:_}=b;(0,r.useEffect)(()=>{e&&_()},[_,e]);let S="schema-form";return(0,t.jsx)(l.Dialog,{open:e,onOpenChange:h,children:(0,t.jsxs)(l.DialogContent,{className:"sm:max-w-[425px]",children:[(0,t.jsx)(l.DialogHeader,{children:(0,t.jsx)(l.DialogTitle,{children:"Create a new schema"})}),(0,t.jsx)(l.DialogSectionSeparator,{}),(0,t.jsx)(l.DialogSection,{children:(0,t.jsx)(o.Form,{...b,children:(0,t.jsx)("form",{id:S,onSubmit:b.handleSubmit(x),className:"grow px-0",children:(0,t.jsx)(o.FormField,{control:b.control,name:"name",render:({field:e})=>(0,t.jsx)(d.FormItemLayout,{layout:"vertical",label:"Schema name",children:(0,t.jsx)(o.FormControl,{children:(0,t.jsx)(c.Input,{...e})})})})})})}),(0,t.jsxs)(l.DialogFooter,{children:[(0,t.jsx)(s.Button,{type:"default",onClick:()=>{b.reset(),h()},disabled:v,children:"Cancel"}),(0,t.jsx)(s.Button,{type:"primary",form:S,htmlType:"submit",loading:v,disabled:v,children:"Save"})]})]})})}])},686255,e=>{"use strict";e.s(["enumeratedTypesKeys",0,{list:e=>["projects",e,"enumerated-types"]}])},155482,e=>{"use strict";var t=e.i(248593),a=e.i(125356),r=e.i(686255),n=e.i(234745);async function i({projectRef:e,connectionString:a},r){if(!e)throw Error("projectRef is required");let s=new Headers;a&&s.set("x-connection-encrypted",a);let{data:l,error:o}=await (0,n.get)("/platform/pg-meta/{ref}/types",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:Object.fromEntries(s),signal:r});return o&&(0,n.handleError)(o),l}e.s(["useEnumeratedTypesQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...s}={})=>(0,a.useQuery)({queryKey:r.enumeratedTypesKeys.list(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a),enabled:n&&void 0!==e,...s})])},569033,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(124416);let r=()=>{let[e,r]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_INLINE_EDITOR,!1);return{inlineEditorEnabled:e??!1,setInlineEditorEnabled:r}},n=()=>{let[e,r]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_QUEUE_OPERATIONS,!1);return{isQueueOperationsEnabled:e??!1,setIsQueueOperationsEnabled:r}};e.s(["useIsInlineEditorEnabled",0,()=>{let{inlineEditorEnabled:e}=r();return e??!1},"useIsInlineEditorSetting",0,r,"useIsQueueOperationsEnabled",0,()=>{let{isQueueOperationsEnabled:e}=n();return e??!1},"useIsQueueOperationsSetting",0,n])},438756,(e,t,a)=>{t.exports=function(e){return null===e}},754468,e=>{"use strict";let t=(0,e.i(679709).default)("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);e.s(["Home",0,t],754468)}]);

//# debugId=40a61daa-1223-d161-a5fa-c5167642a096
//# sourceMappingURL=17hqcn-6y889f.js.map