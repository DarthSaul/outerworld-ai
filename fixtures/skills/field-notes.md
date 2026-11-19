---
name: Field Notes
slug: field-notes
description: Turn a day's scattered observations into tidy, filed notes.
category: Writing
requires: [files, memory]
license: MIT
default: true
---

Collect what the Commander observed today and file it as one note per topic.

## Method
1. List every observation in the conversation.
2. Group them by topic; name each group plainly.
3. Write each group to `notes/<topic>.md` with write_file.
4. Propose anything that should outlast today with remember.
