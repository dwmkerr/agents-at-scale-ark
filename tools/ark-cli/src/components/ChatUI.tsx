import {Box, Text, useInput, useApp} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import * as React from 'react';
import {marked} from 'marked';
// @ts-ignore - no types available
import TerminalRenderer from 'marked-terminal';
import {ChatClient, QueryTarget, ChatConfig, ToolCall} from '../lib/chatClient.js';
import {ArkApiClient} from '../lib/arkApiClient.js';
import {ArkApiProxy} from '../lib/arkApiProxy.js';
import {AgentSelector} from '../commands/agents/selector.js';
import {ModelSelector} from '../commands/models/selector.js';
import {TeamSelector} from '../commands/teams/selector.js';
import {ToolSelector} from '../commands/tools/selector.js';

type SlashCommand =
  | '/output'
  | '/streaming'
  | '/agents'
  | '/models'
  | '/teams'
  | '/tools';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  targetName?: string; // Store the target name with the message
  cancelled?: boolean; // Track if message was cancelled
  command?: SlashCommand; // The slash command that generated this system message
  toolCalls?: ToolCall[]; // Tool calls for this message
}

interface ChatUIProps {
  initialTargetId?: string;
  arkApiClient: ArkApiClient;
  arkApiProxy: ArkApiProxy;
}

// Output format configuration (default: text)
type OutputFormat = 'text' | 'markdown';

// Get output format from environment variable
const getOutputFormat = (): OutputFormat => {
  const format = process.env.ARK_OUTPUT_FORMAT?.toLowerCase();
  return format === 'markdown' ? 'markdown' : 'text';
};

// Configure marked with terminal renderer for markdown output
const configureMarkdown = () => {
  marked.setOptions({
    renderer: new TerminalRenderer({
      showSectionPrefix: false,
      width: 80,
      reflowText: true,
      preserveNewlines: true,
    }),
  });
};

const ChatUI: React.FC<ChatUIProps> = ({
  initialTargetId,
  arkApiClient,
  arkApiProxy,
}) => {
  const {exit} = useApp();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [target, setTarget] = React.useState<QueryTarget | null>(null);
  const [availableTargets, setAvailableTargets] = React.useState<QueryTarget[]>(
    []
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [targetIndex, setTargetIndex] = React.useState(0);
  const [abortController, setAbortController] =
    React.useState<AbortController | null>(null);
  const [showCommands, setShowCommands] = React.useState(false);
  const [filteredCommands, setFilteredCommands] = React.useState<
    Array<{command: string; description: string}>
  >([]);
  const [inputKey, setInputKey] = React.useState(0); // Key to force re-mount of TextInput
  const [outputFormat, setOutputFormat] =
    React.useState<OutputFormat>(getOutputFormat());
  const [showAgentSelector, setShowAgentSelector] = React.useState(false);
  const [showModelSelector, setShowModelSelector] = React.useState(false);
  const [showTeamSelector, setShowTeamSelector] = React.useState(false);
  const [showToolSelector, setShowToolSelector] = React.useState(false);

  // Message history navigation
  const [messageHistory, setMessageHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);

  // Initialize chat config from environment variable
  const [chatConfig, setChatConfig] = React.useState<ChatConfig>({
    streamingEnabled: process.env.ARK_ENABLE_STREAMING === '1',
    currentTarget: undefined,
  });

  const chatClientRef = React.useRef<ChatClient | undefined>(undefined);

  // Configure markdown when output format changes
  React.useEffect(() => {
    if (outputFormat === 'markdown') {
      configureMarkdown();
    }
  }, [outputFormat]);

  // Initialize chat client and fetch targets on mount
  React.useEffect(() => {
    const initializeChat = async () => {
      try {
        // Use the provided ArkApiClient to create ChatClient
        const client = new ChatClient(arkApiClient);
        chatClientRef.current = client;

        const targets = await client.getQueryTargets();
        setAvailableTargets(targets);

        if (initialTargetId) {
          // If initialTargetId is provided, find and set the target
          const matchedTarget = targets.find((t) => t.id === initialTargetId);
          const matchedIndex = targets.findIndex(
            (t) => t.id === initialTargetId
          );
          if (matchedTarget) {
            setTarget(matchedTarget);
            setTargetIndex(matchedIndex >= 0 ? matchedIndex : 0);
            setChatConfig((prev) => ({...prev, currentTarget: matchedTarget}));
            setMessages([]);
          } else {
            // If target not found, show error and exit
            console.error(
              chalk.red('Error:'),
              `Target "${initialTargetId}" not found`
            );
            console.error(
              chalk.gray('Use "ark targets list" to see available targets')
            );
            if (arkApiProxy) {
              arkApiProxy.stop();
            }
            exit();
          }
        } else if (targets.length > 0) {
          // No initial target specified - auto-select first available
          // Priority: agents > models > tools
          const agents = targets.filter((t) => t.type === 'agent');
          const models = targets.filter((t) => t.type === 'model');
          const tools = targets.filter((t) => t.type === 'tool');

          let selectedTarget: QueryTarget | null = null;
          let selectedIndex = 0;

          if (agents.length > 0) {
            selectedTarget = agents[0];
            selectedIndex = targets.findIndex((t) => t.id === agents[0].id);
          } else if (models.length > 0) {
            selectedTarget = models[0];
            selectedIndex = targets.findIndex((t) => t.id === models[0].id);
          } else if (tools.length > 0) {
            selectedTarget = tools[0];
            selectedIndex = targets.findIndex((t) => t.id === tools[0].id);
          }

          if (selectedTarget) {
            setTarget(selectedTarget);
            setTargetIndex(selectedIndex);
            setChatConfig((prev) => ({...prev, currentTarget: selectedTarget}));
            setMessages([]);
          } else {
            setError('No targets available');
          }
        } else {
          setError('No agents, models, or tools available');
        }

        setIsLoading(false);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to initialize chat';
        console.error(chalk.red('Error:'), errorMessage);
        if (arkApiProxy) {
          arkApiProxy.stop();
        }
        exit();
      }
    };

    initializeChat();

    // Cleanup function to close port forward when component unmounts
    return () => {
      if (arkApiProxy) {
        arkApiProxy.stop();
      }
      chatClientRef.current = undefined;
    };
  }, [initialTargetId]);

  // Handle keyboard input
  useInput((inputChar, key) => {
    // Handle Ctrl+C to exit cleanly
    if (inputChar === '\x03' || (key.ctrl && inputChar === 'c')) {
      // Clean up resources
      if (arkApiProxy) {
        arkApiProxy.stop();
      }
      if (abortController) {
        abortController.abort();
      }
      // Exit the app properly
      exit();
      return;
    }

    // Handle Ctrl+W to delete previous word
    if (key.ctrl && inputChar === 'w') {
      if (input.length > 0) {
        // Find the last word boundary
        const trimmed = input.trimEnd();
        const lastSpaceIndex = trimmed.lastIndexOf(' ');

        if (lastSpaceIndex === -1) {
          // Only one word, clear everything
          setInput('');
        } else {
          // Remove the last word
          setInput(trimmed.substring(0, lastSpaceIndex + 1));
        }
        setInputKey((prev) => prev + 1); // Force re-mount to update cursor
      }
      return;
    }


    // Handle arrow keys for message history navigation
    if (!showCommands && messageHistory.length > 0) {
      if (key.upArrow && input === '') {
        // Go back in history
        const newIndex = historyIndex === -1
          ? messageHistory.length - 1
          : Math.max(0, historyIndex - 1);

        if (newIndex >= 0 && newIndex < messageHistory.length) {
          setHistoryIndex(newIndex);
          setInput(messageHistory[newIndex]);
          setInputKey((prev) => prev + 1); // Force re-mount to update cursor
        }
        return;
      }

      if (key.downArrow && input === '') {
        // Go forward in history
        if (historyIndex >= 0) {
          const newIndex = Math.min(messageHistory.length - 1, historyIndex + 1);

          if (newIndex === messageHistory.length - 1) {
            // At the end of history, clear input
            setHistoryIndex(-1);
            setInput('');
          } else {
            setHistoryIndex(newIndex);
            setInput(messageHistory[newIndex]);
          }
          setInputKey((prev) => prev + 1); // Force re-mount to update cursor
        }
        return;
      }
    }

    // Tab to autocomplete when there's a single matching command
    if (
      key.tab &&
      !key.shift &&
      showCommands &&
      filteredCommands.length === 1
    ) {
      // Set the completed command with a space at the end
      const completedCommand = filteredCommands[0].command + ' ';
      setInput(completedCommand);
      // Keep the command hint visible but update to show only the completed command
      setFilteredCommands([filteredCommands[0]]);
      // Force re-mount of TextInput to reset cursor position
      setInputKey((prev) => prev + 1);
      return;
    }

    // Shift+Tab to cycle through targets
    if (key.shift && key.tab && availableTargets.length > 0) {
      // Cycle to next target
      const nextIndex = (targetIndex + 1) % availableTargets.length;
      const nextTarget = availableTargets[nextIndex];

      setTargetIndex(nextIndex);
      setTarget(nextTarget);
      setChatConfig((prev) => ({...prev, currentTarget: nextTarget}));
    }

    // Esc to cancel current request
    if (key.escape && isTyping && abortController) {
      abortController.abort();
      setAbortController(null);
      setIsTyping(false);

      // Mark the assistant message as cancelled and add system message
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.cancelled = true;
          // Remove the message if it has no content
          if (!lastMessage.content) {
            newMessages.pop();
          }
        }
        // Add system message about interruption
        newMessages.push({
          role: 'system',
          content: 'Interrupted by user',
          timestamp: new Date(),
        });
        return newMessages;
      });
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    // Check for slash commands first (these work without a target)
    if (value.startsWith('/output')) {
      const parts = value.split(' ');
      const arg = parts[1]?.toLowerCase();

      if (arg === 'text' || arg === 'markdown') {
        // Set output format
        setOutputFormat(arg);

        // Update environment variable for consistency
        process.env.ARK_OUTPUT_FORMAT = arg;

        // Add system message to show the change
        const systemMessage: Message = {
          role: 'system',
          content: `Output format set to ${arg}`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else if (!arg) {
        // Show current format
        const systemMessage: Message = {
          role: 'system',
          content: `Current output format: ${outputFormat}`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else {
        // Show usage message
        const systemMessage: Message = {
          role: 'system',
          content: `Use 'text' or 'markdown' e.g. /output markdown`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      }

      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/streaming')) {
      const parts = value.split(' ');
      const arg = parts[1]?.toLowerCase();

      if (arg === 'on' || arg === 'off') {
        // Set streaming based on argument
        const newState = arg === 'on';
        setChatConfig((prev) => ({...prev, streamingEnabled: newState}));

        // Add system message to show the change
        const systemMessage: Message = {
          role: 'system',
          content: `Streaming ${newState ? 'enabled' : 'disabled'}`,
          timestamp: new Date(),
          command: '/streaming',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else {
        // Show usage message
        const systemMessage: Message = {
          role: 'system',
          content: `Use either 'on' or 'off' e.g. /streaming on`,
          timestamp: new Date(),
          command: '/streaming',
        };
        setMessages((prev) => [...prev, systemMessage]);
      }

      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/agents')) {
      setShowAgentSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/models')) {
      setShowModelSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/teams')) {
      setShowTeamSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/tools')) {
      setShowToolSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    // For regular messages, we need a target and client
    if (!target || !chatClientRef.current) {
      const systemMessage: Message = {
        role: 'system',
        content: 'No target selected. Use Shift+Tab to select a target.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: value,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Add to message history
    setMessageHistory((prev) => [...prev, value]);
    setHistoryIndex(-1); // Reset history navigation

    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      // Create abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Convert messages to format expected by OpenAI API - only include user and assistant messages
      const apiMessages = messages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      // Add the new user message
      apiMessages.push({
        role: 'user' as const,
        content: value,
      });

      // Add a placeholder message for the assistant while thinking
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          targetName: target.name, // Store just the name
        },
      ]);

      // Send message and get response with abort signal
      const fullResponse = await chatClientRef.current.sendMessage(
        target.id,
        apiMessages,
        chatConfig,
        (chunk: string, toolCalls?: ToolCall[]) => {
          // Update the assistant's message progressively as chunks arrive
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            // Only update if not cancelled
            if (
              lastMessage &&
              lastMessage.role === 'assistant' &&
              !lastMessage.cancelled
            ) {
              // Update content if there's text
              if (chunk) {
                lastMessage.content = (lastMessage.content || '') + chunk;
              }
              // Update tool calls if provided
              if (toolCalls) {
                lastMessage.toolCalls = toolCalls;
              }
            }
            return newMessages;
          });
        },
        controller.signal
      );

      // For non-streaming responses or final validation
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        // Only update if not cancelled
        if (
          lastMessage &&
          lastMessage.role === 'assistant' &&
          !lastMessage.cancelled
        ) {
          // If content is empty (no streaming occurred), set the full response
          // This handles the case where streaming is disabled but we still got a response
          if (!lastMessage.content && fullResponse) {
            lastMessage.content = fullResponse;
          }
          // If no content at all, show a default message
          if (!lastMessage.content && !lastMessage.toolCalls) {
            lastMessage.content = 'No response received';
          }
        }
        return newMessages;
      });

      setIsTyping(false);
      setAbortController(null);
    } catch (err) {
      // Check if this was cancelled by user
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, message already updated by Esc handler
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      setIsTyping(false);
      setAbortController(null);

      // Update the assistant's message with the error
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (
          lastMessage &&
          lastMessage.role === 'assistant' &&
          !lastMessage.cancelled
        ) {
          lastMessage.content = `Error: ${errorMessage}`;
        }
        return newMessages;
      });
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const isAssistant = msg.role === 'assistant';

    // Determine if this is the last assistant message and we're typing
    const isCurrentlyTyping =
      isAssistant && isTyping && index === messages.length - 1;
    const hasError =
      isAssistant &&
      (msg.content.startsWith('Error:') ||
        msg.content === 'No response received');
    const isCancelled = msg.cancelled === true;

    // Render system messages with consistent formatting
    if (isSystem) {
      const isInterruption = msg.content === 'Interrupted by user';

      // If it's a slash command response, show with special formatting
      if (msg.command) {
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="gray">› {msg.command}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color="gray">⎿ {msg.content}</Text>
            </Box>
          </Box>
        );
      }

      // For other system messages (interruptions, errors, etc.)
      const color = isInterruption ? 'yellow' : 'gray';
      return (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Box marginLeft={2}>
            <Text color={color}>• {msg.content}</Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          {/* Status indicator */}
          {isUser && <Text color="cyan">●</Text>}
          {isAssistant && !isCurrentlyTyping && !hasError && !isCancelled && (
            <Text color="green">●</Text>
          )}
          {isAssistant && isCurrentlyTyping && (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          {isAssistant && hasError && <Text color="red">●</Text>}
          {isAssistant && isCancelled && <Text color="gray">●</Text>}
          <Text> </Text>

          {/* Name */}
          <Text
            color={
              isUser
                ? 'cyan'
                : isCurrentlyTyping
                  ? 'yellow'
                  : isCancelled
                    ? 'gray'
                    : hasError
                      ? 'red'
                      : 'green'
            }
            bold
          >
            {isUser ? 'You' : msg.targetName || target?.name}
          </Text>

          {/* Timestamp or interrupt hint */}
          {isAssistant && isCurrentlyTyping ? (
            <Text color="gray"> (esc to interrupt)</Text>
          ) : (
            <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
          )}
        </Box>

        {/* Tool calls - show before content */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <Box marginLeft={2} flexDirection="column">
            <Text color="magenta" bold>
              Tool Calls:
            </Text>
            {msg.toolCalls.map((toolCall, toolIndex) => (
              <Box key={toolIndex} marginLeft={2} flexDirection="column">
                <Text color="magenta">
                  • {toolCall.function.name}
                </Text>
                {toolCall.function.arguments && (
                  <Box marginLeft={2}>
                    <Text color="gray" dimColor>
                      {(() => {
                        try {
                          // Try to parse and pretty-print JSON arguments
                          const args = JSON.parse(toolCall.function.arguments);
                          return JSON.stringify(args, null, 2);
                        } catch {
                          // If not valid JSON yet (still streaming), show raw
                          return toolCall.function.arguments;
                        }
                      })()}
                    </Text>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* Message content - show after tool calls */}
        {msg.content && (
          <Box marginLeft={2}>
            {outputFormat === 'markdown' && isAssistant ? (
              // Render markdown for assistant messages when enabled
              <Text>{marked.parseInline(msg.content)}</Text>
            ) : (
              // Plain text for user messages or when markdown is disabled
              <Text>{msg.content}</Text>
            )}
          </Box>
        )}
      </Box>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">
          <Spinner type="dots" /> Loading available targets...
        </Text>
      </Box>
    );
  }

  // Show error if no targets available
  if (!target && error) {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠ Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">
            Please ensure ark-api is running and has available agents, models,
            or tools.
          </Text>
        </Box>
      </Box>
    );
  }

  // Show agent selector if requested
  if (showAgentSelector) {
    return (
      <AgentSelector
        arkApiClient={arkApiClient}
        onSelect={(agent) => {
          // Update the target to the selected agent
          const agentTarget: QueryTarget = {
            id: `agent/${agent.name}`,
            name: agent.name,
            type: 'agent',
            description: agent.description,
          };
          setTarget(agentTarget);
          setChatConfig((prev) => ({...prev, currentTarget: agentTarget}));
          setMessages([]);
          setShowAgentSelector(false);

          // Add system message about the selection
          const systemMessage: Message = {
            role: 'system',
            content: `Switched to agent: ${agent.name}`,
            timestamp: new Date(),
            command: '/agents',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowAgentSelector(false)}
      />
    );
  }

  // Show model selector if requested
  if (showModelSelector) {
    return (
      <ModelSelector
        arkApiClient={arkApiClient}
        onSelect={(model) => {
          // Update the target to the selected model
          const modelTarget: QueryTarget = {
            id: `model/${model.name}`,
            name: model.name,
            type: 'model',
            description: model.type,
          };
          setTarget(modelTarget);
          setChatConfig((prev) => ({...prev, currentTarget: modelTarget}));
          setMessages([]);
          setShowModelSelector(false);

          // Add system message about the selection
          const systemMessage: Message = {
            role: 'system',
            content: `Switched to model: ${model.name}`,
            timestamp: new Date(),
            command: '/models',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowModelSelector(false)}
      />
    );
  }

  // Show team selector if requested
  if (showTeamSelector) {
    return (
      <TeamSelector
        arkApiClient={arkApiClient}
        onSelect={(team) => {
          // Update the target to the selected team
          const teamTarget: QueryTarget = {
            id: `team/${team.name}`,
            name: team.name,
            type: 'team',
            description: team.strategy,
          };
          setTarget(teamTarget);
          setChatConfig((prev) => ({...prev, currentTarget: teamTarget}));
          setMessages([]);
          setShowTeamSelector(false);

          // Add system message about the selection
          const systemMessage: Message = {
            role: 'system',
            content: `Switched to team: ${team.name}`,
            timestamp: new Date(),
            command: '/teams',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowTeamSelector(false)}
      />
    );
  }

  // Show tool selector if requested
  if (showToolSelector) {
    return (
      <ToolSelector
        arkApiClient={arkApiClient}
        onSelect={(tool) => {
          // Update the target to the selected tool
          const toolTarget: QueryTarget = {
            id: `tool/${tool.name}`,
            name: tool.name,
            type: 'tool',
            description: tool.description,
          };
          setTarget(toolTarget);
          setChatConfig((prev) => ({...prev, currentTarget: toolTarget}));
          setMessages([]);
          setShowToolSelector(false);

          // Add system message about the selection
          const systemMessage: Message = {
            role: 'system',
            content: `Switched to tool: ${tool.name}`,
            timestamp: new Date(),
            command: '/tools',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowToolSelector(false)}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Welcome header - only show if no messages */}
      {messages.length === 0 && (
        <Box flexDirection="column" marginBottom={1} paddingX={2}>
          <Text bold color="green">
            ✻ Welcome to ARK Chat!
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Type your message and press Enter to start</Text>
          </Box>
          <Box>
            <Text dimColor>Type '/' for available commands</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1}>
        {messages.map(renderMessage)}
      </Box>

      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Box flexDirection="row" width="100%">
            <Text color="cyan" bold>
              ›
            </Text>
            <Box marginLeft={1} flexGrow={1}>
              <TextInput
                key={inputKey}
                value={input}
                onChange={(value) => {
                  setInput(value);
                  // Show commands menu only when input starts with '/'
                  const shouldShowCommands = value.startsWith('/');
                  setShowCommands(shouldShowCommands);

                  // Update filtered commands
                  if (shouldShowCommands) {
                    const inputLower = value.toLowerCase();
                    const commands = [
                      {
                        command: '/agents',
                        description: 'Select an agent to chat with',
                      },
                      {
                        command: '/models',
                        description: 'Select a model to chat with',
                      },
                      {
                        command: '/teams',
                        description: 'Select a team to chat with',
                      },
                      {
                        command: '/tools',
                        description: 'Select a tool to use',
                      },
                      {
                        command: '/output',
                        description: `Set output format (${outputFormat}) - use: /output text|markdown`,
                      },
                      {
                        command: '/streaming',
                        description: `Toggle streaming mode (${chatConfig.streamingEnabled ? 'on' : 'off'}) - use: /streaming on|off`,
                      },
                    ];

                    // Check if user has typed a complete command (with space or at exact match)
                    const hasSpace = value.includes(' ');
                    const baseCommand = hasSpace ? value.split(' ')[0] : value;

                    // Filter commands - show matching commands or the current command if fully typed
                    const filtered = commands.filter((cmd) => {
                      if (hasSpace) {
                        // If there's a space, only show the exact matching command
                        return cmd.command === baseCommand;
                      } else {
                        // Otherwise show all commands that start with the input
                        return cmd.command.toLowerCase().startsWith(inputLower);
                      }
                    });
                    setFilteredCommands(filtered);
                  } else {
                    setFilteredCommands([]);
                  }
                }}
                onSubmit={handleSubmit}
                placeholder="Type your message..."
              />
            </Box>
          </Box>
        </Box>

        {/* Command menu */}
        {showCommands && filteredCommands.length > 0 && (
          <Box marginLeft={1} marginTop={1} flexDirection="column">
            {filteredCommands.map((cmd, index) => (
              <Box key={index}>
                <Text color="cyan">{cmd.command}</Text>
                <Text color="gray"> {cmd.description}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Status bar - only show when menu is not open */}
        {!showCommands && (
          <Box marginLeft={1} marginTop={0}>
            <Box flexDirection="row">
              {target && (
                <>
                  <Text color="gray">Chatting with </Text>
                  <Text color="gray">{target.type} </Text>
                  <Text color="green">{target.name}</Text>
                  <Text color="gray"> • Shift+Tab to cycle • </Text>
                </>
              )}
              <Text color="gray">Ctrl+C to exit</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatUI;
