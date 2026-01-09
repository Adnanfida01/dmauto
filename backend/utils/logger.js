let logger;

try {
  const winston = await import("winston");
  logger = winston.createLogger({
    level: "info",
    transports: [new winston.transports.Console()],
  });
} catch (e) {
  // If winston is not installed, fall back to a simple console wrapper
  logger = {
    info: (...args) => console.log('[info]', ...args),
    warn: (...args) => console.warn('[warn]', ...args),
    error: (...args) => console.error('[error]', ...args),
    debug: (...args) => console.debug('[debug]', ...args),
  };
}

export default logger;
