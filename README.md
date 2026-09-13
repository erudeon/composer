# Composer

How a course gets from the materials you have to something a student opens on pass the year.

You need two things and only two: **this plugin**, and a connection to the Composer's MCP. You do not
need the platform's code, a package manager, or anything from a developer.

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

It asks which course, makes the folder for it, and tells you what to do next. Everything for that course
then lives in one place and stays there between sessions.

## Where your work lives

`~/Documents/Composer/<course>/`, made for you, the same shape every time:

```
01-inputs/     what you put in. Nothing ever writes here but you.
02-source/     the text pulled out of your documents, with the maths intact
03-figures/    the pictures, and where each one ended up
04-manifest/   the course as a file, and versions/ keeping every one ever sent
05-reports/    what each step reported, so you can pick it up tomorrow
```

`01-inputs` is never modified, because every check compares what was built against what you gave it. If
that could change underneath, a clean result would not mean anything.

To see everything you have on the go:

```
node ~/.claude/plugins/cache/erudeon/composer/*/scripts/workspace.mjs list
```

## What goes in the folder

In order of how much it matters:

1. **The course manual.** Without it we do not know what we are doing.
2. **Past exams, with their answer keys.** Without them we do not know if we are exam-oriented.
3. **Teaching materials**: slides, tutorials, the formula sheet.
4. **What the cohort thinks**: their frustrations, who they compare us to, what they say.
5. **The summary**, as the file it came in, with everything in it.

A missing one does not stop you. It gets written down, and it has to be accepted by a person before the
course can be published.

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
| 6 | **Publish** | one press, and it says which environment |
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

It will not touch staging, in any phase, for any reason.
