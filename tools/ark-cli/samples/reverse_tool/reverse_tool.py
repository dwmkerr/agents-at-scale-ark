#!/usr/bin/env python3
"""
Simple FastMCP tool for testing - reverses text messages
"""

from fastmcp import FastMCP

# Initialize the MCP server
mcp = FastMCP("reverse_tool")

@mcp.tool()
def reverse_message(message: str) -> str:
    """
    Reverses the text of a message
    
    Args:
        message: The message text to reverse
        
    Returns:
        The reversed message text
    """
    return message[::-1]

if __name__ == "__main__":
    # Run the MCP server with HTTP transport for Kubernetes
    import os
    port = int(os.environ.get("PORT", "8080"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path="/")