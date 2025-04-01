
import chalk from 'chalk';

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3
}

let currentLogLevel: LogLevel = LogLevel.INFO;

function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

function logDebug(message: string) {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.log(chalk.gray(`[${getTimestamp()}] [DEBUG] ${message}`));
  }
}
function logInfo(message: string) {
  if (currentLogLevel <= LogLevel.INFO) {
    console.log(chalk.blue(`[${getTimestamp()}] [INFO] ${message}`));
  }
}
function logWarning(message: string) {
  if (currentLogLevel <= LogLevel.WARNING) {
    console.log(chalk.yellow(`[${getTimestamp()}] [WARN] ${message}`));
  }
}
function logError(message: string) {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.log(chalk.red(`[${getTimestamp()}] [ERROR] ${message}`));
  }
}


export {LogLevel ,setLogLevel, logDebug, logInfo, logWarning, logError}