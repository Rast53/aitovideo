# TASK-71 Plan — Unified Native Player + HLS Streaming

## Steps

1. [x] Backend: create `/api/stream/:platform/:id` endpoint with yt-dlp HLS proxy
2. [x] Backend: register stream router in `api/index.ts`
3. [x] Frontend: add `hls.js` dependency
4. [x] Frontend: add `StreamInfo` type and `resolveStream` API method
5. [x] Frontend Player: replace iframe with native `<video>` + hls.js
6. [x] Frontend Player: smart source selection (rutube > vk > youtube)
7. [x] Frontend VideoCard: dual-icon platform badge
8. [x] Frontend VideoCard: remove clickable alt-source buttons
9. [ ] Type-check passes
10. [ ] Create branch, commit, push, PR
