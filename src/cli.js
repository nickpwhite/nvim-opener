#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import {
  formatHelp,
  parseCliArgs,
  parseCodeInsidersArgs,
} from "./parse.js";
import {
  executeOpenAction,
  executeSyncThreadStateAction,
} from "./opener.js";
import { OpenerError, CommandError } from "./errors.js";

function toAction(parsed) {
  if (parsed.command === "from-code-insiders") {
    return parseCodeInsidersArgs(parsed.args);
  }

  return parsed;
}

function main() {
  const config = loadConfig(process.env);
  const logger = createLogger(config.debug);

  try {
    const parsed = parseCliArgs(process.argv.slice(2));
    if (parsed.command === "help") {
      process.stdout.write(`${formatHelp()}\n`);
      return;
    }

    const action = toAction(parsed);
    if (action.kind === "sync-thread-state") {
      executeSyncThreadStateAction(action, config, logger);
      return;
    }

    executeOpenAction(action, config, logger);
  } catch (error) {
    if (error instanceof OpenerError || error instanceof CommandError) {
      const details = {
        ...error.details,
      };
      logger.error(error.message, details);
      process.exitCode = 1;
      return;
    }

    logger.error("Unexpected failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

main();
