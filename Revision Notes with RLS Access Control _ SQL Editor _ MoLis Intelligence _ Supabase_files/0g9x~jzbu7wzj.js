;!function(){try { var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof global?global:"undefined"!=typeof window?window:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&((e._debugIds|| (e._debugIds={}))[n]="10767fc9-59f5-59e3-cbe4-bb332172a4fd")}catch(e){}}();
(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,71049,e=>{"use strict";var r,t=e.i(221628),o=e.i(416340),a=e.i(174617),n=e.i(608652),i=e.i(199786),s=e.i(78892),l=e.i(127200),d=e.i(112466),u=e.i(169525),c=e.i(600317),p=e.i(538469),m="HoverCard",[f,g]=(0,n.createContextScope)(m,[l.createPopperScope]),x=(0,l.createPopperScope)(),[h,b]=f(m),v=e=>{let{__scopeHoverCard:r,children:a,open:n,defaultOpen:s,onOpenChange:d,openDelay:u=700,closeDelay:c=300}=e,p=x(r),f=o.useRef(0),g=o.useRef(0),b=o.useRef(!1),v=o.useRef(!1),[y,w]=(0,i.useControllableState)({prop:n,defaultProp:s??!1,onChange:d,caller:m}),j=o.useCallback(()=>{clearTimeout(g.current),f.current=window.setTimeout(()=>w(!0),u)},[u,w]),_=o.useCallback(()=>{clearTimeout(f.current),b.current||v.current||(g.current=window.setTimeout(()=>w(!1),c))},[c,w]),z=o.useCallback(()=>w(!1),[w]);return o.useEffect(()=>()=>{clearTimeout(f.current),clearTimeout(g.current)},[]),(0,t.jsx)(h,{scope:r,open:y,onOpenChange:w,onOpen:j,onClose:_,onDismiss:z,hasSelectionRef:b,isPointerDownOnContentRef:v,children:(0,t.jsx)(l.Root,{...p,children:a})})};v.displayName=m;var y="HoverCardTrigger",w=o.forwardRef((e,r)=>{let{__scopeHoverCard:o,...n}=e,i=b(y,o),s=x(o);return(0,t.jsx)(l.Anchor,{asChild:!0,...s,children:(0,t.jsx)(c.Primitive.a,{"data-state":i.open?"open":"closed",...n,ref:r,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,R(i.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,R(i.onClose)),onFocus:(0,a.composeEventHandlers)(e.onFocus,i.onOpen),onBlur:(0,a.composeEventHandlers)(e.onBlur,i.onClose),onTouchStart:(0,a.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});w.displayName=y;var j="HoverCardPortal",[_,z]=f(j,{forceMount:void 0}),C=e=>{let{__scopeHoverCard:r,forceMount:o,children:a,container:n}=e,i=b(j,r);return(0,t.jsx)(_,{scope:r,forceMount:o,children:(0,t.jsx)(u.Presence,{present:o||i.open,children:(0,t.jsx)(d.Portal,{asChild:!0,container:n,children:a})})})};C.displayName=j;var P="HoverCardContent",E=o.forwardRef((e,r)=>{let o=z(P,e.__scopeHoverCard),{forceMount:n=o.forceMount,...i}=e,s=b(P,e.__scopeHoverCard);return(0,t.jsx)(u.Presence,{present:n||s.open,children:(0,t.jsx)(N,{"data-state":s.open?"open":"closed",...i,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,R(s.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,R(s.onClose)),ref:r})})});E.displayName=P;var N=o.forwardRef((e,n)=>{let{__scopeHoverCard:i,onEscapeKeyDown:d,onPointerDownOutside:u,onFocusOutside:c,onInteractOutside:m,...f}=e,g=b(P,i),h=x(i),v=o.useRef(null),y=(0,s.useComposedRefs)(n,v),[w,j]=o.useState(!1);return o.useEffect(()=>{if(w){let e=document.body;return r=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=r,e.style.webkitUserSelect=r}}},[w]),o.useEffect(()=>{if(v.current){let e=()=>{j(!1),g.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(g.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!1}}},[g.isPointerDownOnContentRef,g.hasSelectionRef]),o.useEffect(()=>{v.current&&(function(e){let r=[],t=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;t.nextNode();)r.push(t.currentNode);return r})(v.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,t.jsx)(p.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:m,onEscapeKeyDown:d,onPointerDownOutside:u,onFocusOutside:(0,a.composeEventHandlers)(c,e=>{e.preventDefault()}),onDismiss:g.onDismiss,children:(0,t.jsx)(l.Content,{...h,...f,onPointerDown:(0,a.composeEventHandlers)(f.onPointerDown,e=>{e.currentTarget.contains(e.target)&&j(!0),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!0}),ref:y,style:{...f.style,userSelect:w?"text":void 0,WebkitUserSelect:w?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),S=o.forwardRef((e,r)=>{let{__scopeHoverCard:o,...a}=e,n=x(o);return(0,t.jsx)(l.Arrow,{...n,...a,ref:r})});function R(e){return r=>"touch"===r.pointerType?void 0:e()}S.displayName="HoverCardArrow",e.s(["Arrow",0,S,"Content",0,E,"HoverCard",0,v,"HoverCardArrow",0,S,"HoverCardContent",0,E,"HoverCardPortal",0,C,"HoverCardTrigger",0,w,"Portal",0,C,"Root",0,v,"Trigger",0,w,"createHoverCardScope",0,g],61413);var k=e.i(61413),k=k,$=e.i(843778);let T=k.Root,F=k.Trigger,O=o.forwardRef(({className:e,align:r="center",animate:o="zoom-in",sideOffset:a=4,...n},i)=>(0,t.jsx)(k.Portal,{children:(0,t.jsx)(k.Content,{ref:i,align:r,sideOffset:a,className:(0,$.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===o?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...n})}));O.displayName=k.Content.displayName,e.s(["HoverCard",0,T,"HoverCardContent",0,O,"HoverCardTrigger",0,F],71049)},540203,e=>{"use strict";var r=e.i(26898),t=e.i(125356),o=e.i(795513),a=e.i(234745),n=e.i(280590),i=e.i(2579);async function s({orgSlug:e},r,t){if(!e)throw Error("orgSlug is required");let{error:o,data:n}=await (0,a.get)("/platform/organizations/{slug}/billing/subscription",{params:{path:{slug:e}},signal:r,headers:t});return o&&(0,a.handleError)(o),n}e.s(["useHasAccessToProjectLevelPermissions",0,e=>{let{hasAccess:r}=(0,n.useCheckEntitlements)("project_scoped_roles",e);return r},"useOrgSubscriptionQuery",0,({orgSlug:e},{enabled:a=!0,...n}={})=>{let{can:l}=(0,i.useAsyncCheckPermissions)(r.PermissionAction.BILLING_READ,"stripe.subscriptions");return(0,t.useQuery)({queryKey:o.subscriptionKeys.orgSubscription(e),queryFn:({signal:r})=>s({orgSlug:e},r),enabled:a&&l&&void 0!==e,staleTime:36e5,...n})}])},567558,e=>{"use strict";var r=e.i(221628),t=e.i(26898),o=e.i(416340),a=e.i(837710),n=e.i(710483),i=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:o,error:n})=>(0,r.jsx)(a.Button,{asChild:!0,type:"default",className:"w-min",children:(0,r.jsx)(i.SupportLink,{queryParams:{category:t.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:o,error:n?.message},children:"Contact support"})}),d=({projectRef:e,subject:t,description:a="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:i,className:d,showIcon:u=!0,layout:c="responsive",showInstructions:p=!0,showErrorPrefix:m=!0,children:f,additionalActions:g})=>{let x=(0,s.useTrack)(),h=(0,o.useRef)(!1),b=i?.message?.includes("503")?"503 Service Temporarily Unavailable":i?.message;return(0,o.useEffect)(()=>{!h.current&&(h.current=!0,.1>Math.random()&&x("dashboard_error_created",{source:"admonition"}))},[x]),(0,r.jsx)(n.Admonition,{type:"warning",layout:g?"vertical":c,showIcon:u,title:t,description:(0,r.jsxs)(r.Fragment,{children:[i?.message&&(0,r.jsxs)("p",{children:[m&&"Error: ",b]}),p&&(0,r.jsx)("p",{children:a}),f]}),actions:g?(0,r.jsxs)(r.Fragment,{children:[g,(0,r.jsx)(l,{projectRef:e,subject:t,error:i})]}):(0,r.jsx)(l,{projectRef:e,subject:t,error:i}),className:d})};e.s(["AlertError",0,d,"default",0,d])},417403,e=>{"use strict";var r=e.i(907019);e.s(["default",0,r])},793595,e=>{"use strict";var r=e.i(125356),t=e.i(711950),o=e.i(234745);async function a({slug:e},r){if(!e)throw Error("slug is required");let[t,n]=await Promise.all([(0,o.get)("/platform/organizations/{slug}/members",{params:{path:{slug:e}},signal:r}),(0,o.get)("/platform/organizations/{slug}/members/invitations",{params:{path:{slug:e}},signal:r})]),{data:i,error:s}=t,{data:l,error:d}=n;return s&&(0,o.handleError)(s),d&&(0,o.handleError)(d),[...i,...l.invitations.map(e=>({...{invited_at:e.invited_at,invited_id:e.id,mfa_enabled:!1,username:e.invited_email.slice(0,1),primary_email:e.invited_email},role_ids:[e.role_id]}))]}e.s(["useOrganizationMembersQuery",0,({slug:e},{enabled:o=!0,...n}={})=>(0,r.useQuery)({queryKey:t.organizationKeys.members(e),queryFn:({signal:r})=>a({slug:e},r),enabled:o&&void 0!==e,...n})])},617976,e=>{"use strict";e.s(["organizationKeys",0,{rolesV2:e=>["organization-members",e,"roles-v2"],invitations:e=>["organization-members",e,"invitations"],invitation:(e,r)=>["organization-members",e,"invitations",r],token:(e,r)=>["organization-members",e,"token",r]}])},794231,388531,781894,e=>{"use strict";var r=e.i(221628),t=e.i(26898);e.i(128328);var o=e.i(657588),a=e.i(158639),n=e.i(561978),i=e.i(837710),s=e.i(215312),l=e.i(344580),d=e.i(416340),u=e.i(67318),c=e.i(739114),p=e.i(587433),m=e.i(253214),f=e.i(20482),g=e.i(511541),x=e.i(613580),h=e.i(538482),b=e.i(417403),v=e.i(125356),y=e.i(617976),w=e.i(234745);let j=["Owner","Administrator","Developer","Read-only"];async function _({slug:e},r){if(!e)throw Error("slug is required");let{data:t,error:o}=await (0,w.get)("/platform/organizations/{slug}/roles",{params:{path:{slug:e}},headers:{Version:2},signal:r});return o&&(0,w.handleError)(o),t}let z=({slug:e},{enabled:r=!0,...t}={})=>(0,v.useQuery)({queryKey:y.organizationKeys.rolesV2(e),queryFn:({signal:r})=>_({slug:e},r),enabled:r&&void 0!==e,select:e=>({...e,org_scoped_roles:e.org_scoped_roles.sort((e,r)=>j.indexOf(e.name)-j.indexOf(r.name))}),...t});e.s(["useOrganizationRolesV2Query",0,z],388531);var C=e.i(793595),P=e.i(705541);async function E({slug:e,plan:r,note:t}){if(!e)throw Error("Slug is required");let{data:o,error:a}=await (0,w.post)("/platform/organizations/{slug}/billing/upgrade-request",{params:{path:{slug:e}},body:{requested_plan:r,note:t}});return a&&(0,w.handleError)(a),o}var N=e.i(265735),S=e.i(635494),R=e.i(967052);let k=b.default.object({note:b.default.string().optional()}),$="request-upgrade-form",T=({block:e=!1,plan:t="Pro",addon:o,featureProposition:a,children:n,className:s,type:b="primary"})=>{let[v,y]=(0,d.useState)(!1),w=(0,R.useTrack)(),{data:j}=(0,S.useSelectedProjectQuery)(),{data:_}=(0,N.useSelectedOrganizationQuery)(),T=_?.slug,F=_?.plan?.id,O="free"===F,{data:q=[]}=(0,C.useOrganizationMembersQuery)({slug:_?.slug}),{data:L}=z({slug:_?.slug}),D=L?.org_scoped_roles??[],{mutate:H,isPending:A}=(({onSuccess:e,onError:r,...t}={})=>(0,P.useMutation)({mutationFn:e=>E(e),async onSuccess(r,t,o){await e?.(r,t,o)},async onError(e,t,o){void 0===r?c.toast.error(`Failed to send upgrade request: ${e.message}`):r(e,t,o)},...t}))({onSuccess:()=>{w("request_upgrade_submitted",{requestedPlan:t,addon:o,currentPlan:F}),c.toast.success("Successfully sent request to billing owners!"),y(!1)}}),B="pitr"===o?"PITR":"customDomain"===o?"Custom domain":"ipv4"===o?"dedicated IPv4 address":"",I=j?`for the project "${j?.name}"`:_?`for the organization "${_.name}"`:"",V="spendCap"===o?"disable spend cap":"computeSize"===o?"change the compute size":`enable the ${B} add-on`,U=o?"spendCap"===o?"Request to disable spend cap":"computeSize"===o?"Request to change compute size":`Request to enable the ${B} add-on`:`Request an upgrade for the ${t} Plan`,M=n||(o?"spendCap"===o?"Request to disable spend cap":"computeSize"===o?"Request to change compute":"Request to enable addon":`Request upgrade to ${t}`),Q={note:o?`We'd like to ${O?"upgrade to Pro and ":""}${V} ${I} so that we can ${a}`:`We'd like to upgrade to the ${t} plan ${a?`to ${a} `:""}${I}`},W=(0,u.useForm)({resolver:(0,l.zodResolver)(k),defaultValues:Q,values:Q}),K=q.filter(e=>{let r=e.role_ids.map(e=>D.find(r=>r.id===e)?.name).filter(Boolean);return!e.invited_id&&(r.includes("Owner")||r.includes("Administrator"))}),Z=async e=>{if(!T)return console.error("Slug is required");H({slug:T,plan:t,note:e.note})};return(0,r.jsxs)(m.Dialog,{open:v,onOpenChange:e=>{e&&w("request_upgrade_modal_opened",{requestedPlan:t,addon:o,currentPlan:F,featureProposition:a}),y(e)},children:[(0,r.jsx)(m.DialogTrigger,{asChild:!0,children:(0,r.jsx)(i.Button,{block:e,type:b,className:s,children:M})}),(0,r.jsx)(m.DialogContent,{children:(0,r.jsx)(f.Form,{...W,children:(0,r.jsxs)("form",{id:$,onSubmit:W.handleSubmit(Z),children:[(0,r.jsxs)(m.DialogHeader,{children:[(0,r.jsx)(m.DialogTitle,{children:U}),(0,r.jsx)(m.DialogDescription,{children:"Let your organization's billing owners know your interest in this"})]}),(0,r.jsx)(m.DialogSectionSeparator,{}),(0,r.jsxs)(m.DialogSection,{className:"flex flex-col gap-y-6",children:[(0,r.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,r.jsx)("p",{className:"text-sm",children:"Your request will be sent to the following emails, who are billing owners of your organization:"}),(0,r.jsxs)("div",{className:"text-sm flex gap-x-2",children:[(0,r.jsx)("p",{children:K.slice(0,2).map(e=>e.primary_email).join(", ")}),K.length>2&&(0,r.jsxs)(x.Tooltip,{children:[(0,r.jsx)(x.TooltipTrigger,{tabIndex:-1,children:(0,r.jsx)(p.Badge,{children:"+1 others"})}),(0,r.jsx)(x.TooltipContent,{side:"bottom",children:(0,r.jsx)("ul",{className:"",children:K.slice(2).map(e=>(0,r.jsx)("li",{children:e.primary_email},e.gotrue_id))})})]})]})]}),(0,r.jsx)(f.FormField,{control:W.control,name:"note",render:({field:e})=>(0,r.jsx)(h.FormItemLayout,{name:"note",label:"Add a note to your request (optional)",layout:"vertical",children:(0,r.jsx)(f.FormControl,{children:(0,r.jsx)(g.TextArea,{id:"note",...e,rows:3,placeholder:o?"spendCap"===o?"e.g. We need to disabled spend cap on this project to do something":"e.g. We need to enable this add-on to do something with the project":"e.g. We need to upgrade to the Pro plan to use this feature"})})})})]}),(0,r.jsxs)(m.DialogFooter,{children:[(0,r.jsx)(i.Button,{type:"default",disabled:A,onClick:()=>y(!1),children:"Cancel"}),(0,r.jsx)(i.Button,{htmlType:"submit",form:$,loading:A,children:"Submit request"})]})]})})})]})};e.s(["RequestUpgradeToBillingOwners",0,T],781894);var F=e.i(196621),O=e.i(2579),q=e.i(912793);let L="<Specify which plan to upgrade to: Pro | Team | Enterprise>";e.s(["PLAN_REQUEST_EMPTY_PLACEHOLDER",0,L,"UpgradePlanButton",0,({source:e,variant:l="primary",plan:d="Pro",addon:u,featureProposition:c,disabled:p,children:m,className:f,slug:g,onClick:x})=>{let{ref:h}=(0,a.useParams)(),{data:b}=(0,N.useSelectedOrganizationQuery)(),v=b?.plan?.id==="free",y=g??b?.slug??"_",w=(0,o.useFlag)("disableProjectCreationAndUpdate"),{billingAll:j}=(0,q.useIsFeatureEnabled)(["billing:all"]),{can:_}=(0,O.useAsyncCheckPermissions)(t.PermissionAction.BILLING_WRITE,"stripe.subscriptions",void 0,{organizationSlug:y}),z=`Enquiry to upgrade ${d?`to ${d} `:""}plan for organization`,C=`Name: ${b?.name}
Slug: ${y}
Requested plan: ${d??L}`,P="spendCap"===u,E=!v&&!!u,S=P?`/org/${y??"_"}/billing?panel=costControl&source=${e}`:E?"computeSize"===u?`/project/${h??"_"}/settings/compute-and-disk`:`/project/${h??"_"}/settings/addons?panel=${u}&source=${e}`:`/org/${y??"_"}/billing?panel=subscriptionPlan&source=${e}`,R=m||(E?"computeSize"===u?"Change compute size":"Enable add-on":`Upgrade to ${d}`),k=j?(0,r.jsx)(n.default,{href:S,children:R}):(0,r.jsx)(F.SupportLink,{queryParams:{orgSlug:y,category:"Plan_upgrade",subject:z,message:C},children:R});return _?w?(0,r.jsx)(s.ButtonTooltip,{disabled:!0,type:l,className:f,tooltip:{content:{side:"bottom",text:"Plan changes are currently disabled, our engineers are working on a fix"}},children:R}):(0,r.jsx)(i.Button,{asChild:!0,type:l,disabled:p,className:f,onClick:x,children:k}):(0,r.jsx)(T,{plan:d,addon:u,featureProposition:c,className:f,type:l,children:m})}],794231)},202003,e=>{"use strict";e.s(["buildStudioPageTitle",0,e=>{let r=[e.entity,e.section,e.surface,e.project,e.org,e.brand],t=[];return r.forEach(e=>{let r=(e=>{if(void 0===e)return;let r=e.trim().replace(/\s+/g," ");if(0!==r.length)return r.length<=60?r:`${r.slice(0,59).trimEnd()}…`})(e);if(!r)return;let o=t[t.length-1];(void 0===o||o.toLowerCase()!==r.toLowerCase())&&t.push(r)}),t.join(" | ")}])},95053,e=>{"use strict";var r=e.i(221628),t=e.i(766181),o=e.i(416340),a=e.i(843778),n=e.i(20482),i=e.i(737018),s=e.i(282410);let l=(0,t.cva)("relative grid gap-10",{variants:{size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},align:{left:"",right:""},responsive:{true:"",false:""},layout:{horizontal:"flex flex-col gap-2 md:grid md:grid-cols-12",vertical:"flex flex-col gap-2",flex:"flex flex-row gap-3","flex-row-reverse":"flex flex-col-reverse gap-2 md:gap-6 md:flex-row-reverse md:justify-between"},flex:{true:"",false:""}},compoundVariants:[{layout:"flex",align:"right",className:"justify-between"},{layout:"flex-row-reverse",align:"right",className:"justify-between"}],defaultVariants:{}}),d=(0,t.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"flex flex-col gap-2 col-span-4",vertical:"flex flex-row gap-2 justify-between",flex:"flex flex-col gap-0 min-w-0","flex-row-reverse":"flex flex-col min-w-0 grow"},labelLayout:{horizontal:"",vertical:"","":""}},compoundVariants:[{flex:!0,align:"left",className:"order-2"},{flex:!0,align:"right",className:"order-1"},{layout:["vertical","flex"],labelLayout:void 0,flex:!1,className:"flex flex-row gap-2 justify-between"},{layout:"horizontal",className:"flex flex-col gap-2"}],defaultVariants:{}}),u=(0,t.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"order-1",right:"order-2"},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:"order-1"},{flex:!0,align:"right",className:"order-2"},{layout:["vertical","flex"],className:"col-span-12"},{layout:"horizontal",align:"left",className:"col-span-8"},{layout:"horizontal",align:"right",className:"text-right"}],defaultVariants:{}}),c=(0,t.cva)("text-foreground-lighter leading-normal",{variants:{size:{...s.SIZE.text},layout:{vertical:"mt-2",horizontal:"mt-2",flex:"","flex-row-reverse":""}},defaultVariants:{}}),p=(0,t.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),m=(0,t.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),f=(0,t.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),g=(0,t.cva)("",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:""},{flex:!0,align:"right",className:"order-last"},{layout:"flex-row-reverse",className:"flex flex-col justify-center items-start md:items-end shrink-0 md:w-1/2 xl:w-2/5 [&>div]:md:w-full"}]}),x=(0,t.cva)("",{variants:{nonBoxInput:{true:"",false:""},label:{true:"",false:""},layout:{vertical:"",horizontal:"","flex-row-reverse":""}},compoundVariants:[{nonBoxInput:!0,label:!0,layout:"vertical",className:"my-3"},{nonBoxInput:!0,label:!0,layout:"horizontal",className:"my-3 md:mt-0 mb-3"}],defaultVariants:{}}),h=o.default.forwardRef(({align:e="left",className:t,description:o,id:s,label:h,labelOptional:b,layout:v="vertical",style:y,labelLayout:w,size:j="medium",beforeLabel:_,afterLabel:z,nonBoxInput:C=!h,hideMessage:P=!1,isReactForm:E,error:N,...S},R)=>{let k="flex"===v||"flex-row-reverse"===v,$=!!(h||_||z),T=E&&!P?(0,r.jsx)(n.FormMessage,{className:(0,a.cn)("mt-2 transition-all duration-300 ease-in-out","flex-row-reverse"===v&&"mt-0"),"data-formlayout-id":"message"}):N&&!P?(0,r.jsx)("p",{className:(0,a.cn)("mt-2 text-sm text-destructive","flex-row-reverse"===v&&"mt-0"),children:N}):null,F=o&&E?(0,r.jsx)(n.FormDescription,{className:(0,a.cn)(c({size:j,layout:v})),"data-formlayout-id":"description",id:`${s}-description`,children:o}):o?(0,r.jsx)("p",{className:(0,a.cn)(c({size:j,layout:v}),"text-sm text-foreground-light"),"data-formlayout-id":"description",children:o}):null,O=()=>(0,r.jsxs)(r.Fragment,{children:[_&&(0,r.jsx)("span",{className:(0,a.cn)(p({size:j})),id:s+"-before","data-formlayout-id":"beforeLabel",children:(0,r.jsx)("span",{children:_})}),(0,r.jsx)("span",{children:h}),z&&(0,r.jsx)("span",{className:(0,a.cn)(m({size:j})),id:s+"-after","data-formlayout-id":"afterLabel",children:z})]});return(0,r.jsxs)("div",{ref:R,...S,className:(0,a.cn)(l({size:j,flex:k,align:e,layout:v}),t),children:[k&&(0,r.jsxs)("div",{className:(0,a.cn)(g({flex:k,align:e,layout:v})),children:[S.children,"flex-row-reverse"===v&&T]}),$||b||"horizontal"===v?(0,r.jsx)(r.Fragment,{children:(0,r.jsxs)("div",{className:(0,a.cn)(d({align:e,labelLayout:w,flex:k,layout:v})),"data-formlayout-id":"labelContainer",children:[$&&E?(0,r.jsx)(n.FormLabel,{className:"text-foreground flex gap-2 items-center wrap-break-word","data-formlayout-id":"formLabel",htmlFor:S.name||s,children:(0,r.jsx)(O,{})}):(0,r.jsx)(i.Label,{className:"text-foreground flex gap-2 items-center wrap-break-word leading-normal","data-formlayout-id":"label",htmlFor:S.name||s,children:(0,r.jsx)(O,{})}),b&&(0,r.jsx)("span",{className:(0,a.cn)(f({size:j})),id:s+"-optional","data-formlayout-id":"labelOptional",children:b}),k&&(0,r.jsxs)(r.Fragment,{children:[F,"flex-row-reverse"!==v&&T]})]})}):null,!k&&(0,r.jsx)("div",{className:(0,a.cn)(u({align:e,layout:v})),style:y,"data-formlayout-id":"dataContainer",children:(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("div",{className:(0,a.cn)(x({nonBoxInput:C,label:h,layout:v})),"data-formlayout-id":"nonBoxInputContainer",children:S.children}),T,F]})})]})});e.s(["FormLayout",0,h])},538482,e=>{"use strict";var r=e.i(221628),t=e.i(416340),o=e.i(20482),a=e.i(95053);let n=(0,t.forwardRef)(({...e},t)=>(0,r.jsx)(o.FormItem,{children:(0,r.jsx)(a.FormLayout,{ref:t,isReactForm:!0,...e,children:e.children})}));n.displayName="FormItemLayout",e.s(["FormItemLayout",0,n])},344580,e=>{"use strict";var r=e.i(67318),t=function(e,t,o){if(e&&"reportValidity"in e){var a=(0,r.get)(o,t);e.setCustomValidity(a&&a.message||""),e.reportValidity()}},o=function(e,r){var o=function(o){var a=r.fields[o];a&&a.ref&&"reportValidity"in a.ref?t(a.ref,o,e):a.refs&&a.refs.forEach(function(r){return t(r,o,e)})};for(var a in r.fields)o(a)},a=function(e,t){t.shouldUseNativeValidation&&o(e,t);var a={};for(var s in e){var l=(0,r.get)(t.fields,s),d=Object.assign(e[s]||{},{ref:l&&l.ref});if(i(t.names||Object.keys(e),s)){var u=Object.assign({},n((0,r.get)(a,s)));(0,r.set)(u,"root",d),(0,r.set)(a,s,u)}else(0,r.set)(a,s,d)}return a},n=function(e){return Array.isArray(e)?e.filter(Boolean):[]},i=function(e,r){return e.some(function(e){return e.startsWith(r+".")})},s=function(e,t){for(var o={};e.length;){var a=e[0],n=a.code,i=a.message,s=a.path.join(".");if(!o[s])if("unionErrors"in a){var l=a.unionErrors[0].errors[0];o[s]={message:l.message,type:l.code}}else o[s]={message:i,type:n};if("unionErrors"in a&&a.unionErrors.forEach(function(r){return r.errors.forEach(function(r){return e.push(r)})}),t){var d=o[s].types,u=d&&d[a.code];o[s]=(0,r.appendErrors)(s,t,o,n,u?[].concat(u,a.message):a.message)}e.shift()}return o};e.s(["zodResolver",0,function(e,r,t){return void 0===t&&(t={}),function(n,i,l){try{return Promise.resolve(function(a){try{var i=Promise.resolve(e["sync"===t.mode?"parse":"parseAsync"](n,r)).then(function(e){return l.shouldUseNativeValidation&&o({},l),{errors:{},values:t.raw?n:e}})}catch(e){return a(e)}return i&&i.then?i.then(void 0,a):i}(function(e){if(null!=e.errors)return{values:{},errors:a(s(e.errors,!l.shouldUseNativeValidation&&"all"===l.criteriaMode),l)};throw e}))}catch(e){return Promise.reject(e)}}}],344580)},345216,e=>{"use strict";let r=(0,e.i(679709).default)("BookOpen",[["path",{d:"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z",key:"vv98re"}],["path",{d:"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",key:"1cyq3y"}]]);e.s(["BookOpen",0,r],345216)},513826,e=>{"use strict";var r=e.i(221628),t=e.i(345216),o=e.i(837710);e.s(["DocsButton",0,({href:e,abbrev:a=!0,className:n})=>(0,r.jsx)(o.Button,{asChild:!0,type:"default",className:n,icon:(0,r.jsx)(t.BookOpen,{}),onClick:e=>e.stopPropagation(),children:(0,r.jsx)("a",{target:"_blank",rel:"noopener noreferrer",href:e,children:a?"Docs":"Documentation"})})])},938933,e=>{"use strict";var r=e.i(416340);let t={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${t.size.text.tiny} ${t.size.padding.tiny}`,small:`${t.size.text.small} ${t.size.padding.small}`,medium:`${t.size.text.medium} ${t.size.padding.medium}`,large:`${t.size.text.large} ${t.size.padding.large}`,xlarge:`${t.size.text.xlarge} ${t.size.padding.xlarge}`},a={card:{base:`
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
      `},block:"w-full flex items-center justify-center",size:{...o},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
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
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `,size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}},n=(0,r.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:t}}=(0,r.useContext)(n);return JSON.parse(t=JSON.stringify(t).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},980533,e=>{"use strict";e.s(["getPathSegment",0,function(e,r){return e.split("/")[r]},"getPathnameWithoutQuery",0,function(e,r){return null==e?r:e.split(/[?#]/)[0]??r}])}]);

//# debugId=10767fc9-59f5-59e3-cbe4-bb332172a4fd
//# sourceMappingURL=1814-v0w25795.js.map