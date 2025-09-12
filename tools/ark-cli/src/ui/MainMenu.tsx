import {Text, Box, render, useInput} from 'ink';
import * as React from 'react';

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
    app.unmount();

    // Remove all existing signal listeners that might interfere with inquirer
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGQUIT');
    process.removeAllListeners('exit');

    // Reset stdin completely
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeAllListeners();
      process.stdin.resume();
    }

    // Reset stdout/stderr
    process.stdout.removeAllListeners();
    process.stderr.removeAllListeners();

    console.clear();

    // Give terminal more time to fully reset
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const MainMenu: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const choices: MenuItem[] = [
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
      label: 'Status Check',
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

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : choices.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < choices.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      handleSelect(choices[selectedIndex]);
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

        // NOTE: We spawn the install command as a separate process to avoid
        // signal handling conflicts between Ink's useInput and inquirer's prompts.
        // The signal-exit library used by inquirer conflicts with Ink's signal handlers,
        // causing ExitPromptError even after proper cleanup. Spawning ensures
        // a clean process environment for inquirer to work correctly.
        const {spawn} = await import('child_process');
        const child = spawn(process.execPath, [process.argv[1], 'install'], {
          stdio: 'inherit',
        });

        await new Promise<void>((resolve, reject) => {
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else if (code === 130) {
              // 130 is the exit code for SIGINT (Ctrl+C)
              process.exit(130);
            } else {
              reject(new Error(`Install command failed with code ${code}`));
            }
          });
          child.on('error', reject);

          // Forward SIGINT to child and exit
          process.on('SIGINT', () => {
            child.kill('SIGINT');
            process.exit(130);
          });
        });
        break;
      }

      case 'dashboard': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {openDashboard} = await import('../commands/dashboard.js');
        await openDashboard();
        break;
      }

      case 'status': {
        //  Unmount fullscreen app and clear screen.
        await unmountInkApp();

        const {checkStatus} = await import('../commands/status.js');
        await checkStatus();
        break;
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
  );
};

export default MainMenu;
