# Known Issues

## AI Tutor paste input issue
Status: unresolved / parked temporarily
Problem:
Copy/paste into the AI Tutor input is still unreliable in browser testing. Multiple fixes were attempted, including manual paste handlers, clipboard button, flushSync, and native textarea simplification. The issue should be revisited later with a deeper isolated input test.

Expected behaviour:
- Cmd+V / Ctrl+V should paste normal text
- long ChatGPT answers should paste
- multi-line code should paste
- textarea should grow or scroll internally
- user should be able to copy/select tutor responses

Reason parked:
We are prioritising speed and moving on to other core MoLis features.
