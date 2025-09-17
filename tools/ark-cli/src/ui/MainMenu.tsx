import {Text, Box, render, useInput} from 'ink';
import Spinner from 'ink-spinner';
import * as React from 'react';
import {isArkReady} from '../lib/arkStatus.js';

type MenuChoice =
  | 'dashboard'
  | 'status'
  | 'generate'
  | 'chat'
  | 'install'
  | 'exit';

interface MenuItem {
  label: string;
  description: string;
  value: MenuChoice;
  command?: string;
}

//  Helper function to unmount the main ink app - used when we move from a
//  React TUI app to basic input/output.
async function unmountInkApp() {
  interface GlobalWithInkApp {
    inkApp?: {
      unmount: () => void;
    };
  }
  const app = (globalThis as GlobalWithInkApp).inkApp;
  if (app) {
    // Unmount the Ink app
    app.unmount();

    // Clear the global reference
    delete (globalThis as GlobalWithInkApp).inkApp;

    // Reset terminal to normal mode
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    // Clear screen
    console.clear();

    // Small delay to ensure everything is flushed
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const MainMenu: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [arkReady, setArkReady] = React.useState<boolean | null>(null);
  const [isChecking, setIsChecking] = React.useState(true);

  React.useEffect(() => {
    const checkArkStatus = async () => {
      setIsChecking(true);
      const ready = await isArkReady();
      setArkReady(ready);
      setIsChecking(false);
      // Reset selected index to 0 after status check
      setSelectedIndex(0);
    };
    checkArkStatus();
  }, []);

  const allChoices: MenuItem[] = [
    {
      label: 'Chat',
      description: 'Interactive chat with ARK agents',
      value: 'chat',
      command: 'ark chat',
    },
    {
      label: 'Install',
      description: 'Install Ark',
      value: 'install',
      command: 'ark install',
    },
    {
      label: 'Dashboard',
      description: 'Open ARK dashboard in browser',
      value: 'dashboard',
      command: 'ark dashboard',
    },
    {
      label: 'Status',
      description: 'Check ARK services status',
      value: 'status',
      command: 'ark status',
    },
    {
      label: 'Generate',
      description: 'Generate new ARK components',
      value: 'generate',
      command: 'ark generate',
    },
    {label: 'Exit', description: 'Exit ARK CLI', value: 'exit'},
  ];

  // Filter choices based on ARK readiness
  const choices = React.useMemo(() => {
    // Don't return any choices while checking
    if (isChecking) return [];

    if (!arkReady) {
      // Only show Install, Status, and Exit when ARK is not ready
      return allChoices.filter(choice =>
        ['install', 'status', 'exit'].includes(choice.value)
      );
    }

    // Show all options when ARK is ready
    return allChoices;
  }, [arkReady, isChecking]);

  useInput((input: string, key: any) => {
    // Don't process input while checking status
    if (isChecking) return;

    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : choices.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < choices.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      handleSelect(choices[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= choices.length) {
        handleSelect(choices[num - 1]);
      }
    }
  });

  const handleSelect = async (item: MenuItem) => {
    switch (item.value) {
      case 'exit':
        process.exit(0);
        break;

      case 'chat': {
        // Unmount fullscreen app and clear screen.
        await unmountInkApp();

        // Import and start ChatUI in the same process
        const {render} = await import('ink');
        const {ArkApiProxy} = await import('../lib/arkApiProxy.js');
        const ChatUI = (await import('../components/ChatUI.js')).default;

        try {
          const proxy = new ArkApiProxy();
          const arkApiClient = await proxy.start();

          // Render ChatUI as a new Ink app
          render(<ChatUI arkApiClient={arkApiClient} arkApiProxy={proxy} />);
        } catch (error) {
          const output = (await import('../lib/output.js')).default;
          output.error(
            error instanceof Error
              ? error.message
              : 'Failed to connect to ARK API'
          );
          process.exit(1);
        }
        break;
      }

      case 'install': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        // Spawn as a new process to avoid Ink/inquirer signal conflicts
        const {execFileSync} = await import('child_process');
        try {
          execFileSync(process.execPath, [process.argv[1], 'install'], {
            stdio: 'inherit',
            env: { ...process.env, FORCE_COLOR: '1' }
          });
        } catch (error: any) {
          // execFileSync throws if the process exits with non-zero
          process.exit(error.status || 1);
        }
        process.exit(0);
      }

      case 'dashboard': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {openDashboard} = await import('../commands/dashboard/index.js');
        await openDashboard();
        break;
      }

      case 'status': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {checkStatus} = await import('../commands/status/index.js');
        await checkStatus();
        process.exit(0);
      }

      case 'generate': {
        const GeneratorUI = (await import('../components/GeneratorUI.js'))
          .default;
        render(<GeneratorUI />);
        break;
      }
    }
  };

  return (
    <>
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color="cyan" bold>
          {`
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║         █████╗ ██████╗ ██╗  ██╗       ║
    ║        ██╔══██╗██╔══██╗██║ ██╔╝       ║
    ║        ███████║██████╔╝█████╔╝        ║
    ║        ██╔══██║██╔══██╗██╔═██╗        ║
    ║        ██║  ██║██║  ██║██║  ██╗       ║
    ║        ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝       ║
    ║                                       ║
    ║        Agents at Scale Platform       ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
        `}
        </Text>
        <Text color="green" bold>
          Welcome to ARK! 🚀
        </Text>
        <Text color="gray">Interactive terminal interface for ARK agents</Text>

      </Box>

      {/* Show loading state or menu based on status check */}
      {isChecking ? (
        <Box justifyContent="center" alignItems="center" marginTop={2}>
          <Text color="gray">
            <Spinner type="dots" /> Checking ARK status...
          </Text>
        </Box>
      ) : (
        <>
          {/* Status indicator */}
          <Box justifyContent="center" alignItems="center" marginBottom={1}>
            {arkReady ? (
              <Text color="green">✓ ARK is ready</Text>
            ) : (
              <Box flexDirection="column" alignItems="center">
                <Text color="yellow">⚠ ARK is not ready</Text>
                <Text color="gray">Run 'Install' to set up ARK or 'Status' for details</Text>
              </Box>
            )}
          </Box>

          <Box flexDirection="column" paddingX={4} marginTop={1}>
            {choices.map((choice, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={choice.value} flexDirection="row" paddingY={0}>
              <Text color="gray" dimColor>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text color="gray" dimColor>
                {index + 1}.
              </Text>
              <Box marginLeft={1} width={20}>
                <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
                  {choice.label}
                </Text>
              </Box>
              <Text color="gray">{choice.description}</Text>
            </Box>
          );
        })}
          </Box>
        </>
      )}
    </>
  );
};

export default MainMenu;
