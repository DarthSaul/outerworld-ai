---
name: Log Dig
slug: log-dig
description: Search a service's logs for the first error before a failure.
category: Engineering
requires: [shell]
license: MIT
default: true
---

Start from the failure's timestamp and read backwards.

## Method
1. Find the failure in the logs.
2. Walk back to the first error or warning before it.
3. Report that line and what it implies.
