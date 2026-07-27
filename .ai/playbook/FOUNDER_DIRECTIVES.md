# MoLis Intelligence Founder Directives

## Status and Authority of This Document

This document records the permanent product and engineering directives of George, founder and final decision-maker of MoLis Intelligence. It is a binding source of truth for Codex, Claude Code, reviewers, architects, engineers, Quality Assurance agents, security agents, and every future MoLis agent or contributor.

These directives preserve the complete meaning of the directive set supplied by George. Editorial corrections improve spelling, grammar, punctuation, sentence structure, and readability only. They do not weaken, narrow, reinterpret, or replace George's vision. If another instruction conflicts with this document, the conflict must be raised for George's decision rather than resolved by silently overriding these directives.

## A. Authority, Mission, Identity, and Scale

### Directive 1 — Founder Authority

George is the founder and final decision-maker of MoLis Intelligence. Material product, engineering, risk, and vision decisions that require founder approval must be presented to George clearly, with the relevant evidence, trade-offs, risks, and recommended course of action.

### Directive 2 — MoLis Mission

MoLis must make students' lives easier and better by giving them an exceptionally capable, trustworthy, secure, and adaptive system that supports everything they need throughout student life.

### Directive 3 — MoLis Product Identity

MoLis is not merely another AI study application. It is an intelligent, adaptive operating system for students: a unified system that understands each student, supports the student's complete experience, and becomes more valuable over time.

### Directive 4 — Ten-Year Vision

Every material decision must support a ten-year vision for MoLis. Architecture, product design, operations, security, data, AI, and organisational practices must be capable of evolving for the next decade rather than serving only the immediate release.

### Directive 5 — More Than One Billion Users

MoLis must be designed with the explicit ambition and technical target of serving more than one billion users. This target must not be reduced, treated as rhetorical, or used to justify premature complexity; it must guide scalable foundations, measurable capacity planning, and responsible architectural evolution.

### Directive 6 — Presence in Schools and Households

MoLis must be built to become present and trusted in schools and households around the world. Its product quality, accessibility, privacy, reliability, security, and reputation must be suitable for that level of adoption and responsibility.

## B. Student Trust, Quality, and Maintainability

### Directive 7 — Student Privacy

Student privacy is fundamental. MoLis must collect, use, retain, share, and protect student data responsibly, transparently, lawfully, and only for legitimate purposes consistent with user expectations and George's vision.

### Directive 8 — Never Knowingly Ship Broken Features

MoLis must never knowingly ship a broken feature. Known defects that materially compromise functionality, safety, security, privacy, data integrity, accessibility, or the promised student experience must block release until resolved or explicitly decided by George with full disclosure of the risk.

### Directive 9 — Long-Term Maintainability Over Quick Hacks

Long-term maintainability must take priority over quick hacks. Short-term pressure must not produce fragile, duplicated, opaque, or unsafe implementation. Any unavoidable temporary measure must be identified as temporary, contained, monitored, owned, documented, and scheduled for durable resolution.

### Directive 10 — Users Should Not Face Errors

Students should not be made to face avoidable errors. MoLis must prevent errors wherever possible and, when failures occur, handle them without exposing internal details, abandoning user work, or leaving the student without a clear and safe next step.

## C. Performance, Stability, and Resilience

### Directive 11 — High Performance as User Numbers Grow

MoLis must maintain high performance as user numbers grow, including on the path toward more than one billion users. Capacity, latency, throughput, data access, caching, concurrency, cost, and operational limits must be measured and improved before they damage the student experience.

### Directive 12 — Fast APIs

MoLis APIs must be fast, predictable, secure, observable, and designed for realistic production traffic. Performance expectations must be explicit and tested at representative loads and data volumes.

### Directive 13 — Fast AI Responses

AI responses must be fast enough to preserve a smooth and natural student experience without sacrificing correctness, security, privacy, or answer quality. The system must manage latency through appropriate architecture, streaming, model selection, caching where safe, and graceful progress feedback.

### Directive 14 — Prevent Performance Degradation Under Increased Usage

Increased usage must not be allowed to cause uncontrolled performance degradation. MoLis must use capacity planning, load testing, backpressure, rate protection, efficient resource use, autoscaling where appropriate, and degradation strategies that protect critical student journeys.

### Directive 15 — Application Stability

Application stability is a permanent product requirement. The product must behave consistently across supported platforms, traffic levels, data conditions, network states, and dependency failures.

### Directive 16 — Crash Prevention

MoLis must proactively prevent crashes through defensive design, boundary validation, resource management, compatibility testing, automated testing, production observability, and prompt remediation of crash patterns.

### Directive 17 — Graceful Recovery and Resilience

When a failure cannot be prevented, MoLis must recover gracefully. It must preserve student work, contain faults, support safe retries, avoid duplicate actions, provide understandable recovery paths, and restore full service without compromising data integrity or security.

## D. Engineering Advancement and Proactive Improvement

### Directive 18 — Advanced and Secure Engineering Throughout the Product

Advanced, secure engineering must apply from signup through every part of the product. Identity, onboarding, authentication, authorisation, data access, AI interactions, integrations, payments where applicable, settings, exports, deletion, support, and all other workflows must meet the same high standard.

### Directive 19 — Modern and Forward-Looking Frameworks and Technologies

MoLis should use modern, forward-looking frameworks and technologies when they provide durable value. Choices must be based on security, maturity, scalability, maintainability, performance, interoperability, ecosystem health, and long-term fit—not novelty alone.

### Directive 20 — Proactive Improvement Suggestions

Every MoLis agent and contributor must proactively identify and suggest improvements beyond the minimum requested implementation when those improvements would materially strengthen the product. Suggestions must be relevant, evidence-based, clearly separated from confirmed requirements, and proportionate to their cost and benefit.

### Directive 21 — User-Experience Improvement

Every meaningful change must consider how to improve the user experience. Technical completion is insufficient if the result remains confusing, slow, inaccessible, inconsistent, fragile, or needlessly demanding for students.

### Directive 22 — Brand-Reputation Protection

Every decision must protect and strengthen the MoLis brand reputation. Low-quality, unreliable, insecure, misleading, inaccessible, copied, or visibly unfinished work is incompatible with the trust MoLis intends to earn in schools and households worldwide.

## E. Security Ambition

### Directive 23 — Advanced Security Measures

MoLis must implement advanced, layered security measures across identity, access control, data, infrastructure, applications, APIs, AI systems, dependencies, devices, monitoring, incident response, and software delivery. Security must be designed in from the beginning and continuously improved.

### Directive 24 — Exceptionally Difficult to Compromise

MoLis must pursue the ambition of becoming exceptionally difficult to compromise. This requires defence in depth, least privilege, secure defaults, strong isolation, continuous testing, rapid vulnerability management, comprehensive monitoring, incident readiness, and ongoing alignment with current security research and guidance.

### Directive 25 — Protection Against Weaknesses Commonly Found in Poorly Generated AI Applications

MoLis must be protected against weaknesses commonly found in poorly generated AI applications, including insecure authentication or authorisation, exposed secrets, unsafe defaults, unvalidated input, injection risks, cross-tenant data exposure, excessive permissions, fabricated assumptions, missing failure handling, weak dependency control, inadequate tests, unsafe AI tool use, and unreviewed generated code.

## F. Cross-Platform and Worldwide Product

### Directive 26 — Apple Device Support

MoLis must support relevant Apple devices and operating environments as part of its cross-platform product strategy.

### Directive 27 — Android Device Support

MoLis must support relevant Android devices and operating environments as part of its cross-platform product strategy.

### Directive 28 — Phone Support

MoLis must deliver a complete, secure, accessible, high-quality experience on supported phones.

### Directive 29 — Tablet Support

MoLis must deliver a complete, secure, accessible, high-quality experience on supported tablets.

### Directive 30 — Desktop Computer Support

MoLis must deliver a complete, secure, accessible, high-quality experience on supported desktop computers.

### Directive 31 — Laptop Support

MoLis must deliver a complete, secure, accessible, high-quality experience on supported laptops.

### Directive 32 — Cross-Platform Readiness for Launch

Cross-platform readiness must be treated as a launch requirement, not an indefinite future enhancement. Supported Apple and Android devices, phones, tablets, desktop computers, and laptops must be professionally validated before the applicable launch.

### Directive 33 — Worldwide Accessibility

MoLis must be accessible to students worldwide. Product, language, accessibility, connectivity, device, performance, cultural, support, operational, and payment considerations where applicable must be addressed as the product expands internationally.

### Directive 34 — International Laws and Regulations

MoLis must comply with applicable international laws and regulations. Legal and regulatory obligations must be identified early and built into product, data, AI, security, accessibility, content, and operational design.

### Directive 35 — Country-Specific Compliance Considerations

Worldwide availability requires country-specific compliance analysis. MoLis must evaluate local requirements, restrictions, age-related protections, privacy rules, data-transfer obligations, consumer protections, accessibility duties, AI rules, educational requirements, and other relevant obligations before operating in a jurisdiction.

## G. Permanent Quality Assurance

### Directive 36 — Permanent Quality Assurance Agent

MoLis must maintain a permanent Quality Assurance Agent with continuing responsibility for product and system quality. Quality assurance is an ongoing function throughout planning, implementation, review, release, and production operation.

### Directive 37 — Professional Bug and System-Error Discovery

The Quality Assurance Agent must professionally and systematically discover bugs and system errors. It must investigate edge cases, failure states, permissions, data conditions, device differences, integrations, concurrency, recovery, and real student journeys—not merely confirm ideal-path behaviour.

### Directive 38 — Testing After Every Meaningful Application Change

Every meaningful application change must be followed by testing proportionate to its scope and risk. Relevant test categories below must be selected explicitly; critical categories must not be omitted for convenience or speed.

### Directive 39 — Functional Testing

Functional testing must verify that each feature behaves according to its specified requirements and student outcomes across success, failure, boundary, and permission scenarios.

### Directive 40 — Unit Testing

Unit testing must verify isolated rules and behaviours with fast, deterministic tests that make regressions easy to locate.

### Directive 41 — Integration Testing

Integration testing must verify that components, services, databases, queues, AI systems, third-party dependencies, and other boundaries work correctly together.

### Directive 42 — System Testing

System testing must verify the complete MoLis system against end-to-end requirements in a representative environment.

### Directive 43 — API Testing

API testing must verify contracts, authentication, authorisation, validation, correctness, errors, idempotency, compatibility, rate behaviour, performance, and security.

### Directive 44 — Non-Functional Testing

Non-functional testing must verify the quality attributes of MoLis, including performance, scalability, reliability, resilience, security, accessibility, usability, compatibility, maintainability, and observability.

### Directive 45 — Performance Testing

Performance testing must measure latency, responsiveness, throughput, resource use, and critical student journeys against defined objectives under representative conditions.

### Directive 46 — Load Testing

Load testing must verify expected and projected usage levels, realistic traffic shapes, concurrent activity, data volumes, and sustained operation.

### Directive 47 — Stress Testing

Stress testing must identify system limits, failure behaviour, recovery characteristics, unsafe collapse modes, and the effectiveness of protective controls beyond expected load.

### Directive 48 — Security Testing

Security testing must assess applications, APIs, identity, access control, data isolation, infrastructure, dependencies, AI-specific threats, abuse cases, and incident controls using current standards and threat information.

### Directive 49 — Usability Testing

Usability testing must determine whether students can understand and complete important journeys efficiently, confidently, and without avoidable confusion or frustration.

### Directive 50 — Compatibility Testing

Compatibility testing must verify supported devices, operating systems, browsers, screen sizes, assistive technologies, network conditions, integrations, and version combinations.

### Directive 51 — Release Testing

Release testing must validate the complete release candidate, deployment configuration, migrations where applicable, feature controls, rollback path, monitoring, and critical student journeys before production exposure.

### Directive 52 — Regression Testing

Regression testing must verify that new changes have not broken existing product behaviour, security guarantees, data integrity, accessibility, performance, or supported platforms.

### Directive 53 — Alpha Testing

Alpha testing must evaluate incomplete or pre-release capabilities in a controlled internal environment to discover defects and product gaps before broader exposure.

### Directive 54 — Beta Testing

Beta testing must evaluate release candidates with a controlled external audience under explicit safeguards, feedback mechanisms, monitoring, and clear expectations.

### Directive 55 — Acceptance Testing

Acceptance testing must confirm that the product satisfies agreed requirements, student outcomes, founder directives, quality thresholds, and release criteria before final acceptance.

## H. UI/UX Transformation

### Directive 56 — Dedicated UI/UX Design Agent

MoLis must maintain a dedicated UI/UX design agent responsible for coherent, accessible, distinctive, high-quality product design and for major, clearly visible improvement of the current experience.

### Directive 57 — Current Inspiration from Leading Companies

The UI/UX design agent must research and draw current product-pattern inspiration from leading companies such as Apple, Uber, and Telegram, while evaluating why their successful patterns work and whether they are appropriate for students and MoLis.

### Directive 58 — Original MoLis Design, Not Direct Copying

Inspiration must result in an original MoLis design. Agents must not directly copy protected branding, visual identity, proprietary assets, or distinctive designs from Apple, Uber, Telegram, competitors, or any other company.

### Directive 59 — Major and Clearly Visible UI Improvements

UI work must produce major, clearly visible improvements rather than superficial or barely perceptible changes. The transformation must improve clarity, coherence, accessibility, ease of use, perceived quality, and the distinct identity of MoLis.

### Directive 60 — Smooth Animations

MoLis must use smooth, purposeful animations that reinforce context and feedback without slowing the student, causing distraction, or disregarding reduced-motion accessibility preferences.

### Directive 61 — Smooth Transitions Between Application Sections

Transitions between application sections must feel smooth, coherent, responsive, and spatially understandable, preserving context and avoiding abrupt or confusing changes.

### Directive 62 — Smooth Interaction While Using Features

Interaction within features must remain smooth and responsive across supported devices and realistic conditions. Loading, progress, optimistic updates, input, feedback, errors, and recovery must feel intentionally designed.

### Directive 63 — UI/UX Pro Max Skill

When the UI/UX Pro Max skill is available, it must be installed and used for relevant UI/UX work. Its recommendations remain subject to George's directives, MoLis architecture, security, accessibility, originality, evidence, and professional review.

## I. The Student Experience George Intends

### Directive 64 — The Experience Students Should Describe

MoLis must create an experience students can describe in substance as follows: “MoLis makes my life easier. It has everything I need, works reliably and consistently, adapts to my lifestyle and to my individual needs and wants, and has become indispensable to me.”

### Directive 65 — Make Students' Lives Easier

MoLis must make students' lives easier by reducing cognitive burden, removing unnecessary effort, coordinating fragmented needs, and helping students act confidently.

### Directive 66 — Everything Students Need

MoLis must pursue the ambition of containing everything students need within a coherent operating system. Capabilities must be integrated rather than becoming a disconnected collection of tools.

### Directive 67 — Reliability and Consistency

Students must be able to rely on MoLis consistently. Core behaviour, data, intelligence, availability, performance, and design must remain dependable across time, platforms, and contexts.

### Directive 68 — Personal Lifestyle Adaptation

MoLis must adapt to each student's personal lifestyle, including the student's routines, context, constraints, preferences, and changing circumstances, subject to privacy, consent, safety, and responsible data use.

### Directive 69 — Adaptation to Individual Needs and Wants

MoLis must adapt to each student's individual needs and wants instead of treating every student as the same. Adaptation must remain transparent, controllable, correctable, and aligned with the student's interests.

### Directive 70 — Become Indispensable to Students

MoLis must pursue the ambition of becoming indispensable to students through genuine usefulness, earned trust, integration, reliability, and personal relevance—not through manipulation, lock-in, anxiety, or artificial dependency.

## J. Intelligent and Adaptive MoLis

### Directive 71 — Not a Low-Quality AI-Generated Application

MoLis must never look, feel, or operate like a low-quality AI-generated application. Generated work must meet professional standards for architecture, security, originality, correctness, design, testing, accessibility, performance, reliability, and maintainability.

### Directive 72 — An Intelligent and Adaptive System

MoLis must be an intelligent and adaptive system that understands context, supports decisions and actions, and changes usefully as the student and the product evolve.

### Directive 73 — Consistently Grow with the User

MoLis must consistently grow with each user. Its relevance and support should deepen throughout the student's journey rather than reset, stagnate, or remain generic.

### Directive 74 — Increase in Knowledge and Intelligence

MoLis must increase in knowledge and intelligence over time through responsible system improvement, better models and tools, reliable knowledge, evaluated learning, and user-specific adaptation.

### Directive 75 — A Central MoLis Intelligence or Brain

MoLis must develop a central intelligence, or “brain,” that coordinates relevant context, knowledge, decisions, recommendations, and capabilities across the product. It must create shared intelligence without becoming an unsafe single point of failure, uncontrolled data store, or unreviewable decision-maker.

### Directive 76 — Responsible Learning from User Behaviour

MoLis must learn responsibly from user behaviour when lawful, expected, secure, and appropriate. Behavioural signals must be used to benefit the student, with data minimisation, transparency, consent or another valid basis where required, safeguards against manipulation, and ways to correct or control personalisation.

### Directive 77 — Responsible Learning from User Lifestyle

MoLis must learn responsibly from the student's lifestyle when lawful, expected, secure, and appropriate. Lifestyle information is sensitive context and must receive strong privacy controls, limited access, clear purpose, and protection against intrusive or discriminatory use.

### Directive 78 — Continuous Personal Adaptation

MoLis must continuously adapt to the individual while preventing unsafe drift, stale conclusions, feedback loops, unjustified inference, and loss of user control. Adaptation must be evaluated, explainable where consequential, reversible where practical, and designed to remain useful as the student changes.

## K. Shared Governance and Repository Truth

### Directive 79 — Shared Awareness Across All MoLis Agents and Roles

Codex, Claude Code, reviewers, architects, engineers, Quality Assurance agents, security agents, and every future MoLis agent must be made aware of and operate consistently with these directives.

### Directive 80 — Repository Documentation as the Permanent Shared Source of Truth

Repository documentation is the permanent shared source of truth for these directives. Material decisions, interpretations, approved clarifications, and amendments must be recorded durably in the repository so they remain available across people, agents, tools, and time.

## L. Internet-Enabled Advanced Recommendations

### Directive 81 — Use Current Internet Research to Improve Recommendations

Every MoLis agent must use the resources available through current internet research to improve the quality of its recommendations.

### Directive 82 — Go Beyond Basic Instructions and Existing Patterns

Agents must not limit themselves to basic implementation instructions or existing repository patterns. Existing patterns are evidence, not an automatic ceiling on product or engineering quality.

### Directive 83 — Research the Latest Relevant Information

When internet access is available, agents planning, designing, reviewing, or recommending changes must research the latest relevant information.

### Directive 84 — Prefer Official Documentation and Primary Sources

Research must prefer official documentation and primary sources. Secondary sources may supplement them when useful but must not displace stronger evidence without a stated reason.

### Directive 85 — Use Current Security Standards and Vulnerability Guidance

Agents must use current security standards, vulnerability guidance, threat intelligence, and authoritative remediation advice relevant to the work.

### Directive 86 — Use Current Architecture and Scalability Practices

Agents must use current architecture and scalability practices appropriate to MoLis, its present stage, and its ambition to serve more than one billion users.

### Directive 87 — Use Current AI Engineering Techniques

Agents must use current AI engineering techniques, including relevant practices for evaluation, grounding, tool safety, model behaviour, observability, privacy, security, reliability, and cost.

### Directive 88 — Use Current Accessibility Standards

Agents must use current accessibility standards and authoritative guidance so that MoLis remains usable by students with diverse access needs.

### Directive 89 — Use Current International Privacy and Regulatory Guidance

Agents must use current international privacy and regulatory guidance, including country-specific considerations where relevant, without presenting research as legal advice or replacing qualified legal review.

### Directive 90 — Use Current Performance and Infrastructure Practices

Agents must use current performance and infrastructure practices relevant to reliable, efficient, observable, resilient, and globally scalable operation.

### Directive 91 — Examine Successful Product Patterns

Agents must examine successful current product patterns from leading companies to understand approaches that could improve MoLis.

### Directive 92 — Use Competitor Research as Inspiration Without Copying

Agents must use competitor research as inspiration without copying protected branding, assets, visual identity, content, or designs.

### Directive 93 — Identify Improvements Beyond the Original Request

Agents must identify technologies or approaches that may improve MoLis beyond the original request when they are relevant to George's vision and offer meaningful value.

### Directive 94 — Provide Advanced, Multi-Dimensional Recommendations

Agents must provide advanced recommendations that improve user experience, reliability, security, scalability, intelligence, maintainability, and brand reputation.

### Directive 95 — Explain Meaningful Trade-offs

Agents must explain meaningful trade-offs, including relevant effects on students, security, privacy, cost, complexity, performance, reliability, delivery, and long-term maintenance.

### Directive 96 — Warn George About Long-Term Problems

Agents must warn George when a requested approach could create long-term problems. The warning must be specific, evidence-based, respectful of his authority, and accompanied by the likely consequences.

### Directive 97 — Suggest a Stronger Alternative

When a stronger alternative exists, agents must suggest it clearly, explain why it is stronger, and distinguish the recommendation from George's final decision.

### Directive 98 — Do Not Present Outdated Practices as Modern Best Practice

Agents must never present outdated practices as modern best practice. If legacy constraints require an older approach, that fact, its risks, and the migration path must be stated.

### Directive 99 — Record the Research Date

Agents must record the date on which time-sensitive research was checked so reviewers can judge its currency.

### Directive 100 — Cite Research-Based Recommendations

Agents must provide citations or source references for research-based recommendations, placing sources close enough to the relevant claim for review and verification.

## M. Required Classification of Claims and Decisions

### Directive 101 — Identify George's Founder Directives

Agents must clearly label George's founder directives and must not present them as optional professional recommendations.

### Directive 102 — Identify Repository-Confirmed Facts

Agents must clearly distinguish facts confirmed from the MoLis repository and, where practical, reference the relevant files, code, tests, configuration, history, or other repository evidence.

### Directive 103 — Identify Internet-Research Facts

Agents must clearly distinguish facts found through internet research and provide the applicable research date and sources.

### Directive 104 — Identify Professional Recommendations

Agents must clearly label professional recommendations, including their rationale, evidence, trade-offs, and expected benefit.

### Directive 105 — Identify Assumptions and Inferences

Agents must clearly label assumptions and inferences. They must not allow an unverified assumption to appear as a founder directive, repository fact, or researched fact.

### Directive 106 — Identify Decisions Requiring George's Approval

Agents must clearly identify decisions that require George's approval and provide enough context for an informed decision without making the decision silently on his behalf.

### Directive 107 — Research Must Support, Not Overwrite, George's Vision

Internet research must support George's vision. It must not be used to overwrite, narrow, soften, or weaken that vision.

## Clarifications Requiring George's Decision

1. **Complete original statement:** No additional prose source statement appeared after the `SOURCE TEXT` heading in the supplied instruction. This document therefore treats the full supplied directive set—Directives 1–80 and the complete Internet-Enabled Advanced Recommendations principle—as George's authoritative source. George should confirm whether any separate original statement was intended for inclusion.
2. **Exact student quotation:** The supplied directive set specifies the experience George wants students to describe and separately defines its required substance in Directives 65–70, but it does not provide an exact original quotation. Directive 64 preserves every specified element in a single student-facing statement. George should confirm whether he intended different exact wording.
3. **UI/UX Pro Max availability:** The directive requires installation and use of the UI/UX Pro Max skill “when available,” but availability is not defined. George should confirm whether “available” means present in an agent's approved tool catalogue, approved for installation, technically compatible with the environment, or another condition.
4. **Cross-platform launch scope:** The directives require cross-platform readiness for launch across the listed device categories, but they do not specify minimum supported operating-system, browser, device, or native-versus-web versions. These must be approved in a launch support matrix without weakening the cross-platform ambition.

## Founder Directive Coverage Register

| No. | Founder directive | Section | Preserved completely | Clarification required |
|---:|---|---|:---:|:---:|
| 1 | Founder authority | A | Yes | No |
| 2 | MoLis mission | A | Yes | No |
| 3 | MoLis product identity | A | Yes | No |
| 4 | Ten-year vision | A | Yes | No |
| 5 | Target of more than one billion users | A | Yes | No |
| 6 | Presence in schools and households | A | Yes | No |
| 7 | Student privacy | B | Yes | No |
| 8 | Never knowingly shipping broken features | B | Yes | No |
| 9 | Long-term maintainability over quick hacks | B | Yes | No |
| 10 | Users should not face errors | B | Yes | No |
| 11 | High performance as user numbers grow | C | Yes | No |
| 12 | Fast APIs | C | Yes | No |
| 13 | Fast AI responses | C | Yes | No |
| 14 | Prevention of performance degradation under increased usage | C | Yes | No |
| 15 | Application stability | C | Yes | No |
| 16 | Crash prevention | C | Yes | No |
| 17 | Graceful recovery and resilience | C | Yes | No |
| 18 | Advanced and secure engineering from signup through the entire product | D | Yes | No |
| 19 | Use of modern and forward-looking frameworks and technologies | D | Yes | No |
| 20 | Proactive improvement suggestions | D | Yes | No |
| 21 | User-experience improvement | D | Yes | No |
| 22 | Brand-reputation protection | D | Yes | No |
| 23 | Advanced security measures | E | Yes | No |
| 24 | Ambition to make MoLis exceptionally difficult to compromise | E | Yes | No |
| 25 | Protection against weaknesses commonly found in poorly generated AI applications | E | Yes | No |
| 26 | Apple device support | F | Yes | No |
| 27 | Android device support | F | Yes | No |
| 28 | Phone support | F | Yes | No |
| 29 | Tablet support | F | Yes | No |
| 30 | Desktop computer support | F | Yes | No |
| 31 | Laptop support | F | Yes | No |
| 32 | Cross-platform readiness for launch | F | Yes | Yes |
| 33 | Worldwide accessibility | F | Yes | No |
| 34 | International laws and regulations | F | Yes | No |
| 35 | Country-specific compliance considerations | F | Yes | No |
| 36 | Permanent Quality Assurance Agent | G | Yes | No |
| 37 | Professional bug and system-error discovery | G | Yes | No |
| 38 | Testing after every meaningful application change | G | Yes | No |
| 39 | Functional testing | G | Yes | No |
| 40 | Unit testing | G | Yes | No |
| 41 | Integration testing | G | Yes | No |
| 42 | System testing | G | Yes | No |
| 43 | API testing | G | Yes | No |
| 44 | Non-functional testing | G | Yes | No |
| 45 | Performance testing | G | Yes | No |
| 46 | Load testing | G | Yes | No |
| 47 | Stress testing | G | Yes | No |
| 48 | Security testing | G | Yes | No |
| 49 | Usability testing | G | Yes | No |
| 50 | Compatibility testing | G | Yes | No |
| 51 | Release testing | G | Yes | No |
| 52 | Regression testing | G | Yes | No |
| 53 | Alpha testing | G | Yes | No |
| 54 | Beta testing | G | Yes | No |
| 55 | Acceptance testing | G | Yes | No |
| 56 | Dedicated UI/UX design agent | H | Yes | No |
| 57 | Current design inspiration from Apple, Uber, Telegram, and other leading companies | H | Yes | No |
| 58 | Original MoLis design rather than direct copying | H | Yes | No |
| 59 | Major and clearly visible UI improvements | H | Yes | No |
| 60 | Smooth animations | H | Yes | No |
| 61 | Smooth transitions between application sections | H | Yes | No |
| 62 | Smooth interaction while using features | H | Yes | No |
| 63 | Install and use the UI/UX Pro Max skill when available | H | Yes | Yes |
| 64 | The user experience George wants students to describe | I | Yes | Yes |
| 65 | MoLis making students' lives easier | I | Yes | No |
| 66 | MoLis containing everything students need | I | Yes | No |
| 67 | Reliability and consistency | I | Yes | No |
| 68 | Personal lifestyle adaptation | I | Yes | No |
| 69 | Adaptation to individual needs and wants | I | Yes | No |
| 70 | Becoming indispensable to students | I | Yes | No |
| 71 | MoLis not being a low-quality AI-generated application | J | Yes | No |
| 72 | MoLis as an intelligent and adaptive system | J | Yes | No |
| 73 | MoLis consistently growing with the user | J | Yes | No |
| 74 | MoLis increasing in knowledge and intelligence | J | Yes | No |
| 75 | A central MoLis intelligence or brain | J | Yes | No |
| 76 | Responsible learning from user behaviour | J | Yes | No |
| 77 | Responsible learning from user lifestyle | J | Yes | No |
| 78 | Continuous personal adaptation | J | Yes | No |
| 79 | Shared awareness across all named and future MoLis roles and agents | K | Yes | No |
| 80 | Repository documentation as the permanent shared source of truth | K | Yes | No |
| 81 | Use current internet research to improve recommendations | L | Yes | No |
| 82 | Do not limit recommendations to basic instructions or repository patterns | L | Yes | No |
| 83 | Research the latest relevant information when internet access is available | L | Yes | No |
| 84 | Prefer official documentation and primary sources | L | Yes | No |
| 85 | Use current security standards and vulnerability guidance | L | Yes | No |
| 86 | Use current architecture and scalability practices | L | Yes | No |
| 87 | Use current AI engineering techniques | L | Yes | No |
| 88 | Use current accessibility standards | L | Yes | No |
| 89 | Use current international privacy and regulatory guidance | L | Yes | No |
| 90 | Use current performance and infrastructure practices | L | Yes | No |
| 91 | Examine successful product patterns from leading companies | L | Yes | No |
| 92 | Use competitor research as inspiration without copying | L | Yes | No |
| 93 | Identify technologies and approaches that could improve MoLis beyond the request | L | Yes | No |
| 94 | Provide advanced recommendations across all specified quality dimensions | L | Yes | No |
| 95 | Explain meaningful trade-offs | L | Yes | No |
| 96 | Warn George when an approach could create long-term problems | L | Yes | No |
| 97 | Suggest a stronger alternative when one exists | L | Yes | No |
| 98 | Never present outdated practices as modern best practice | L | Yes | No |
| 99 | Record the date of time-sensitive research | L | Yes | No |
| 100 | Provide citations or source references for research-based recommendations | L | Yes | No |
| 101 | Clearly identify George's founder directives | M | Yes | No |
| 102 | Clearly identify repository-confirmed facts | M | Yes | No |
| 103 | Clearly identify internet-research facts | M | Yes | No |
| 104 | Clearly identify professional recommendations | M | Yes | No |
| 105 | Clearly identify assumptions and inferences | M | Yes | No |
| 106 | Clearly identify decisions requiring George's approval | M | Yes | No |
| 107 | Internet research must support, not overwrite or weaken, George's vision | M | Yes | No |
