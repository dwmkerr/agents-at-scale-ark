import {Text, Box, render, useInput} from 'ink';
import * as React from 'react';

type MenuChoice = 'dashboard' | 'status' | 'generate' | 'chat' | 'exit';

interface MenuItem {
  label: string;
  description: string;
  value: MenuChoice;
  command?: string;
}

const MainMenu: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  
  const choices: MenuItem[] = [
    {label: 'Chat', description: 'Interactive chat with ARK agents', value: 'chat', command: 'ark chat'},
    {label: 'Dashboard', description: 'Open ARK dashboard in browser', value: 'dashboard', command: 'ark dashboard'},
    {label: 'Status Check', description: 'Check ARK services status', value: 'status', command: 'ark status'},
    {label: 'Generate', description: 'Generate new ARK components', value: 'generate', command: 'ark generate'},
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
        const ChatUI = (await import('../components/ChatUI.js')).default;
        render(<ChatUI />);
        break;
      }

      case 'dashboard': {
        // Unmount the current Ink app
        interface GlobalWithInkApp {
          inkApp?: {
            unmount: () => void;
          };
        }
        const app = (globalThis as GlobalWithInkApp).inkApp;
        if (app) {
          app.unmount();
        }

        // Clear the screen
        console.clear();

        // Import and run the dashboard command
        const {createDashboardCommand} = await import(
          '../commands/dashboard.js'
        );
        const dashboardCmd = createDashboardCommand();
        await dashboardCmd.parseAsync(['node', 'ark', 'dashboard']);
        break;
      }

      case 'status': {
        const StatusView = (await import('../components/StatusView.js'))
          .default;
        const {StatusChecker} = await import('../components/statusChecker.js');
        const {ConfigManager} = await import('../config.js');
        const {ArkClient} = await import('../lib/arkClient.js');

        const configManager = new ConfigManager();
        const apiBaseUrl = await configManager.getApiBaseUrl();
        const serviceUrls = await configManager.getServiceUrls();
        const arkClient = new ArkClient(apiBaseUrl);
        const statusChecker = new StatusChecker(arkClient);

        let statusData = null;
        let error = null;

        try {
          statusData = await statusChecker.checkAll(serviceUrls, apiBaseUrl);
        } catch (err) {
          error = err instanceof Error ? err.message : 'Unknown error';
        }

        render(
          <StatusView
            statusData={statusData}
            isLoading={false}
            error={error}
            onBack={() => process.exit(0)}
          />
        );
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
              <Text color="gray">
                {choice.description}
              </Text>
            </Box>
          );
        })}
      </Box>
    </>
  );
};

export default MainMenu;
