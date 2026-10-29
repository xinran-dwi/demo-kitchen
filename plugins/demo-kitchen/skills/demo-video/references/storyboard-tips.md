# Storyboard tips

What made the Desktop Version plugin demo work, as rules.

## Length and pacing
- **Under 20 seconds.** One idea per beat, 3 to 5 beats. Viewers on LinkedIn or Substack give you about 3 seconds before deciding to keep watching.
- About 3 seconds per beat: arrive (0.6 s), act (click or type), show the result (1.2–2 s hold), move on.
- Camera moves take 0.8–1.4 s. Faster feels jumpy; slower drags.
- Repeat the core action at most 3–4 times (like 4 mobile→desktop pairs), each faster than the last: 3.3 s, 2.9 s, 2.6 s, 2.4 s. The viewer already gets it.
- End on the payoff: a pull-back showing everything you made, then an end card with the name and link.

## Camera
- Start tight on the first screen, so viewers can read it. Pull back (`s` smaller) to show a before/after pair.
- When a HUD panel sits on one side, shift the anchor (`ax`) so content centers in the free space.
- Hold the camera still while the cursor clicks. Move the camera and the cursor together only for "travel" between beats.

## Cursor
- Rest the cursor at a neutral corner (bottom right) between beats, never on top of what the viewer should read.
- Arrive 0.15–0.3 s before the click, hold 0.3 s after. Clicks need a moment to register.
- Aim slightly below the vertical center of labels (`"at": [0.5, 0.55]`) so the arrow doesn't cover text.
- Text fields: click, then start typing 0.1 s later. Use a short, realistic value.

## Captions
- One short sentence, about 4–8 words, stating the benefit and not the UI ("One click: a real desktop layout.", not "Click the Create button").
- Show a caption from the start of its beat to just before the next beat. Leave a 0.3 s gap between captions.
- Keep captions away from the action: top when the action is low, bottom when it is high.

## Content
- Use the product's real copy, colors, fonts and icons. Realistic sample data, never "Lorem ipsum" or "Test User".
- Remove anything distracting: notification badges, dev tools, cookie banners, scrollbars.
- If the real product has a loading moment, keep a short honest version (0.5–1.5 s of "Building…") rather than faking instant results.
