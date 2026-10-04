# Testing checklist

Record actual results while demonstrating the project. The initial checklist is intentionally marked **NOT RUN** rather than claiming success.

| Test case | Expected result | Actual result | Status |
|---|---|---|---|
| Empty command | Friendly validation message | Not run | NOT RUN |
| Normal create-card command | Structured create preview | Not run | NOT RUN |
| Command with date | Date appears in intent | Not run | NOT RUN |
| Command with time | Time is preserved by configured AI | Not run | NOT RUN |
| Command with list | List appears and is checked | Not run | NOT RUN |
| Existing-card update | Matching card is previewed | Not run | NOT RUN |
| Ambiguous card | Action is blocked for clarification | Not run | NOT RUN |
| Unknown list | Live action is rejected | Not run | NOT RUN |
| Unknown member | Live action is rejected | Not run | NOT RUN |
| Missing Trello credentials | DEMO MODE is visible; no real claim | Not run | NOT RUN |
| Invalid AI response | Response is rejected safely | Not run | NOT RUN |
| Trello API failure | Friendly error is shown | Not run | NOT RUN |
| Speech unsupported | Typed fallback remains usable | Not run | NOT RUN |
| User cancellation | No execute request is made | Not run | NOT RUN |
| Successful confirmation | Live card is created/updated | Not run | NOT RUN |
