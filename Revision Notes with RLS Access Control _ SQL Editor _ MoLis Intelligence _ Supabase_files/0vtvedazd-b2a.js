;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="7b2a958c-d73e-7b51-fab5-0216bb54bcd3")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,417403,e=>{"use strict";var r=e.i(907019);e.s(["default",0,r])},793595,e=>{"use strict";var r=e.i(125356),t=e.i(711950),a=e.i(234745);async function o({slug:e},r){if(!e)throw Error("slug is required");let[t,n]=await Promise.all([(0,a.get)("/platform/organizations/{slug}/members",{params:{path:{slug:e}},signal:r}),(0,a.get)("/platform/organizations/{slug}/members/invitations",{params:{path:{slug:e}},signal:r})]),{data:i,error:l}=t,{data:s,error:d}=n;return l&&(0,a.handleError)(l),d&&(0,a.handleError)(d),[...i,...s.invitations.map(e=>({...{invited_at:e.invited_at,invited_id:e.id,mfa_enabled:!1,username:e.invited_email.slice(0,1),primary_email:e.invited_email},role_ids:[e.role_id]}))]}e.s(["useOrganizationMembersQuery",0,({slug:e},{enabled:a=!0,...n}={})=>(0,r.useQuery)({queryKey:t.organizationKeys.members(e),queryFn:({signal:r})=>o({slug:e},r),enabled:a&&void 0!==e,...n})])},617976,e=>{"use strict";e.s(["organizationKeys",0,{rolesV2:e=>["organization-members",e,"roles-v2"],invitations:e=>["organization-members",e,"invitations"],invitation:(e,r)=>["organization-members",e,"invitations",r],token:(e,r)=>["organization-members",e,"token",r]}])},794231,388531,781894,e=>{"use strict";var r=e.i(221628),t=e.i(26898);e.i(128328);var a=e.i(657588),o=e.i(158639),n=e.i(561978),i=e.i(837710),l=e.i(215312),s=e.i(344580),d=e.i(416340),u=e.i(67318),c=e.i(739114),f=e.i(587433),p=e.i(253214),g=e.i(20482),m=e.i(511541),x=e.i(613580),h=e.i(538482),b=e.i(417403),y=e.i(125356),v=e.i(617976),w=e.i(234745);let _=["Owner","Administrator","Developer","Read-only"];async function j({slug:e},r){if(!e)throw Error("slug is required");let{data:t,error:a}=await (0,w.get)("/platform/organizations/{slug}/roles",{params:{path:{slug:e}},headers:{Version:2},signal:r});return a&&(0,w.handleError)(a),t}let z=({slug:e},{enabled:r=!0,...t}={})=>(0,y.useQuery)({queryKey:v.organizationKeys.rolesV2(e),queryFn:({signal:r})=>j({slug:e},r),enabled:r&&void 0!==e,select:e=>({...e,org_scoped_roles:e.org_scoped_roles.sort((e,r)=>_.indexOf(e.name)-_.indexOf(r.name))}),...t});e.s(["useOrganizationRolesV2Query",0,z],388531);var A=e.i(793595),S=e.i(705541);async function N({slug:e,plan:r,note:t}){if(!e)throw Error("Slug is required");let{data:a,error:o}=await (0,w.post)("/platform/organizations/{slug}/billing/upgrade-request",{params:{path:{slug:e}},body:{requested_plan:r,note:t}});return o&&(0,w.handleError)(o),a}var $=e.i(265735),P=e.i(635494),k=e.i(967052);let E=b.default.object({note:b.default.string().optional()}),C="request-upgrade-form",F=({block:e=!1,plan:t="Pro",addon:a,featureProposition:o,children:n,className:l,type:b="primary"})=>{let[y,v]=(0,d.useState)(!1),w=(0,k.useTrack)(),{data:_}=(0,P.useSelectedProjectQuery)(),{data:j}=(0,$.useSelectedOrganizationQuery)(),F=j?.slug,O=j?.plan?.id,q="free"===O,{data:T=[]}=(0,A.useOrganizationMembersQuery)({slug:j?.slug}),{data:L}=z({slug:j?.slug}),R=L?.org_scoped_roles??[],{mutate:I,isPending:V}=(({onSuccess:e,onError:r,...t}={})=>(0,S.useMutation)({mutationFn:e=>N(e),async onSuccess(r,t,a){await e?.(r,t,a)},async onError(e,t,a){void 0===r?c.toast.error(`Failed to send upgrade request: ${e.message}`):r(e,t,a)},...t}))({onSuccess:()=>{w("request_upgrade_submitted",{requestedPlan:t,addon:a,currentPlan:O}),c.toast.success("Successfully sent request to billing owners!"),v(!1)}}),B="pitr"===a?"PITR":"customDomain"===a?"Custom domain":"ipv4"===a?"dedicated IPv4 address":"",D=_?`for the project "${_?.name}"`:j?`for the organization "${j.name}"`:"",Q="spendCap"===a?"disable spend cap":"computeSize"===a?"change the compute size":`enable the ${B} add-on`,M=a?"spendCap"===a?"Request to disable spend cap":"computeSize"===a?"Request to change compute size":`Request to enable the ${B} add-on`:`Request an upgrade for the ${t} Plan`,U=n||(a?"spendCap"===a?"Request to disable spend cap":"computeSize"===a?"Request to change compute":"Request to enable addon":`Request upgrade to ${t}`),W={note:a?`We'd like to ${q?"upgrade to Pro and ":""}${Q} ${D} so that we can ${o}`:`We'd like to upgrade to the ${t} plan ${o?`to ${o} `:""}${D}`},K=(0,u.useForm)({resolver:(0,s.zodResolver)(E),defaultValues:W,values:W}),Z=T.filter(e=>{let r=e.role_ids.map(e=>R.find(r=>r.id===e)?.name).filter(Boolean);return!e.invited_id&&(r.includes("Owner")||r.includes("Administrator"))}),G=async e=>{if(!F)return console.error("Slug is required");I({slug:F,plan:t,note:e.note})};return(0,r.jsxs)(p.Dialog,{open:y,onOpenChange:e=>{e&&w("request_upgrade_modal_opened",{requestedPlan:t,addon:a,currentPlan:O,featureProposition:o}),v(e)},children:[(0,r.jsx)(p.DialogTrigger,{asChild:!0,children:(0,r.jsx)(i.Button,{block:e,type:b,className:l,children:U})}),(0,r.jsx)(p.DialogContent,{children:(0,r.jsx)(g.Form,{...K,children:(0,r.jsxs)("form",{id:C,onSubmit:K.handleSubmit(G),children:[(0,r.jsxs)(p.DialogHeader,{children:[(0,r.jsx)(p.DialogTitle,{children:M}),(0,r.jsx)(p.DialogDescription,{children:"Let your organization's billing owners know your interest in this"})]}),(0,r.jsx)(p.DialogSectionSeparator,{}),(0,r.jsxs)(p.DialogSection,{className:"flex flex-col gap-y-6",children:[(0,r.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,r.jsx)("p",{className:"text-sm",children:"Your request will be sent to the following emails, who are billing owners of your organization:"}),(0,r.jsxs)("div",{className:"text-sm flex gap-x-2",children:[(0,r.jsx)("p",{children:Z.slice(0,2).map(e=>e.primary_email).join(", ")}),Z.length>2&&(0,r.jsxs)(x.Tooltip,{children:[(0,r.jsx)(x.TooltipTrigger,{tabIndex:-1,children:(0,r.jsx)(f.Badge,{children:"+1 others"})}),(0,r.jsx)(x.TooltipContent,{side:"bottom",children:(0,r.jsx)("ul",{className:"",children:Z.slice(2).map(e=>(0,r.jsx)("li",{children:e.primary_email},e.gotrue_id))})})]})]})]}),(0,r.jsx)(g.FormField,{control:K.control,name:"note",render:({field:e})=>(0,r.jsx)(h.FormItemLayout,{name:"note",label:"Add a note to your request (optional)",layout:"vertical",children:(0,r.jsx)(g.FormControl,{children:(0,r.jsx)(m.TextArea,{id:"note",...e,rows:3,placeholder:a?"spendCap"===a?"e.g. We need to disabled spend cap on this project to do something":"e.g. We need to enable this add-on to do something with the project":"e.g. We need to upgrade to the Pro plan to use this feature"})})})})]}),(0,r.jsxs)(p.DialogFooter,{children:[(0,r.jsx)(i.Button,{type:"default",disabled:V,onClick:()=>v(!1),children:"Cancel"}),(0,r.jsx)(i.Button,{htmlType:"submit",form:C,loading:V,children:"Submit request"})]})]})})})]})};e.s(["RequestUpgradeToBillingOwners",0,F],781894);var O=e.i(196621),q=e.i(2579),T=e.i(912793);let L="<Specify which plan to upgrade to: Pro | Team | Enterprise>";e.s(["PLAN_REQUEST_EMPTY_PLACEHOLDER",0,L,"UpgradePlanButton",0,({source:e,variant:s="primary",plan:d="Pro",addon:u,featureProposition:c,disabled:f,children:p,className:g,slug:m,onClick:x})=>{let{ref:h}=(0,o.useParams)(),{data:b}=(0,$.useSelectedOrganizationQuery)(),y=b?.plan?.id==="free",v=m??b?.slug??"_",w=(0,a.useFlag)("disableProjectCreationAndUpdate"),{billingAll:_}=(0,T.useIsFeatureEnabled)(["billing:all"]),{can:j}=(0,q.useAsyncCheckPermissions)(t.PermissionAction.BILLING_WRITE,"stripe.subscriptions",void 0,{organizationSlug:v}),z=`Enquiry to upgrade ${d?`to ${d} `:""}plan for organization`,A=`Name: ${b?.name}
Slug: ${v}
Requested plan: ${d??L}`,S="spendCap"===u,N=!y&&!!u,P=S?`/org/${v??"_"}/billing?panel=costControl&source=${e}`:N?"computeSize"===u?`/project/${h??"_"}/settings/compute-and-disk`:`/project/${h??"_"}/settings/addons?panel=${u}&source=${e}`:`/org/${v??"_"}/billing?panel=subscriptionPlan&source=${e}`,k=p||(N?"computeSize"===u?"Change compute size":"Enable add-on":`Upgrade to ${d}`),E=_?(0,r.jsx)(n.default,{href:P,children:k}):(0,r.jsx)(O.SupportLink,{queryParams:{orgSlug:v,category:"Plan_upgrade",subject:z,message:A},children:k});return j?w?(0,r.jsx)(l.ButtonTooltip,{disabled:!0,type:s,className:g,tooltip:{content:{side:"bottom",text:"Plan changes are currently disabled, our engineers are working on a fix"}},children:k}):(0,r.jsx)(i.Button,{asChild:!0,type:s,disabled:f,className:g,onClick:x,children:E}):(0,r.jsx)(F,{plan:d,addon:u,featureProposition:c,className:g,type:s,children:p})}],794231)},202003,e=>{"use strict";e.s(["buildStudioPageTitle",0,e=>{let r=[e.entity,e.section,e.surface,e.project,e.org,e.brand],t=[];return r.forEach(e=>{let r=(e=>{if(void 0===e)return;let r=e.trim().replace(/\s+/g," ");if(0!==r.length)return r.length<=60?r:`${r.slice(0,59).trimEnd()}…`})(e);if(!r)return;let a=t[t.length-1];(void 0===a||a.toLowerCase()!==r.toLowerCase())&&t.push(r)}),t.join(" | ")}])},95053,e=>{"use strict";var r=e.i(221628),t=e.i(766181),a=e.i(416340),o=e.i(843778),n=e.i(20482),i=e.i(737018),l=e.i(282410);let s=(0,t.cva)("relative grid gap-10",{variants:{size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},align:{left:"",right:""},responsive:{true:"",false:""},layout:{horizontal:"flex flex-col gap-2 md:grid md:grid-cols-12",vertical:"flex flex-col gap-2",flex:"flex flex-row gap-3","flex-row-reverse":"flex flex-col-reverse gap-2 md:gap-6 md:flex-row-reverse md:justify-between"},flex:{true:"",false:""}},compoundVariants:[{layout:"flex",align:"right",className:"justify-between"},{layout:"flex-row-reverse",align:"right",className:"justify-between"}],defaultVariants:{}}),d=(0,t.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"flex flex-col gap-2 col-span-4",vertical:"flex flex-row gap-2 justify-between",flex:"flex flex-col gap-0 min-w-0","flex-row-reverse":"flex flex-col min-w-0 grow"},labelLayout:{horizontal:"",vertical:"","":""}},compoundVariants:[{flex:!0,align:"left",className:"order-2"},{flex:!0,align:"right",className:"order-1"},{layout:["vertical","flex"],labelLayout:void 0,flex:!1,className:"flex flex-row gap-2 justify-between"},{layout:"horizontal",className:"flex flex-col gap-2"}],defaultVariants:{}}),u=(0,t.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"order-1",right:"order-2"},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:"order-1"},{flex:!0,align:"right",className:"order-2"},{layout:["vertical","flex"],className:"col-span-12"},{layout:"horizontal",align:"left",className:"col-span-8"},{layout:"horizontal",align:"right",className:"text-right"}],defaultVariants:{}}),c=(0,t.cva)("text-foreground-lighter leading-normal",{variants:{size:{...l.SIZE.text},layout:{vertical:"mt-2",horizontal:"mt-2",flex:"","flex-row-reverse":""}},defaultVariants:{}}),f=(0,t.cva)("text-foreground-muted",{variants:{size:{...l.SIZE.text}},defaultVariants:{}}),p=(0,t.cva)("text-foreground-muted",{variants:{size:{...l.SIZE.text}},defaultVariants:{}}),g=(0,t.cva)("text-foreground-muted",{variants:{size:{...l.SIZE.text}},defaultVariants:{}}),m=(0,t.cva)("",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:""},{flex:!0,align:"right",className:"order-last"},{layout:"flex-row-reverse",className:"flex flex-col justify-center items-start md:items-end shrink-0 md:w-1/2 xl:w-2/5 [&>div]:md:w-full"}]}),x=(0,t.cva)("",{variants:{nonBoxInput:{true:"",false:""},label:{true:"",false:""},layout:{vertical:"",horizontal:"","flex-row-reverse":""}},compoundVariants:[{nonBoxInput:!0,label:!0,layout:"vertical",className:"my-3"},{nonBoxInput:!0,label:!0,layout:"horizontal",className:"my-3 md:mt-0 mb-3"}],defaultVariants:{}}),h=a.default.forwardRef(({align:e="left",className:t,description:a,id:l,label:h,labelOptional:b,layout:y="vertical",style:v,labelLayout:w,size:_="medium",beforeLabel:j,afterLabel:z,nonBoxInput:A=!h,hideMessage:S=!1,isReactForm:N,error:$,...P},k)=>{let E="flex"===y||"flex-row-reverse"===y,C=!!(h||j||z),F=N&&!S?(0,r.jsx)(n.FormMessage,{className:(0,o.cn)("mt-2 transition-all duration-300 ease-in-out","flex-row-reverse"===y&&"mt-0"),"data-formlayout-id":"message"}):$&&!S?(0,r.jsx)("p",{className:(0,o.cn)("mt-2 text-sm text-destructive","flex-row-reverse"===y&&"mt-0"),children:$}):null,O=a&&N?(0,r.jsx)(n.FormDescription,{className:(0,o.cn)(c({size:_,layout:y})),"data-formlayout-id":"description",id:`${l}-description`,children:a}):a?(0,r.jsx)("p",{className:(0,o.cn)(c({size:_,layout:y}),"text-sm text-foreground-light"),"data-formlayout-id":"description",children:a}):null,q=()=>(0,r.jsxs)(r.Fragment,{children:[j&&(0,r.jsx)("span",{className:(0,o.cn)(f({size:_})),id:l+"-before","data-formlayout-id":"beforeLabel",children:(0,r.jsx)("span",{children:j})}),(0,r.jsx)("span",{children:h}),z&&(0,r.jsx)("span",{className:(0,o.cn)(p({size:_})),id:l+"-after","data-formlayout-id":"afterLabel",children:z})]});return(0,r.jsxs)("div",{ref:k,...P,className:(0,o.cn)(s({size:_,flex:E,align:e,layout:y}),t),children:[E&&(0,r.jsxs)("div",{className:(0,o.cn)(m({flex:E,align:e,layout:y})),children:[P.children,"flex-row-reverse"===y&&F]}),C||b||"horizontal"===y?(0,r.jsx)(r.Fragment,{children:(0,r.jsxs)("div",{className:(0,o.cn)(d({align:e,labelLayout:w,flex:E,layout:y})),"data-formlayout-id":"labelContainer",children:[C&&N?(0,r.jsx)(n.FormLabel,{className:"text-foreground flex gap-2 items-center wrap-break-word","data-formlayout-id":"formLabel",htmlFor:P.name||l,children:(0,r.jsx)(q,{})}):(0,r.jsx)(i.Label,{className:"text-foreground flex gap-2 items-center wrap-break-word leading-normal","data-formlayout-id":"label",htmlFor:P.name||l,children:(0,r.jsx)(q,{})}),b&&(0,r.jsx)("span",{className:(0,o.cn)(g({size:_})),id:l+"-optional","data-formlayout-id":"labelOptional",children:b}),E&&(0,r.jsxs)(r.Fragment,{children:[O,"flex-row-reverse"!==y&&F]})]})}):null,!E&&(0,r.jsx)("div",{className:(0,o.cn)(u({align:e,layout:y})),style:v,"data-formlayout-id":"dataContainer",children:(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("div",{className:(0,o.cn)(x({nonBoxInput:A,label:h,layout:y})),"data-formlayout-id":"nonBoxInputContainer",children:P.children}),F,O]})})]})});e.s(["FormLayout",0,h])},538482,e=>{"use strict";var r=e.i(221628),t=e.i(416340),a=e.i(20482),o=e.i(95053);let n=(0,t.forwardRef)(({...e},t)=>(0,r.jsx)(a.FormItem,{children:(0,r.jsx)(o.FormLayout,{ref:t,isReactForm:!0,...e,children:e.children})}));n.displayName="FormItemLayout",e.s(["FormItemLayout",0,n])},344580,e=>{"use strict";var r=e.i(67318),t=function(e,t,a){if(e&&"reportValidity"in e){var o=(0,r.get)(a,t);e.setCustomValidity(o&&o.message||""),e.reportValidity()}},a=function(e,r){var a=function(a){var o=r.fields[a];o&&o.ref&&"reportValidity"in o.ref?t(o.ref,a,e):o.refs&&o.refs.forEach(function(r){return t(r,a,e)})};for(var o in r.fields)a(o)},o=function(e,t){t.shouldUseNativeValidation&&a(e,t);var o={};for(var l in e){var s=(0,r.get)(t.fields,l),d=Object.assign(e[l]||{},{ref:s&&s.ref});if(i(t.names||Object.keys(e),l)){var u=Object.assign({},n((0,r.get)(o,l)));(0,r.set)(u,"root",d),(0,r.set)(o,l,u)}else(0,r.set)(o,l,d)}return o},n=function(e){return Array.isArray(e)?e.filter(Boolean):[]},i=function(e,r){return e.some(function(e){return e.startsWith(r+".")})},l=function(e,t){for(var a={};e.length;){var o=e[0],n=o.code,i=o.message,l=o.path.join(".");if(!a[l])if("unionErrors"in o){var s=o.unionErrors[0].errors[0];a[l]={message:s.message,type:s.code}}else a[l]={message:i,type:n};if("unionErrors"in o&&o.unionErrors.forEach(function(r){return r.errors.forEach(function(r){return e.push(r)})}),t){var d=a[l].types,u=d&&d[o.code];a[l]=(0,r.appendErrors)(l,t,a,n,u?[].concat(u,o.message):o.message)}e.shift()}return a};e.s(["zodResolver",0,function(e,r,t){return void 0===t&&(t={}),function(n,i,s){try{return Promise.resolve(function(o){try{var i=Promise.resolve(e["sync"===t.mode?"parse":"parseAsync"](n,r)).then(function(e){return s.shouldUseNativeValidation&&a({},s),{errors:{},values:t.raw?n:e}})}catch(e){return o(e)}return i&&i.then?i.then(void 0,o):i}(function(e){if(null!=e.errors)return{values:{},errors:o(l(e.errors,!s.shouldUseNativeValidation&&"all"===s.criteriaMode),s)};throw e}))}catch(e){return Promise.reject(e)}}}],344580)},793365,(e,r,t)=>{!function(a,o){if("function"==typeof define&&define.amd){let a;void 0!==(a=o(e.r,t,r))&&e.v(a)}else r.exports=o()}(e.e,function(){"use strict";Array.isArray||(Array.isArray=function(e){return"[object Array]"===Object.prototype.toString.call(e)});var e={},r={"==":function(e,r){return e==r},"===":function(e,r){return e===r},"!=":function(e,r){return e!=r},"!==":function(e,r){return e!==r},">":function(e,r){return e>r},">=":function(e,r){return e>=r},"<":function(e,r,t){return void 0===t?e<r:e<r&&r<t},"<=":function(e,r,t){return void 0===t?e<=r:e<=r&&r<=t},"!!":function(r){return e.truthy(r)},"!":function(r){return!e.truthy(r)},"%":function(e,r){return e%r},log:function(e){return console.log(e),e},in:function(e,r){return!!r&&void 0!==r.indexOf&&-1!==r.indexOf(e)},cat:function(){return Array.prototype.join.call(arguments,"")},substr:function(e,r,t){if(t<0){var a=String(e).substr(r);return a.substr(0,a.length+t)}return String(e).substr(r,t)},"+":function(){return Array.prototype.reduce.call(arguments,function(e,r){return parseFloat(e,10)+parseFloat(r,10)},0)},"*":function(){return Array.prototype.reduce.call(arguments,function(e,r){return parseFloat(e,10)*parseFloat(r,10)})},"-":function(e,r){return void 0===r?-e:e-r},"/":function(e,r){return e/r},min:function(){return Math.min.apply(this,arguments)},max:function(){return Math.max.apply(this,arguments)},merge:function(){return Array.prototype.reduce.call(arguments,function(e,r){return e.concat(r)},[])},var:function(e,r){var t=void 0===r?null:r,a=this;if(void 0===e||""===e||null===e)return a;for(var o=String(e).split("."),n=0;n<o.length;n++)if(null==a||void 0===(a=a[o[n]]))return t;return a},missing:function(){for(var r=[],t=Array.isArray(arguments[0])?arguments[0]:arguments,a=0;a<t.length;a++){var o=t[a],n=e.apply({var:o},this);(null===n||""===n)&&r.push(o)}return r},missing_some:function(r,t){var a=e.apply({missing:t},this);return t.length-a.length>=r?[]:a}};return e.is_logic=function(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)&&1===Object.keys(e).length},e.truthy=function(e){return(!Array.isArray(e)||0!==e.length)&&!!e},e.get_operator=function(e){return Object.keys(e)[0]},e.get_values=function(r){return r[e.get_operator(r)]},e.apply=function(t,a){if(Array.isArray(t))return t.map(function(r){return e.apply(r,a)});if(!e.is_logic(t))return t;var o,n,i,l,s,d=e.get_operator(t),u=t[d];if(Array.isArray(u)||(u=[u]),"if"===d||"?:"==d){for(o=0;o<u.length-1;o+=2)if(e.truthy(e.apply(u[o],a)))return e.apply(u[o+1],a);return u.length===o+1?e.apply(u[o],a):null}if("and"===d){for(o=0;o<u.length&&(n=e.apply(u[o],a),e.truthy(n));o+=1);return n}if("or"===d){for(o=0;o<u.length&&(n=e.apply(u[o],a),!e.truthy(n));o+=1);return n}if("filter"===d)return(l=e.apply(u[0],a),i=u[1],Array.isArray(l))?l.filter(function(r){return e.truthy(e.apply(i,r))}):[];if("map"===d)return(l=e.apply(u[0],a),i=u[1],Array.isArray(l))?l.map(function(r){return e.apply(i,r)}):[];else if("reduce"===d)return(l=e.apply(u[0],a),i=u[1],s=void 0!==u[2]?u[2]:null,Array.isArray(l))?l.reduce(function(r,t){return e.apply(i,{current:t,accumulator:r})},s):s;else if("all"===d){if(l=e.apply(u[0],a),i=u[1],!Array.isArray(l)||!l.length)return!1;for(o=0;o<l.length;o+=1)if(!e.truthy(e.apply(i,l[o])))return!1;return!0}else if("none"===d){if(l=e.apply(u[0],a),i=u[1],!Array.isArray(l)||!l.length)return!0;for(o=0;o<l.length;o+=1)if(e.truthy(e.apply(i,l[o])))return!1;return!0}else if("some"===d){if(l=e.apply(u[0],a),i=u[1],!Array.isArray(l)||!l.length)return!1;for(o=0;o<l.length;o+=1)if(e.truthy(e.apply(i,l[o])))return!0;return!1}if(u=u.map(function(r){return e.apply(r,a)}),r.hasOwnProperty(d)&&"function"==typeof r[d])return r[d].apply(a,u);if(d.indexOf(".")>0){var c=String(d).split("."),f=r;for(o=0;o<c.length;o++){if(!f.hasOwnProperty(c[o]))throw Error("Unrecognized operation "+d+" (failed at "+c.slice(0,o+1).join(".")+")");f=f[c[o]]}return f.apply(a,u)}throw Error("Unrecognized operation "+d)},e.uses_data=function(r){var t=[];if(e.is_logic(r)){var a=e.get_operator(r),o=r[a];Array.isArray(o)||(o=[o]),"var"===a?t.push(o[0]):o.forEach(function(r){t.push.apply(t,e.uses_data(r))})}for(var n=[],i=0,l=t.length;i<l;i++)-1===n.indexOf(t[i])&&n.push(t[i]);return n},e.add_operation=function(e,t){r[e]=t},e.rm_operation=function(e){delete r[e]},e.rule_like=function(r,t){if(t===r||"@"===t)return!0;if("number"===t)return"number"==typeof r;if("string"===t)return"string"==typeof r;if("array"===t)return Array.isArray(r)&&!e.is_logic(r);if(e.is_logic(t)){if(e.is_logic(r)){var a=e.get_operator(t),o=e.get_operator(r);if("@"===a||a===o)return e.rule_like(e.get_values(r,!1),e.get_values(t,!1))}return!1}if(Array.isArray(t)&&Array.isArray(r)){if(t.length!==r.length)return!1;for(var n=0;n<t.length;n+=1)if(!e.rule_like(r[n],t[n]))return!1;return!0}return!1},e})},2579,e=>{"use strict";e.i(128328);var r=e.i(704206),t=e.i(158639),a=e.i(793365),o=e.i(416340),n=e.i(265735),i=e.i(635494),l=e.i(154985),s=e.i(10429);let d=e=>`^${e.replace(".","\\.").replace("%",".*")}$`;function u(e,r){return!e.filter(e=>e.restrictive).some(({condition:e})=>null===e||a.default.apply(e,r))&&e.filter(e=>!e.restrictive).some(({condition:e})=>null===e||a.default.apply(e,r))}function c(e,r,t,a,o,n){if(!e||!Array.isArray(e))return!1;if(n){let i=e.filter(e=>e.organization_slug===o&&e.actions.some(e=>r?r.match(d(e)):null)&&e.resources.some(e=>t.match(d(e)))&&e.project_refs?.includes(n));if(i.length>0)return u(i,{resource_name:t,...a})}return u(e.filter(e=>!e.project_refs||0===e.project_refs.length).filter(e=>e.organization_slug===o&&e.actions.some(e=>r?r.match(d(e)):null)&&e.resources.some(e=>t.match(d(e)))),{resource_name:t,...a})}function f(e,r,a,o=!0){let{data:s,isPending:d,isSuccess:u}=(0,l.usePermissionsQuery)({enabled:void 0===e&&o}),c=void 0===r&&o,{data:p,isPending:g,isSuccess:m}=(0,n.useSelectedOrganizationQuery)({enabled:c}),x=(void 0===r?p:{slug:r})?.slug,{ref:h}=(0,t.useParams)(),b=!!h&&void 0===a&&o,{data:y,isPending:v,isSuccess:w}=(0,i.useSelectedProjectQuery)({enabled:b}),_=void 0===a||y?.parent_project_ref?y:{ref:a,parent_project_ref:void 0},j=_?.parent_project_ref?_.parent_project_ref:_?.ref;return{permissions:void 0===e?s:e,organizationSlug:x,projectRef:j,isLoading:d||c&&g||b&&v,isSuccess:u&&(!c||m)&&(!b||w)}}e.s(["doPermissionsCheck",0,c,"useAsyncCheckPermissions",0,function(e,t,a,n){let i=(0,r.useIsLoggedIn)(),{organizationSlug:l,projectRef:d,permissions:u}=n??{},{permissions:p,organizationSlug:g,projectRef:m,isLoading:x,isSuccess:h}=f(u,l,d,i),b=(0,o.useMemo)(()=>!s.IS_PLATFORM||!!i&&!!h&&!!p&&c(p,e,t,a,g,m),[i,h,p,e,t,a,g,m]);return{isLoading:!!s.IS_PLATFORM&&(!i||x),isSuccess:!s.IS_PLATFORM||!!i&&h,can:b}},"useGetPermissions",0,function(e,r,t=!0){return f(e,r,void 0,t)}])},215312,e=>{"use strict";var r=e.i(221628),t=e.i(416340),a=e.i(837710),o=e.i(843778),n=e.i(613580);let i=(0,t.forwardRef)(({tooltip:e,className:t,...i},l)=>(0,r.jsxs)(n.Tooltip,{children:[(0,r.jsx)(n.TooltipTrigger,{asChild:!0,children:(0,r.jsx)(a.Button,{ref:l,...i,className:(0,o.cn)(t,"pointer-events-auto"),children:i.children})}),void 0!==e.content.text&&(0,r.jsx)(n.TooltipContent,{...e.content,children:e.content.text})]}));i.displayName="ButtonTooltip",e.s(["ButtonTooltip",0,i])},938933,e=>{"use strict";var r=e.i(416340);let t={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},a={tiny:`${t.size.text.tiny} ${t.size.padding.tiny}`,small:`${t.size.text.small} ${t.size.padding.small}`,medium:`${t.size.text.medium} ${t.size.padding.medium}`,large:`${t.size.text.large} ${t.size.padding.large}`,xlarge:`${t.size.text.xlarge} ${t.size.padding.xlarge}`},o={card:{base:`
      bg-surface-100

      border
      ${t.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${t.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${t.border.secondary}
        `,base:`
        relative
        cursor-pointer
        text-foreground-lighter
        flex
        items-center
        space-x-2
        text-center
        transition
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
      `,inactive:`
        hover:text-foreground
      `,active:`
        !text-foreground
        border-b-2 border-foreground
      `},pills:{list:"flex space-x-1",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-sm
        border
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-background
        border-strong hover:border-foreground-muted
        text-foreground-muted hover:text-foreground
      `,active:`
        bg-selection
        text-foreground
        border-stronger
      `},"rounded-pills":{list:"flex flex-wrap gap-2",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-full
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-surface-200 hover:bg-surface-300
        hover:border-foreground-lighter
        text-foreground-lighter hover:text-foreground
      `,active:`
        bg-foreground
        text-background
        border-foreground
      `},block:"w-full flex items-center justify-center",size:{...a},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...a},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
      z-50
      bg-dash-sidebar
      flex flex-col
      fixed
      inset-y-0
      h-full lg:h-screen
      border-l
      shadow-xl
    `,header:`
      flex items-center
      space-y-1 py-4 px-4 bg-dash-sidebar sm:px-6
      border-b h-(--header-height)
    `,contents:`
      relative
      flex-1
      overflow-y-auto
    `,content:`
      px-4 sm:px-6
    `,footer:`
      flex justify-end gap-2
      p-4 bg-overlay
      border-t
    `,size:{medium:"w-screen max-w-md h-full",large:"w-screen max-w-2xl h-full",xlarge:"w-screen max-w-3xl h-full",xxlarge:"w-screen max-w-4xl h-full",xxxlarge:"w-screen max-w-5xl h-full",xxxxlarge:"w-screen max-w-6xl h-full"},align:{left:`
        left-0
        data-open:animate-panel-slide-left-out
        data-closed:animate-panel-slide-left-in
      `,right:`
        right-0
        data-open:animate-panel-slide-right-out
        data-closed:animate-panel-slide-right-in
      `},separator:`
      w-full
      h-px
      my-2
      bg-border
    `,overlay:`
      z-50
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,trigger:`
      border-none bg-transparent p-0 focus:ring-0
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...t.size.text}},label_optional:{base:"text-foreground-lighter",size:{...t.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...t.size.text}},label_before:{base:"text-foreground-lighter ",size:{...t.size.text}},label_after:{base:"text-foreground-lighter",size:{...t.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...t.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},menu:{item:{base:`
        cursor-pointer
        flex space-x-3 items-center
        outline-hidden
        focus-visible:ring-1 ring-foreground-muted focus-visible:z-10
        group
      `,content:{base:"transition truncate text-sm w-full",normal:"text-foreground-light group-hover:text-foreground",active:"text-foreground font-semibold"},icon:{base:"transition truncate text-sm",normal:"text-foreground-lighter group-hover:text-foreground-light",active:"text-foreground"},variants:{text:{base:`
            py-1
          `,normal:`
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold
            text-foreground-muted
            z-10
          `},border:{base:`
            px-4 py-1
          `,normal:`
            border-l
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold

            text-foreground-muted
            z-10

            border-l
            border-brand
            group-hover:border-brand
          `,rounded:"rounded-md"},pills:{base:"my-px px-3 py-[3px] rounded-md transition-colors active:bg-sidebar-accent/50",normal:`
            font-normal
            border-default
            hover:bg-sidebar-accent/50
            group-hover:border-foreground-muted`,active:`
            font-semibold
            bg-sidebar-accent
            text-foreground-lighter
            z-10 rounded-md
          `}}},group:{base:`
        flex space-x-3
        mb-2
        font-normal
      `,icon:"text-foreground-lighter",content:"text-sm text-foreground-lighter w-full",variants:{text:"",pills:"px-3",border:""}}},modal:{base:`
      relative
      bg-dash-sidebar
      my-4 max-w-screen
      border border-overlay
      rounded-md
      shadow-xl
      data-open:animate-overlay-show
      data-closed:animate-overlay-hide

    `,header:`
      bg-surface-200
      space-y-1 py-3 px-4 sm:px-5
      border-b border-overlay
      flex items-center justify-between
    `,footer:`
      flex justify-end gap-2
      py-3 px-5
      border-t border-overlay
    `,size:{tiny:"sm:align-middle sm:w-full sm:max-w-xs",small:"sm:align-middle sm:w-full sm:max-w-sm",medium:"sm:align-middle sm:w-full sm:max-w-lg",large:"sm:align-middle sm:w-full md:max-w-xl",xlarge:"sm:align-middle sm:w-full md:max-w-3xl",xxlarge:"sm:align-middle sm:w-full max-w-screen md:max-w-6xl",xxxlarge:"sm:align-middle sm:w-full md:max-w-7xl"},overlay:`
      z-40
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,scroll_overlay:`
      z-40
      fixed
      inset-0
      grid
      place-items-center
      overflow-y-auto
      data-open:animate-overlay-show data-closed:animate-overlay-hide
    `,separator:`
      w-full
      h-px
      my-2
      bg-border-overlay
    `,content:"px-5"},listbox:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      text-foreground
      border
      focus-visible:shadow-md
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
      indent-px
      transition-all
      bg-none
    `,container:"relative",label:"truncate",variants:{standard:`
        bg-control
        border border-control

        aria-expanded:border-foreground-muted
        aria-expanded:ring-border-muted
        aria-expanded:ring-2
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},options_container_animate:`
      transition
      data-open:animate-slide-down
      data-open:opacity-1
      data-closed:animate-slide-up
      data-closed:opacity-0
    `,options_container:`
      bg-overlay
      shadow-lg
      border border-solid
      border-overlay max-h-60
      rounded-md py-1 text-base
      sm:text-sm z-10 overflow-hidden overflow-y-scroll

      origin-dropdown
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
    `,with_icon:"pl-2",addOnBefore:`
      w-full flex flex-row items-center space-x-3
    `,size:{...a},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
      w-listbox
      transition cursor-pointer select-none relative py-2 pl-3 pr-9
      text-foreground-light
      text-sm
      hover:bg-border-overlay
      focus:bg-border-overlay
      focus:text-foreground
      border-none
      focus:outline-hidden
    `,option_active:"text-foreground bg-selection",option_disabled:"cursor-not-allowed opacity-60",option_inner:"flex items-center space-x-3",option_check:"absolute inset-y-0 right-0 flex items-center pr-3 text-brand",option_check_active:"text-brand",option_check_icon:"h-5 w-5"},inputErrorIcon:{base:`
      flex items-center
      right-3 pr-2 pl-2
      inset-y-0
      pointer-events-none
      text-red-900
    `},inputIconContainer:{base:`
    absolute inset-y-0
    left-0 pl-2 flex
    items-center pointer-events-none
    text-foreground-light
    [&_svg]:stroke-[1.5]
    `,size:{tiny:"[&_svg]:h-[14px] [&_svg]:w-[14px]",small:"[&_svg]:h-[18px] [&_svg]:w-[18px]",medium:"[&_svg]:h-[20px] [&_svg]:w-[20px]",large:"[&_svg]:h-[20px] [&_svg]:w-[20px] pl-3",xlarge:"[&_svg]:h-[24px] [&_svg]:w-[24px] pl-3",xxlarge:"[&_svg]:h-[30px] [&_svg]:w-[30px] pl-3",xxxlarge:"[&_svg]:h-[42px] [&_svg]:w-[42px] pl-3"}},icon:{container:"shrink-0 flex items-center justify-center rounded-full p-3"},loading:{base:"relative",content:{base:"transition-opacity duration-300",active:"opacity-40"},spinner:`
      absolute
      text-foreground-lighter animate-spin
      inset-0
      size-5
      m-auto
    `}},n=(0,r.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:t}}=(0,r.useContext)(n);return JSON.parse(t=JSON.stringify(t).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},980533,e=>{"use strict";e.s(["getPathSegment",0,function(e,r){return e.split("/")[r]},"getPathnameWithoutQuery",0,function(e,r){return null==e?r:e.split(/[?#]/)[0]??r}])}]);

//# debugId=7b2a958c-d73e-7b51-fab5-0216bb54bcd3
//# sourceMappingURL=159388ccdpw8-.js.map