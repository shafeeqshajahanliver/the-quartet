# How drops are made

A scheduled task runs every other morning (06:48, Europe/London). For each reader it adds one drop: an essay, a poem, a short story and a song that share one hidden thread.

## Two pathways

- **Own drops.** The curator picks four pieces for that reader from their About me and their last three sets of notes.
- **The curator's drops.** The reader gets a copy of the curator's drop for that morning, with their own sealed reveal and private notes. No extra research.

## Rules for choosing

- Four pieces, one of each kind, each about 25 minutes or less.
- Spread across at least three countries and two centuries where the thread allows.
- At least every other drop leads with a non-Western, Southeast Asian or Global Majority writer or artist.
- No author repeated within a reader's last 30 drops.
- Links only to legitimate free sources: Project Gutenberg, Gutenberg Australia, poets.org, Poetry Foundation, archive.org, publishers and magazines. Songs link to a YouTube search and a Spotify search.
- No reproduced text or lyrics from copyrighted works. Full text appears in "Read here" only for public-domain works with a named source.
- The invitation and notes never name or hint at the thread, and titles never give it away.
- Thread types rotate and never repeat back to back: symbol, object, place, year, author, philosophical idea, value, emotion, form or device, archetype, colour, historical event, setting.

## Writing exercise

Only on every 7th drop for each reader (7, 14, 21 and so on). On other drops there is no exercise.

## The year

Six phases of about 30 drops each: Noticing, Voice, Structure, Compression, Inheritance, Signature. Each phase sets the kind of thread and the kind of exercise. Every 30th drop looks back at what the reader's notes have shown.

## Adapting

- A kind that misses twice running changes register.
- Three right guesses in a row make the threads subtler; three wrong make them more concrete.
- A reader's "Keep away from" and "Notes for the curator" override the plan.

## What it writes

For each reader, in the artifact's database: `readers/<id>/drops/dNNN`, `readers/<id>/reveals/dNNN`, and an entry in `plans/<id>`. It never writes to a reader's own profile or notes. It sends one notification per run that never mentions a thread.
