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
- The thread is always a philosophical idea, tension or question, never a shared surface detail. A moth, night, the moon, a colour, a year or a recurring object is too obvious. The right register is closer to: attention as a form of love; the cost of being seen; mercy that humiliates; freedom that arrives too late; hospitality as power.
- Each piece embodies the idea differently (one argues it, one images it, one dramatises it, one sings around it) and none names it. If it could be guessed from the titles or a quick skim, pick another. It should click only after sitting with all four.
- The territory of the idea rotates and never repeats back to back: ethics, love and attachment, time and memory, power, the self, belief, knowledge and perception, freedom and constraint, death and inheritance, language and silence, beauty and art.

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
