# The findings list

`findings.json` in the course folder. Opened at Intake, extended by Analyze and Audit, worked off at
Compose and Layout, closed or accepted in writing before Publish. **It is the audit trail of the run**,
and the Publish gate parses it, so the shape is not a matter of taste.

It is deliberately flat and typed, because its honest long-term home is the Hub and the migration should
be an import rather than a rewrite.

```json
{
  "course": "eur-ibeb-y1-introduction-to-mathematics",
  "openedAt": "2026-09-13T20:00:00.000Z",
  "mode": "summary",
  "lines": [
    {
      "id": "f-001",
      "class": "file",
      "what": "Full-page cover from the summary's previous brand, before the first heading",
      "where": "summary.docx, page 1",
      "foundBy": "intake",
      "foundAt": "2026-09-13T20:01:00.000Z",
      "state": "done",
      "did": "Dropped by the edit list; the prose after it is untouched",
      "why": null
    }
  ]
}
```

## The fields

| Field | What it holds |
| --- | --- |
| `id` | Unique within the run. `f-001` upward. Never reused, even after a line is closed |
| `class` | One of the seven below. It is what the phase report counts by |
| `what` | One sentence, stating the defect and not its remedy |
| `where` | The file, unit, block id or drawing index. A line nobody can locate cannot be worked off |
| `foundBy` | `intake`, `analyze`, `compose`, `layout`, `audit`, `review`, or a person's name |
| `foundAt` | ISO timestamp |
| `state` | `open`, `done`, or `accepted` |
| `did` | What was done. Required when `state` is `done` |
| `why` | The reason. **Required when `state` is `accepted`, and required for every substantive edit.** A substantive edit without a reason is a failure of Audit, whatever it says |

## The classes

| Class | It means |
| --- | --- |
| `file` | Something wrong with the document as a document: branding, an empty heading, a manual page break, an emoji in a heading |
| `drawing` | A drawing and its disposition, including a crop that may never be uploaded |
| `maths` | An equation that was a picture, one that lives in a floating text box, one KaTeX refuses |
| `gap` | A topic the exams test and the material does not cover. **Published as a gap or left. Never written in** |
| `substantive` | A change to what the summary says. Certain, small, and never without `why` |
| `missing` | A checklist item we do not hold. Does not block the phases that follow; blocks Publish until accepted |
| `skip` | A phase that did not run, and the reason. The course status still says which phases it went through |

## The rules

**A finding is recorded, not acted on immediately.** It goes on the list and the phase continues. The
pauses in this pipeline are the gates that name a person, and a finding is not one.

**Publish refuses while any line is `open`.** Every line must be `done` or `accepted`, and every
`accepted` line must carry a `why` written by the person accepting it. That is the whole gate, and it is
why this file has a shape.

**A gap is never promoted to a substantive edit.** A topic the material does not cover is published as a
gap or left. A claim the author did not make does not belong in their course, however well it reads.
