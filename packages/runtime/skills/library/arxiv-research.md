---
name: arXiv Research
slug: arxiv-research
description: Search and retrieve academic papers from arXiv's free API — by keyword, author, category, or paper ID.
category: Research
requires: [web]
license: MIT
default: false
---

Find and read academic papers on arXiv. The API is free and keyless and answers in Atom XML, which web_fetch returns as text; the abstract pages and, for most papers since late 2023, an HTML full text are fetchable too. PDFs are not: web_fetch refuses them.

Use when the Commander wants recent papers on a topic, a specific paper's abstract, or an author's/category's output.

## Search
Call the query API with web_fetch and read the Atom XML it returns as text:
```
web_fetch("https://export.arxiv.org/api/query?search_query=all:diffusion+transformer&max_results=5&sortBy=submittedDate&sortOrder=descending")
```
Each `<entry>` has the title, `<id>` (the arXiv id after `/abs/`), `<published>` date, `<author>` names, `<summary>` (abstract), and `<category term=...>`. Pull those out and present a numbered list.

## Query syntax
| Prefix | Searches | Example |
|---|---|---|
| `all:` | all fields | `all:transformer+attention` |
| `ti:` | title | `ti:large+language+models` |
| `au:` | author | `au:vaswani` |
| `abs:` | abstract | `abs:reinforcement+learning` |
| `cat:` | category | `cat:cs.AI` |

Combine with `+AND+`, `+OR+`, `+ANDNOT+`; exact phrase with quotes (`ti:"chain of thought"`). Sort with `&sortBy=submittedDate&sortOrder=descending` for the latest.

## Get a specific paper
- Metadata (Atom XML): `web_fetch("https://export.arxiv.org/api/query?id_list=2402.03300")`
- Abstract page: `web_fetch("https://arxiv.org/abs/2402.03300")`
- Full text, when arXiv has an HTML version: `web_fetch("https://arxiv.org/html/2402.03300")`. If that is not found, the paper exists only as a PDF; say that reading its full text needs a PDF text extractor this station does not have, and work from the abstract.

## Present it
For each result: `[id] Title — Authors — date — categories`, a two-line summary, and the abstract link. When the Commander picks one, fetch its abstract page (and the HTML full text when there is one) and pull the specific claims they need, citing the id and saying whether each claim came from the abstract or the full text.

