# PolicyProof
PolicyProof helps Indian policyholders recover hospital claims that insurers rejected or quietly shortened. Upload your policy, hospital bill, discharge summary and rejection letter. We check every line against your policy and IRDAI rules, then hand you a ready-to-file appeal.
## Why this exists
Insurers deduct and deny claims fast, using automated rules. Families rarely know the limits IRDAI puts on that: the 60-month moratorium, the 36-month cap on pre-existing disease waiting periods, and the ban on proportionate cuts to pharmacy, implants, consumables, diagnostics and ICU charges.
A lawyer's retainer (₹15,000 to ₹30,000) can cost more than the disputed amount. So most people just give up. PolicyProof is priced for them: a flat ₹499 dossier, or no upfront cost with a small cut of whatever we recover.
## How it works
1. Upload four documents.
2. Parse and scan. We extract every bill line with its page and position, and strip hidden prompt-injection text.
3. Deterministic audit. Python rules (not an LLM) do all the math: room-rent ratios, waiting periods, moratorium checks.
4. Valid denial? If the insurer was right, we say so honestly and stop. No false hope.
5. Missing something? We pause and ask for one specific document, then resume when you upload it.
6. Gray area? A human specialist gets a 30-second judgment brief with highlighted evidence and approves, edits or declines.
7. Draft and red-team. A hostile "insurer adjuster" agent attacks the draft. Up to two revisions, then a human steps in.
8. Dossier ready. Filing-ready PDF or JSON, plus a tamper-evident audit log.
## What makes it trustworthy
- No LLM math. All rupee figures come from tested Python rules.
- Zero orphan figures. Every amount and clause links to a document, page and bounding box, or it's blocked.
- Honest refusals. Meritless appeals are declined.
- Humans only where needed. Roughly 15% of cases reach a specialist.
- Durable state. Cases survive refreshes and server restarts.
- Audit trail. SHA-256 file hashes, model and prompt versions, rule results and sign-offs per case.
## Features (MVP)
Multi-document intake, a deterministic policy engine (12+ rules), a citation graph, a valid-denial gate, a missing-document chase agent, specialist judgment briefs, a red-team critic, a dossier generator, an audit log, client and ops portals with a live margin meter, and a 20-case synthetic eval suite.
## Tech stack
| Layer| Choice |
| ----- | ------|
|Frontend| Next.js, TypeScript, Tailwind, react-pdf-highlighter|
|Backend| FastAPI, Pydantic v2|
|Orchestration| LangGraph with SQLite/PostgreSQL checkpointer|
|Models| Gemini 2.5 Pro / Flash or Claude Sonnet|
|Parsing| Docling or PyMuPDF, with vision LLM fallback|
|Search| SQLite FTS5 or pgvector (hybrid BM25 + dense)|
|Evals| pytest, ReportLab/WeasyPrint for synthetic data|
|Hosting| Vercel + Render/Railway/Fly.io|
## Targets (not yet measured)
- 90%+ pass rate on the 20-case benchmark
- 100% deterministic math accuracy
- 0% orphan rupee figures in exports
- 100% prompt-injection blocks and correct valid-denial refusals
- Under ₹30 API cost per case; under 60 seconds of specialist review
## What we don't do
- No real patient data (hackathon rules; production would follow the DPDP Act 2023).
- We don't file on the Ombudsman portal for you. The policyholder or an immediate family member files; we prepare the dossier.
- No medical diagnosis or formal legal representation.
## Disclaimer
PolicyProof is a prototype built on synthetic data. The IRDAI rules modeled here are for demonstration and must be reviewed by licensed insurance compliance counsel before real use. Personas like Suresh and Dr. Meera are hypothetical.
