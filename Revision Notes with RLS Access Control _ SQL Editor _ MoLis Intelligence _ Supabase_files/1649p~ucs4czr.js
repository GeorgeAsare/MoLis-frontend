;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="d9dc645d-40d9-fe11-26d4-68dda191502a")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,67574,e=>{"use strict";let t=(0,e.i(679709).default)("Book",[["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]]);e.s(["Book",0,t],67574)},804222,e=>{"use strict";var t=e.i(416340);e.s(["useStaticEffectEvent",0,e=>{let a=(0,t.useRef)(e);return(0,t.useLayoutEffect)(()=>{a.current=e}),(0,t.useCallback)((...e)=>a.current(...e),[])}])},681328,e=>{"use strict";e.s(["EMPTY_ARR",0,[],"EMPTY_OBJ",0,{},"noop",0,function(){}])},463333,208747,e=>{"use strict";var t=e.i(221628);e.i(128328);var a=e.i(657588),s=e.i(947748),r=e.i(802715),i=e.i(197451),n=e.i(416340);let o=()=>{let e=(0,a.useFlag)("unifiedLogs"),t=(0,a.useFlag)("pgdeltaDiff"),r=(0,a.useFlag)("platformWebhooks"),i=(0,a.useFlag)("jitDbAccess");return[{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_RLS_TESTER,name:"RLS Tester",discussionsUrl:"https://github.com/orgs/supabase/discussions/45233",enabled:!0,isNew:!0,isPlatformOnly:!1,isDefaultOptIn:!1},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_UNIFIED_LOGS,name:"Updated Logs interface",discussionsUrl:"https://github.com/orgs/supabase/discussions/37234",enabled:e,isNew:!0,isPlatformOnly:!0,isDefaultOptIn:!1},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_ADVISOR_RULES,name:"Disable Advisor rules",discussionsUrl:void 0,enabled:!0,isNew:!1,isPlatformOnly:!0,isDefaultOptIn:!1},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_PG_DELTA_DIFF,name:"PG Delta Diff",discussionsUrl:void 0,isNew:!1,isPlatformOnly:!0,isDefaultOptIn:!0,enabled:t},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_PLATFORM_WEBHOOKS,name:"Platform webhooks",discussionsUrl:void 0,isNew:!0,isPlatformOnly:!0,isDefaultOptIn:!1,enabled:r},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_JIT_DB_ACCESS,name:"Temporary access",discussionsUrl:void 0,isNew:!0,isPlatformOnly:!0,isDefaultOptIn:!1,enabled:i},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_CLS,name:"Column-level privileges",discussionsUrl:"https://github.com/orgs/supabase/discussions/20295",enabled:!0,isNew:!1,isPlatformOnly:!1,isDefaultOptIn:!1},{key:s.LOCAL_STORAGE_KEYS.UI_PREVIEW_MARKETPLACE,name:"Marketplace",discussionsUrl:void 0,enabled:!0,isNew:!0,isPlatformOnly:!1,isDefaultOptIn:!0}].sort((e,t)=>Number(t.isNew)-Number(e.isNew))};e.s(["useFeaturePreviews",0,o],208747);var l=e.i(804222),u=e.i(681328);let d=(0,n.createContext)({flags:u.EMPTY_OBJ,onUpdateFlag:r.default}),c=()=>(0,n.useContext)(d);e.s(["FeaturePreviewContextProvider",0,({children:e})=>{let{hasLoaded:s}=(0,n.useContext)(a.FeatureFlagContext),r=o(),[i,u]=(0,n.useState)(()=>r.reduce((e,t)=>({...e,[t.key]:!1}),{})),c=(0,l.useStaticEffectEvent)(()=>{u(r.reduce((e,t)=>{let a=t.isDefaultOptIn;try{let s=window.localStorage.getItem(t.key);return{...e,[t.key]:s?"true"===s:a}}catch{return{...e,[t.key]:a}}},{}))});return(0,n.useEffect)(()=>{c()},[s,c]),(0,t.jsx)(d.Provider,{value:{flags:i,onUpdateFlag:(e,t)=>{try{window.localStorage&&window.localStorage.setItem(e,t?"true":"false")}catch{}u({...i,[e]:t})}},children:e})},"useFeaturePreviewContext",0,c,"useFeaturePreviewModal",0,()=>{let e=o(),[t,a]=(0,i.useQueryState)("featurePreviewModal"),s=t?.trim()??null,r=null!==s,l=s||e[0].key,u=(0,n.useCallback)(e=>{a(e)},[a]),d=(0,n.useCallback)(e=>{e?u(l):a(null)},[u,a,l]);return(0,n.useMemo)(()=>({showFeaturePreviewModal:r,selectedFeatureKey:l,selectFeaturePreview:u,toggleFeaturePreviewModal:d}),[r,l,u,d])},"useIsAdvisorRulesEnabled",0,()=>{let{flags:e}=c();return e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_ADVISOR_RULES]},"useIsColumnLevelPrivilegesEnabled",0,()=>{let{flags:e}=c();return e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_CLS]},"useIsJitDbAccessEnabled",0,()=>{let{flags:e}=c();return(0,a.useFlag)("jitDbAccess")&&e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_JIT_DB_ACCESS]},"useIsMarketplaceEnabled",0,()=>{let{flags:e}=c();return(0,a.useFlag)("marketplaceIntegrations")&&e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_MARKETPLACE]},"useIsPgDeltaDiffEnabled",0,()=>{let{flags:e}=c();return(0,a.useFlag)("pgdeltaDiff")&&e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_PG_DELTA_DIFF]},"useIsPlatformWebhooksEnabled",0,()=>{let{flags:e}=c();return(0,a.useFlag)("platformWebhooks")&&e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_PLATFORM_WEBHOOKS]},"useIsRLSTesterEnabled",0,()=>{let{flags:e}=c();return e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_RLS_TESTER]},"useUnifiedLogsPreview",0,()=>{let{flags:e,onUpdateFlag:t}=c(),{hasLoaded:r}=(0,n.useContext)(a.FeatureFlagContext),i=(0,a.useFlag)("unifiedLogs");return{isEnabled:i&&e[s.LOCAL_STORAGE_KEYS.UI_PREVIEW_UNIFIED_LOGS],isEligible:i,isLoading:!r,enable:()=>t(s.LOCAL_STORAGE_KEYS.UI_PREVIEW_UNIFIED_LOGS,!0),disable:()=>t(s.LOCAL_STORAGE_KEYS.UI_PREVIEW_UNIFIED_LOGS,!1)}}],463333)},491167,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0});var s={VALID_LOADERS:function(){return i},imageConfigDefault:function(){return n}};for(var r in s)Object.defineProperty(a,r,{enumerable:!0,get:s[r]});let i=["default","imgix","cloudinary","akamai","custom"],n={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],path:"/_next/image",loader:"default",loaderFile:"",domains:[],disableStaticImages:!1,minimumCacheTTL:14400,formats:["image/webp"],maximumDiskCacheSize:void 0,maximumRedirects:3,maximumResponseBody:5e7,dangerouslyAllowLocalIP:!1,dangerouslyAllowSVG:!1,contentSecurityPolicy:"script-src 'none'; frame-src 'none'; sandbox;",contentDispositionType:"attachment",localPatterns:void 0,remotePatterns:[],qualities:[75],unoptimized:!1,customCacheHandler:!1}},866268,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"ImageConfigContext",{enumerable:!0,get:function(){return i}});let s=e.r(2879)._(e.r(416340)),r=e.r(491167),i=s.default.createContext(r.imageConfigDefault)},503947,(e,t,a)=>{"use strict";function s(e,t){let a=e||75;return t?.qualities?.length?t.qualities.reduce((e,t)=>Math.abs(t-a)<Math.abs(e-a)?t:e,t.qualities[0]):a}Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"findClosestQuality",{enumerable:!0,get:function(){return s}})},235324,(e,t,a)=>{"use strict";function s({widthInt:e,heightInt:t,blurWidth:a,blurHeight:r,blurDataURL:i,objectFit:n}){let o=a?40*a:e,l=r?40*r:t,u=o&&l?`viewBox='0 0 ${o} ${l}'`:"";return`%3Csvg xmlns='http://www.w3.org/2000/svg' ${u}%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='${u?"none":"contain"===n?"xMidYMid":"cover"===n?"xMidYMid slice":"none"}' style='filter: url(%23b);' href='${i}'/%3E%3C/svg%3E`}Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"getImageBlurSvg",{enumerable:!0,get:function(){return s}})},281075,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"getImgProps",{enumerable:!0,get:function(){return u}}),e.r(160469);let s=e.r(391077),r=e.r(235324),i=e.r(491167),n=["-moz-initial","fill","none","scale-down",void 0];function o(e){return void 0!==e.default}function l(e){return void 0===e?e:"number"==typeof e?Number.isFinite(e)?e:NaN:"string"==typeof e&&/^[0-9]+$/.test(e)?parseInt(e,10):NaN}function u({src:e,sizes:t,unoptimized:a=!1,priority:d=!1,preload:c=!1,loading:p,className:m,quality:g,width:_,height:f,fill:h=!1,style:E,overrideSrc:b,onLoad:S,onLoadingComplete:v,placeholder:y="empty",blurDataURL:T,fetchPriority:R,decoding:O="async",layout:w,objectFit:A,objectPosition:I,lazyBoundary:N,lazyRoot:L,...C},x){var P;let j,k,F,{imgConf:q,showAltText:$,blurComplete:U,defaultLoader:G}=x,D=q||i.imageConfigDefault;if("allSizes"in D)j=D;else{let e=[...D.deviceSizes,...D.imageSizes].sort((e,t)=>e-t),t=D.deviceSizes.sort((e,t)=>e-t),a=D.qualities?.sort((e,t)=>e-t);j={...D,allSizes:e,deviceSizes:t,qualities:a}}if(void 0===G)throw Object.defineProperty(Error("images.loaderFile detected but the file is missing default export.\nRead more: https://nextjs.org/docs/messages/invalid-images-config"),"__NEXT_ERROR_CODE",{value:"E163",enumerable:!1,configurable:!0});let M=C.loader||G;delete C.loader,delete C.srcSet;let W="__next_img_default"in M;if(W){if("custom"===j.loader)throw Object.defineProperty(Error(`Image with src "${e}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),"__NEXT_ERROR_CODE",{value:"E252",enumerable:!1,configurable:!0})}else{let e=M;M=t=>{let{config:a,...s}=t;return e(s)}}if(w){"fill"===w&&(h=!0);let e={intrinsic:{maxWidth:"100%",height:"auto"},responsive:{width:"100%",height:"auto"}}[w];e&&(E={...E,...e});let a={responsive:"100vw",fill:"100vw"}[w];a&&!t&&(t=a)}let V="",H=l(_),K=l(f);if((P=e)&&"object"==typeof P&&(o(P)||void 0!==P.src)){let t=o(e)?e.default:e;if(!t.src)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E460",enumerable:!1,configurable:!0});if(!t.height||!t.width)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E48",enumerable:!1,configurable:!0});if(k=t.blurWidth,F=t.blurHeight,T=T||t.blurDataURL,V=t.src,!h)if(H||K){if(H&&!K){let e=H/t.width;K=Math.round(t.height*e)}else if(!H&&K){let e=K/t.height;H=Math.round(t.width*e)}}else H=t.width,K=t.height}let B=!d&&!c&&("lazy"===p||void 0===p);(!(e="string"==typeof e?e:V)||e.startsWith("data:")||e.startsWith("blob:"))&&(a=!0,B=!1),j.unoptimized&&(a=!0),W&&!j.dangerouslyAllowSVG&&e.split("?",1)[0].endsWith(".svg")&&(a=!0);let Q=l(g),z=Object.assign(h?{position:"absolute",height:"100%",width:"100%",left:0,top:0,right:0,bottom:0,objectFit:A,objectPosition:I}:{},$?{}:{color:"transparent"},E),Y=U||"empty"===y?null:"blur"===y?`url("data:image/svg+xml;charset=utf-8,${(0,r.getImageBlurSvg)({widthInt:H,heightInt:K,blurWidth:k,blurHeight:F,blurDataURL:T||"",objectFit:z.objectFit})}")`:`url("${y}")`,X=n.includes(z.objectFit)?"fill"===z.objectFit?"100% 100%":"cover":z.objectFit,J=Y?{backgroundSize:X,backgroundPosition:z.objectPosition||"50% 50%",backgroundRepeat:"no-repeat",backgroundImage:Y}:{},Z=function({config:e,src:t,unoptimized:a,width:r,quality:i,sizes:n,loader:o}){if(a){if(t.startsWith("/")&&!t.startsWith("//")){let e=(0,s.getDeploymentId)();if(e){let a=t.indexOf("?");if(-1!==a){let s=new URLSearchParams(t.slice(a+1));s.get("dpl")||(s.append("dpl",e),t=t.slice(0,a)+"?"+s.toString())}else t+=`?dpl=${e}`}}return{src:t,srcSet:void 0,sizes:void 0}}let{widths:l,kind:u}=function({deviceSizes:e,allSizes:t},a,s){if(s){let a=/(^|\s)(1?\d?\d)vw/g,r=[];for(let e;e=a.exec(s);)r.push(parseInt(e[2]));if(r.length){let a=.01*Math.min(...r);return{widths:t.filter(t=>t>=e[0]*a),kind:"w"}}return{widths:t,kind:"w"}}return"number"!=typeof a?{widths:e,kind:"w"}:{widths:[...new Set([a,2*a].map(e=>t.find(t=>t>=e)||t[t.length-1]))],kind:"x"}}(e,r,n),d=l.length-1;return{sizes:n||"w"!==u?n:"100vw",srcSet:l.map((a,s)=>`${o({config:e,src:t,quality:i,width:a})} ${"w"===u?a:s+1}${u}`).join(", "),src:o({config:e,src:t,quality:i,width:l[d]})}}({config:j,src:e,unoptimized:a,width:H,quality:Q,sizes:t,loader:M}),ee=B?"lazy":p;return{props:{...C,loading:ee,fetchPriority:R,width:H,height:K,decoding:O,className:m,style:{...z,...J},sizes:Z.sizes,srcSet:Z.srcSet,src:b||Z.src},meta:{unoptimized:a,preload:c||d,placeholder:y,fill:h}}}},306706,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"default",{enumerable:!0,get:function(){return n}});let s=e.r(503947),r=e.r(391077);function i({config:e,src:t,width:a,quality:n}){let o=(0,r.getDeploymentId)();if(t.startsWith("/")&&!t.startsWith("//")){let e=t.indexOf("?");if(-1!==e){let a=new URLSearchParams(t.slice(e+1)),s=a.get("dpl");if(s){o=s,a.delete("dpl");let r=a.toString();t=t.slice(0,e)+(r?"?"+r:"")}}}if(t.startsWith("/")&&t.includes("?")&&e.localPatterns?.length===1&&"**"===e.localPatterns[0].pathname&&""===e.localPatterns[0].search)throw Object.defineProperty(Error(`Image with src "${t}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),"__NEXT_ERROR_CODE",{value:"E871",enumerable:!1,configurable:!0});let l=(0,s.findClosestQuality)(n,e);return`${e.path}?url=${encodeURIComponent(t)}&w=${a}&q=${l}${t.startsWith("/")&&o?`&dpl=${o}`:""}`}i.__next_img_default=!0;let n=i},559545,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0}),Object.defineProperty(a,"Image",{enumerable:!0,get:function(){return S}});let s=e.r(2879),r=e.r(887602),i=e.r(221628),n=r._(e.r(416340)),o=s._(e.r(149285)),l=s._(e.r(71123)),u=e.r(281075),d=e.r(491167),c=e.r(866268);e.r(160469);let p=e.r(264069),m=s._(e.r(306706)),g=e.r(176063),_={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/dashboard/_next/image",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!1};function f(e,t,a,s,r,i,n){let o=e?.src;e&&e["data-loaded-src"]!==o&&(e["data-loaded-src"]=o,("decode"in e?e.decode():Promise.resolve()).catch(()=>{}).then(()=>{if(e.parentElement&&e.isConnected){if("empty"!==t&&r(!0),a?.current){let t=new Event("load");Object.defineProperty(t,"target",{writable:!1,value:e});let s=!1,r=!1;a.current({...t,nativeEvent:t,currentTarget:e,target:e,isDefaultPrevented:()=>s,isPropagationStopped:()=>r,persist:()=>{},preventDefault:()=>{s=!0,t.preventDefault()},stopPropagation:()=>{r=!0,t.stopPropagation()}})}s?.current&&s.current(e)}}))}function h(e){return n.use?{fetchPriority:e}:{fetchpriority:e}}"u"<typeof window&&(globalThis.__NEXT_IMAGE_IMPORTED=!0);let E=(0,n.forwardRef)(({src:e,srcSet:t,sizes:a,height:s,width:r,decoding:o,className:l,style:u,fetchPriority:d,placeholder:c,loading:p,unoptimized:m,fill:_,onLoadRef:E,onLoadingCompleteRef:b,setBlurComplete:S,setShowAltText:v,sizesInput:y,onLoad:T,onError:R,...O},w)=>{let A=(0,n.useCallback)(e=>{e&&(R&&(e.src=e.src),e.complete&&f(e,c,E,b,S,m,y))},[e,c,E,b,S,R,m,y]),I=(0,g.useMergedRef)(w,A);return(0,i.jsx)("img",{...O,...h(d),loading:p,width:r,height:s,decoding:o,"data-nimg":_?"fill":"1",className:l,style:u,sizes:a,srcSet:t,src:e,ref:I,onLoad:e=>{f(e.currentTarget,c,E,b,S,m,y)},onError:e=>{v(!0),"empty"!==c&&S(!0),R&&R(e)}})});function b({isAppRouter:e,imgAttributes:t}){let a={as:"image",imageSrcSet:t.srcSet,imageSizes:t.sizes,crossOrigin:t.crossOrigin,referrerPolicy:t.referrerPolicy,...h(t.fetchPriority)};return e&&o.default.preload?(o.default.preload(t.src,a),null):(0,i.jsx)(l.default,{children:(0,i.jsx)("link",{rel:"preload",href:t.srcSet?void 0:t.src,...a},"__nimg-"+t.src+t.srcSet+t.sizes)})}let S=(0,n.forwardRef)((e,t)=>{let a=(0,n.useContext)(p.RouterContext),s=(0,n.useContext)(c.ImageConfigContext),r=(0,n.useMemo)(()=>{let e=_||s||d.imageConfigDefault,t=[...e.deviceSizes,...e.imageSizes].sort((e,t)=>e-t),a=e.deviceSizes.sort((e,t)=>e-t),r=e.qualities?.sort((e,t)=>e-t);return{...e,allSizes:t,deviceSizes:a,qualities:r,localPatterns:"u"<typeof window?s?.localPatterns:e.localPatterns}},[s]),{onLoad:o,onLoadingComplete:l}=e,g=(0,n.useRef)(o);(0,n.useEffect)(()=>{g.current=o},[o]);let f=(0,n.useRef)(l);(0,n.useEffect)(()=>{f.current=l},[l]);let[h,S]=(0,n.useState)(!1),[v,y]=(0,n.useState)(!1),{props:T,meta:R}=(0,u.getImgProps)(e,{defaultLoader:m.default,imgConf:r,blurComplete:h,showAltText:v});return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(E,{...T,unoptimized:R.unoptimized,placeholder:R.placeholder,fill:R.fill,onLoadRef:g,onLoadingCompleteRef:f,setBlurComplete:S,setShowAltText:y,sizesInput:e.sizes,ref:t}),R.preload?(0,i.jsx)(b,{isAppRouter:!a,imgAttributes:T}):null]})});("function"==typeof a.default||"object"==typeof a.default&&null!==a.default)&&void 0===a.default.__esModule&&(Object.defineProperty(a.default,"__esModule",{value:!0}),Object.assign(a.default,a),t.exports=a.default)},396157,(e,t,a)=>{"use strict";Object.defineProperty(a,"__esModule",{value:!0});var s={default:function(){return d},getImageProps:function(){return u}};for(var r in s)Object.defineProperty(a,r,{enumerable:!0,get:s[r]});let i=e.r(2879),n=e.r(281075),o=e.r(559545),l=i._(e.r(306706));function u(e){let{props:t}=(0,n.getImgProps)(e,{defaultLoader:l.default,imgConf:{deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/dashboard/_next/image",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!1}});for(let[e,a]of Object.entries(t))void 0===a&&delete t[e];return{props:t}}let d=o.Image},188139,(e,t,a)=>{t.exports=e.r(396157)},967052,e=>{"use strict";e.i(128328);var t=e.i(709364),a=e.i(896779),s=e.i(416340),r=e.i(265735),i=e.i(635494),n=e.i(10429);e.s(["useTrack",0,()=>{let{data:e}=(0,i.useSelectedProjectQuery)(),{data:o}=(0,r.useSelectedOrganizationQuery)(),l=(0,a.useRouter)();return(0,s.useCallback)((a,...s)=>{let[r,i]=s,u={...e?.ref&&{project:e.ref},...o?.slug&&{organization:o.slug},...i},d={action:a,...r&&{properties:r},...u&&{groups:u}};(0,t.sendTelemetryEvent)(n.API_URL,d,l.pathname)},[e?.ref,o?.slug,l.pathname])}])},912793,142119,e=>{"use strict";e.i(128328);var t=e.i(667551),a=e.i(125356);let s={cliReleaseVersion:()=>["cliReleaseVersion"],defaultRegion:(e,t)=>["defaultRegion",[e,t]],ipAddress:()=>["ip-address"],clockSkew:()=>["clock-skew"],enabledFeaturesOverride:()=>["enabled-features-override"]};e.s(["miscKeys",0,s],142119);var r=e.i(234745),i=e.i(10429);async function n(e){let t=await (0,r.fetchHandler)(`${i.BASE_PATH}/api/enabled-features-overrides`,{signal:e});if(!t.ok)throw Error(`Failed to fetch enabled features override (${t.status})`);return await t.json()}var o=e.i(432478);e.s(["useIsFeatureEnabled",0,function(e){let{profile:r}=(0,o.useProfile)(),{data:l}=(({enabled:e=!0,...t}={})=>(0,a.useQuery)({queryKey:s.enabledFeaturesOverride(),queryFn:({signal:e})=>n(e),enabled:e&&!i.IS_PLATFORM,staleTime:1/0,gcTime:1/0,refetchOnMount:!1,refetchOnWindowFocus:!1,refetchOnReconnect:!1,...t}))(),u=[...r?.disabled_features??[],...l?.disabled_features??[]];return Array.isArray(e),(0,t.isFeatureEnabled)(e,u)}],912793)},469099,e=>{"use strict";let t=(0,e.i(679709).default)("Boxes",[["path",{d:"M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",key:"lc1i9w"}],["path",{d:"m7 16.5-4.74-2.85",key:"1o9zyk"}],["path",{d:"m7 16.5 5-3",key:"va8pkn"}],["path",{d:"M7 16.5v5.17",key:"jnp8gn"}],["path",{d:"M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",key:"8zsnat"}],["path",{d:"m17 16.5-5-3",key:"8arw3v"}],["path",{d:"m17 16.5 4.74-2.85",key:"8rfmw"}],["path",{d:"M17 16.5v5.17",key:"k6z78m"}],["path",{d:"M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",key:"1xygjf"}],["path",{d:"M12 8 7.26 5.15",key:"1vbdud"}],["path",{d:"m12 8 4.74-2.85",key:"3rx089"}],["path",{d:"M12 13.5V8",key:"1io7kd"}]]);e.s(["Boxes",0,t],469099)},667286,e=>{"use strict";e.s(["databaseExtensionsKeys",0,{list:e=>["projects",e,"database-extensions"]}])},450972,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(125356),s=e.i(667286),r=e.i(714403),i=e.i(635494);e.i(10429);var n=e.i(837508);async function o({projectRef:e,connectionString:a},s){let i=(0,t.getDatabaseExtensionsSQL)(),{result:n}=await (0,r.executeSql)({projectRef:e,connectionString:a,sql:i,queryKey:["database-extensions"]},s);return n}e.s(["useDatabaseExtensionsQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...l}={})=>{let{data:u}=(0,i.useSelectedProjectQuery)(),d=u?.status===n.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,a.useQuery)({queryKey:s.databaseExtensionsKeys.list(e),queryFn:({signal:a})=>o({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e&&d,...l})}])},12214,e=>{"use strict";var t=e.i(531837),a=e.i(615515);let s=t.object({index:t.number(),columns:t.array(t.object({name:t.string(),type:t.string()})),is_new_schema:t.boolean(),schema:t.string(),schema_name:t.string(),table_name:t.string(),object:t.any().optional()}).passthrough(),r=e=>Object.fromEntries(e.map(e=>e.split("=")));function i(e,t){if("wasm_fdw_handler"===e.handlerName){let a=r(t?.server_options??[]);return e.server.options.find(e=>"fdw_package_name"===e.name)?.defaultValue===a.fdw_package_name}return e.handlerName===t?.handler}e.s(["NewTable",0,{},"convertKVStringArrayToJson",0,r,"formatWrapperTables",0,(e,t)=>(e?.tables??[]).map(s=>{let r=0,i=Object.fromEntries(s.options.map(e=>e.split("=")));switch(e.handler){case a.WRAPPER_HANDLERS.STRIPE:r=t?.tables.findIndex(e=>e.options.find(e=>"object"===e.name)?.defaultValue===i.object)??0;break;case a.WRAPPER_HANDLERS.FIREBASE:r="auth/users"===i.object?t?.tables.findIndex(e=>e.options.find(e=>"auth/users"===e.defaultValue))??0:t?.tables.findIndex(e=>"Firestore Collection"===e.label)??0;case a.WRAPPER_HANDLERS.S3:case a.WRAPPER_HANDLERS.AIRTABLE:case a.WRAPPER_HANDLERS.LOGFLARE:case a.WRAPPER_HANDLERS.BIG_QUERY:case a.WRAPPER_HANDLERS.CLICK_HOUSE:}return{...i,index:r,id:s.id,columns:s.columns??[],is_new_schema:!1,schema:s.schema,schema_name:s.schema,table_name:s.name}}),"getEditionFormSchema",0,e=>{let a={wrapper_name:t.string().min(1,"Please provide a name for your wrapper"),tables:t.array(s,{required_error:"Please provide at least one table"}).min(1,"Please provide at least one table")};return e.server.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.object(a)},"getTableFormSchema",0,e=>{let a={table_name:t.string().min(1,"Required"),schema:t.string().min(1,"Required"),schema_name:t.string().optional(),columns:t.array(t.object({name:t.string().min(1,"Required"),type:t.string().min(1,"Required")}))};return e.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.object(a).passthrough().superRefine((e,t)=>{"custom"!==e.schema||e.schema_name||t.addIssue({code:"custom",path:["schema_name"],message:"Required"})})},"getWrapperCreationFormSchema",0,e=>{let a={wrapper_name:t.string().min(1,"Please provide a name for your wrapper")};return e.server.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.discriminatedUnion("mode",[t.object({mode:t.literal("tables"),tables:t.array(s,{required_error:"Please provide at least one table"}).min(1,"Please provide at least one table")}).merge(t.object(a)),t.object({mode:t.literal("schema"),source_schema:t.string().min(1,"Please provide a source schema"),target_schema:t.string().min(1,"Please provide an unique target schema")}).merge(t.object(a))])},"getWrapperMetaForWrapper",0,function(e){return a.WRAPPERS.find(t=>i(t,e))},"wrapperMetaComparator",0,i])},298625,33942,584258,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=()=>t.safeSql`
    select
      s.oid as "id",
      w.fdwname as "name",
      s.srvname as "server_name",
      s.srvoptions as "server_options",
      c.proname as "handler",
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.oid::bigint,
            'schema', relnamespace::regnamespace::text,
            'name', c.relname,
            'columns', (
              select jsonb_agg(
                jsonb_build_object(
                  'name', a.attname,
                  'type', pg_catalog.format_type(a.atttypid, a.atttypmod)
                )
              )
              from pg_catalog.pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            ),
            'options', t.ftoptions
          )
        )
        from pg_catalog.pg_class c
        join pg_catalog.pg_foreign_table t on c.oid = t.ftrelid
        where c.oid = any (select t.ftrelid from pg_catalog.pg_foreign_table t where t.ftserver = s.oid)
      ) as "tables"
    from pg_catalog.pg_foreign_server s
    join pg_catalog.pg_foreign_data_wrapper w on s.srvfdw = w.oid
    join pg_catalog.pg_proc c on w.fdwhandler = c.oid;
  `;function s({wrapperMeta:e,formState:a,mode:r,tables:i,sourceSchema:n,targetSchema:o,schemaOptions:l=[]}){let u=(0,t.joinSqlFragments)(i.filter(e=>e.is_new_schema).map(e=>t.safeSql`create schema if not exists ${(0,t.ident)(e.schema_name)};`),"\n"),d=t.safeSql`
    create foreign data wrapper ${(0,t.ident)(a.wrapper_name)}
    handler ${(0,t.ident)(e.handlerName)}
    validator ${(0,t.ident)(e.validatorName)};
  `,c=e.server.options.filter(e=>e.encrypted),p=e.server.options.filter(e=>!e.encrypted),m=c.map(e=>{let s=`${a.wrapper_name}_${e.name}`,r=(0,t.literal)(a[e.name]||"");return t.safeSql`
      do $$
      begin
        -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
        -- we use Vault directly.
        if (select extversion from pg_extension where extname = 'wrappers') in (
          '0.1.0',
          '0.1.1',
          '0.1.4',
          '0.1.5',
          '0.1.6',
          '0.1.7',
          '0.1.8',
          '0.1.9',
          '0.1.10',
          '0.1.11',
          '0.1.12',
          '0.1.14',
          '0.1.15',
          '0.1.16',
          '0.1.17',
          '0.1.18',
          '0.1.19',
          '0.2.0',
          '0.3.0',
          '0.3.1',
          '0.4.0',
          '0.4.1',
          '0.4.2',
          '0.4.3',
          '0.4.4',
          '0.4.5'
        ) then
          create extension if not exists pgsodium;

          perform pgsodium.create_key(
            name := ${(0,t.literal)(s)}
          );

          perform vault.create_secret(
            new_secret := ${r},
            new_name   := ${(0,t.literal)(s)},
            new_key_id := (select id from pgsodium.valid_key where name = ${(0,t.literal)(s)})
          );
        else
          perform vault.create_secret(
            new_secret := ${r},
            new_name := ${(0,t.literal)(s)}
          );
        end if;
      end $$;
    `}),g=(0,t.joinSqlFragments)(m,"\n"),_=c.filter(e=>a[e.name]).map(e=>t.safeSql`${(0,t.ident)(e.name)} ''%s''`),f=p.filter(e=>a[e.name]).map(e=>{let s=(0,t.literal)(a[e.name]).replace(/'/g,"''");return t.safeSql`${(0,t.ident)(e.name)} ${s}`}),h=(0,t.joinSqlFragments)([..._,...f],","),E=t.safeSql`
    do $$
    declare
      -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
      -- we use Vault directly.
      is_using_old_wrappers bool;
      ${(0,t.joinSqlFragments)(c.map(e=>t.safeSql`${(0,t.ident)(`v_${e.name}`)} text;`),"\n")}
    begin
      is_using_old_wrappers := (select extversion from pg_extension where extname = 'wrappers') in (
        '0.1.0',
        '0.1.1',
        '0.1.4',
        '0.1.5',
        '0.1.6',
        '0.1.7',
        '0.1.8',
        '0.1.9',
        '0.1.10',
        '0.1.11',
        '0.1.12',
        '0.1.14',
        '0.1.15',
        '0.1.16',
        '0.1.17',
        '0.1.18',
        '0.1.19',
        '0.2.0',
        '0.3.0',
        '0.3.1',
        '0.4.0',
        '0.4.1',
        '0.4.2',
        '0.4.3',
        '0.4.4',
        '0.4.5'
      );
      ${(0,t.joinSqlFragments)(c.map(e=>t.safeSql`
              if is_using_old_wrappers then
                select id into ${(0,t.ident)(`v_${e.name}`)} from pgsodium.valid_key where name = ${(0,t.literal)(`${a.wrapper_name}_${e.name}`)} limit 1;
              else
                select id into ${(0,t.ident)(`v_${e.name}`)} from vault.secrets where name = ${(0,t.literal)(`${a.wrapper_name}_${e.name}`)} limit 1;
              end if;
            `),"\n")}
    
      execute format(
        E'create server ${(0,t.ident)(a.server_name)} foreign data wrapper ${(0,t.ident)(a.wrapper_name)} options (${h});',
        ${(0,t.joinSqlFragments)(c.filter(e=>a[e.name]).map(e=>(0,t.ident)(`v_${e.name}`)),",")}
      );
    end $$;
  `,b=(0,t.joinSqlFragments)(i.map(e=>{let s=e.columns;return t.safeSql`
        create foreign table ${(0,t.ident)(e.schema_name)}.${(0,t.ident)(e.table_name)} (
          ${(0,t.joinSqlFragments)(s.map(e=>t.safeSql`${(0,t.ident)(e.name)} ${(0,t.keyword)(e.type)}`),",")}
        )
        server ${(0,t.ident)(a.server_name)}
        options (
          ${(0,t.joinSqlFragments)(Object.entries(e).filter(([e,t])=>"table_name"!==e&&"schema_name"!==e&&"columns"!==e&&"index"!==e&&"is_new_schema"!==e&&!!t).map(([e,a])=>t.safeSql`${(0,t.ident)(e)} ${(0,t.literal)(a)}`),",")}
        );
      `}),"\n\n"),S=(0,t.joinSqlFragments)([...l,t.safeSql`strict 'true'`],", ");return t.safeSql`
    ${u}

    ${d}

    ${g}

    ${E}

    ${"tables"===r?b:t.safeSql``}

    ${"schema"===r?t.safeSql`
  import foreign schema ${(0,t.ident)(n)} from server ${(0,t.ident)(a.server_name)} into ${(0,t.ident)(o)} options (${S});
`:t.safeSql``}
  `}let r=({wrapper:e,wrapperMeta:a})=>{let s=a.server.options.filter(e=>e.encrypted).map(a=>{let s=`${e.name}_${a.name}`;return t.safeSql`
      do $$
      begin
        -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
        -- we use Vault directly.
        if (select extversion from pg_extension where extname = 'wrappers') in (
          '0.1.0',
          '0.1.1',
          '0.1.4',
          '0.1.5',
          '0.1.6',
          '0.1.7',
          '0.1.8',
          '0.1.9',
          '0.1.10',
          '0.1.11',
          '0.1.12',
          '0.1.14',
          '0.1.15',
          '0.1.16',
          '0.1.17',
          '0.1.18',
          '0.1.19',
          '0.2.0',
          '0.3.0',
          '0.3.1',
          '0.4.0',
          '0.4.1',
          '0.4.2',
          '0.4.3',
          '0.4.4',
          '0.4.5'
        ) then
          delete from vault.secrets where key_id = (select id from pgsodium.valid_key where name = ${(0,t.literal)(s)});

          delete from pgsodium.key where name = ${(0,t.literal)(s)};
        else
          delete from vault.secrets where name = ${(0,t.literal)(s)};
        end if;
      end $$;
    `}),r=(0,t.joinSqlFragments)(s,"\n");return t.safeSql`
    drop foreign data wrapper if exists ${(0,t.ident)(e.name)} cascade;

    ${r}
  `};e.s(["getCreateFDWSql",0,s,"getDeleteFDWSql",0,r,"getDropForeignTableSql",0,function({schema:e,table:a}){return t.safeSql`
drop foreign table if exists ${(0,t.ident)(e)}.${(0,t.ident)(a)};
`},"getFDWsSql",0,a,"getImportForeignSchemaSql",0,function({serverName:e,sourceSchema:a,targetSchema:s,schemaOptions:r=[]}){let i=(0,t.joinSqlFragments)([...r,t.safeSql`strict 'true'`],", ");return t.safeSql`
  import foreign schema ${(0,t.ident)(a)} from server ${(0,t.ident)(e)} into ${(0,t.ident)(s)} options (${i});
`},"getUpdateFDWSql",0,({wrapper:e,wrapperMeta:a,formState:i,tables:n})=>{let o=r({wrapper:e,wrapperMeta:a}),l=s({wrapperMeta:a,formState:i,tables:n,mode:"tables",sourceSchema:"",targetSchema:""});return t.safeSql`
    ${o}

    ${l}
  `}],33942);var i=e.i(125356);let n={list:e=>["projects",e,"fdws"]};e.s(["fdwKeys",0,n],584258);var o=e.i(714403);async function l({projectRef:e,connectionString:t},s){let r=a(),{result:i}=await (0,o.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["fdws"]},s);return i}e.s(["getFDWs",0,l,"useFDWsQuery",0,({projectRef:e,connectionString:t},{enabled:a=!0,...s}={})=>(0,i.useQuery)({queryKey:n.list(e),queryFn:({signal:a})=>l({projectRef:e,connectionString:t},a),enabled:a&&void 0!==e,...s})],298625)},986261,(e,t,a)=>{var s=e.r(781125);t.exports=function(e){return e&&e.length?s(e):[]}},392491,e=>{"use strict";e.i(850036);var t=e.i(957386),a=e.i(986261),s=e.i(539256),r=e.i(416340),i=e.i(635494),n=e.i(615515),o=e.i(12214),l=e.i(298625);let u=["auth","cron","etl","extensions","information_schema","net","pgsodium","pgsodium_masks","pgbouncer","pgtle","pgmq","realtime","storage","supabase_functions","supabase_migrations","vault","graphql","graphql_public",t.QUEUES_SCHEMA],d=({excludeSchemas:e=[]}={})=>{let t=(0,r.useMemo)(()=>e,[JSON.stringify(e)]),d=(()=>{let{data:e}=(0,i.useSelectedProjectQuery)(),t=(0,l.useFDWsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),s=(0,r.useMemo)(()=>n.WRAPPERS.filter(e=>e.server.options.some(e=>e.name===n.SUPABASE_TARGET_SCHEMA_OPTION.name)),[]),u=(0,r.useMemo)(()=>(t.data?.filter(e=>s.some(t=>(0,o.wrapperMetaComparator)(t,e)))??[]).map(e=>{let t=(0,o.convertKVStringArrayToJson)(e.server_options??[]).supabase_target_schema??"",s=(0,a.default)(t.split(",").filter(Boolean));return{serverName:e.server_name,type:e.handler.replace("_fdw_handler",""),schemas:s}}),[t.data,s]);return{...t,data:u}})(),c=(0,r.useMemo)(()=>{let e=u.map(e=>({name:e,type:"internal"})),a=d.data?.flatMap(e=>e.schemas.map(t=>({name:t,type:"fdw",fdwType:e.type,serverName:e.serverName})));return(0,s.default)([...e,...a],e=>e.name).filter(e=>!t.includes(e.name))},[d.data,t]);return{...d,data:c}};e.s(["INTERNAL_SCHEMAS",0,u,"useIsProtectedSchema",0,({schema:e,excludedSchemas:t=[]})=>{let{data:a}=d({excludeSchemas:t}),s=a.find(t=>t.name===e);return s?{isSchemaLocked:!0,reason:s.type,fdwType:s.fdwType}:{isSchemaLocked:!1,reason:void 0,fdwType:void 0}},"useProtectedSchemas",0,d])},46932,e=>{"use strict";e.s(["queryOptions",0,function(e){return e}])},79745,757670,353917,462531,e=>{"use strict";var t=e.i(221628),a=e.i(125356);e.i(128328);var s=e.i(657588),r=e.i(86086);e.i(187688);var i=e.i(206300);let n=()=>(0,i.createClient)("https://otqhrpbxhxkrhrnjqbba.supabase.co","sb_publishable_ZVVKKu1s88KsSBWVYlou-g_phb2OJVQ",{auth:{persistSession:!1,autoRefreshToken:!1,detectSessionInUrl:!1,storage:{getItem:e=>null,setItem:(e,t)=>{},removeItem:e=>{}}}}),o=e=>`https://otqhrpbxhxkrhrnjqbba.supabase.co${e}`;e.s(["createMarketplaceClient",0,n,"fullImageUrl",0,o],757670);var l=e.i(469099),u=e.i(313087),d=e.i(188139),c=e.i(416340),p=e.i(843778),m=e.i(933275),g=e.i(463333),_=e.i(46932);let f={list:()=>["marketplace","integrations"],categories:()=>["marketplace","categories"]};e.s(["marketplaceIntegrationsKeys",0,f],353917);var h=e.i(234745);async function E(){let e=n(),{data:t,error:a}=await e.from("listings").select("*").is("publish_dashboard",!0);return a&&(0,h.handleError)(a),t??[]}let b=({enabled:e=!0}={})=>(0,_.queryOptions)({queryKey:f.list(),queryFn:()=>E(),enabled:e});e.s(["marketplaceIntegrationsQueryOptions",0,b],462531);var S=e.i(375890),v=e.i(912793);e.s(["useAvailableIntegrations",0,()=>{let{hasLoaded:i}=(0,c.useContext)(s.FeatureFlagContext),n=(0,g.useIsMarketplaceEnabled)(),{integrationsWrappers:_}=(0,v.useIsFeatureEnabled)(["integrations:wrappers"]),{data:f}=(0,S.useCLIReleaseVersionQuery)(),h=!!f?.current,{data:E,error:y}=(0,a.useQuery)({...b(),enabled:n}),T=r.IS_PLATFORM&&(!i||n&&!E&&!y),R=!r.IS_PLATFORM||i&&(!n||!!E&&!y),O=r.IS_PLATFORM&&n&&!!y,w=(0,c.useMemo)(()=>(E??[])?.map(a=>{let{id:s,slug:r,categories:i,featured:n,title:c,description:g,documentation_url:_,website_url:f,installation_url:h,installation_url_type:E,installation_identification_method:b,secret_key_prefix:S,edge_function_secret_name:v,images:y,content:T,partner_name:R,listing_logo:O}=a;return{id:r??"",name:c??"",status:void 0,featured:!!n,type:"oauth",source:"Partner",categories:Array.isArray(i)?i.map(e=>e.slug):[],content:T,files:y?.map(e=>o(e)),description:g,docsUrl:_,siteUrl:f,installUrl:h,installUrlType:E??void 0,installIdentificationMethod:b??void 0,secretKeyPrefix:S??void 0,edgeFunctionSecretName:v??void 0,listingId:s??void 0,author:{name:R??"",websiteUrl:""},requiredExtensions:[],icon:({className:e,...a}={})=>(0,t.jsx)("div",{className:"relative w-full h-full",children:O?(0,t.jsx)(d.default,{fill:!0,src:o(O),alt:"",className:(0,p.cn)("p-2",e),...a}):(0,t.jsx)(l.Boxes,{className:(0,p.cn)("inset-0 p-2 text-black w-full h-full",e),...a})}),navigation:[{route:"overview",label:"Overview"}],navigate:({pageId:t="overview"})=>"overview"===t?(0,u.default)(()=>e.A(356631).then(e=>e.IntegrationOverviewTabV2),{loadableGenerated:{modules:[157592]},loading:m.Loading}):null}}),[E]),A=(0,c.useMemo)(()=>m.INTEGRATIONS.filter(e=>!(!_&&("wrapper"===e.type||e.id.endsWith("_wrapper")))&&("stripe_sync_engine"!==e.id||!h)),[_,h]);return{data:(0,c.useMemo)(()=>[...w,...A].sort((e,t)=>e.name.localeCompare(t.name)),[w,A]),error:y,isPending:T,isSuccess:R,isError:O}}],79745)},375890,e=>{"use strict";var t=e.i(125356),a=e.i(142119),s=e.i(234745),r=e.i(10429);async function i(){try{return await (0,s.fetchHandler)(`${r.BASE_PATH}/api/cli-release-version`).then(e=>e.json())}catch(e){throw e}}e.s(["getCLIReleaseVersion",0,i,"useCLIReleaseVersionQuery",0,({enabled:e=!0,...s}={})=>(0,t.useQuery)({queryKey:a.miscKeys.cliReleaseVersion(),queryFn:()=>i(),enabled:e&&!r.IS_PLATFORM,...s})])},480762,e=>{"use strict";var t=e.i(479084);e.s(["getEnableWebhooksSQL",0,()=>t.safeSql`
BEGIN;
  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;
  END
  $$;

  -- Event trigger for pg_net
  CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
  RETURNS event_trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_event_trigger_ddl_commands() AS ev
      JOIN pg_extension AS ext
      ON ev.objid = ext.oid
      WHERE ext.extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

      IF EXISTS (
        SELECT FROM pg_extension
        WHERE extname = 'pg_net'
        -- all versions in use on existing projects as of 2025-02-20
        -- version 0.12.0 onwards don't need these applied
        AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
      ) THEN
        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

        REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
        REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      END IF;
    END IF;
  END;
  $$;
  COMMENT ON FUNCTION extensions.grant_pg_net_access IS 'Grants access to pg_net';

  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_event_trigger
      WHERE evtname = 'issue_pg_net_access'
    ) THEN
      CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end WHEN TAG IN ('CREATE EXTENSION')
      EXECUTE PROCEDURE extensions.grant_pg_net_access();
    END IF;
  END
  $$;

  -- pg_net grants when extension is already enabled
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

      IF EXISTS (
        SELECT FROM pg_extension
        WHERE extname = 'pg_net'
        -- all versions in use on existing projects as of 2025-02-20
        -- version 0.12.0 onwards don't need these applied
        AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
      ) THEN
        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

        REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
        REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      END IF;
    END IF;
  END
  $$;

  -- Create pg_net extension
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

  -- Create supabase_functions schema
  CREATE SCHEMA supabase_functions AUTHORIZATION supabase_admin;

  GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

  -- supabase_functions.migrations definition
  CREATE TABLE supabase_functions.migrations (
    version text PRIMARY KEY,
    inserted_at timestamptz NOT NULL DEFAULT NOW()
  );

  -- Initial supabase_functions migration
  INSERT INTO supabase_functions.migrations (version) VALUES ('initial');

  -- supabase_functions.hooks definition
  CREATE TABLE supabase_functions.hooks (
    id bigserial PRIMARY KEY,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    request_id bigint
  );
  CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);
  CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);
  COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';

  CREATE FUNCTION supabase_functions.http_request()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      request_id bigint;
      payload jsonb;
      url text := TG_ARGV[0]::text;
      method text := TG_ARGV[1]::text;
      headers jsonb DEFAULT '{}'::jsonb;
      params jsonb DEFAULT '{}'::jsonb;
      timeout_ms integer DEFAULT 1000;
    BEGIN
      IF url IS NULL OR url = 'null' THEN
        RAISE EXCEPTION 'url argument is missing';
      END IF;

      IF method IS NULL OR method = 'null' THEN
        RAISE EXCEPTION 'method argument is missing';
      END IF;

      IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
        headers = '{"Content-Type": "application/json"}'::jsonb;
      ELSE
        headers = TG_ARGV[2]::jsonb;
      END IF;

      IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
        params = '{}'::jsonb;
      ELSE
        params = TG_ARGV[3]::jsonb;
      END IF;

      IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
        timeout_ms = 1000;
      ELSE
        timeout_ms = TG_ARGV[4]::integer;
      END IF;

      CASE
        WHEN method = 'GET' THEN
          SELECT http_get INTO request_id FROM net.http_get(
            url,
            params,
            headers,
            timeout_ms
          );
        WHEN method = 'POST' THEN
          payload = jsonb_build_object(
            'old_record', OLD,
            'record', NEW,
            'type', TG_OP,
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );

          SELECT http_post INTO request_id FROM net.http_post(
            url,
            payload,
            params,
            headers,
            timeout_ms
          );
        ELSE
          RAISE EXCEPTION 'method argument % is invalid', method;
      END CASE;

      INSERT INTO supabase_functions.hooks
        (hook_table_id, hook_name, request_id)
      VALUES
        (TG_RELID, TG_NAME, request_id);

      RETURN NEW;
    END
  $function$;

  GRANT ALL PRIVILEGES ON SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA supabase_functions TO supabase_functions_admin;
  ALTER USER supabase_functions_admin SET search_path = "supabase_functions";
  ALTER table "supabase_functions".migrations OWNER TO supabase_functions_admin;
  ALTER table "supabase_functions".hooks OWNER TO supabase_functions_admin;
  ALTER function "supabase_functions".http_request() OWNER TO supabase_functions_admin;
  GRANT supabase_functions_admin TO postgres;

  -- Remove unused supabase_pg_net_admin role
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_pg_net_admin'
    )
    THEN
      REASSIGN OWNED BY supabase_pg_net_admin TO supabase_admin;
      DROP OWNED BY supabase_pg_net_admin;
      DROP ROLE supabase_pg_net_admin;
    END IF;
  END
  $$;

  INSERT INTO supabase_functions.migrations (version) VALUES ('20210809183423_update_grants');

  ALTER function supabase_functions.http_request() SECURITY DEFINER;
  ALTER function supabase_functions.http_request() SET search_path = supabase_functions;
  REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO postgres, anon, authenticated, service_role;

  COMMIT;
`])},662972,e=>{"use strict";let t=(0,e.i(679709).default)("Clock5",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 14.5 16",key:"1pcbox"}]]);e.s(["Clock5",0,t],662972)},728561,e=>{"use strict";let t=(0,e.i(679709).default)("CodeXml",[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]]);e.s(["Code2",0,t],728561)},582968,e=>{"use strict";let t=(0,e.i(679709).default)("Layers",[["path",{d:"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",key:"8b97xw"}],["path",{d:"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",key:"dd6zsq"}],["path",{d:"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",key:"ep9fru"}]]);e.s(["Layers",0,t],582968)},839869,e=>{"use strict";let t=(0,e.i(679709).default)("Timer",[["line",{x1:"10",x2:"14",y1:"2",y2:"2",key:"14vaq8"}],["line",{x1:"12",x2:"15",y1:"14",y2:"11",key:"17fdiu"}],["circle",{cx:"12",cy:"14",r:"8",key:"1e1u0o"}]]);e.s(["Timer",0,t],839869)},889131,e=>{"use strict";let t=(0,e.i(679709).default)("Vault",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}],["path",{d:"m7.9 7.9 2.7 2.7",key:"hpeyl3"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}],["path",{d:"m13.4 10.6 2.7-2.7",key:"264c1n"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor",key:"nkw3mc"}],["path",{d:"m7.9 16.1 2.7-2.7",key:"p81g5e"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor",key:"fubopw"}],["path",{d:"m13.4 13.4 2.7 2.7",key:"abhel3"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}]]);e.s(["Vault",0,t],889131)},866543,e=>{"use strict";let t=(0,e.i(679709).default)("Webhook",[["path",{d:"M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2",key:"q3hayz"}],["path",{d:"m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06",key:"1go1hn"}],["path",{d:"m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",key:"qlwsc0"}]]);e.s(["Webhook",0,t],866543)},933275,297808,232622,e=>{"use strict";var t=e.i(221628);e.i(850036);var a=e.i(480762),s=e.i(662972),r=e.i(728561),i=e.i(582968),n=e.i(839869),o=e.i(889131),l=e.i(866543),u=e.i(313087),d=e.i(188139),c=e.i(843778),p=e.i(108151),m=e.i(561978),g=e.i(837710),_=e.i(710483),f=e.i(635494);let h=({minimumVersion:e="15.6"})=>{let{data:a}=(0,f.useSelectedProjectQuery)();return(0,t.jsxs)(_.Admonition,{type:"default",title:"Database upgrade needed",childProps:{description:{className:"flex flex-col gap-y-2"}},children:[(0,t.jsx)("div",{className:"prose text-sm max-w-full",children:(0,t.jsxs)("p",{children:["This integration requires the ",(0,t.jsx)("code",{children:"pgmq"})," extension which is not available on this version of Postgres. The extension is available on version ",e," and higher."]})}),(0,t.jsx)(g.Button,{color:"primary",className:"w-fit",children:(0,t.jsx)(m.default,{href:`/project/${a?.ref}/settings/infrastructure`,children:"Upgrade database"})})]})};var E=e.i(559398),b=e.i(615515),S=e.i(918018),v=e.i(705541),y=e.i(964574);e.i(128328);var T=e.i(704206),R=e.i(739114),O=e.i(246230),w=e.i(10429),A=e.i(967052);async function I({projectRef:e,stripeSecretKey:t,startTime:a}){let s=await (0,T.getAccessToken)(),r=await fetch(`${w.BASE_PATH}/api/integrations/stripe-sync`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`},body:JSON.stringify({projectRef:e,stripeSecretKey:t,startTime:a})}),i=await r.json();if(!r.ok)throw Error(i.error?.message||"Failed to install Stripe Sync");return i}e.s(["installStripeSync",0,I,"useStripeSyncInstallMutation",0,({onSuccess:e,onError:t,...a}={})=>{let s=(0,y.useQueryClient)(),r=(0,A.useTrack)();return(0,v.useMutation)({mutationFn:e=>I(e),async onSuccess(t,a,i){let{projectRef:n}=a;r("integration_install_submitted",{integrationName:"stripe_sync_engine",method:"template"}),await s.invalidateQueries({queryKey:O.databaseKeys.schemas(n)}),await s.invalidateQueries({queryKey:S.stripeSyncKeys.all}),await e?.(t,a,i)},async onError(e,a,s){void 0===t?R.toast.error(`Failed to install Stripe Sync: ${e.message}`):t(e,a,s)},...a})}],297808);var N=e.i(801834),L=e.i(234745);async function C({ref:e}){let{data:t,error:a}=await (0,L.post)("/platform/database/{ref}/hook-enable",{params:{path:{ref:e}}});return a&&(0,L.handleError)(a),t}e.s(["enableDatabaseWebhooks",0,C,"useHooksEnableMutation",0,({onSuccess:e,onError:t,...a}={})=>{let s=(0,y.useQueryClient)();return(0,v.useMutation)({mutationFn:e=>C(e),async onSuccess(t,a,r){let{ref:i}=a;await e?.(t,a,r),await (0,N.invalidateSchemasQuery)(s,i)},async onError(e,a,s){void 0===t?R.toast.error(`Failed to enable webhooks: ${e.message}`):t(e,a,s)},...a})}],232622);var x=e.i(741391);let P={name:"Supabase",websiteUrl:"https://supabase.com"},j=[{id:"queues",type:"postgres_extension",source:"Community",requiredExtensions:["pgmq"],missingExtensionsAlert:(0,t.jsx)(h,{minimumVersion:"15.6.1.143"}),name:"Queues",icon:({className:e,...a}={})=>(0,t.jsx)(i.Layers,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Lightweight message queue in Postgres",docsUrl:"https://github.com/tembo-io/pgmq",author:{name:"pgmq",websiteUrl:"https://github.com/tembo-io/pgmq"},navigation:[{route:"overview",label:"Overview"},{route:"queues",label:"Queues",hasChild:!0,childIcon:(0,t.jsx)(i.Layers,{size:12,strokeWidth:1.5,className:(0,c.cn)("text-foreground w-full h-full")})},{route:"settings",label:"Settings",layout:"constrained"}],navigate:({pageId:t="overview",childId:a})=>{if(a)return(0,u.default)(()=>e.A(274794).then(e=>e.QueuePage),{loadableGenerated:{modules:[571538]},loading:F});switch(t){case"overview":return(0,u.default)(()=>e.A(909495).then(e=>e.QueuesOverviewTab),{loadableGenerated:{modules:[698380]},loading:F});case"queues":return(0,u.default)(()=>e.A(548863).then(e=>e.QueuesTab),{loadableGenerated:{modules:[79703]},loading:F});case"settings":return(0,u.default)(()=>e.A(283398).then(e=>e.QueuesSettings),{loadableGenerated:{modules:[541970]},loading:F})}return null}},{id:"cron",type:"postgres_extension",source:"Community",requiredExtensions:["pg_cron"],name:"Cron",icon:({className:e,...a}={})=>(0,t.jsx)(s.Clock5,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Schedule recurring Jobs in Postgres",docsUrl:"https://github.com/citusdata/pg_cron",author:{name:"Citus Data",websiteUrl:"https://github.com/citusdata/pg_cron"},navigation:[{route:"overview",label:"Overview"},{route:"jobs",label:"Jobs",hasChild:!0,childIcon:(0,t.jsx)(n.Timer,{size:12,strokeWidth:1.5,className:(0,c.cn)("text-foreground w-full h-full")})}],navigate:({pageId:t="overview",childId:a})=>{if(a)return(0,u.default)(()=>e.A(609157).then(e=>e.CronJobPage),{loadableGenerated:{modules:[323205]},loading:F});switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"jobs":return(0,u.default)(()=>e.A(579437).then(e=>e.CronjobsTab),{loadableGenerated:{modules:[524943]},loading:F})}return null}},{id:"vault",type:"postgres_extension",source:"Official",requiredExtensions:["supabase_vault"],missingExtensionsAlert:(0,t.jsx)(h,{}),name:"Vault",status:"beta",icon:({className:e,...a}={})=>(0,t.jsx)(o.Vault,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Application level encryption for your project",docsUrl:`${w.DOCS_URL}/guides/database/vault`,author:P,navigation:[{route:"overview",label:"Overview"},{route:"secrets",label:"Secrets"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"secrets":return(0,u.default)(()=>e.A(707643).then(e=>e.SecretsManagement),{loadableGenerated:{modules:[935100]},loading:F})}return null}},{id:"webhooks",type:"postgres_extension",source:"Official",name:"Database Webhooks",icon:({className:e,...a}={})=>(0,t.jsx)(l.Webhook,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Send real-time data from your database to another system when a table event occurs",docsUrl:`${w.DOCS_URL}/guides/database/webhooks`,author:P,requiredExtensions:["pg_net"],navigation:[{route:"overview",label:"Overview"},{route:"webhooks",label:"Webhooks",layout:"constrained"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(467186).then(e=>e.WebhooksOverviewTab),{loadableGenerated:{modules:[6777]},loading:F});case"webhooks":return(0,u.default)(()=>e.A(639206).then(e=>e.WebhooksListTab),{loadableGenerated:{modules:[791713]},loading:F})}return null},installationSql:(0,a.getEnableWebhooksSQL)(),installationCommand:async({ref:e})=>{let t=(0,x.getQueryClient)();await C({ref:e}),await (0,N.invalidateSchemasQuery)(t,e)}},{id:"data_api",type:"custom",source:"Official",requiredExtensions:[],name:"Data API",icon:({className:e,...a}={})=>(0,t.jsx)(r.Code2,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Auto-generate an API directly from your database schema",docsUrl:`${w.DOCS_URL}/guides/api`,author:P,navigation:[{route:"overview",label:"Overview"},{route:"settings",label:"Settings",layout:"constrained"},{route:"docs",label:"Docs"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(250577).then(e=>e.DataApiOverviewTab),{loadableGenerated:{modules:[429091]},loading:F});case"settings":return(0,u.default)(()=>e.A(610764).then(e=>e.DataApiSettingsTab),{loadableGenerated:{modules:[247311]},loading:F});case"docs":return(0,u.default)(()=>e.A(818633).then(e=>e.DataApiDocsTab),{loadableGenerated:{modules:[338481]},loading:F})}return null}},{id:"graphiql",type:"postgres_extension",source:"Official",requiredExtensions:["pg_graphql"],name:"GraphQL",icon:({className:e,...a}={})=>(0,t.jsx)(d.default,{fill:!0,src:`${w.BASE_PATH}/img/graphql.svg`,alt:"GraphiQL",className:(0,c.cn)("p-2",e),...a}),description:"Run GraphQL queries through our interactive in-browser IDE",docsUrl:`${w.DOCS_URL}/guides/database/extensions/pg_graphql`,author:P,navigation:[{route:"overview",label:"Overview"},{route:"graphiql",label:"GraphiQL"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"graphiql":return(0,u.default)(()=>e.A(500556).then(e=>e.GraphiQLTab),{loadableGenerated:{modules:[321608]},loading:F})}return null}}],k=[...b.WRAPPERS.map(a=>({id:a.name,type:"wrapper",source:"Official",name:`${a.label} Wrapper`,icon:({className:e,...s}={})=>(0,t.jsx)(d.default,{fill:!0,src:a.icon,alt:a.name,className:(0,c.cn)("p-2",e),...s}),requiredExtensions:["wrappers","supabase_vault"],description:a.description,docsUrl:a.docsUrl,meta:a,author:P,navigation:[{route:"overview",label:"Overview"},{route:"wrappers",label:"Wrappers"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(596207).then(e=>e.WrapperOverviewTab),{loadableGenerated:{modules:[865243]},loading:F});case"wrappers":return(0,u.default)(()=>e.A(354946).then(e=>e.WrappersTab),{loadableGenerated:{modules:[674412]},loading:F})}return null}})),...j,{id:"stripe_sync_engine",type:"template",source:"Partner",requiredExtensions:["pgmq","supabase_vault","pg_cron","pg_net"],missingExtensionsAlert:(0,t.jsx)(h,{minimumVersion:"15.6.1.143"}),name:"Stripe Sync Engine",status:"alpha",icon:({className:e,...a}={})=>(0,t.jsx)(d.default,{fill:!0,src:`${w.BASE_PATH}/img/icons/stripe-icon.svg`,alt:"Stripe Logo",className:(0,c.cn)("p-2",e),...a}),description:"Continuously sync your payments, customer, and other data from Stripe to your Postgres database",docsUrl:"https://github.com/stripe-experiments/sync-engine/",author:{name:"Stripe",websiteUrl:"https://www.stripe.com"},navigation:[{route:"overview",label:"Overview"},{route:"settings",label:"Settings",layout:"constrained"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(943222).then(e=>e.StripeSyncEngineOverviewTab),{loadableGenerated:{modules:[140017]},loading:F});case"settings":return(0,u.default)(()=>e.A(98740).then(e=>e.StripeSyncSettingsPage),{loadableGenerated:{modules:[795776]},loading:F})}return null},inputs:{stripe_api_key:{type:"password",required:!0,label:"Stripe API secret key",description:"Requires write access to Webhook Endpoints and read-only access to all other categories.",actions:[{label:"Get API key",href:"https://dashboard.stripe.com/apikeys"},{label:"What are Stripe API keys?",href:"https://support.stripe.com/questions/what-are-stripe-api-keys-and-how-to-find-them"}]}},steps:[{label:"Creates a new database schema named `stripe`"},{label:"Creates tables and views in the `stripe` schema for synced Stripe data"},{label:"Deploys Edge Functions to handle incoming webhooks from Stripe"},{label:"Schedules automatic Stripe data syncs using Supabase Queues"}],installationCommand:async({ref:e,track:t,stripe_api_key:a})=>{let s=Date.now();await I({projectRef:e,startTime:s,stripeSecretKey:a}),t&&t("integration_install_submitted",{integrationName:"stripe_sync_engine",method:"template"});let r=(0,x.getQueryClient)();await r.invalidateQueries({queryKey:S.stripeSyncKeys.all})},checkInstallationStatus:async e=>{let t=(0,x.getQueryClient)(),{projectRef:a,connectionString:s}=e||{},r=await (0,N.getSchemas)({projectRef:a,connectionString:s}),{status:i,errorMessage:n}=(0,E.getStripeSyncSchemaComment)(r);if("install error"===i)throw Error(n??"Stripe Sync installation failed");return"installed"===i&&await t.invalidateQueries({queryKey:O.databaseKeys.schemas(a)}),"installed"===i?"installed":"installing"}}],F=()=>(0,t.jsx)("div",{className:"p-10",children:(0,t.jsx)(p.GenericSkeletonLoader,{})});e.s(["INTEGRATIONS",0,k,"Loading",0,F],933275)}]);

//# debugId=d9dc645d-40d9-fe11-26d4-68dda191502a
//# sourceMappingURL=0dpw9qnixsx~p.js.map