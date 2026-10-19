# The Quartet

An essay, a poem, a short story and a song, every other morning, joined by one hidden thread. The thread stays sealed until the reader leaves their notes.

The live page is a claude.ai artifact: https://claude.ai/artifact/QXS9uUMAYJyQwj9SPY6qKK
This repo is the master copy of how it works.

## What's here

| Path | What it is |
| --- | --- |
| `page/index.html` | The page itself, exactly as published. Edit here first, then publish. |
| `curator/how-drops-are-made.md` | What the scheduled curator does every other morning. |

## How it fits together

- **The page** shows each reader their drops, collects their reactions and notes, and unseals the thread once they've rated the drop. Readers join by invitation (invited by email as editors) and pick one of two pathways: their own drops, or the curator's drops.
- **Storage** lives in the artifact's own database, not in this repo:
  - `readers/<id>`: a reader's About me, pathway and join date.
  - `readers/<id>/drops`, `/reveals`, `/feedback`, `/texts`: their drops, sealed threads, notes and any public-domain texts for "Read here".
  - `plan/arc` and `plans/<id>`: the year plan and each reader's history. Only the curator can read these.
- **The curator** is a scheduled task that runs every other morning at 06:48 London time and writes the next drop for each reader.

## Privacy

This repo is public. Readers' notes, About me pages, the year plan and the threads are deliberately not stored here. If the repo is made private, a weekly backup of the database can be added under `backup/`.
