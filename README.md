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
