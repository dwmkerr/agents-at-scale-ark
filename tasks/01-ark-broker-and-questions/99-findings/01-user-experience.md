# User Experience Issues

## Agent Creation

User experience is poor creating the agent. There is little space for the prompt and the tool selection is unintuitive.

## Query Visibility

User experience running queries is poor - it is not possible to see the tool calls. If the v1/completions stream included tool calls in the stream we would be able to show them in the dashboard. This highlights the need for the broker, as it could interleave tool calls and so on with the completions stream.

## Proposed Solution

To work with this, rather than updating the 'chat' page the 'query' page will be updated allowing for more visibility into what is going on, with the query detail page being the full source of truth for ALL data we see in a query and will allow the query to be joined halfway through a stream for example. This requires that we can pass a timeout to the query and that we fully update the query page to be truly async.
