export function createLogger(debugEnabled) {
  const isEnabled = Boolean(debugEnabled);

  function log(level, message, fields = {}) {
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }

  return {
    debug(message, fields) {
      if (!isEnabled) {
        return;
      }
      log("debug", message, fields);
    },
    info(message, fields) {
      log("info", message, fields);
    },
    warn(message, fields) {
      log("warn", message, fields);
    },
    error(message, fields) {
      log("error", message, fields);
    },
  };
}
