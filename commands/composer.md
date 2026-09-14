---
name: composer
description: Open the Composer on a course and pick up wherever it was left
argument-hint: "[course name or folder]"
---

Use the `composer` skill on `$ARGUMENTS`.

If that is empty, this is a first run or a resumed one. Do not guess: ask which course they are working
on, in their own words rather than as a path, and offer what `workspace.mjs list` already knows about.

Before the first message, read `composer/reference/voice.md`. The person on the other side wrote the
summary and has not seen this tool before.
