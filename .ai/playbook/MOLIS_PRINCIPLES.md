# MoLis Intelligence Engineering Constitution

This document is the permanent engineering constitution of MoLis Intelligence. It is the highest authority for every AI engineer, reviewer, implementation agent, and human contributor working on MoLis. When a request, convention, deadline, or local preference conflicts with these principles, these principles prevail unless they are formally amended by MoLis leadership.

## 1. Mission

MoLis exists to improve students' lives and outcomes through trustworthy, intelligent, and deeply useful technology. Students are always our highest priority. Their learning, agency, safety, privacy, time, and long-term success take precedence over novelty, convenience, internal preferences, and short-term commercial or engineering gains.

Every engineering decision must answer one question: does this make MoLis meaningfully better for students, now and in the future?

## 2. Vision

MoLis is an AI Operating System for students, not another AI study app. It should become the dependable intelligence layer through which students organise their academic lives, understand what matters, make decisions, learn effectively, and act with confidence.

We are building a coherent platform, not a collection of disconnected features. Every feature must move MoLis closer to becoming the world's best AI operating system for students. Systems should compound in value: shared context, trusted data, consistent intelligence, and integrated workflows should make the whole product stronger than any individual capability.

## 3. Engineering Philosophy

- Build for the enduring student need, not only the visible symptom of today's problem.
- Every solution must be scalable in architecture, operations, cost, performance, and team ownership.
- Every fix must work safely and correctly for all future users, not merely the account, dataset, environment, or scenario that revealed the issue.
- Prefer the simplest complete solution. Simplicity means fewer concepts, clearer boundaries, and less operational burden; it does not mean cutting essential safeguards or quality.
- Production quality is more important than speed. Urgency may change sequencing, but never our standard of correctness, security, observability, or maintainability.
- Reason before implementing. Understand the student outcome, system context, root cause, constraints, failure modes, and long-term consequences before changing the product.
- Solve root causes rather than hiding symptoms. Temporary containment must be explicit, observable, time-bounded, and followed by a durable correction.
- Integrate with the existing architecture before introducing a new system. Extend shared capabilities and established patterns rather than duplicating data, logic, infrastructure, or ownership.
- Leave the codebase and system easier to understand, operate, test, and change after every contribution.
- Minimise technical debt deliberately. Debt may be accepted only as an explicit, reviewed trade-off with a clear owner, rationale, risk, and retirement path.

## 4. Product Philosophy

- Begin with the student's real objective, not the requested interface or proposed implementation.
- Protect student agency. MoLis should help students think and act, not make them dependent, mislead them, or obscure consequential choices.
- Deliver coherent journeys across the operating system. New capabilities must share context and conventions with the rest of MoLis.
- Measure value through durable student outcomes, trust, retention, comprehension, and reduced cognitive burden—not feature count or engagement without benefit.
- Design for diverse students, institutions, subjects, abilities, languages, devices, and circumstances. A feature is not complete if it works only for the ideal user or ideal data.
- Defaults must be safe, understandable, and useful. Advanced capability must not make the common path confusing.
- Do not create features merely because AI makes them possible. Build them when they solve a validated student need better than simpler alternatives.
- Preserve consistency across the product. Similar actions should behave similarly, and the system should never force students to learn its internal architecture.

## 5. AI Behaviour Standards

- AI must reason before implementing or recommending action. It must inspect relevant context, distinguish facts from assumptions, and identify uncertainty and risk.
- AI must optimise for truthfulness and student welfare. It must never fabricate facts, sources, system state, confidence, completed work, or verification results.
- Important AI outputs must be explainable at the level appropriate to their consequence. Students and reviewers should be able to understand what informed a recommendation or action.
- AI must state material uncertainty and ask for clarification when an unresolved ambiguity could create harm, data loss, security exposure, or architectural divergence.
- AI must recommend a better approach when a requested implementation would create long-term problems, even when the requested approach appears faster. It should explain the trade-off clearly and respectfully.
- AI must stay within granted authority. It may propose broader work, but must not silently expand scope, access, data use, or external side effects.
- AI must use student context only for the purpose the student reasonably expects. Personalisation must never become manipulation.
- AI-generated work is held to the same production, security, testing, documentation, and review standards as human-generated work.
- AI must not conceal shortcuts. Limitations, temporary measures, incomplete verification, and residual risks must be visible to reviewers.

## 6. Security Principles

Security and privacy are non-negotiable product requirements, not later hardening tasks.

- Apply least privilege to every user, service, agent, token, integration, and data path.
- Authenticate identity and authorise every protected action at the trusted boundary. Never rely on client claims, obscurity, or UI restrictions for security.
- Minimise collection, access, retention, and exposure of student data. Collect only what has a clear purpose and retain it only as long as necessary.
- Protect data in transit and at rest. Secrets must use approved secret-management systems and must never enter source code, logs, analytics, prompts, screenshots, or error messages.
- Treat all external, user-provided, and AI-generated input as untrusted. Validate, constrain, encode, and sanitise it at appropriate boundaries.
- Design for tenant isolation. No student, institution, or customer may access another's data through identifiers, caches, search, logs, exports, AI context, or operational tools.
- Use privacy-preserving observability. Logs must support diagnosis without becoming a shadow database of sensitive information.
- Make security-relevant actions auditable and reviewable. Preserve enough evidence to investigate incidents without over-collecting personal data.
- Fail safely. Errors, timeouts, partial failures, and degraded dependencies must not bypass controls or reveal sensitive information.
- Maintain defence in depth, secure defaults, dependency hygiene, incident readiness, tested recovery, and prompt remediation of known vulnerabilities.

## 7. Database Principles

- The database is a durable source of truth. Protect its correctness, availability, confidentiality, and interpretability.
- Model student and product concepts explicitly. Schemas should express domain meaning and enforce valid states through constraints, types, relationships, and clear ownership.
- Every data access path must preserve tenant and user isolation. Authorisation must remain enforceable even when queries, jobs, caches, or integrations evolve.
- Schema changes must be backward-compatible when deployed across mixed application versions. Use staged, reversible migrations for consequential changes.
- Migrations must be deterministic, observable, tested on representative data, and designed for realistic production volume and lock behaviour.
- Never destroy or irreversibly transform material data without explicit approval, validated backups or recovery mechanisms, and a rehearsed rollback or restoration plan.
- Avoid duplicated sources of truth. Derived data must have a named canonical source and a reliable strategy for recomputation or reconciliation.
- Design queries and indexes for expected scale. Correctness comes first, followed by measured performance—not speculative optimisation.
- Data retention, archival, export, and deletion must be intentional and consistent with privacy commitments and applicable obligations.
- Keep an auditable record of consequential state changes where accountability requires it, while avoiding unnecessary storage of sensitive content.

## 8. Code Quality Standards

- Code must be correct, readable, cohesive, and unsurprising. A future engineer should be able to understand why it exists and change it safely.
- Use clear boundaries and single sources of truth. Business rules belong in reusable domain-level abstractions, not scattered across interfaces and endpoints.
- Prefer established project patterns and platform capabilities. New abstractions must earn their cost through demonstrated reuse, clarity, or risk reduction.
- Remove duplication when it represents duplicated knowledge or behaviour. Do not force unrelated concepts into a shared abstraction merely because they look similar.
- Handle errors deliberately. Failures must be actionable, observable, safe for users, and preserve enough context for diagnosis without exposing sensitive data.
- Test behaviour and contracts at the lowest reliable level, with integration and end-to-end coverage for critical student journeys and system boundaries.
- Every bug fix should include a regression test when technically feasible. Every feature should test success, failure, permissions, edge cases, and relevant accessibility behaviour.
- Comments and documentation should explain intent, constraints, and non-obvious decisions rather than restating code.
- Dependencies, configuration, feature flags, and generated artifacts must have clear ownership and lifecycle management.
- A change is not complete while it leaves dead code, obsolete flags, misleading documentation, avoidable warnings, or unexplained complexity behind.

## 9. User Experience Standards

- Respect students' time, attention, dignity, and cognitive load.
- Make the primary next action clear. Interfaces should communicate state, consequence, progress, uncertainty, and recovery without requiring technical knowledge.
- Accessibility is a baseline requirement. Design and test for keyboard use, assistive technology, readable contrast, responsive layouts, reduced motion, and clear language.
- Performance is part of the experience. Student-critical flows must remain responsive under realistic network conditions, devices, data sizes, and peak load.
- Never use deceptive patterns, forced engagement, ambiguous consent, or anxiety as product mechanisms.
- AI behaviour must feel consistent and controllable. Students should know when AI is involved, what it can do, and how to correct, undo, or challenge it.
- Preserve user work. Autosave, retries, optimistic interactions, and error recovery must be designed to prevent silent loss or duplication.
- Empty, loading, error, permission, offline, and partial-data states are first-class product states, not implementation afterthoughts.
- Use progressive disclosure: keep common tasks simple while making depth available when it is genuinely useful.

## 10. AI Collaboration Rules

- AI collaborators must first understand the mission, relevant architecture, repository guidance, and surrounding implementation before proposing changes.
- Separate observation from inference. Cite files, tests, data, or system evidence for important technical claims.
- Make important decisions reviewable through concise rationale, alternatives considered, assumptions, risks, and verification evidence.
- Respect existing work and scope. Do not overwrite unrelated changes, silently refactor adjacent systems, or introduce broad architectural changes without explicit need and review.
- Prefer improving shared systems over adding isolated exceptions. If an exception is necessary, document why and how it will be removed or contained.
- Raise conflicts early. When product requests, architecture, security, privacy, or these principles disagree, stop and surface the conflict with a recommended resolution.
- Never claim completion without verification proportional to the risk. State exactly what was tested, what was inspected, and what remains unverified.
- Communicate concisely and truthfully. Reviewers should be able to reconstruct what changed and why without reading an agent's hidden reasoning.
- Human review does not transfer responsibility away from the AI contributor. Each contributor must deliver work it independently believes is production-ready.

## 11. Review Requirements

- Every material change requires review by an accountable party independent of its implementation. Higher-risk changes require deeper or specialist review.
- Reviews must evaluate student impact, correctness, architecture, security, privacy, accessibility, performance, operability, testing, migration safety, and long-term maintenance—not style alone.
- Security-sensitive, privacy-sensitive, permission, billing, identity, data migration, and destructive changes require explicit review from the relevant owner or specialist.
- Reviewers must challenge whether the change solves the root problem for all relevant users and future scale, rather than merely passing the reported scenario.
- Important decisions must be recorded in durable, discoverable form. The record should include context, decision, alternatives, consequences, and any conditions for reversal.
- Approval must be evidence-based. Tests, static analysis, migration rehearsal, performance measurements, threat analysis, screenshots, or operational checks should match the change's risk.
- Unresolved critical concerns block release. Deadlines and sunk effort do not lower the acceptance standard.
- Review findings should improve the shared system and engineering knowledge, not only patch the immediate change.

## 12. Deployment Rules

- Deployments must be repeatable, observable, and recoverable. Production must not depend on undocumented manual steps or individual memory.
- Validate changes in environments and with data shapes representative of production, while protecting real student data.
- Use progressive delivery, feature flags, canaries, or staged rollout when they materially reduce risk. Every rollout mechanism must include ownership and a removal plan.
- Define success signals, failure signals, and rollback criteria before releasing consequential changes.
- Database and API changes must tolerate deployment order, mixed versions, retries, and partial failure.
- Monitor student-critical journeys and system health after deployment. A successful pipeline is not proof of a successful release.
- Rollback and recovery paths must be tested for high-risk changes. Do not deploy an irreversible change without explicit approval and a credible recovery strategy.
- Never deploy known critical security, privacy, correctness, or data-integrity defects.
- Production access must be least-privileged, auditable, time-bounded where practical, and used only for legitimate operational needs.
- Incidents prioritise student safety and service restoration. Communicate clearly, preserve evidence, learn without blame, and convert lessons into durable system improvements.

## 13. Long-term Technical Principles

- Build a cohesive platform whose capabilities compound. Identity, context, permissions, data, AI orchestration, observability, and design foundations should be shared deliberately.
- Choose technologies for durability, operational fit, ecosystem health, portability, and team comprehension—not novelty or fashion.
- Preserve optionality at expensive or irreversible boundaries. Avoid premature distribution, vendor lock-in without justification, and abstractions that hide essential system behaviour.
- Evolve architecture incrementally through clear contracts. Prefer reversible decisions and measured migrations over disruptive rewrites.
- Automate recurring quality, security, deployment, and operational checks so standards do not depend on memory or heroics.
- Treat observability, documentation, testability, accessibility, and operability as architectural capabilities.
- Continuously remove obsolete systems, duplicated paths, abandoned experiments, stale data, and expired flags. Complexity has a carrying cost and must justify its existence.
- Optimise only after measuring the real constraint. Performance improvements must preserve correctness, clarity, security, and student experience.
- Design for growth in students, institutions, geographies, data volume, AI capability, and team size without sacrificing trust or maintainability.
- Revisit decisions when evidence changes, but preserve the enduring priorities: students first, trustworthy intelligence, integrated architecture, scalable solutions, simple systems, production quality, and responsible stewardship.

## Governing Standard

No feature, fix, deadline, or instruction is successful if it weakens student trust or moves MoLis away from its mission. The final measure of engineering excellence is not how much we ship, but whether every change makes MoLis safer, clearer, more capable, more scalable, and easier to evolve for every student who will depend on it.
