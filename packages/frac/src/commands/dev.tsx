import { Command, Flags } from "@oclif/core";
import { Box, render, Text } from "ink";
import { resolvePort } from "../cli/detect-port.js";
import { Header } from "../cli/header.js";
import { useMessages } from "../cli/use-messages.js";
import { useNodemon } from "../cli/use-nodemon.js";
import { useOpenBrowser } from "../cli/use-open-browser.js";
import { useTypeScriptCheck } from "../cli/use-typescript-check.js";

export default class Dev extends Command {
  static override description = "Start development server";
  static override examples = ["frac"];
  static override flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to run the server on",
      min: 1,
    }),
    open: Flags.boolean({
      description: "Open the local server in the browser when ready",
      default: process.env.FRAC_OPEN !== "false",
      allowNo: true,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Dev);

    const { port, fallback, envWarning } = await resolvePort(flags.port);
    if (envWarning) {
      this.warn(envWarning);
    }

    const env = {
      ...process.env,
      __PORT: String(port),
    };

    const App = () => {
      const tsErrors = useTypeScriptCheck();
      const [messages, pushMessage] = useMessages();
      useNodemon(env, pushMessage);
      useOpenBrowser(port, flags.open);

      return (
        <Box flexDirection="column" padding={1} marginLeft={1}>
          <Header version={this.config.version} />

          <Box>
            <Text>🏠{"  "}</Text>
            {fallback ? (
              <Text color="yellow">3000 in use, running on </Text>
            ) : (
              <Text>Running on </Text>
            )}
            <Text color="green">{`http://localhost:${port}/mcp`}</Text>
          </Box>
          <Box marginBottom={1}>
            <Text color="#20a832">→{"  "}</Text>
            <Text color="white" bold>
              Local server:{" "}
            </Text>
            <Text color="green">{`http://localhost:${port}/`}</Text>
          </Box>

          {tsErrors.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color="red" bold>
                ⚠️ TypeScript errors found:
              </Text>
              {tsErrors.map((error) => (
                <Box
                  key={`${error.file}:${error.line}:${error.col}`}
                  marginLeft={2}
                  flexDirection="column"
                >
                  <Box>
                    <Text color="white">{error.file}</Text>
                    <Text color="grey">
                      ({error.line},{error.col}):{" "}
                    </Text>
                  </Box>
                  <Box marginLeft={2}>
                    <Text color="red">{error.message}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          {messages.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text color="white" bold>
                Logs:
              </Text>
              {messages.map((message) => (
                <Box key={message.id} marginLeft={2}>
                  {message.type === "restart" ? (
                    <>
                      <Text color="green">✓{"  "}</Text>
                      <Text color="white">{message.text}</Text>
                    </>
                  ) : message.type === "error" ? (
                    <Text color="red">{message.text}</Text>
                  ) : (
                    <Text>{message.text}</Text>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    };

    render(<App />, { exitOnCtrlC: true, patchConsole: true });
  }
}
