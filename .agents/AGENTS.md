# AI Model Communication Rules

## Conciseness & Chat Cleanliness
- **Keep Chat Responses Extremely Concise**: Do NOT output verbose explanations, step-by-step reasoning, or your internal thought process in the final user-facing chat response.
- **Do Not List Code Changes in Chat**: Avoid filling the chat box with long summaries of code edits, diffs, or files modified.
- **Use Artifacts for Details**: Put detailed implementation plans, task checklists, and code change summaries into markdown artifacts (e.g., `implementation_plan.md`, `task.md`, `walkthrough.md`). In the chat, simply provide a brief 1-2 sentence status update and direct links to the relevant artifacts.
- **No Filler/Fluff**: Deliver direct answers and ask clear questions without introductory or concluding conversational filler.
