# 📘 Project Change Log

A living document tracking updates, fixes, and changes across the project.

---

## 🗓️ Summary Table

| Date       | Type       | Title/Short Description     | Status       | Owner     | Notes |
|-----------|------------|------------------------------|--------------|-----------|-------|
| 2025-11-06 | Update     | Added basecode             | Completed    | Jaewon    |       |
| 2025-11-13 | Bug        | B-001            | Completed  | Jaewon, Abdulla, Noor    | Fixed 2025-12-02 |
| 2025-11-13 | Bug        | B-002            | Completed  | Jaewon, Abdulla, Noor    | Fixed 2025-12-02 |
| 2025-11-13 | Update     | Implement context window token usage (average context window size?)             | In Progress    | Jaewon, Abdulla, Noor     |       |
| 2025-11-27 | Bug Fix    | Fixed overlay not showing until reload | Completed | Jaewon, Abdulla, Noor | Scans all existing messages on page load |
| 2025-11-29 | Bug Fix    | Fixed energy only counting current question | Completed | Jaewon, Abdulla, Noor | Now counts all Q&A pairs |
| 2025-12-01 | Bug Fix    | Fixed duplicate entries on reload | Completed | Jaewon, Abdulla, Noor | Added stable messageId deduplication |
| 2025-12-01 | Bug Fix    | Fixed popup showing smaller values for long responses | Completed | Jaewon | Waits for streaming completion, updates existing entries |
| 2025-12-01 | Feature    | Added mWh display | Completed | Jaewon | Shows milliwatt-hours alongside Wh |
| 2025-12-01 | Feature    | Added crank rotation count | Completed | Jaewon | 15 cranks = 1 mWh conversion |
| 2025-12-01 | Feature    | Added Clear History button | Completed | Jaewon | Allows users to reset popup history |
---

## 🔧 Detailed Logs

### 2025-12-02 — Major Bug Fixes & New Features
**Type:** Bug Fix / Feature  
**Status:** Completed  
**Owner:** Jaewon  
**Description:**  
- Fixed overlay not updating on page load (now scans all existing messages)
- Fixed energy calculation only counting current question (now counts all Q&A pairs)
- Fixed duplicate history entries on page reload (added stable messageId system)
- Fixed popup showing incorrect values for long responses (streaming detection + entry updates)
- Added mWh display alongside Wh in overlay and popup
- Added crank rotation count (15 cranks = 1 mWh) in overlay and popup
- Added "Clear All History" button to popup
- Improved SPA navigation detection (intercepts pushState/replaceState)
- Better streaming detection (checks for stop button before logging)

**Notes:**  
- Overlay now shows: Wh, mWh, and cranks needed
- Popup now shows per-prompt and total energy with crank equivalents
- History entries include messageId for deduplication across reloads

---

## 🐞 Open Bugs

| Bug ID | Description | Severity | Status | 
|--------|-------------|----------|--------|
| — | No open bugs | — | — |

---

## 🐞 Resolved Bugs

| Bug ID | Description | Severity | Resolution | 
|--------|-------------|----------|------------|
| B-001  | When we ask question (prompt), only the question is calculated as token (energy usage), not the answer from ChatGPT. | High | Fixed — Now scans all user + assistant message pairs on the page |
| B-002  | When we refresh the page, the total prompt energy keeps increasing as the most recent prompt energy is duplicated | High | Fixed — Added stable messageId based on convoId + message index for deduplication |

---

## 🚀 Upcoming Tasks / Changes

- [ ] Improve token estimation accuracy
- [ ] Add support for other AI chat platforms (Claude, Gemini, etc.)
- [ ] Connect crank device hardware integration

---

## ✅ Completed Items

- [x] Overlay shows energy in real-time during streaming
- [x] Overlay displays Wh, mWh, and crank count
- [x] Popup displays per-chat totals with crank equivalents
- [x] Popup shows recent prompts with energy breakdown
- [x] Clear history functionality
- [x] SPA navigation support
- [x] Streaming completion detection
- [x] Message deduplication system
