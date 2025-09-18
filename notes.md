- [ ] stream in endpoint vs stream
annotations use consant
diagram
check logging
spec when not streaming enabled
A2A


---

> is it possible that we have an httpclient that we create early on - we stream messages through it, but then at the point
  we end the query we create a _new_ client that is used to send the stream end? would this cause the error? diagnose and
  challenge by thining - it might be that the same client exists but chunks arrive after the done message is sent.

⏺ Excellent insight! Let me trace through the HTTP client usage to see if there are multiple clients involved:

⏺ You're absolutely right! Look at this:

  1. In establishStreamConnection (line 397):
  // Create a separate HTTP client without timeout for streaming
  streamClient := &http.Client{
      Transport: m.httpClient.Transport,
      // No timeout for streaming connections
  }
  resp, err := streamClient.Do(req)
  This creates a NEW HTTP client for the streaming connection.

  2. In NotifyCompletion (line 302):
  resp, err := m.httpClient.Do(req)
  This uses the ORIGINAL m.httpClient to send the completion notification.

  3. The sequence is:
    - StreamChunk is called with first chunk
    - establishStreamConnection creates a goroutine with a NEW streamClient
    - The goroutine tries to POST to /stream/{query}
    - Meanwhile, chunks are being written through the pipe
    - NotifyCompletion is called using the ORIGINAL httpClient to POST /stream/{query}/complete
    - The goroutine with streamClient is still trying to connect but the context is canceled

  The issue is that we have two different HTTP connections:
