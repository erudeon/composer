# Composer

How a course gets from the materials you have to something a student opens on pass the year.

You need two things and only two: **this plugin**, and **access to pass the year's course tools**, which
is the connection that lets it read and write your course. Whoever asked you to write the summary can
set that up for you; if it is missing, everything here still runs on your own machine and only the last
step, sending the course, is blocked.

You do not need the platform's code, a package manager, or anything from a developer.

## Install

```
/plugin marketplace add erudeon/composer
/plugin install composer
```

You also need Node.js, which the scripts run on. `node --version` should print something. If it does
not, install it from nodejs.org and reopen your terminal.

**On Windows, write paths the way Node reads them.** Your shell may understand `/tmp` and `/c/Users`;
Node does not. It resolves `/tmp` to `C:\tmp` and stops with a file-not-found error that names a path
you never typed. Use `C:/Users/...`. Every phase here runs a Node script over a path you give it, so
this bites on the first command and on no other.

## Use

```
/composer
```

It asks which course, makes the folder for it, and tells you what to do next. You do not have to move
any files: say where they are, even "they are in my Downloads", and it copies them in. Your originals
stay exactly where they were.

Everything for that course then lives in one place and stays there between sessions.

## Where your work lives

`~/Documents/Composer/<course>/`, made for you, the same shape every time:

```
01-inputs/     your files. Tell it where they are and it copies them in for you.
02-source/     the text pulled out of your documents, with the maths intact
03-figures/    the pictures, and where each one ended up
04-manifest/   your course as one file, and versions/ keeping every one ever sent
05-reports/    what each step reported, so you can pick it up tomorrow
```

`01-inputs` is never modified, because every check compares what was built against what you gave it. If
that could change underneath, a clean result would not mean anything.

To see everything you have on the go:

```
node ~/.claude/plugins/cache/erudeon/composer/*/scripts/workspace.mjs list
```

## What it is actually like

You talk to it. It reads your folder, tells you which step you are on, and does the work; where a
decision is yours it asks, all at once, with a recommendation each, rather than a question at a time.

There are four moments where it stops and waits for you: what a teaching unit is called and how the
course is put together, any change that would alter what your text MEANS, the first unit once it is
built so you can look before the rest follow, and the word `publish`.

Everything else it gets on with, and writes down what it found. **Your writing is published exactly as
you wrote it, typos included.** It does not rewrite you, tighten you, or improve you. Where something
genuinely has to change, it asks first and tells you why.

You can stop at any point and come back. The folder remembers.

## What goes in the folder

In order of how much it matters:

1. **The course manual.** It settles what a teaching unit is called and where one stops, which is the
   decision everything else is built on.
2. **Past exams, with their answer keys.** They are how anyone can tell whether the course prepares
   somebody for the thing they actually sit.
3. **Teaching materials**: slides, tutorials, the formula sheet.
4. **What students on this course find hard.** What they ask about, what they get stuck on, what they
   wish the material did differently.
5. **The summary**, as the file it came in, with everything in it.

A missing one does not stop you. It gets written down, and it has to be accepted by a person before the
course can be published.

## If something looks wrong

Say so, in your own words. "This equation looks broken", "that section is in the wrong place", "this is
not what I wrote". It will look, tell you what it finds, and either fix it or say why it cannot.

Two things worth knowing, because they surprise people:

**A file whose name is wrong is common.** A `.docx` that is really a PDF, a `.pdf` that is really a Word
document. It checks the bytes rather than the name and tells you which you have, so if it says your file
is not what it claims, it is not being difficult.

**Not everything is a problem with your work.** Word does a lot on its own: styling a paragraph as a
heading, splitting one sentence across three differently formatted pieces, leaving a lock file beside an
open document. Most of what gets reported is that, not you.

## The eight phases

| | | |
| --- | --- | --- |
| 0 | **Intake** | what we hold, and whether it is what it claims |
| | **Convert** | a document becomes text we can build from, with the maths intact |
| 1 | *Analyze* | what the exams ask. Not built yet |
| 2 | **Compose** | make the text right |
| 3 | **Layout** | make it a course |
| 4 | **Audit** | prove it, with nobody |
| 5 | *Student View* | a second person reads it as a student. Not built yet |
| 6 | **Publish** | one press, once you say the word |
| 7 | *Observe* | watch it until the exam. Not built yet |

The bold ones have skills behind them today and take a written summary all the way to a published
course. The italic ones are written down but not built: each needs something that does not exist yet,
and the plugin says so rather than improvising.

## What it will not do

It will not write the summary for you, and it will not quietly improve one. The prose is the author's,
verbatim, typos included. Where the exams test something the material does not cover, that is recorded
as a gap and published as a gap or left. A claim the author did not make does not belong in their course,
however well it reads.

It will not upload a picture cropped from a textbook, a slide, Chegg or the web. Those are redrawn from
what the text states. Reproducing somebody else's images is the one mistake that costs more than a bad
course.

It will not publish anything without being told to, by name, in so many words. Every step before that
one can be run again, and `plan` rehearses a whole course without writing a thing.
