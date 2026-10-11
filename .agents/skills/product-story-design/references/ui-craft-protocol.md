# OpenScience UI craft protocol

Use this protocol for any refinement that touches more than one page or changes a shared shell. It keeps the guide-page standard repeatable without inventing a second product brief.

## 0. Start from the reviewed page

During an explicit page-review freeze, organize skills and evidence only. Once a page is selected, take its P-number, chosen image/Figma frame, task, entry/exit, factual assets and feedback from the existing manuscript. Resolve concrete gaps from that material rather than reopening the whole design. Use the [capability ledger](../../openscience-aesthetic-design/references/aesthetic-capability-ledger.md) for tools and the approved-page implementation sequence.

## 1. Read the page as a research task

Before touching CSS or JSX, name the visitor's immediate purpose, the evidence that makes the purpose believable, and the one next action. Build the first viewport in this order:

1. orientation: where the visitor is and what kind of work this surface holds;
2. anchor: the real research title, contribution, figure, current task or identity context;
3. action: the next useful step, placed beside the anchor;
4. depth: supporting text, sources, history or secondary tools below the first decision;
5. companion: Hermes supports the current task without becoming a second hero.

Keep factual scientific content, labels and permissions unchanged. Explanations belong at the decision they clarify. Do not put operational caveats in the opening sentence when the page can communicate the next step through composition and nearby help.

## 2. Apply the surface hierarchy

- Public explore and reading pages lead with the work: title or contribution, complete media, then comfortable reading and sources.
- The research desk leads with what can continue now: current study, progress or empty-state action, then library and tools.
- Creation leads with the material handoff: paper or idea, input, start action and local file guidance.
- Workspaces lead with the contribution and editable result; evidence, versions and tools recede until requested.
- Account, journals and developer pages lead with identity or task context, then grouped controls and feedback.
- Guide pages lead with an invitation, a real published example and selectable explanations/FAQ. The action leads to the research desk; upload and creation do not move into Guide.

Use one dominant heading and one dominant surface per viewport. A section may be visually quiet without being boxed. Use real media and localized text when tuning line length, whitespace and breakpoints.

## 3. Keep Hermes one visual object

Hermes uses the later human-selected opaque Live2D face-and-hat avatar, currently 64px, including on the research desk. Click opens the existing contextual assistant in its own area; closing restores the entry and focus. Expanded size follows available space and the selected page, not a permanent 360px seat or a 120px default. No bottom banner, static duplicate, ghost over content, or use of Hermes as the researcher identity. Landing has no added companion. Speech stays within the assistant area and uses the shared short hat/face anchor.

The stage must reserve its footprint before the actor or speech appears. The actor, carrier, WebGL fallback, menu and speech contour share that footprint. Speech uses the hat upper-left origin and a short tail; its box may move to avoid content, but its origin rule stays shared. Prefer a meaningful place in the page header, supporting copy or work margin over an empty row. Internal attempts and technical checks recede into history; final results and in-context feedback lead. Idle, loading and reduced-motion states must not change the page's layout geometry. Route-scoped anchor measurements must never position the next page's companion.

Place the entry in a meaningful toolbar or page-owned margin; if no useful assistant task exists, omit it. Do not force a corner overlay or empty seat onto every page. Its accessible name describes opening Hermes; navigation remains in navigation links.

## 4. Author motion with restraint

Give each surface one authored movement: scene selection, a task state change or a local reveal. Use 160–450ms transitions with a natural deceleration. Keep scientific figures and reading text stable; decorative motion may pause when reading, the document is hidden or reduced motion is requested. Never stagger every paragraph or use a background effect to compensate for missing hierarchy.

## 5. Verify before calling it finished

Use the actual route from the visible navigation, not a direct component or fixture. Check at 1440/1280, 1024/768, 390/844 and 375/812 when the browser allows it.

- inspect Hermes stage width/height, placement, compact state and speech origin;
- check document width for horizontal overflow and verify the dominant heading/action remain visible;
- exercise one real navigation or primary action, one expanded/feedback state, keyboard focus and reduced motion;
- inspect loading, empty and failure states for the changed surface;
- capture a fresh visual observation only after the route has settled.

Run targeted tests for changed contracts, then typecheck/build as required by the repository. A passing build proves implementation integrity; it does not prove visual quality. Report candidate, deployed, observed and user-accepted states separately.
